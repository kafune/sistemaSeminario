import re
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import (
    Aluno,
    AluTurma,
    Turma,
    WhatsappConfiguracao,
    WhatsappDestinatario,
    WhatsappDisparo,
)
from ..security import usuario_atual
from ..services.uazapi import (
    UazApiClient,
    UazApiError,
    criptografar_token,
    descriptografar_token,
    sanitizar_resposta,
)

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])

STATUS_FINAIS = {"CONCLUIDO", "CONCLUIDO_COM_FALHAS", "FALHA"}
VARIAVEIS_SUPORTADAS = {"nome", "primeiro_nome"}
RE_VARIAVEL = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")


def _agora() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def normalizar_celular(celular: str | None) -> tuple[str | None, str | None]:
    if not celular or not celular.strip():
        return None, "Celular não informado"
    original = celular.strip()
    ddi_explicito = original.startswith(("+", "00"))
    numero = re.sub(r"\D", "", original)
    if numero.startswith("00"):
        numero = numero[2:]
    if ddi_explicito and not numero.startswith("55"):
        return None, "Celular sem DDI brasileiro (+55)"
    if len(numero) in (10, 11):
        numero = f"55{numero}"
    if not 12 <= len(numero) <= 15:
        return None, "Celular fora do formato brasileiro esperado"
    if not numero.startswith("55"):
        return None, "Celular sem DDI brasileiro (+55)"
    return numero, None


def personalizar_mensagem(modelo: str, nome: str | None) -> str:
    nome_completo = (nome or "").strip()
    primeiro_nome = nome_completo.split()[0] if nome_completo else ""
    valores = {"nome": nome_completo, "primeiro_nome": primeiro_nome}
    return RE_VARIAVEL.sub(lambda match: valores[match.group(1)], modelo)


def _validar_modelo(modelo: str) -> str:
    modelo = modelo.strip()
    if not modelo:
        raise HTTPException(400, "Digite a mensagem antes de continuar.")
    if len(modelo) > 4096:
        raise HTTPException(400, "A mensagem deve ter no máximo 4096 caracteres.")
    desconhecidas = sorted(
        {item for item in RE_VARIAVEL.findall(modelo) if item not in VARIAVEIS_SUPORTADAS}
    )
    if desconhecidas:
        raise HTTPException(
            400,
            "Variáveis não reconhecidas: "
            + ", ".join(f"{{{{{item}}}}}" for item in desconhecidas),
        )
    return modelo


def _configuracao(db: Session) -> WhatsappConfiguracao | None:
    return db.get(WhatsappConfiguracao, 1)


def _cliente_instancia(db: Session) -> tuple[WhatsappConfiguracao, UazApiClient]:
    config = _configuracao(db)
    if not config:
        raise HTTPException(409, "Crie a instância do WhatsApp antes de continuar.")
    try:
        token = descriptografar_token(config.token_criptografado)
        return config, UazApiClient(token)
    except UazApiError as exc:
        raise HTTPException(exc.status_code, exc.mensagem) from exc


def _instancia_publica(resposta: dict, config: WhatsappConfiguracao) -> dict:
    segura = sanitizar_resposta(resposta)
    instancia = segura.get("instance") or {}
    status = instancia.get("status") or (
        "connected" if (segura.get("status") or {}).get("connected") else "disconnected"
    )
    return {
        "configurada": True,
        "nome": instancia.get("name") or config.nome,
        "instancia_id": instancia.get("id") or config.instancia_id,
        "estado": status,
        "conectada": bool(
            (segura.get("status") or {}).get("connected")
            or segura.get("connected")
            or status == "connected"
        ),
        "autenticada": bool(
            (segura.get("status") or {}).get("loggedIn")
            or segura.get("loggedIn")
            or status == "connected"
        ),
        "qrcode": instancia.get("qrcode"),
        "codigo_pareamento": instancia.get("paircode"),
        "perfil_nome": instancia.get("profileName"),
        "perfil_foto": instancia.get("profilePicUrl"),
        "numero": instancia.get("owner"),
        "business": instancia.get("isBusiness"),
        "plataforma": instancia.get("plataform"),
        "ultima_desconexao": instancia.get("lastDisconnect"),
        "motivo_desconexao": instancia.get("lastDisconnectReason"),
    }


class InstanciaInput(BaseModel):
    nome: str = Field(min_length=2, max_length=100)


class PublicoInput(BaseModel):
    tipo: Literal["alunos", "turma", "todos"]
    aluno_ids: list[int] = Field(default_factory=list)
    cod_tur: int | None = None


class PrevisualizacaoInput(PublicoInput):
    mensagem: str = Field(min_length=1, max_length=4096)


class DisparoInput(PrevisualizacaoInput):
    link_preview: bool = True
    consentimento_confirmado: bool = False


def _alunos_publico(
    db: Session, publico: PublicoInput
) -> tuple[list[tuple[Aluno, str | None]], str]:
    """Retorna aluno + motivo de exclusão por status."""
    if publico.tipo == "alunos":
        ids = list(dict.fromkeys(publico.aluno_ids))
        if not ids:
            raise HTTPException(400, "Selecione ao menos um aluno.")
        encontrados = list(
            db.scalars(select(Aluno).where(Aluno.cod_alu.in_(ids)).order_by(Aluno.nome))
        )
        mapa = {aluno.cod_alu: aluno for aluno in encontrados}
        if len(mapa) != len(ids):
            raise HTTPException(400, "Um ou mais alunos selecionados não existem.")
        itens = [
            (mapa[codigo], None if mapa[codigo].status == "A" else "Aluno inativo")
            for codigo in ids
        ]
        descricao = (
            mapa[ids[0]].nome or f"Aluno {ids[0]}"
            if len(ids) == 1
            else f"{len(ids)} alunos selecionados"
        )
        return itens, descricao

    if publico.tipo == "turma":
        if not publico.cod_tur:
            raise HTTPException(400, "Selecione uma turma.")
        turma = db.get(Turma, publico.cod_tur)
        if not turma:
            raise HTTPException(404, "Turma não encontrada.")
        linhas = list(
            db.execute(
                select(Aluno, AluTurma.status)
                .join(AluTurma, AluTurma.cod_alu == Aluno.cod_alu)
                .where(AluTurma.cod_tur == publico.cod_tur)
                .order_by(Aluno.nome)
            )
        )
        itens = []
        for aluno, vinculo_status in linhas:
            motivo = None
            if aluno.status != "A":
                motivo = "Aluno inativo"
            elif vinculo_status != "A":
                motivo = "Matrícula inativa"
            itens.append((aluno, motivo))
        return itens, f"Turma {turma.nome or turma.cod_tur}"

    alunos = list(db.scalars(select(Aluno).where(Aluno.status == "A").order_by(Aluno.nome)))
    return [(aluno, None) for aluno in alunos], "Todos os alunos ativos"


def _resolver_publico(db: Session, dados: PrevisualizacaoInput) -> tuple[list[dict], str]:
    modelo = _validar_modelo(dados.mensagem)
    alunos, descricao = _alunos_publico(db, dados)
    vistos: set[str] = set()
    itens = []
    for aluno, motivo_status in alunos:
        numero, motivo_numero = normalizar_celular(aluno.celular)
        motivo = motivo_status or motivo_numero
        if not motivo and numero in vistos:
            motivo = "Celular duplicado neste disparo"
        if not motivo and numero:
            vistos.add(numero)
        itens.append(
            {
                "cod_alu": aluno.cod_alu,
                "nome": aluno.nome or f"Aluno {aluno.cod_alu}",
                "celular": aluno.celular,
                "numero_normalizado": numero,
                "valido": motivo is None,
                "motivo": motivo,
                "mensagem_final": personalizar_mensagem(modelo, aluno.nome)
                if motivo is None
                else None,
            }
        )
    return itens, descricao


def _resumo_previa(itens: list[dict], descricao: str) -> dict:
    validos = sum(1 for item in itens if item["valido"])
    return {
        "publico_descricao": descricao,
        "total": len(itens),
        "validos": validos,
        "invalidos": len(itens) - validos,
        "itens": itens,
    }


def _disparo_dict(disparo: WhatsappDisparo) -> dict:
    return {
        "id": disparo.id,
        "usuario": disparo.usuario,
        "tipo_publico": disparo.tipo_publico,
        "cod_tur": disparo.cod_tur,
        "publico_descricao": disparo.publico_descricao,
        "mensagem_modelo": disparo.mensagem_modelo,
        "link_preview": disparo.link_preview == "S",
        "status": disparo.status,
        "total_selecionados": disparo.total_selecionados,
        "total_validos": disparo.total_validos,
        "total_invalidos": disparo.total_invalidos,
        "total_agendados": disparo.total_agendados,
        "total_enviados": disparo.total_enviados,
        "total_falhos": disparo.total_falhos,
        "erro": disparo.erro,
        "criado_em": disparo.criado_em.isoformat() if disparo.criado_em else None,
        "atualizado_em": disparo.atualizado_em.isoformat()
        if disparo.atualizado_em
        else None,
    }


def _destinatario_dict(item: WhatsappDestinatario) -> dict:
    return {
        "id": item.id,
        "cod_alu": item.cod_alu,
        "nome": item.nome,
        "celular": item.celular_original,
        "numero_normalizado": item.numero_normalizado,
        "valido": item.valido == "S",
        "motivo": item.motivo,
        "status": item.status,
        "erro": item.erro,
    }


@router.get("/instancia")
def obter_instancia(db: Session = Depends(get_db)):
    config = _configuracao(db)
    if not config:
        return {
            "configurada": False,
            "administracao_configurada": bool(
                settings.uazapi_base_url.strip() and settings.uazapi_admin_token.strip()
            ),
            "estado": "nao_configurada",
            "conectada": False,
        }
    _, cliente = _cliente_instancia(db)
    try:
        return _instancia_publica(cliente.status(), config)
    except UazApiError as exc:
        raise HTTPException(exc.status_code, exc.mensagem) from exc


@router.post("/instancia")
def criar_instancia(dados: InstanciaInput, db: Session = Depends(get_db)):
    if _configuracao(db):
        raise HTTPException(409, "Já existe uma instância configurada.")
    try:
        resposta = UazApiClient().criar_instancia(dados.nome.strip())
    except UazApiError as exc:
        raise HTTPException(exc.status_code, exc.mensagem) from exc
    token = resposta.get("token") or (resposta.get("instance") or {}).get("token")
    if not token:
        raise HTTPException(502, "A UazAPI criou a instância, mas não retornou seu token.")
    instancia = resposta.get("instance") or {}
    agora = _agora()
    config = WhatsappConfiguracao(
        id=1,
        instancia_id=instancia.get("id"),
        nome=instancia.get("name") or dados.nome.strip(),
        token_criptografado=criptografar_token(token),
        criado_em=agora,
        atualizado_em=agora,
    )
    db.add(config)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "A instância já foi configurada por outro usuário.") from exc
    return _instancia_publica(resposta, config)


@router.post("/instancia/conectar")
def conectar_instancia(db: Session = Depends(get_db)):
    config, cliente = _cliente_instancia(db)
    try:
        resposta = cliente.conectar()
        config.atualizado_em = _agora()
        db.commit()
        return _instancia_publica(resposta, config)
    except UazApiError as exc:
        raise HTTPException(exc.status_code, exc.mensagem) from exc


@router.post("/instancia/desconectar")
def desconectar_instancia(db: Session = Depends(get_db)):
    config, cliente = _cliente_instancia(db)
    try:
        resposta = cliente.desconectar()
        config.atualizado_em = _agora()
        db.commit()
        return _instancia_publica(resposta, config)
    except UazApiError as exc:
        raise HTTPException(exc.status_code, exc.mensagem) from exc


@router.post("/previsualizar")
def previsualizar(dados: PrevisualizacaoInput, db: Session = Depends(get_db)):
    itens, descricao = _resolver_publico(db, dados)
    return _resumo_previa(itens, descricao)


@router.post("/disparos")
def criar_disparo(
    dados: DisparoInput,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    if not dados.consentimento_confirmado:
        raise HTTPException(400, "Confirme o consentimento dos destinatários.")
    config, cliente = _cliente_instancia(db)
    try:
        estado = _instancia_publica(cliente.status(), config)
    except UazApiError as exc:
        raise HTTPException(exc.status_code, exc.mensagem) from exc
    if not estado["conectada"]:
        raise HTTPException(409, "Conecte a instância do WhatsApp antes do disparo.")

    itens, descricao = _resolver_publico(db, dados)
    validos = [item for item in itens if item["valido"]]
    if not validos:
        raise HTTPException(400, "Nenhum destinatário possui celular válido para o envio.")

    agora = _agora()
    disparo = WhatsappDisparo(
        usuario=usuario,
        tipo_publico=dados.tipo,
        cod_tur=dados.cod_tur if dados.tipo == "turma" else None,
        publico_descricao=descricao,
        mensagem_modelo=dados.mensagem.strip(),
        link_preview="S" if dados.link_preview else "N",
        status="CRIANDO",
        total_selecionados=len(itens),
        total_validos=len(validos),
        total_invalidos=len(itens) - len(validos),
        total_agendados=0,
        total_enviados=0,
        total_falhos=0,
        criado_em=agora,
        atualizado_em=agora,
    )
    db.add(disparo)
    db.flush()
    for item in itens:
        db.add(
            WhatsappDestinatario(
                disparo_id=disparo.id,
                cod_alu=item["cod_alu"],
                nome=item["nome"],
                celular_original=item["celular"],
                numero_normalizado=item["numero_normalizado"],
                mensagem_final=item["mensagem_final"],
                valido="S" if item["valido"] else "N",
                motivo=item["motivo"],
                status="VALIDADO" if item["valido"] else "INVALIDO",
            )
        )
    db.commit()

    minimo = max(0, settings.whatsapp_delay_min)
    maximo = max(minimo, settings.whatsapp_delay_max)
    payload = {
        "delayMin": minimo,
        "delayMax": maximo,
        "info": f"TOV #{disparo.id} - {descricao}",
        "messages": [
            {
                "number": item["numero_normalizado"],
                "type": "text",
                "text": item["mensagem_final"],
                "linkPreview": dados.link_preview,
            }
            for item in validos
        ],
    }
    try:
        resposta = cliente.enviar_campanha_avancada(payload)
        disparo.pasta_uazapi_id = resposta.get("folder_id")
        disparo.status = "NA_FILA"
        disparo.total_agendados = int(resposta.get("count") or len(validos))
        disparo.atualizado_em = _agora()
        db.execute(
            WhatsappDestinatario.__table__.update()
            .where(
                WhatsappDestinatario.disparo_id == disparo.id,
                WhatsappDestinatario.valido == "S",
            )
            .values(status="AGENDADO")
        )
        db.commit()
        return _disparo_dict(disparo)
    except UazApiError as exc:
        disparo.status = "FALHA"
        disparo.erro = exc.mensagem
        disparo.atualizado_em = _agora()
        db.execute(
            WhatsappDestinatario.__table__.update()
            .where(
                WhatsappDestinatario.disparo_id == disparo.id,
                WhatsappDestinatario.valido == "S",
            )
            .values(status="FALHA", erro=exc.mensagem)
        )
        db.commit()
        raise HTTPException(
            exc.status_code,
            f"Disparo #{disparo.id} registrado, mas não foi enfileirado: {exc.mensagem}",
        ) from exc


@router.get("/disparos")
def listar_disparos(
    pagina: int = 1,
    por_pagina: int = 20,
    db: Session = Depends(get_db),
):
    pagina = max(1, pagina)
    por_pagina = min(100, max(1, por_pagina))
    total = db.scalar(select(func.count()).select_from(WhatsappDisparo)) or 0
    disparos = list(
        db.scalars(
            select(WhatsappDisparo)
            .order_by(WhatsappDisparo.criado_em.desc(), WhatsappDisparo.id.desc())
            .offset((pagina - 1) * por_pagina)
            .limit(por_pagina)
        )
    )
    return {
        "total": total,
        "pagina": pagina,
        "itens": [_disparo_dict(item) for item in disparos],
    }


@router.get("/disparos/{disparo_id}")
def obter_disparo(disparo_id: int, db: Session = Depends(get_db)):
    disparo = db.get(WhatsappDisparo, disparo_id)
    if not disparo:
        raise HTTPException(404, "Disparo não encontrado.")
    destinatarios = list(
        db.scalars(
            select(WhatsappDestinatario)
            .where(WhatsappDestinatario.disparo_id == disparo_id)
            .order_by(WhatsappDestinatario.nome)
        )
    )
    return {
        **_disparo_dict(disparo),
        "destinatarios": [_destinatario_dict(item) for item in destinatarios],
    }


def _numero_mensagem(mensagem: dict) -> str | None:
    candidato = (
        mensagem.get("number")
        or mensagem.get("chatid")
        or mensagem.get("chatId")
        or mensagem.get("receiver")
    )
    if not candidato:
        return None
    return re.sub(r"\D", "", str(candidato).split("@")[0]) or None


@router.post("/disparos/{disparo_id}/sincronizar")
def sincronizar_disparo(disparo_id: int, db: Session = Depends(get_db)):
    disparo = db.get(WhatsappDisparo, disparo_id)
    if not disparo:
        raise HTTPException(404, "Disparo não encontrado.")
    if disparo.status in STATUS_FINAIS or not disparo.pasta_uazapi_id:
        return obter_disparo(disparo_id, db)

    _, cliente = _cliente_instancia(db)
    try:
        mensagens = cliente.listar_mensagens(disparo.pasta_uazapi_id)
    except UazApiError as exc:
        raise HTTPException(exc.status_code, exc.mensagem) from exc

    destinatarios = list(
        db.scalars(
            select(WhatsappDestinatario).where(
                WhatsappDestinatario.disparo_id == disparo_id,
                WhatsappDestinatario.valido == "S",
            )
        )
    )
    por_numero = {item.numero_normalizado: item for item in destinatarios}
    for mensagem in mensagens:
        item = por_numero.get(_numero_mensagem(mensagem))
        if not item:
            continue
        status = str(mensagem.get("status") or mensagem.get("messageStatus") or "").lower()
        if status in {"sent", "delivered", "read", "played"}:
            item.status = "ENVIADO"
            item.erro = None
        elif status in {"failed", "error"}:
            item.status = "FALHA"
            item.erro = str(
                mensagem.get("error")
                or mensagem.get("message")
                or "Falha informada pela UazAPI"
            )[:1000]
        else:
            item.status = "AGENDADO"

    disparo.total_enviados = sum(item.status == "ENVIADO" for item in destinatarios)
    disparo.total_falhos = sum(item.status == "FALHA" for item in destinatarios)
    disparo.total_agendados = sum(item.status == "AGENDADO" for item in destinatarios)
    processados = disparo.total_enviados + disparo.total_falhos
    if processados >= disparo.total_validos:
        disparo.status = (
            "CONCLUIDO_COM_FALHAS" if disparo.total_falhos else "CONCLUIDO"
        )
    elif processados:
        disparo.status = "EM_ANDAMENTO"
    else:
        disparo.status = "NA_FILA"
    disparo.atualizado_em = _agora()
    db.commit()
    return obter_disparo(disparo_id, db)
