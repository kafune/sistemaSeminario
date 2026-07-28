import json
import hashlib
import hmac
import re
import unicodedata
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
    Lead,
    LeadConsentimentoEvento,
    LeadInteracao,
    Turma,
    Usuario,
    WhatsappArquivo,
    WhatsappConfiguracao,
    WhatsappDestinatario,
    WhatsappDisparo,
    WhatsappTemplate,
)
from ..security import exigir_perfis, perfil_atual, usuario_atual
from ..services.uazapi import (
    UazApiClient,
    UazApiError,
    criptografar_token,
    descriptografar_token,
    sanitizar_resposta,
)
from ..services.notificacoes import criar_notificacao, entregar_lista

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])
public_router = APIRouter(prefix="/whatsapp-publico", tags=["whatsapp"])

STATUS_FINAIS = {"CONCLUIDO", "CONCLUIDO_COM_FALHAS", "FALHA", "CANCELADO"}
STATUS_NOTIFICAVEIS = {"CONCLUIDO", "CONCLUIDO_COM_FALHAS", "FALHA"}
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
    tipo: Literal["alunos", "turma", "todos", "leads"]
    aluno_ids: list[int] = Field(default_factory=list)
    cod_tur: int | None = None
    lead_ids: list[int] = Field(default_factory=list)
    segmento_leads: Literal[
        "todos", "selecionados", "campanha", "origem", "tag", "status_funil"
    ] | None = None
    campanha: str | None = Field(default=None, max_length=100)
    origem: str | None = Field(default=None, max_length=100)
    tag: str | None = Field(default=None, max_length=100)
    status_funil: str | None = Field(default=None, max_length=30)


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
    categoria_api: Literal["MARKETING", "UTILIDADE", "AUTENTICACAO"] = "UTILIDADE"
    finalidade: Literal["NUTRICAO", "COMERCIAL", "OPERACIONAL"] = "OPERACIONAL"


class DisparoInput(PrevisualizacaoInput):
    consentimento_confirmado: bool = False
    agendado_para: datetime | None = None


class TemplateInput(BaseModel):
    nome: str = Field(min_length=2, max_length=100)
    categoria: str = Field(default="Geral", min_length=1, max_length=60)
    categoria_api: Literal["MARKETING", "UTILIDADE", "AUTENTICACAO"] = "UTILIDADE"
    finalidade: Literal["NUTRICAO", "COMERCIAL", "OPERACIONAL"] = "OPERACIONAL"
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


RODAPE_OPTOUT = "Para não receber mais mensagens, responda SAIR."


def _aplicar_optout(conteudo: dict) -> dict:
    """Garante o opt-out no último item da composição de marketing."""
    copia = json.loads(json.dumps(conteudo, ensure_ascii=False))
    itens = [copia, *(copia.get("sequencia") or [])]
    ultimo = itens[-1]
    mensagem = (ultimo.get("mensagem") or "").strip()
    if RODAPE_OPTOUT.casefold() not in mensagem.casefold():
        ultimo["mensagem"] = (
            f"{mensagem}\n\n{RODAPE_OPTOUT}" if mensagem else RODAPE_OPTOUT
        )
    if len(ultimo["mensagem"]) > 4096:
        raise HTTPException(
            400,
            "Reduza a última mensagem para comportar o rodapé obrigatório de opt-out.",
        )
    if len(itens) > 1:
        copia["sequencia"] = itens[1:]
    return copia


def _perfil_usuario(db: Session, usuario: str) -> str:
    registro = db.get(Usuario, usuario)
    return (registro.perfil if registro else "ADMIN") or "ADMIN"


def _validar_acesso_publico(db: Session, usuario: str, publico: PublicoInput) -> None:
    perfil = _perfil_usuario(db, usuario).upper()
    if perfil == "MARKETING" and publico.tipo != "leads":
        raise HTTPException(403, "O perfil Marketing acessa somente a base de leads.")
    if perfil == "SECRETARIA" and publico.tipo == "leads":
        raise HTTPException(403, "O perfil Secretaria não acessa a base de leads.")


def _validar_classificacao(
    publico: PublicoInput, categoria_api: str, finalidade: str
) -> None:
    if publico.tipo == "leads":
        if categoria_api != "MARKETING":
            raise HTTPException(
                400,
                "Disparos para leads devem usar a categoria API Marketing.",
            )
        if finalidade not in {"NUTRICAO", "COMERCIAL"}:
            raise HTTPException(
                400,
                "Defina a finalidade do disparo como Nutrição ou Comercial.",
            )


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


def _leads_publico(
    db: Session, publico: PublicoInput
) -> tuple[list[tuple[Lead, str | None]], str]:
    segmento = publico.segmento_leads or "todos"
    consulta = select(Lead)
    descricao = "Todos os leads ativos com opt-in"
    if segmento == "selecionados":
        ids = list(dict.fromkeys(publico.lead_ids))
        if not ids:
            raise HTTPException(400, "Selecione ao menos um lead.")
        encontrados = list(
            db.scalars(select(Lead).where(Lead.id.in_(ids)).order_by(Lead.nome))
        )
        mapa = {lead.id: lead for lead in encontrados}
        if len(mapa) != len(ids):
            raise HTTPException(400, "Um ou mais leads selecionados não existem.")
        leads = [mapa[item] for item in ids]
        descricao = (
            leads[0].nome
            if len(leads) == 1
            else f"{len(leads)} leads selecionados"
        )
    else:
        if segmento == "campanha":
            if not publico.campanha:
                raise HTTPException(400, "Selecione uma campanha.")
            consulta = consulta.where(Lead.campanha == publico.campanha)
            descricao = f"Leads da campanha {publico.campanha}"
        elif segmento == "origem":
            if not publico.origem:
                raise HTTPException(400, "Selecione uma origem.")
            consulta = consulta.where(Lead.origem == publico.origem)
            descricao = f"Leads da origem {publico.origem}"
        elif segmento == "tag":
            if not publico.tag:
                raise HTTPException(400, "Selecione uma tag.")
            consulta = consulta.where(Lead.tags.like(f"%{publico.tag}%"))
            descricao = f"Leads com a tag {publico.tag}"
        elif segmento == "status_funil":
            if not publico.status_funil:
                raise HTTPException(400, "Selecione um status do funil.")
            consulta = consulta.where(
                Lead.status_funil == publico.status_funil.upper()
            )
            descricao = f"Leads no estágio {publico.status_funil}"
        leads = list(db.scalars(consulta.order_by(Lead.nome)))

    itens: list[tuple[Lead, str | None]] = []
    for lead in leads:
        motivo = None
        if lead.status != "ATIVO":
            motivo = "Lead inativo"
        elif lead.consentimento_status == "PENDENTE":
            motivo = "Opt-in pendente"
        elif lead.consentimento_status == "RECUSADO":
            motivo = "Consentimento recusado"
        elif lead.consentimento_status == "REVOGADO":
            motivo = "Lead solicitou opt-out"
        elif lead.consentimento_status != "CONFIRMADO":
            motivo = "Opt-in não confirmado"
        itens.append((lead, motivo))
    return itens, descricao


def _resolver_publico(
    db: Session, publico: PublicoInput, conteudo: dict
) -> tuple[list[dict], str]:
    if publico.tipo == "leads":
        leads, descricao = _leads_publico(db, publico)
        vistos: set[str] = set()
        itens = []
        for lead, motivo_status in leads:
            numero, motivo_numero = normalizar_celular(lead.telefone)
            motivo = motivo_status or motivo_numero
            if not motivo and numero in vistos:
                motivo = "Telefone duplicado neste disparo"
            if not motivo and numero:
                vistos.add(numero)
            itens.append(
                {
                    "cod_alu": None,
                    "lead_id": lead.id,
                    "nome": lead.nome,
                    "celular": lead.telefone,
                    "numero_normalizado": numero,
                    "valido": motivo is None,
                    "motivo": motivo,
                    "mensagem_final": personalizar_mensagem(
                        conteudo.get("mensagem") or f"[{conteudo['tipo']}]",
                        lead.nome,
                    )
                    if motivo is None
                    else None,
                }
            )
        return itens, descricao

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
                "lead_id": None,
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
        "total_respostas": disparo.total_respostas or 0,
        "total_optouts": disparo.total_optouts or 0,
        "categoria_api": disparo.categoria_api or "UTILIDADE",
        "finalidade": disparo.finalidade or "OPERACIONAL",
        "disparo_origem_id": disparo.disparo_origem_id,
        "erro": disparo.erro,
        "criado_em": disparo.criado_em.isoformat() if disparo.criado_em else None,
        "atualizado_em": disparo.atualizado_em.isoformat()
        if disparo.atualizado_em
        else None,
    }


def _notificar_finalizacao_disparo(
    db: Session, disparo: WhatsappDisparo, status_anterior: str | None
):
    if status_anterior == disparo.status or disparo.status not in STATUS_NOTIFICAVEIS:
        return None
    mensagens = {
        "CONCLUIDO": "O disparo foi concluído.",
        "CONCLUIDO_COM_FALHAS": "O disparo foi concluído com falhas.",
        "FALHA": "O disparo não pôde ser concluído.",
    }
    return criar_notificacao(
        db,
        usuario=disparo.usuario,
        categoria="WHATSAPP",
        titulo=f"Disparo #{disparo.id}",
        corpo=mensagens[disparo.status],
        rota=f"/whatsapp?disparo={disparo.id}",
        chave_evento=f"whatsapp:{disparo.id}:{disparo.status}",
    )


def _destinatario_dict(item: WhatsappDestinatario) -> dict:
    return {
        "id": item.id,
        "cod_alu": item.cod_alu,
        "lead_id": item.lead_id,
        "nome": item.nome,
        "celular": item.celular_original,
        "numero_normalizado": item.numero_normalizado,
        "valido": item.valido == "S",
        "motivo": item.motivo,
        "status": item.status,
        "erro": item.erro,
    }


def _validar_acesso_disparo(
    db: Session, usuario: str, disparo: WhatsappDisparo
) -> None:
    perfil = _perfil_usuario(db, usuario).upper()
    eh_leads = disparo.tipo_publico == "leads"
    if perfil == "MARKETING" and not eh_leads:
        raise HTTPException(403, "O perfil Marketing acessa somente disparos de leads.")
    if perfil == "SECRETARIA" and eh_leads:
        raise HTTPException(403, "O perfil Secretaria não acessa disparos de leads.")


def _detalhe_disparo(disparo: WhatsappDisparo, db: Session) -> dict:
    destinatarios = list(
        db.scalars(
            select(WhatsappDestinatario)
            .where(WhatsappDestinatario.disparo_id == disparo.id)
            .order_by(WhatsappDestinatario.nome)
        )
    )
    return {
        **_disparo_dict(disparo),
        "destinatarios": [_destinatario_dict(item) for item in destinatarios],
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
        notificacoes = []
        for disparo in ativos:
            pasta = por_id.get(str(disparo.pasta_uazapi_id))
            if pasta:
                status_anterior = disparo.status
                _aplicar_contadores_pasta(disparo, pasta)
                notificacao = _notificar_finalizacao_disparo(db, disparo, status_anterior)
                if notificacao:
                    notificacoes.append(notificacao)
        db.commit()
        entregar_lista(db, notificacoes)
    except Exception:
        db.rollback()
    finally:
        db.close()


def _mensagens_recebidas(payload: dict) -> list[dict]:
    if str(payload.get("event") or "").lower() not in {"messages", "message"}:
        return []
    dados = payload.get("data", payload)
    if isinstance(dados, list):
        candidatos = dados
    elif isinstance(dados, dict):
        candidatos = dados.get("messages") or dados.get("items") or [dados]
    else:
        return []
    return [
        item
        for item in candidatos
        if isinstance(item, dict)
        and not item.get("fromMe")
        and not item.get("isGroup")
        and not item.get("wasSentByApi")
    ]


def _texto_mensagem_recebida(mensagem: dict) -> str:
    texto = mensagem.get("text")
    conteudo = mensagem.get("content")
    if not texto and isinstance(conteudo, dict):
        texto = (
            conteudo.get("conversation")
            or (conteudo.get("extendedTextMessage") or {}).get("text")
        )
    return str(texto or "").strip()


def _numero_remetente(mensagem: dict) -> str | None:
    candidato = (
        mensagem.get("sender_pn")
        or mensagem.get("sender")
        or mensagem.get("chatid")
        or mensagem.get("chatId")
    )
    if not candidato:
        return None
    parte = str(candidato).split("@")[0].split(":")[-1]
    numero = re.sub(r"\D", "", parte)
    return numero if 12 <= len(numero) <= 15 else None


def _eh_optout(texto: str) -> bool:
    normalizado = unicodedata.normalize("NFKD", texto)
    normalizado = normalizado.encode("ascii", "ignore").decode().upper()
    normalizado = re.sub(r"[^A-Z0-9]+", " ", normalizado).strip()
    return normalizado in {
        "SAIR",
        "STOP",
        "CANCELAR",
        "PARAR",
        "REMOVER",
        "REMOVA ME",
        "NAO QUERO",
        "NAO TENHO INTERESSE",
    }


def _processar_interacoes_webhook(
    db: Session,
    payload: dict,
    optouts: set[int] | None = None,
) -> int:
    processadas = 0
    instancia = str(payload.get("instance") or "")
    for mensagem in _mensagens_recebidas(payload):
        numero = _numero_remetente(mensagem)
        texto = _texto_mensagem_recebida(mensagem)
        identificador = str(
            mensagem.get("messageid") or mensagem.get("id") or ""
        )
        if not numero or not texto or not identificador:
            continue
        evento_id = f"{instancia}:{identificador}"[:150]
        if db.scalar(
            select(LeadInteracao).where(
                LeadInteracao.mensagem_externa_id == evento_id
            )
        ):
            continue
        lead = db.scalar(
            select(Lead).where(Lead.telefone_normalizado == numero)
        )
        if not lead:
            continue
        linha = db.execute(
            select(WhatsappDestinatario, WhatsappDisparo)
            .join(
                WhatsappDisparo,
                WhatsappDisparo.id == WhatsappDestinatario.disparo_id,
            )
            .where(
                WhatsappDestinatario.lead_id == lead.id,
                WhatsappDisparo.categoria_api == "MARKETING",
            )
            .order_by(WhatsappDisparo.criado_em.desc())
            .limit(1)
        ).first()
        disparo = linha[1] if linha else None
        optout = _eh_optout(texto)
        db.add(
            LeadInteracao(
                lead_id=lead.id,
                disparo_id=disparo.id if disparo else None,
                tipo="OPTOUT" if optout else "RESPOSTA",
                mensagem_externa_id=evento_id,
                texto=texto[:4096],
                criado_em=_agora(),
            )
        )
        if disparo:
            disparo.total_respostas = (disparo.total_respostas or 0) + 1
        if optout and lead.consentimento_status != "REVOGADO":
            anterior = lead.consentimento_status
            agora = _agora()
            lead.consentimento_status = "REVOGADO"
            lead.opt_out_em = agora
            lead.opt_out_origem = "WHATSAPP"
            lead.status = "INATIVO"
            lead.atualizado_em = agora
            db.add(
                LeadConsentimentoEvento(
                    lead_id=lead.id,
                    status_anterior=anterior,
                    status_novo="REVOGADO",
                    origem="WHATSAPP",
                    usuario=None,
                    detalhes=f"Opt-out pela mensagem {identificador}"[:255],
                    criado_em=agora,
                )
            )
            if disparo:
                disparo.total_optouts = (disparo.total_optouts or 0) + 1
        if optout and optouts is not None:
            optouts.add(lead.id)
        processadas += 1
    if processadas:
        db.commit()
    return processadas


def _cancelar_campanhas_por_optout(lead_ids: list[int]) -> None:
    """Interrompe filas de marketing que ainda possam enviar para quem optou sair."""
    if not lead_ids:
        return
    db = SessionLocal()
    try:
        disparos = list(
            db.scalars(
                select(WhatsappDisparo)
                .join(
                    WhatsappDestinatario,
                    WhatsappDestinatario.disparo_id == WhatsappDisparo.id,
                )
                .where(
                    WhatsappDestinatario.lead_id.in_(lead_ids),
                    WhatsappDisparo.categoria_api == "MARKETING",
                    WhatsappDisparo.status.notin_(STATUS_FINAIS),
                    WhatsappDisparo.pasta_uazapi_id.is_not(None),
                )
                .distinct()
            )
        )
        for disparo in disparos:
            cancelada_na_uazapi = False
            falhas: list[str] = []
            try:
                _, cliente = _cliente_instancia(db)
                cliente.controlar_campanha(disparo.pasta_uazapi_id, "delete")
                cancelada_na_uazapi = True
            except (HTTPException, UazApiError) as exc:
                detalhe = exc.detail if isinstance(exc, HTTPException) else exc
                falhas.append(getattr(exc, "mensagem", str(detalhe)))
                try:
                    _, cliente = _cliente_instancia(db)
                    cliente.controlar_campanha(disparo.pasta_uazapi_id, "stop")
                    cancelada_na_uazapi = True
                except (HTTPException, UazApiError) as pausa_exc:
                    falhas.append(
                        getattr(
                            pausa_exc,
                            "mensagem",
                            str(
                                pausa_exc.detail
                                if isinstance(pausa_exc, HTTPException)
                                else pausa_exc
                            ),
                        )
                    )

            motivo = (
                "Campanha cancelada automaticamente após opt-out de lead."
                if cancelada_na_uazapi
                else "ALERTA: não foi possível interromper a fila externa após opt-out."
            )
            if falhas:
                motivo = f"{motivo} {' | '.join(falhas)}"[:4000]
            disparo.status = "CANCELADO" if cancelada_na_uazapi else "FALHA"
            disparo.erro = motivo
            disparo.total_agendados = 0
            disparo.atualizado_em = _agora()
            db.execute(
                WhatsappDestinatario.__table__.update()
                .where(
                    WhatsappDestinatario.disparo_id == disparo.id,
                    WhatsappDestinatario.status == "AGENDADO",
                )
                .values(
                    status="CANCELADO" if cancelada_na_uazapi else "FALHA",
                    erro=motivo[:255],
                )
            )
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
    db: Session = Depends(get_db),
):
    if not hmac.compare_digest(segredo, _segredo_webhook()):
        raise HTTPException(404, "Webhook não encontrado.")
    optouts: set[int] = set()
    _processar_interacoes_webhook(db, payload, optouts)
    if optouts:
        tarefas.add_task(_cancelar_campanhas_por_optout, sorted(optouts))
    evento = str(payload.get("event") or "").lower()
    if evento not in {"message", "messages"}:
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
        "categoria_api": template.categoria_api or "UTILIDADE",
        "finalidade": template.finalidade or "OPERACIONAL",
        "favorito": template.favorito == "S",
        "versao": template.versao or 1,
        "conteudo": _validar_conteudo(db, conteudo_input),
        "criado_por": template.criado_por,
        "criado_em": template.criado_em.isoformat(),
        "atualizado_em": template.atualizado_em.isoformat(),
    }


def _template_permitido(perfil: str, categoria_api: str, finalidade: str) -> bool:
    perfil = perfil.upper()
    categoria_api = (categoria_api or "UTILIDADE").upper()
    finalidade = (finalidade or "OPERACIONAL").upper()
    if perfil == "ADMIN":
        return True
    if perfil == "MARKETING":
        return (
            categoria_api == "MARKETING"
            and finalidade in {"NUTRICAO", "COMERCIAL"}
        )
    return categoria_api != "MARKETING" and finalidade == "OPERACIONAL"


def _validar_escopo_template(
    perfil: str,
    categoria_api: str,
    finalidade: str,
) -> None:
    if not _template_permitido(perfil, categoria_api, finalidade):
        raise HTTPException(
            403,
            "Este template pertence a uma área diferente do seu perfil.",
        )


@router.get("/templates")
def listar_templates(
    db: Session = Depends(get_db),
    perfil: str = Depends(perfil_atual),
):
    templates = list(
        db.scalars(select(WhatsappTemplate).order_by(WhatsappTemplate.nome))
    )
    return [
        _template_dict(db, template)
        for template in templates
        if _template_permitido(
            perfil,
            template.categoria_api or "UTILIDADE",
            template.finalidade or "OPERACIONAL",
        )
    ]


@router.post("/templates")
def criar_template(
    dados: TemplateInput,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
    perfil: str = Depends(perfil_atual),
):
    _validar_escopo_template(perfil, dados.categoria_api, dados.finalidade)
    _validar_conteudo(db, dados.conteudo)
    agora = _agora()
    template = WhatsappTemplate(
        nome=dados.nome.strip(),
        tipo_mensagem=dados.conteudo.tipo,
        categoria=dados.categoria.strip(),
        categoria_api=dados.categoria_api,
        finalidade=dados.finalidade,
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
    perfil: str = Depends(perfil_atual),
):
    template = db.get(WhatsappTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template não encontrado.")
    _validar_escopo_template(
        perfil,
        template.categoria_api or "UTILIDADE",
        template.finalidade or "OPERACIONAL",
    )
    _validar_escopo_template(perfil, dados.categoria_api, dados.finalidade)
    _validar_conteudo(db, dados.conteudo)
    template.nome = dados.nome.strip()
    template.tipo_mensagem = dados.conteudo.tipo
    template.categoria = dados.categoria.strip()
    template.categoria_api = dados.categoria_api
    template.finalidade = dados.finalidade
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
    perfil: str = Depends(perfil_atual),
):
    original = db.get(WhatsappTemplate, template_id)
    if not original:
        raise HTTPException(404, "Template não encontrado.")
    _validar_escopo_template(
        perfil,
        original.categoria_api or "UTILIDADE",
        original.finalidade or "OPERACIONAL",
    )
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
        categoria_api=original.categoria_api,
        finalidade=original.finalidade,
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
def excluir_template(
    template_id: int,
    db: Session = Depends(get_db),
    perfil: str = Depends(perfil_atual),
):
    template = db.get(WhatsappTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template não encontrado.")
    _validar_escopo_template(
        perfil,
        template.categoria_api or "UTILIDADE",
        template.finalidade or "OPERACIONAL",
    )
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
def criar_instancia(
    dados: InstanciaInput,
    db: Session = Depends(get_db),
    _perfil: str = Depends(exigir_perfis("ADMIN")),
):
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
def conectar_instancia(
    db: Session = Depends(get_db),
    _perfil: str = Depends(exigir_perfis("ADMIN")),
):
    config, cliente = _cliente_instancia(db)
    try:
        resposta = cliente.conectar()
        config.atualizado_em = _agora()
        db.commit()
        return _instancia_publica(resposta, config)
    except UazApiError as exc:
        raise HTTPException(exc.status_code, exc.mensagem) from exc


@router.post("/instancia/desconectar")
def desconectar_instancia(
    db: Session = Depends(get_db),
    _perfil: str = Depends(exigir_perfis("ADMIN")),
):
    config, cliente = _cliente_instancia(db)
    try:
        resposta = cliente.desconectar()
        config.atualizado_em = _agora()
        db.commit()
        return _instancia_publica(resposta, config)
    except UazApiError as exc:
        raise HTTPException(exc.status_code, exc.mensagem) from exc


@router.post("/instancia/configurar-webhook")
def configurar_webhook(
    db: Session = Depends(get_db),
    _perfil: str = Depends(exigir_perfis("ADMIN")),
):
    url = _url_webhook()
    if not url:
        raise HTTPException(503, "TOV_PUBLIC_API_URL não está configurada.")
    _, cliente = _cliente_instancia(db)
    try:
        cliente.configurar_webhook(url)
        return {
            "ok": True,
            "eventos": ["sender", "messages", "messages_update", "connection"],
        }
    except UazApiError as exc:
        raise HTTPException(exc.status_code, exc.mensagem) from exc


@router.post("/previsualizar")
def previsualizar(
    dados: PrevisualizacaoInput,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    _validar_acesso_publico(db, usuario, dados.publico)
    _validar_classificacao(
        dados.publico, dados.categoria_api, dados.finalidade
    )
    conteudo = _validar_conteudo(db, dados.conteudo)
    if dados.publico.tipo == "leads":
        conteudo = _aplicar_optout(conteudo)
    itens, descricao = _resolver_publico(db, dados.publico, conteudo)
    return {
        **_resumo_previa(itens, descricao),
        "conteudo": conteudo,
        "categoria_api": dados.categoria_api,
        "finalidade": dados.finalidade,
    }


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
    _validar_acesso_publico(db, usuario, dados.publico)
    _validar_classificacao(
        dados.publico, dados.categoria_api, dados.finalidade
    )
    config, cliente = _cliente_instancia(db)
    try:
        estado = _instancia_publica(cliente.status(), config)
    except UazApiError as exc:
        raise HTTPException(exc.status_code, exc.mensagem) from exc
    if not estado["conectada"]:
        raise HTTPException(409, "Conecte a instância do WhatsApp antes do disparo.")

    conteudo = _validar_conteudo(db, dados.conteudo)
    if dados.publico.tipo == "leads":
        conteudo = _aplicar_optout(conteudo)
    itens, descricao = _resolver_publico(db, dados.publico, conteudo)
    validos = [item for item in itens if item["valido"]]
    if not validos:
        raise HTTPException(400, "Nenhum destinatário possui celular válido para o envio.")
    limite = max(1, settings.whatsapp_mass_max_recipients)
    if len(validos) > limite:
        raise HTTPException(
            400,
            f"O segmento possui {len(validos)} destinatários; o limite configurado "
            f"por disparo é {limite}. Divida o público em segmentos menores.",
        )

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
        total_respostas=0,
        total_optouts=0,
        categoria_api=dados.categoria_api,
        finalidade=dados.finalidade,
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
                lead_id=item["lead_id"],
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
        status_anterior = disparo.status
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
        notificacao = _notificar_finalizacao_disparo(db, disparo, status_anterior)
        db.commit()
        if notificacao:
            entregar_lista(db, [notificacao])
        raise HTTPException(
            exc.status_code,
            f"Disparo #{disparo.id} registrado, mas não foi enfileirado: {exc.mensagem}",
        ) from exc


@router.get("/disparos")
def listar_disparos(
    pagina: int = 1,
    por_pagina: int = 20,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    pagina = max(1, pagina)
    por_pagina = min(100, max(1, por_pagina))
    consulta = select(WhatsappDisparo)
    perfil = _perfil_usuario(db, usuario).upper()
    if perfil == "MARKETING":
        consulta = consulta.where(WhatsappDisparo.tipo_publico == "leads")
    elif perfil == "SECRETARIA":
        consulta = consulta.where(WhatsappDisparo.tipo_publico != "leads")
    total = db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    disparos = list(
        db.scalars(
            consulta
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
def sincronizar_disparos_ativos(
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
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
        notificacoes = []
        for disparo in ativos:
            pasta = por_id.get(str(disparo.pasta_uazapi_id))
            if pasta:
                status_anterior = disparo.status
                _aplicar_contadores_pasta(disparo, pasta)
                notificacao = _notificar_finalizacao_disparo(db, disparo, status_anterior)
                if notificacao:
                    notificacoes.append(notificacao)
        db.commit()
        entregar_lista(db, notificacoes)
    consulta_retorno = (
        select(WhatsappDisparo)
        .order_by(WhatsappDisparo.criado_em.desc(), WhatsappDisparo.id.desc())
        .limit(30)
    )
    perfil = _perfil_usuario(db, usuario).upper()
    if perfil == "MARKETING":
        consulta_retorno = consulta_retorno.where(
            WhatsappDisparo.tipo_publico == "leads"
        )
    elif perfil == "SECRETARIA":
        consulta_retorno = consulta_retorno.where(
            WhatsappDisparo.tipo_publico != "leads"
        )
    return {
        "atualizados": len(ativos),
        "itens": [
            _disparo_dict(item)
            for item in db.scalars(consulta_retorno)
        ],
    }


@router.get("/disparos/{disparo_id}")
def obter_disparo(
    disparo_id: int,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    disparo = db.get(WhatsappDisparo, disparo_id)
    if not disparo:
        raise HTTPException(404, "Disparo não encontrado.")
    _validar_acesso_disparo(db, usuario, disparo)
    return _detalhe_disparo(disparo, db)


@router.post("/disparos/{disparo_id}/previsualizar-edicao")
def previsualizar_edicao(
    disparo_id: int,
    conteudo_input: ConteudoMensagemInput,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    disparo = db.get(WhatsappDisparo, disparo_id)
    if not disparo:
        raise HTTPException(404, "Disparo não encontrado.")
    _validar_acesso_disparo(db, usuario, disparo)
    if disparo.status in STATUS_FINAIS or disparo.total_enviados or disparo.total_falhos:
        raise HTTPException(409, "Este disparo não pode mais ser editado.")
    conteudo = _validar_conteudo(db, conteudo_input)
    if disparo.tipo_publico == "leads":
        conteudo = _aplicar_optout(conteudo)
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
            "lead_id": item.lead_id,
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
def sincronizar_disparo(
    disparo_id: int,
    db: Session = Depends(get_db),
    usuario: str | None = Depends(usuario_atual),
):
    disparo = db.get(WhatsappDisparo, disparo_id)
    if not disparo:
        raise HTTPException(404, "Disparo não encontrado.")
    # Chamadas internas reutilizam esta rotina sem passar pelo resolvedor do FastAPI.
    if isinstance(usuario, str):
        _validar_acesso_disparo(db, usuario, disparo)
    if not disparo.pasta_uazapi_id:
        return _detalhe_disparo(disparo, db)

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
    status_anterior = disparo.status
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
    notificacao = _notificar_finalizacao_disparo(db, disparo, status_anterior)
    db.commit()
    if notificacao:
        entregar_lista(db, [notificacao])
    return _detalhe_disparo(disparo, db)


def _controlar_disparo(
    disparo_id: int,
    acao: str,
    novo_status: str,
    db: Session,
    usuario: str,
) -> dict:
    disparo = db.get(WhatsappDisparo, disparo_id)
    if not disparo or not disparo.pasta_uazapi_id:
        raise HTTPException(404, "Campanha da UazAPI não encontrada.")
    _validar_acesso_disparo(db, usuario, disparo)
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
    return _detalhe_disparo(disparo, db)


@router.post("/disparos/{disparo_id}/pausar")
def pausar_disparo(
    disparo_id: int,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    return _controlar_disparo(disparo_id, "stop", "PAUSADO", db, usuario)


@router.post("/disparos/{disparo_id}/retomar")
def retomar_disparo(
    disparo_id: int,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    disparo = db.get(WhatsappDisparo, disparo_id)
    if disparo:
        _validar_acesso_disparo(db, usuario, disparo)
    status = (
        "AGENDADO"
        if disparo and disparo.agendado_para and disparo.agendado_para > _agora()
        else "NA_FILA"
    )
    return _controlar_disparo(disparo_id, "continue", status, db, usuario)


@router.post("/disparos/{disparo_id}/cancelar")
def cancelar_disparo(
    disparo_id: int,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    return _controlar_disparo(disparo_id, "delete", "CANCELADO", db, usuario)


@router.post("/disparos/{disparo_id}/reagendar")
def reagendar_disparo(
    disparo_id: int,
    dados: ReagendamentoInput,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    disparo = db.get(WhatsappDisparo, disparo_id)
    if not disparo or not disparo.pasta_uazapi_id:
        raise HTTPException(404, "Disparo não encontrado.")
    _validar_acesso_disparo(db, usuario, disparo)
    if disparo.status in STATUS_FINAIS:
        raise HTTPException(409, "Esta campanha já foi encerrada.")
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
    return _detalhe_disparo(disparo, db)


@router.post("/disparos/{disparo_id}/editar-agendamento")
def editar_agendamento(
    disparo_id: int,
    dados: EdicaoAgendamentoInput,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    disparo = db.get(WhatsappDisparo, disparo_id)
    if not disparo or not disparo.pasta_uazapi_id:
        raise HTTPException(404, "Disparo não encontrado.")
    _validar_acesso_disparo(db, usuario, disparo)
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
    if disparo.tipo_publico == "leads":
        conteudo = _aplicar_optout(conteudo)
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
    return _detalhe_disparo(disparo, db)


@router.post("/disparos/{disparo_id}/reenviar-falhos")
def reenviar_falhos(
    disparo_id: int,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    original = db.get(WhatsappDisparo, disparo_id)
    if not original:
        raise HTTPException(404, "Disparo não encontrado.")
    _validar_acesso_disparo(db, usuario, original)
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
    if original.tipo_publico == "leads":
        leads_permitidos = {
            lead.id
            for lead in db.scalars(
                select(Lead).where(
                    Lead.id.in_(
                        [item.lead_id for item in falhos if item.lead_id is not None]
                    ),
                    Lead.status == "ATIVO",
                    Lead.consentimento_status == "CONFIRMADO",
                )
            )
        }
        falhos = [
            item
            for item in falhos
            if item.lead_id is not None and item.lead_id in leads_permitidos
        ]
    if not falhos:
        raise HTTPException(
            409,
            "Não há destinatários elegíveis com falha para reenviar.",
        )
    conteudo = json.loads(original.conteudo_json)
    agora = _agora()
    novo = WhatsappDisparo(
        usuario=usuario,
        tipo_publico=original.tipo_publico,
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
        total_respostas=0,
        total_optouts=0,
        categoria_api=original.categoria_api or "UTILIDADE",
        finalidade=original.finalidade or "OPERACIONAL",
        criado_em=agora,
        atualizado_em=agora,
    )
    db.add(novo)
    db.flush()
    for item in falhos:
        db.add(WhatsappDestinatario(
            disparo_id=novo.id,
            cod_alu=item.cod_alu,
            lead_id=item.lead_id,
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
