import json
import hashlib
import hmac
import re
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal, get_db
from ..models import (
    Aluno,
    AluTurma,
    Turma,
    WhatsappArquivo,
    WhatsappConfiguracao,
    WhatsappDestinatario,
    WhatsappDisparo,
    WhatsappTemplate,
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
public_router = APIRouter(prefix="/whatsapp-publico", tags=["whatsapp"])

STATUS_FINAIS = {"CONCLUIDO", "CONCLUIDO_COM_FALHAS", "FALHA", "CANCELADO"}
VARIAVEIS_SUPORTADAS = {"nome", "primeiro_nome"}
RE_VARIAVEL = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")
TIPOS_MENSAGEM = {"text", "image", "document", "audio", "button", "poll", "carousel"}
MIMES_PERMITIDOS = {
    "image/jpeg", "image/png", "image/webp",
    "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm",
    "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain", "text/csv", "application/zip",
}


def _agora() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _segredo_webhook() -> str:
    return hashlib.sha256(
        f"{settings.secret_key}:uazapi-webhook".encode()
    ).hexdigest()


def _url_webhook() -> str:
    base = settings.public_api_url.strip().rstrip("/")
    return f"{base}/whatsapp-publico/webhook/{_segredo_webhook()}" if base else ""


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


class BotaoInput(BaseModel):
    texto: str = Field(min_length=1, max_length=40)
    tipo: Literal["REPLY", "URL", "COPY", "CALL"] = "REPLY"
    valor: str = Field(min_length=1, max_length=500)


class CartaoInput(BaseModel):
    texto: str = Field(min_length=1, max_length=500)
    arquivo_id: int
    botoes: list[BotaoInput] = Field(min_length=1, max_length=3)


class ConteudoMensagemInput(BaseModel):
    tipo: Literal["text", "image", "document", "audio", "button", "poll", "carousel"]
    mensagem: str = Field(default="", max_length=4096)
    link_preview: bool = True
    arquivo_id: int | None = None
    nome_arquivo: str | None = Field(default=None, max_length=255)
    botoes: list[BotaoInput] = Field(default_factory=list, max_length=3)
    enquete_opcoes: list[str] = Field(default_factory=list, max_length=12)
    enquete_selecionaveis: int = Field(default=1, ge=1, le=12)
    carousel: list[CartaoInput] = Field(default_factory=list, max_length=10)
    sequencia: list["ConteudoMensagemInput"] = Field(default_factory=list, max_length=9)
    intervalo_segundos: int = Field(default=8, ge=1, le=3600)


class PrevisualizacaoInput(BaseModel):
    publico: PublicoInput
    conteudo: ConteudoMensagemInput


class DisparoInput(PrevisualizacaoInput):
    consentimento_confirmado: bool = False
    agendado_para: datetime | None = None


class TemplateInput(BaseModel):
    nome: str = Field(min_length=2, max_length=100)
    categoria: str = Field(default="Geral", min_length=1, max_length=60)
    favorito: bool = False
    conteudo: ConteudoMensagemInput


class ReagendamentoInput(BaseModel):
    agendado_para: datetime


class EdicaoAgendamentoInput(BaseModel):
    conteudo: ConteudoMensagemInput
    agendado_para: datetime


def _arquivo_dict(arquivo: WhatsappArquivo) -> dict:
    base = settings.public_api_url.strip().rstrip("/")
    return {
        "id": arquivo.id,
        "nome": arquivo.nome,
        "mime_type": arquivo.mime_type,
        "tamanho": arquivo.tamanho,
        "url": f"{base}/whatsapp-publico/midia/{arquivo.token_publico}" if base else None,
    }


def _obter_arquivo(db: Session, arquivo_id: int | None) -> WhatsappArquivo:
    arquivo = db.get(WhatsappArquivo, arquivo_id) if arquivo_id else None
    if not arquivo:
        raise HTTPException(400, "Selecione e envie um arquivo válido.")
    if not settings.public_api_url.strip():
        raise HTTPException(503, "TOV_PUBLIC_API_URL não está configurada para envio de mídia.")
    return arquivo


def _validar_texto_variaveis(texto: str) -> str:
    texto = texto.strip()
    desconhecidas = sorted(
        {item for item in RE_VARIAVEL.findall(texto) if item not in VARIAVEIS_SUPORTADAS}
    )
    if desconhecidas:
        raise HTTPException(
            400,
            "Variáveis não reconhecidas: "
            + ", ".join(f"{{{{{item}}}}}" for item in desconhecidas),
        )
    return texto


def _validar_conteudo(
    db: Session, conteudo: ConteudoMensagemInput, *, permitir_sequencia: bool = True
) -> dict:
    texto = _validar_texto_variaveis(conteudo.mensagem)
    if conteudo.tipo in {"text", "button", "poll", "carousel"} and not texto:
        raise HTTPException(400, "Digite o texto principal da mensagem.")

    dados = conteudo.model_dump()
    dados["mensagem"] = texto
    if conteudo.tipo in {"image", "document", "audio"}:
        arquivo = _obter_arquivo(db, conteudo.arquivo_id)
        prefixo_esperado = {
            "image": "image/",
            "audio": "audio/",
            "document": "",
        }[conteudo.tipo]
        if prefixo_esperado and not arquivo.mime_type.startswith(prefixo_esperado):
            raise HTTPException(400, f"O arquivo selecionado não é do tipo {conteudo.tipo}.")
        dados["arquivo"] = _arquivo_dict(arquivo)

    if conteudo.tipo == "button":
        if not 1 <= len(conteudo.botoes) <= 3:
            raise HTTPException(400, "Adicione de 1 a 3 botões.")

    if conteudo.tipo == "poll":
        opcoes = [opcao.strip() for opcao in conteudo.enquete_opcoes if opcao.strip()]
        if not 2 <= len(opcoes) <= 12:
            raise HTTPException(400, "A enquete deve ter de 2 a 12 opções.")
        if conteudo.enquete_selecionaveis > len(opcoes):
            raise HTTPException(400, "A quantidade selecionável supera o número de opções.")
        dados["enquete_opcoes"] = opcoes

    if conteudo.tipo == "carousel":
        if not 2 <= len(conteudo.carousel) <= 10:
            raise HTTPException(400, "O carrossel deve ter de 2 a 10 cartões.")
        cartoes = []
        for cartao in conteudo.carousel:
            arquivo = _obter_arquivo(db, cartao.arquivo_id)
            if not arquivo.mime_type.startswith("image/"):
                raise HTTPException(400, "Cada cartão do carrossel precisa de uma imagem.")
            cartoes.append({
                **cartao.model_dump(),
                "texto": _validar_texto_variaveis(cartao.texto),
                "arquivo": _arquivo_dict(arquivo),
            })
        dados["carousel"] = cartoes
    if conteudo.sequencia:
        if not permitir_sequencia:
            raise HTTPException(400, "Não é permitido aninhar sequências de mensagens.")
        dados["sequencia"] = [
            _validar_conteudo(db, item, permitir_sequencia=False)
            for item in conteudo.sequencia
        ]
    return dados


def _choice_botao(botao: dict) -> str:
    prefixos = {"REPLY": "reply:", "COPY": "copy:", "CALL": "call:", "URL": ""}
    return f"{botao['texto']}|{prefixos[botao['tipo']]}{botao['valor']}"


def _mensagem_uazapi(conteudo: dict, numero: str, nome: str) -> dict:
    tipo = conteudo["tipo"]
    texto = personalizar_mensagem(conteudo.get("mensagem") or "", nome)
    mensagem = {"number": numero, "type": tipo}
    if tipo == "text":
        mensagem.update(text=texto, linkPreview=conteudo.get("link_preview", True))
    elif tipo in {"image", "document", "audio"}:
        mensagem.update(file=conteudo["arquivo"]["url"], text=texto)
        if tipo == "document":
            mensagem["docName"] = (
                conteudo.get("nome_arquivo") or conteudo["arquivo"]["nome"]
            )
    elif tipo == "button":
        mensagem.update(
            text=texto,
            choices=[_choice_botao(botao) for botao in conteudo["botoes"]],
        )
    elif tipo == "poll":
        mensagem.update(
            text=texto,
            choices=conteudo["enquete_opcoes"],
            selectableCount=conteudo["enquete_selecionaveis"],
        )
    elif tipo == "carousel":
        escolhas: list[str] = []
        for cartao in conteudo["carousel"]:
            escolhas.extend([
                f"[{personalizar_mensagem(cartao['texto'], nome)}]",
                f"{{{cartao['arquivo']['url']}}}",
                *[_choice_botao(botao) for botao in cartao["botoes"]],
            ])
        mensagem.update(text=texto, choices=escolhas)
    return mensagem


def _mensagens_uazapi(conteudo: dict, numero: str, nome: str) -> list[dict]:
    principal = {**conteudo, "sequencia": []}
    return [
        _mensagem_uazapi(principal, numero, nome),
        *[
            _mensagem_uazapi({**item, "sequencia": []}, numero, nome)
            for item in conteudo.get("sequencia") or []
        ],
    ]


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


def _resolver_publico(
    db: Session, publico: PublicoInput, conteudo: dict
) -> tuple[list[dict], str]:
    alunos, descricao = _alunos_publico(db, publico)
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
                "mensagem_final": personalizar_mensagem(
                    conteudo.get("mensagem") or f"[{conteudo['tipo']}]", aluno.nome
                )
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
    try:
        conteudo = json.loads(disparo.conteudo_json) if disparo.conteudo_json else {
            "tipo": "text",
            "mensagem": disparo.mensagem_modelo,
            "link_preview": disparo.link_preview == "S",
        }
    except ValueError:
        conteudo = {"tipo": disparo.tipo_mensagem or "text", "mensagem": disparo.mensagem_modelo}
    return {
        "id": disparo.id,
        "usuario": disparo.usuario,
        "tipo_publico": disparo.tipo_publico,
        "cod_tur": disparo.cod_tur,
        "publico_descricao": disparo.publico_descricao,
        "mensagem_modelo": disparo.mensagem_modelo,
        "tipo_mensagem": disparo.tipo_mensagem or "text",
        "conteudo": conteudo,
        "link_preview": disparo.link_preview == "S",
        "agendado_para": disparo.agendado_para.isoformat()
        if disparo.agendado_para
        else None,
        "status": disparo.status,
        "total_selecionados": disparo.total_selecionados,
        "total_validos": disparo.total_validos,
        "total_mensagens": disparo.total_mensagens or disparo.total_validos,
        "total_invalidos": disparo.total_invalidos,
        "total_agendados": disparo.total_agendados,
        "total_enviados": disparo.total_enviados,
        "total_falhos": disparo.total_falhos,
        "total_entregues": disparo.total_entregues or 0,
        "total_lidos": disparo.total_lidos or 0,
        "total_reproduzidos": disparo.total_reproduzidos or 0,
        "disparo_origem_id": disparo.disparo_origem_id,
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


@public_router.get("/midia/{token_publico}")
def obter_midia_publica(token_publico: str, db: Session = Depends(get_db)):
    arquivo = db.scalar(
        select(WhatsappArquivo).where(WhatsappArquivo.token_publico == token_publico)
    )
    if not arquivo:
        raise HTTPException(404, "Arquivo não encontrado.")
    nome_seguro = arquivo.nome.replace('"', "").replace("\r", "").replace("\n", "")
    disposicao = "inline" if arquivo.mime_type.startswith(("image/", "audio/")) else "attachment"
    return Response(
        content=arquivo.conteudo,
        media_type=arquivo.mime_type,
        headers={"Content-Disposition": f'{disposicao}; filename="{nome_seguro}"'},
    )


def _sincronizar_por_webhook() -> None:
    db = SessionLocal()
    try:
        config = _configuracao(db)
        if not config:
            return
        cliente = UazApiClient(descriptografar_token(config.token_criptografado))
        pastas = cliente.listar_campanhas()
        por_id = {
            str(pasta.get("id") or pasta.get("folder_id")): pasta
            for pasta in pastas
        }
        ativos = list(
            db.scalars(
                select(WhatsappDisparo).where(
                    WhatsappDisparo.status.notin_(STATUS_FINAIS),
                    WhatsappDisparo.pasta_uazapi_id.is_not(None),
                )
            )
        )
        for disparo in ativos:
            pasta = por_id.get(str(disparo.pasta_uazapi_id))
            if pasta:
                _aplicar_contadores_pasta(disparo, pasta)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@public_router.post("/webhook/{segredo}")
def receber_webhook(
    segredo: str,
    payload: dict,
    tarefas: BackgroundTasks,
):
    if not hmac.compare_digest(segredo, _segredo_webhook()):
        raise HTTPException(404, "Webhook não encontrado.")
    tarefas.add_task(_sincronizar_por_webhook)
    return {"ok": True}


@router.post("/arquivos")
async def enviar_arquivo(
    arquivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    mime = (arquivo.content_type or "application/octet-stream").lower()
    if mime not in MIMES_PERMITIDOS:
        raise HTTPException(400, f"Tipo de arquivo não permitido: {mime}")
    limite = max(1, settings.whatsapp_upload_max_mb) * 1024 * 1024
    conteudo = await arquivo.read(limite + 1)
    if len(conteudo) > limite:
        raise HTTPException(
            400, f"O arquivo deve ter no máximo {settings.whatsapp_upload_max_mb} MB."
        )
    if not conteudo:
        raise HTTPException(400, "O arquivo está vazio.")
    nome = (arquivo.filename or "arquivo").replace("\\", "/").split("/")[-1][:255]
    registro = WhatsappArquivo(
        token_publico=uuid.uuid4().hex + uuid.uuid4().hex,
        nome=nome,
        mime_type=mime,
        tamanho=len(conteudo),
        conteudo=conteudo,
        criado_por=usuario,
        criado_em=_agora(),
    )
    db.add(registro)
    db.commit()
    db.refresh(registro)
    return _arquivo_dict(registro)


def _template_dict(db: Session, template: WhatsappTemplate) -> dict:
    conteudo_input = ConteudoMensagemInput.model_validate(json.loads(template.conteudo_json))
    return {
        "id": template.id,
        "nome": template.nome,
        "tipo_mensagem": template.tipo_mensagem,
        "categoria": template.categoria or "Geral",
        "favorito": template.favorito == "S",
        "versao": template.versao or 1,
        "conteudo": _validar_conteudo(db, conteudo_input),
        "criado_por": template.criado_por,
        "criado_em": template.criado_em.isoformat(),
        "atualizado_em": template.atualizado_em.isoformat(),
    }


@router.get("/templates")
def listar_templates(db: Session = Depends(get_db)):
    templates = list(
        db.scalars(select(WhatsappTemplate).order_by(WhatsappTemplate.nome))
    )
    return [_template_dict(db, template) for template in templates]


@router.post("/templates")
def criar_template(
    dados: TemplateInput,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    _validar_conteudo(db, dados.conteudo)
    agora = _agora()
    template = WhatsappTemplate(
        nome=dados.nome.strip(),
        tipo_mensagem=dados.conteudo.tipo,
        categoria=dados.categoria.strip(),
        favorito="S" if dados.favorito else "N",
        versao=1,
        conteudo_json=json.dumps(dados.conteudo.model_dump(), ensure_ascii=False),
        criado_por=usuario,
        criado_em=agora,
        atualizado_em=agora,
    )
    db.add(template)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Já existe um template com esse nome.") from exc
    db.refresh(template)
    return _template_dict(db, template)


@router.put("/templates/{template_id}")
def atualizar_template(
    template_id: int,
    dados: TemplateInput,
    db: Session = Depends(get_db),
):
    template = db.get(WhatsappTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template não encontrado.")
    _validar_conteudo(db, dados.conteudo)
    template.nome = dados.nome.strip()
    template.tipo_mensagem = dados.conteudo.tipo
    template.categoria = dados.categoria.strip()
    template.favorito = "S" if dados.favorito else "N"
    template.versao = (template.versao or 1) + 1
    template.conteudo_json = json.dumps(dados.conteudo.model_dump(), ensure_ascii=False)
    template.atualizado_em = _agora()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Já existe um template com esse nome.") from exc
    return _template_dict(db, template)


@router.post("/templates/{template_id}/duplicar")
def duplicar_template(
    template_id: int,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    original = db.get(WhatsappTemplate, template_id)
    if not original:
        raise HTTPException(404, "Template não encontrado.")
    base_nome = f"{original.nome} (cópia)"
    nome = base_nome
    sufixo = 2
    while db.scalar(select(WhatsappTemplate.id).where(WhatsappTemplate.nome == nome)):
        nome = f"{base_nome} {sufixo}"
        sufixo += 1
    agora = _agora()
    copia = WhatsappTemplate(
        nome=nome,
        tipo_mensagem=original.tipo_mensagem,
        categoria=original.categoria,
        favorito=original.favorito,
        versao=1,
        conteudo_json=original.conteudo_json,
        criado_por=usuario,
        criado_em=agora,
        atualizado_em=agora,
    )
    db.add(copia)
    db.commit()
    db.refresh(copia)
    return _template_dict(db, copia)


@router.delete("/templates/{template_id}")
def excluir_template(template_id: int, db: Session = Depends(get_db)):
    template = db.get(WhatsappTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template não encontrado.")
    db.delete(template)
    db.commit()
    return {"ok": True}


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


@router.post("/instancia/configurar-webhook")
def configurar_webhook(db: Session = Depends(get_db)):
    url = _url_webhook()
    if not url:
        raise HTTPException(503, "TOV_PUBLIC_API_URL não está configurada.")
    _, cliente = _cliente_instancia(db)
    try:
        cliente.configurar_webhook(url)
        return {"ok": True, "eventos": ["sender", "messages_update", "connection"]}
    except UazApiError as exc:
        raise HTTPException(exc.status_code, exc.mensagem) from exc


@router.post("/previsualizar")
def previsualizar(dados: PrevisualizacaoInput, db: Session = Depends(get_db)):
    conteudo = _validar_conteudo(db, dados.conteudo)
    itens, descricao = _resolver_publico(db, dados.publico, conteudo)
    return {**_resumo_previa(itens, descricao), "conteudo": conteudo}


@router.post("/testar")
def enviar_teste(dados: ConteudoMensagemInput, db: Session = Depends(get_db)):
    config, cliente = _cliente_instancia(db)
    try:
        estado = _instancia_publica(cliente.status(), config)
    except UazApiError as exc:
        raise HTTPException(exc.status_code, exc.mensagem) from exc
    numero, motivo = normalizar_celular(estado.get("numero"))
    if motivo or not numero:
        raise HTTPException(400, "A UazAPI não informou o número conectado para o teste.")
    conteudo = _validar_conteudo(db, dados)
    mensagens: list[dict] = []
    for item in _mensagens_uazapi(conteudo, numero, estado.get("perfil_nome") or "Secretaria"):
        mensagens.append(item)
    intervalo = conteudo.get("intervalo_segundos") or 1
    try:
        resposta = cliente.enviar_campanha_avancada({
            "delayMin": intervalo,
            "delayMax": intervalo,
            "info": "TOV - teste de mensagem",
            "messages": mensagens,
        })
        return {
            "ok": True,
            "quantidade": len(mensagens),
            "pasta_uazapi_id": resposta.get("folder_id"),
        }
    except UazApiError as exc:
        raise HTTPException(exc.status_code, exc.mensagem) from exc


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

    conteudo = _validar_conteudo(db, dados.conteudo)
    itens, descricao = _resolver_publico(db, dados.publico, conteudo)
    validos = [item for item in itens if item["valido"]]
    if not validos:
        raise HTTPException(400, "Nenhum destinatário possui celular válido para o envio.")

    agora = _agora()
    agendado_para = dados.agendado_para
    if agendado_para:
        if agendado_para.tzinfo:
            agendado_para = agendado_para.astimezone(timezone.utc).replace(tzinfo=None)
        if agendado_para <= agora:
            raise HTTPException(400, "Escolha uma data e hora futura para o agendamento.")
    disparo = WhatsappDisparo(
        usuario=usuario,
        tipo_publico=dados.publico.tipo,
        cod_tur=dados.publico.cod_tur if dados.publico.tipo == "turma" else None,
        publico_descricao=descricao,
        mensagem_modelo=conteudo.get("mensagem") or f"[{conteudo['tipo']}]",
        tipo_mensagem=conteudo["tipo"],
        conteudo_json=json.dumps(conteudo, ensure_ascii=False),
        link_preview="S" if conteudo.get("link_preview") else "N",
        agendado_para=agendado_para,
        status="CRIANDO",
        total_selecionados=len(itens),
        total_validos=len(validos),
        total_mensagens=len(validos) * (1 + len(conteudo.get("sequencia") or [])),
        total_invalidos=len(itens) - len(validos),
        total_agendados=0,
        total_enviados=0,
        total_falhos=0,
        total_entregues=0,
        total_lidos=0,
        total_reproduzidos=0,
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
    mensagens_uazapi = [
        mensagem
        for item in validos
        for mensagem in _mensagens_uazapi(
            conteudo, item["numero_normalizado"], item["nome"]
        )
    ]
    if conteudo.get("sequencia"):
        minimo = maximo = conteudo.get("intervalo_segundos") or minimo
    payload = {
        "delayMin": minimo,
        "delayMax": maximo,
        "info": f"TOV #{disparo.id} - {descricao}",
        "messages": mensagens_uazapi,
    }
    if agendado_para:
        payload["scheduled_for"] = int(
            agendado_para.replace(tzinfo=timezone.utc).timestamp() * 1000
        )
    try:
        resposta = cliente.enviar_campanha_avancada(payload)
        disparo.pasta_uazapi_id = resposta.get("folder_id")
        disparo.status = "AGENDADO" if agendado_para else "NA_FILA"
        disparo.total_agendados = int(
            resposta.get("count") or len(mensagens_uazapi)
        )
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


def _aplicar_contadores_pasta(disparo: WhatsappDisparo, pasta: dict) -> None:
    enviados = int(pasta.get("log_sucess") or pasta.get("log_success") or 0)
    falhos = int(pasta.get("log_failed") or 0)
    total_esperado = disparo.total_mensagens or disparo.total_validos
    total = int(pasta.get("log_total") or total_esperado)
    disparo.total_enviados = min(enviados, total_esperado)
    disparo.total_falhos = min(falhos, max(0, total_esperado - enviados))
    disparo.total_entregues = min(
        int(pasta.get("log_delivered") or 0), total_esperado
    )
    disparo.total_lidos = min(int(pasta.get("log_read") or 0), total_esperado)
    disparo.total_reproduzidos = min(
        int(pasta.get("log_played") or 0), total_esperado
    )
    disparo.total_agendados = max(
        0, min(total, total_esperado) - disparo.total_enviados - disparo.total_falhos
    )
    processados = disparo.total_enviados + disparo.total_falhos
    status_pasta = str(pasta.get("status") or "").lower()
    if status_pasta == "paused":
        disparo.status = "PAUSADO"
    elif status_pasta in {"deleting", "deleted", "canceled", "cancelled"}:
        disparo.status = "CANCELADO"
    elif processados >= total_esperado:
        disparo.status = (
            "CONCLUIDO_COM_FALHAS" if disparo.total_falhos else "CONCLUIDO"
        )
    elif processados:
        disparo.status = "EM_ANDAMENTO"
    elif disparo.agendado_para and disparo.agendado_para > _agora():
        disparo.status = "AGENDADO"
    else:
        disparo.status = "NA_FILA"
    disparo.atualizado_em = _agora()


@router.post("/disparos/sincronizar-ativos")
def sincronizar_disparos_ativos(db: Session = Depends(get_db)):
    ativos = list(
        db.scalars(
            select(WhatsappDisparo).where(
                WhatsappDisparo.status.notin_(STATUS_FINAIS),
                WhatsappDisparo.pasta_uazapi_id.is_not(None),
            )
        )
    )
    if ativos:
        _, cliente = _cliente_instancia(db)
        try:
            pastas = cliente.listar_campanhas()
        except UazApiError as exc:
            raise HTTPException(exc.status_code, exc.mensagem) from exc
        por_id = {
            str(pasta.get("id") or pasta.get("folder_id")): pasta
            for pasta in pastas
        }
        for disparo in ativos:
            pasta = por_id.get(str(disparo.pasta_uazapi_id))
            if pasta:
                _aplicar_contadores_pasta(disparo, pasta)
        db.commit()
    return {
        "atualizados": len(ativos),
        "itens": [
            _disparo_dict(item)
            for item in db.scalars(
                select(WhatsappDisparo)
                .order_by(WhatsappDisparo.criado_em.desc(), WhatsappDisparo.id.desc())
                .limit(30)
            )
        ],
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


@router.post("/disparos/{disparo_id}/previsualizar-edicao")
def previsualizar_edicao(
    disparo_id: int,
    conteudo_input: ConteudoMensagemInput,
    db: Session = Depends(get_db),
):
    disparo = db.get(WhatsappDisparo, disparo_id)
    if not disparo:
        raise HTTPException(404, "Disparo não encontrado.")
    if disparo.status in STATUS_FINAIS or disparo.total_enviados or disparo.total_falhos:
        raise HTTPException(409, "Este disparo não pode mais ser editado.")
    conteudo = _validar_conteudo(db, conteudo_input)
    destinatarios = list(
        db.scalars(
            select(WhatsappDestinatario)
            .where(WhatsappDestinatario.disparo_id == disparo_id)
            .order_by(WhatsappDestinatario.nome)
        )
    )
    itens = [
        {
            "cod_alu": item.cod_alu,
            "nome": item.nome,
            "celular": item.celular_original,
            "numero_normalizado": item.numero_normalizado,
            "valido": item.valido == "S",
            "motivo": item.motivo,
            "mensagem_final": personalizar_mensagem(
                conteudo.get("mensagem") or f"[{conteudo['tipo']}]", item.nome
            ) if item.valido == "S" else None,
        }
        for item in destinatarios
    ]
    return {
        **_resumo_previa(itens, disparo.publico_descricao),
        "conteudo": conteudo,
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
    if not disparo.pasta_uazapi_id:
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
    estados_por_numero: dict[str, list[tuple[str, dict]]] = {}
    for mensagem in mensagens:
        numero = _numero_mensagem(mensagem)
        if not numero or numero not in por_numero:
            continue
        status = str(mensagem.get("status") or mensagem.get("messageStatus") or "").lower()
        estados_por_numero.setdefault(numero, []).append((status, mensagem))

    passos = max(1, (disparo.total_mensagens or disparo.total_validos) // max(1, disparo.total_validos))
    sucesso_status = {"sent", "delivered", "read", "played"}
    for numero, item in por_numero.items():
        estados = estados_por_numero.get(numero, [])
        falha = next((msg for status, msg in estados if status in {"failed", "error"}), None)
        if falha:
            item.status = "FALHA"
            item.erro = str(
                falha.get("error")
                or falha.get("message")
                or "Falha informada pela UazAPI"
            )[:1000]
        elif len(estados) >= passos and all(status in sucesso_status for status, _ in estados):
            item.status = "ENVIADO"
            item.erro = None
        else:
            item.status = "AGENDADO"

    status_mensagens = [
        str(msg.get("status") or msg.get("messageStatus") or "").lower()
        for msg in mensagens
    ]
    disparo.total_enviados = sum(status in sucesso_status for status in status_mensagens)
    disparo.total_falhos = sum(status in {"failed", "error"} for status in status_mensagens)
    disparo.total_entregues = sum(status in {"delivered", "read", "played"} for status in status_mensagens)
    disparo.total_lidos = sum(status in {"read", "played"} for status in status_mensagens)
    disparo.total_reproduzidos = sum(status == "played" for status in status_mensagens)
    total_esperado = disparo.total_mensagens or disparo.total_validos
    disparo.total_agendados = max(
        0, total_esperado - disparo.total_enviados - disparo.total_falhos
    )
    processados = disparo.total_enviados + disparo.total_falhos
    if processados >= total_esperado:
        disparo.status = (
            "CONCLUIDO_COM_FALHAS" if disparo.total_falhos else "CONCLUIDO"
        )
    elif processados:
        disparo.status = "EM_ANDAMENTO"
    elif disparo.agendado_para and disparo.agendado_para > _agora():
        disparo.status = "AGENDADO"
    else:
        disparo.status = "NA_FILA"
    disparo.atualizado_em = _agora()
    db.commit()
    return obter_disparo(disparo_id, db)


def _controlar_disparo(
    disparo_id: int,
    acao: str,
    novo_status: str,
    db: Session,
) -> dict:
    disparo = db.get(WhatsappDisparo, disparo_id)
    if not disparo or not disparo.pasta_uazapi_id:
        raise HTTPException(404, "Campanha da UazAPI não encontrada.")
    if disparo.status in STATUS_FINAIS:
        raise HTTPException(409, "Esta campanha já foi encerrada.")
    _, cliente = _cliente_instancia(db)
    try:
        cliente.controlar_campanha(disparo.pasta_uazapi_id, acao)
    except UazApiError as exc:
        raise HTTPException(exc.status_code, exc.mensagem) from exc
    disparo.status = novo_status
    disparo.atualizado_em = _agora()
    if novo_status == "CANCELADO":
        db.execute(
            WhatsappDestinatario.__table__.update()
            .where(
                WhatsappDestinatario.disparo_id == disparo.id,
                WhatsappDestinatario.status == "AGENDADO",
            )
            .values(status="CANCELADO")
        )
    db.commit()
    return obter_disparo(disparo_id, db)


@router.post("/disparos/{disparo_id}/pausar")
def pausar_disparo(disparo_id: int, db: Session = Depends(get_db)):
    return _controlar_disparo(disparo_id, "stop", "PAUSADO", db)


@router.post("/disparos/{disparo_id}/retomar")
def retomar_disparo(disparo_id: int, db: Session = Depends(get_db)):
    disparo = db.get(WhatsappDisparo, disparo_id)
    status = (
        "AGENDADO"
        if disparo and disparo.agendado_para and disparo.agendado_para > _agora()
        else "NA_FILA"
    )
    return _controlar_disparo(disparo_id, "continue", status, db)


@router.post("/disparos/{disparo_id}/cancelar")
def cancelar_disparo(disparo_id: int, db: Session = Depends(get_db)):
    return _controlar_disparo(disparo_id, "delete", "CANCELADO", db)


@router.post("/disparos/{disparo_id}/reagendar")
def reagendar_disparo(
    disparo_id: int,
    dados: ReagendamentoInput,
    db: Session = Depends(get_db),
):
    disparo = db.get(WhatsappDisparo, disparo_id)
    if not disparo or not disparo.pasta_uazapi_id:
        raise HTTPException(404, "Disparo não encontrado.")
    if disparo.total_enviados or disparo.total_falhos:
        raise HTTPException(409, "Só é possível reagendar antes do primeiro envio.")
    nova_data = dados.agendado_para
    if nova_data.tzinfo:
        nova_data = nova_data.astimezone(timezone.utc).replace(tzinfo=None)
    if nova_data <= _agora():
        raise HTTPException(400, "Escolha uma data e hora futura.")
    conteudo = json.loads(disparo.conteudo_json)
    destinatarios = list(
        db.scalars(
            select(WhatsappDestinatario).where(
                WhatsappDestinatario.disparo_id == disparo_id,
                WhatsappDestinatario.valido == "S",
            )
        )
    )
    mensagens = [
        mensagem
        for item in destinatarios
        for mensagem in _mensagens_uazapi(
            conteudo, item.numero_normalizado, item.nome
        )
    ]
    _, cliente = _cliente_instancia(db)
    try:
        cliente.controlar_campanha(disparo.pasta_uazapi_id, "delete")
        intervalo = conteudo.get("intervalo_segundos") or settings.whatsapp_delay_min
        resposta = cliente.enviar_campanha_avancada({
            "delayMin": intervalo if conteudo.get("sequencia") else settings.whatsapp_delay_min,
            "delayMax": intervalo if conteudo.get("sequencia") else settings.whatsapp_delay_max,
            "scheduled_for": int(
                nova_data.replace(tzinfo=timezone.utc).timestamp() * 1000
            ),
            "info": f"TOV #{disparo.id} reagendado - {disparo.publico_descricao}",
            "messages": mensagens,
        })
    except UazApiError as exc:
        disparo.status = "FALHA"
        disparo.erro = f"Falha ao reagendar: {exc.mensagem}"
        disparo.atualizado_em = _agora()
        db.commit()
        raise HTTPException(exc.status_code, disparo.erro) from exc
    disparo.pasta_uazapi_id = resposta.get("folder_id")
    disparo.agendado_para = nova_data
    disparo.status = "AGENDADO"
    disparo.total_agendados = len(mensagens)
    disparo.erro = None
    disparo.atualizado_em = _agora()
    db.commit()
    return obter_disparo(disparo_id, db)


@router.post("/disparos/{disparo_id}/editar-agendamento")
def editar_agendamento(
    disparo_id: int,
    dados: EdicaoAgendamentoInput,
    db: Session = Depends(get_db),
):
    disparo = db.get(WhatsappDisparo, disparo_id)
    if not disparo or not disparo.pasta_uazapi_id:
        raise HTTPException(404, "Disparo não encontrado.")
    if disparo.status in STATUS_FINAIS:
        raise HTTPException(409, "Esta campanha já foi encerrada.")
    if disparo.total_enviados or disparo.total_falhos:
        raise HTTPException(409, "Só é possível editar antes do primeiro envio.")
    nova_data = dados.agendado_para
    if nova_data.tzinfo:
        nova_data = nova_data.astimezone(timezone.utc).replace(tzinfo=None)
    if nova_data <= _agora():
        raise HTTPException(400, "A campanha editada precisa permanecer agendada para uma data futura.")
    conteudo = _validar_conteudo(db, dados.conteudo)
    destinatarios = list(
        db.scalars(
            select(WhatsappDestinatario).where(
                WhatsappDestinatario.disparo_id == disparo_id,
                WhatsappDestinatario.valido == "S",
            )
        )
    )
    mensagens = [
        mensagem
        for item in destinatarios
        for mensagem in _mensagens_uazapi(conteudo, item.numero_normalizado, item.nome)
    ]
    _, cliente = _cliente_instancia(db)
    intervalo = conteudo.get("intervalo_segundos") or settings.whatsapp_delay_min
    try:
        cliente.controlar_campanha(disparo.pasta_uazapi_id, "delete")
        resposta = cliente.enviar_campanha_avancada({
            "delayMin": intervalo if conteudo.get("sequencia") else settings.whatsapp_delay_min,
            "delayMax": intervalo if conteudo.get("sequencia") else settings.whatsapp_delay_max,
            "scheduled_for": int(
                nova_data.replace(tzinfo=timezone.utc).timestamp() * 1000
            ),
            "info": f"TOV #{disparo.id} editado - {disparo.publico_descricao}",
            "messages": mensagens,
        })
    except UazApiError as exc:
        disparo.status = "FALHA"
        disparo.erro = f"Falha ao editar agendamento: {exc.mensagem}"
        disparo.atualizado_em = _agora()
        db.commit()
        raise HTTPException(exc.status_code, disparo.erro) from exc
    disparo.pasta_uazapi_id = resposta.get("folder_id")
    disparo.mensagem_modelo = conteudo.get("mensagem") or f"[{conteudo['tipo']}]"
    disparo.tipo_mensagem = conteudo["tipo"]
    disparo.conteudo_json = json.dumps(conteudo, ensure_ascii=False)
    disparo.link_preview = "S" if conteudo.get("link_preview") else "N"
    disparo.agendado_para = nova_data
    disparo.status = "AGENDADO"
    disparo.total_mensagens = len(mensagens)
    disparo.total_agendados = len(mensagens)
    disparo.erro = None
    disparo.atualizado_em = _agora()
    db.commit()
    return obter_disparo(disparo_id, db)


@router.post("/disparos/{disparo_id}/reenviar-falhos")
def reenviar_falhos(
    disparo_id: int,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    original = db.get(WhatsappDisparo, disparo_id)
    if not original:
        raise HTTPException(404, "Disparo não encontrado.")
    if original.pasta_uazapi_id:
        sincronizar_disparo(disparo_id, db)
        db.refresh(original)
    falhos = list(
        db.scalars(
            select(WhatsappDestinatario).where(
                WhatsappDestinatario.disparo_id == disparo_id,
                WhatsappDestinatario.status == "FALHA",
                WhatsappDestinatario.valido == "S",
            )
        )
    )
    if not falhos:
        raise HTTPException(409, "Não há destinatários com falha para reenviar.")
    conteudo = json.loads(original.conteudo_json)
    agora = _agora()
    novo = WhatsappDisparo(
        usuario=usuario,
        tipo_publico="reenvio",
        cod_tur=original.cod_tur,
        publico_descricao=f"Reenvio das falhas do disparo #{original.id}",
        mensagem_modelo=original.mensagem_modelo,
        tipo_mensagem=original.tipo_mensagem,
        conteudo_json=original.conteudo_json,
        link_preview=original.link_preview,
        disparo_origem_id=original.id,
        status="CRIANDO",
        total_selecionados=len(falhos),
        total_validos=len(falhos),
        total_mensagens=len(falhos) * (1 + len(conteudo.get("sequencia") or [])),
        total_invalidos=0,
        total_agendados=0,
        total_enviados=0,
        total_falhos=0,
        total_entregues=0,
        total_lidos=0,
        total_reproduzidos=0,
        criado_em=agora,
        atualizado_em=agora,
    )
    db.add(novo)
    db.flush()
    for item in falhos:
        db.add(WhatsappDestinatario(
            disparo_id=novo.id,
            cod_alu=item.cod_alu,
            nome=item.nome,
            celular_original=item.celular_original,
            numero_normalizado=item.numero_normalizado,
            mensagem_final=item.mensagem_final,
            valido="S",
            status="AGENDADO",
        ))
    db.commit()
    mensagens = [
        mensagem
        for item in falhos
        for mensagem in _mensagens_uazapi(
            conteudo, item.numero_normalizado, item.nome
        )
    ]
    _, cliente = _cliente_instancia(db)
    intervalo = conteudo.get("intervalo_segundos") or settings.whatsapp_delay_min
    try:
        resposta = cliente.enviar_campanha_avancada({
            "delayMin": intervalo if conteudo.get("sequencia") else settings.whatsapp_delay_min,
            "delayMax": intervalo if conteudo.get("sequencia") else settings.whatsapp_delay_max,
            "info": f"TOV #{novo.id} - reenvio do #{original.id}",
            "messages": mensagens,
        })
        novo.pasta_uazapi_id = resposta.get("folder_id")
        novo.status = "NA_FILA"
        novo.total_agendados = len(mensagens)
        novo.atualizado_em = _agora()
        db.commit()
        return _disparo_dict(novo)
    except UazApiError as exc:
        novo.status = "FALHA"
        novo.erro = exc.mensagem
        novo.atualizado_em = _agora()
        db.commit()
        raise HTTPException(exc.status_code, exc.mensagem) from exc
