import json
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db, row_to_dict
from ..models import (
    Lead,
    LeadConsentimentoEvento,
    LeadImportacao,
    LeadImportacaoItem,
)
from ..security import exigir_perfis, usuario_atual
from .importacoes import LIMITE_ARQUIVO, _ler_matriz
from .whatsapp import normalizar_celular

router = APIRouter(
    prefix="/leads",
    tags=["leads"],
    dependencies=[Depends(exigir_perfis("ADMIN", "MARKETING"))],
)

STATUS_VALIDOS = {"ATIVO", "INATIVO"}
STATUS_FUNIL_VALIDOS = {
    "NOVO",
    "NUTRICAO",
    "QUALIFICADO",
    "OPORTUNIDADE",
    "CONVERTIDO",
    "DESCARTADO",
}
CONSENTIMENTOS_VALIDOS = {"PENDENTE", "CONFIRMADO", "RECUSADO", "REVOGADO"}


def _agora() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _texto(valor) -> str | None:
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    texto = str(valor or "").strip()
    return texto or None


def _normalizar_texto(valor) -> str:
    texto = unicodedata.normalize("NFKD", str(valor or ""))
    texto = texto.encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", texto).strip()


def _tags(valor) -> str | None:
    partes = [
        item.strip()
        for item in re.split(r"[,;|]", str(valor or ""))
        if item.strip()
    ]
    unicas = list(dict.fromkeys(partes))
    return ", ".join(unicas)[:1000] or None


def _data(valor) -> date | None:
    if valor in (None, ""):
        return None
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    if isinstance(valor, (int, float)):
        # Serial de data usado por Excel; 1899-12-30 cobre o ajuste histórico.
        return (datetime(1899, 12, 30) + timedelta(days=float(valor))).date()
    texto = str(valor).strip()
    for formato in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(texto[:10], formato).date()
        except ValueError:
            continue
    raise ValueError(f"data de captação inválida: {texto}")


def _consentimento(valor) -> tuple[str, str | None]:
    normalizado = _normalizar_texto(valor)
    if not normalizado:
        return "PENDENTE", "Consentimento não informado; marcado como pendente"
    if normalizado in {
        "sim", "s", "yes", "y", "true", "1", "aceito", "aceitou",
        "confirmado", "opt in", "autorizado", "consentiu",
    }:
        return "CONFIRMADO", None
    if normalizado in {
        "nao", "n", "no", "false", "0", "recusado", "nao autorizou",
        "sem consentimento",
    }:
        return "RECUSADO", None
    if normalizado in {"pendente", "aguardando", "nao informado"}:
        return "PENDENTE", None
    raise ValueError(f"consentimento inválido: {valor}")


def _registrar_consentimento(
    db: Session,
    lead: Lead,
    novo_status: str,
    *,
    origem: str,
    usuario: str | None,
    detalhes: str | None = None,
) -> None:
    anterior = lead.consentimento_status
    if anterior == novo_status:
        return
    lead.consentimento_status = novo_status
    agora = _agora()
    if novo_status == "CONFIRMADO":
        lead.consentimento_em = agora
        lead.consentimento_origem = origem
        lead.opt_out_em = None
        lead.opt_out_origem = None
    elif novo_status == "REVOGADO":
        lead.opt_out_em = agora
        lead.opt_out_origem = origem
        lead.status = "INATIVO"
    db.add(
        LeadConsentimentoEvento(
            lead_id=lead.id,
            status_anterior=anterior,
            status_novo=novo_status,
            origem=origem,
            usuario=usuario,
            detalhes=detalhes,
            criado_em=agora,
        )
    )


def _lead_dict(lead: Lead) -> dict:
    dados = row_to_dict(lead)
    dados["tags_lista"] = [
        item.strip() for item in (lead.tags or "").split(",") if item.strip()
    ]
    return dados


class LeadInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    nome: str = Field(min_length=1, max_length=100)
    telefone: str = Field(min_length=8, max_length=30)
    e_mail: str | None = Field(default=None, max_length=100)
    origem: str | None = Field(default=None, max_length=100)
    campanha: str | None = Field(default=None, max_length=100)
    captado_em: date | None = None
    tags: str | None = Field(default=None, max_length=1000)
    status: str = "ATIVO"
    status_funil: str = "NOVO"
    consentimento_status: str = "PENDENTE"
    consentimento_origem: str | None = Field(default=None, max_length=100)


def _validar_codigos(dados: LeadInput) -> None:
    if dados.status.upper() not in STATUS_VALIDOS:
        raise HTTPException(400, "Status do lead inválido.")
    if dados.status_funil.upper() not in STATUS_FUNIL_VALIDOS:
        raise HTTPException(400, "Status do funil inválido.")
    if dados.consentimento_status.upper() not in CONSENTIMENTOS_VALIDOS:
        raise HTTPException(400, "Status de consentimento inválido.")


@router.get("")
def listar(
    busca: str = "",
    status: str | None = None,
    origem: str | None = None,
    campanha: str | None = None,
    tag: str | None = None,
    status_funil: str | None = None,
    consentimento: str | None = None,
    pagina: int = 1,
    por_pagina: int = 50,
    db: Session = Depends(get_db),
):
    consulta = select(Lead)
    if busca.strip():
        termo = f"%{busca.strip()}%"
        consulta = consulta.where(
            or_(
                Lead.nome.like(termo),
                Lead.e_mail.like(termo),
                Lead.telefone.like(termo),
                Lead.telefone_normalizado.like(termo),
            )
        )
    if status:
        consulta = consulta.where(Lead.status == status.upper())
    if origem:
        consulta = consulta.where(Lead.origem == origem)
    if campanha:
        consulta = consulta.where(Lead.campanha == campanha)
    if tag:
        consulta = consulta.where(Lead.tags.like(f"%{tag}%"))
    if status_funil:
        consulta = consulta.where(Lead.status_funil == status_funil.upper())
    if consentimento:
        consulta = consulta.where(
            Lead.consentimento_status == consentimento.upper()
        )
    pagina = max(1, pagina)
    por_pagina = min(100, max(1, por_pagina))
    total = db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    itens = list(
        db.scalars(
            consulta.order_by(Lead.criado_em.desc(), Lead.nome)
            .offset((pagina - 1) * por_pagina)
            .limit(por_pagina)
        )
    )
    return {"total": total, "pagina": pagina, "itens": [_lead_dict(item) for item in itens]}


@router.get("/opcoes")
def opcoes(db: Session = Depends(get_db)):
    def distintos(coluna):
        return [
            item
            for item in db.scalars(
                select(coluna)
                .where(coluna.is_not(None), coluna != "")
                .distinct()
                .order_by(coluna)
            )
            if item
        ]

    tags = set()
    for valor in db.scalars(select(Lead.tags).where(Lead.tags.is_not(None))):
        tags.update(item.strip() for item in valor.split(",") if item.strip())
    return {
        "origens": distintos(Lead.origem),
        "campanhas": distintos(Lead.campanha),
        "tags": sorted(tags, key=str.casefold),
        "status_funil": sorted(STATUS_FUNIL_VALIDOS),
    }


@router.get("/importacoes/modelo")
def modelo_importacao_leads():
    workbook = Workbook()
    planilha = workbook.active
    planilha.title = "Leads"
    cabecalhos = [
        "Nome", "Telefone", "E-mail", "Origem", "Campanha",
        "Data de captação", "Tags", "Status do funil", "Opt-in",
    ]
    planilha.append(cabecalhos)
    planilha.append([
        "Maria Exemplo", "(11) 99999-8888", "maria.exemplo@example.com",
        "Landing page", "Curso 2026", "28/07/2026", "interessado, curso",
        "NUTRICAO", "Sim",
    ])
    planilha.freeze_panes = "A2"
    planilha.auto_filter.ref = planilha.dimensions
    planilha.column_dimensions["A"].width = 24
    planilha.column_dimensions["B"].width = 20
    planilha.column_dimensions["C"].width = 32
    planilha.column_dimensions["F"].width = 20
    planilha.column_dimensions["H"].width = 18

    conteudo = BytesIO()
    workbook.save(conteudo)
    conteudo.seek(0)
    return StreamingResponse(
        conteudo,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition":
                'attachment; filename="modelo-importacao-leads.xlsx"',
        },
    )


@router.get("/importacoes")
def listar_importacoes(db: Session = Depends(get_db)):
    itens = list(
        db.scalars(
            select(LeadImportacao)
            .order_by(LeadImportacao.criado_em.desc())
            .limit(30)
        )
    )
    return [row_to_dict(item) for item in itens]


@router.get("/{lead_id}")
def obter(lead_id: int, db: Session = Depends(get_db)):
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(404, "Lead não encontrado.")
    dados = _lead_dict(lead)
    eventos = list(
        db.scalars(
            select(LeadConsentimentoEvento)
            .where(LeadConsentimentoEvento.lead_id == lead_id)
            .order_by(LeadConsentimentoEvento.criado_em.desc())
        )
    )
    dados["auditoria_consentimento"] = [row_to_dict(item) for item in eventos]
    return dados


@router.post("")
def criar(
    dados: LeadInput,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    _validar_codigos(dados)
    numero, motivo = normalizar_celular(dados.telefone)
    if motivo or not numero:
        raise HTTPException(400, motivo or "Telefone inválido.")
    if db.scalar(select(Lead).where(Lead.telefone_normalizado == numero)):
        raise HTTPException(409, "Já existe um lead com este telefone.")
    agora = _agora()
    consentimento = dados.consentimento_status.upper()
    lead = Lead(
        nome=dados.nome,
        telefone=dados.telefone,
        telefone_normalizado=numero,
        e_mail=_texto(dados.e_mail),
        origem=_texto(dados.origem),
        campanha=_texto(dados.campanha),
        captado_em=dados.captado_em or date.today(),
        tags=_tags(dados.tags),
        status=dados.status.upper(),
        status_funil=dados.status_funil.upper(),
        consentimento_status=consentimento,
        consentimento_origem=_texto(dados.consentimento_origem) or "CADASTRO_MANUAL",
        consentimento_em=agora if consentimento == "CONFIRMADO" else None,
        opt_out_em=agora if consentimento == "REVOGADO" else None,
        opt_out_origem=(
            (_texto(dados.consentimento_origem) or "CADASTRO_MANUAL")
            if consentimento == "REVOGADO"
            else None
        ),
        origem_importacao="MANUAL",
        criado_por=usuario,
        criado_em=agora,
        atualizado_em=agora,
    )
    if consentimento in {"RECUSADO", "REVOGADO"}:
        lead.status = "INATIVO"
    db.add(lead)
    db.flush()
    db.add(
        LeadConsentimentoEvento(
            lead_id=lead.id,
            status_anterior=None,
            status_novo=consentimento,
            origem=lead.consentimento_origem or "CADASTRO_MANUAL",
            usuario=usuario,
            detalhes="Cadastro manual do lead",
            criado_em=agora,
        )
    )
    db.commit()
    db.refresh(lead)
    return _lead_dict(lead)


@router.put("/{lead_id}")
def atualizar(
    lead_id: int,
    dados: LeadInput,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(404, "Lead não encontrado.")
    _validar_codigos(dados)
    numero, motivo = normalizar_celular(dados.telefone)
    if motivo or not numero:
        raise HTTPException(400, motivo or "Telefone inválido.")
    duplicado = db.scalar(
        select(Lead).where(
            Lead.telefone_normalizado == numero,
            Lead.id != lead_id,
        )
    )
    if duplicado:
        raise HTTPException(409, "Já existe outro lead com este telefone.")
    novo_consentimento = dados.consentimento_status.upper()
    if (
        lead.consentimento_status == "REVOGADO"
        and novo_consentimento != "REVOGADO"
    ):
        raise HTTPException(
            409,
            "Um opt-out não pode ser alterado nesta edição. "
            "Registre uma nova prova de consentimento em um fluxo dedicado.",
        )
    for campo, valor in {
        "nome": dados.nome,
        "telefone": dados.telefone,
        "telefone_normalizado": numero,
        "e_mail": _texto(dados.e_mail),
        "origem": _texto(dados.origem),
        "campanha": _texto(dados.campanha),
        "captado_em": dados.captado_em,
        "tags": _tags(dados.tags),
        "status": dados.status.upper(),
        "status_funil": dados.status_funil.upper(),
    }.items():
        setattr(lead, campo, valor)
    _registrar_consentimento(
        db,
        lead,
        novo_consentimento,
        origem=_texto(dados.consentimento_origem) or "EDICAO_MANUAL",
        usuario=usuario,
        detalhes="Alteração manual",
    )
    if novo_consentimento in {"RECUSADO", "REVOGADO"}:
        lead.status = "INATIVO"
    lead.atualizado_em = _agora()
    db.commit()
    return _lead_dict(lead)


ALIASES = {
    "nome": "nome",
    "nome completo": "nome",
    "telefone": "telefone",
    "celular": "telefone",
    "whatsapp": "telefone",
    "e mail": "e_mail",
    "email": "e_mail",
    "origem": "origem",
    "fonte": "origem",
    "campanha": "campanha",
    "origem campanha": "campanha",
    "data de captacao": "captado_em",
    "data captacao": "captado_em",
    "captado em": "captado_em",
    "tags": "tags",
    "tag": "tags",
    "segmento": "tags",
    "status": "status_funil",
    "status do funil": "status_funil",
    "funil": "status_funil",
    "opt in": "consentimento",
    "optin": "consentimento",
    "consentimento": "consentimento",
    "status de consentimento": "consentimento",
}


def _payloads(matriz: list[list]) -> list[tuple[int, dict, str | None]]:
    if not matriz:
        raise HTTPException(400, "A planilha está vazia.")
    colunas: dict[int, str] = {}
    for indice, cabecalho in enumerate(matriz[0]):
        campo = ALIASES.get(_normalizar_texto(cabecalho))
        if campo and campo not in colunas.values():
            colunas[indice] = campo
    faltantes = {"nome", "telefone"} - set(colunas.values())
    if faltantes:
        raise HTTPException(
            400,
            "A planilha precisa das colunas Nome e Telefone/Celular.",
        )
    itens = []
    for numero_linha, linha in enumerate(matriz[1:], start=2):
        if not any(str(valor or "").strip() for valor in linha):
            continue
        dados = {
            campo: linha[indice]
            for indice, campo in colunas.items()
            if indice < len(linha)
        }
        aviso = None
        try:
            consentimento, aviso = _consentimento(dados.get("consentimento"))
            data_captacao = _data(dados.get("captado_em"))
            dados = {
                "nome": _texto(dados.get("nome")),
                "telefone": _texto(dados.get("telefone")),
                "e_mail": _texto(dados.get("e_mail")),
                "origem": _texto(dados.get("origem")),
                "campanha": _texto(dados.get("campanha")),
                "captado_em": data_captacao.isoformat() if data_captacao else None,
                "tags": _tags(dados.get("tags")),
                "status_funil": (
                    _normalizar_texto(dados.get("status_funil"))
                    .replace(" ", "_")
                    .upper()
                    or "NOVO"
                ),
                "consentimento_status": consentimento,
            }
            itens.append((numero_linha, dados, aviso))
        except ValueError as exc:
            itens.append((numero_linha, {"nome": _texto(dados.get("nome")), "telefone": _texto(dados.get("telefone"))}, str(exc)))
    return itens


def _importacao_dict(importacao: LeadImportacao, itens: list[LeadImportacaoItem]) -> dict:
    return {
        **row_to_dict(importacao),
        "itens": [
            {
                "id": item.id,
                "numero_linha": item.numero_linha,
                "nome": item.nome,
                "telefone": item.telefone,
                "telefone_normalizado": item.telefone_normalizado,
                "acao": item.acao,
                "motivo": item.motivo,
                "lead_existente_id": item.lead_existente_id,
            }
            for item in itens
        ],
    }


@router.post("/importacoes/previa")
def previsualizar_importacao(
    arquivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    conteudo = arquivo.file.read(LIMITE_ARQUIVO + 1)
    if len(conteudo) > LIMITE_ARQUIVO:
        raise HTTPException(400, "O arquivo excede o limite de 15 MB.")
    matriz = _ler_matriz(arquivo.filename or "", conteudo)
    payloads = _payloads(matriz)
    if not payloads:
        raise HTTPException(400, "A planilha não possui leads para importar.")
    agora = _agora()
    importacao = LeadImportacao(
        usuario=usuario,
        arquivo_nome=(arquivo.filename or "planilha")[:255],
        status="PREVIA",
        total_linhas=len(payloads),
        total_validos=0,
        total_criados=0,
        total_atualizados=0,
        total_ignorados=0,
        total_erros=0,
        criado_em=agora,
    )
    db.add(importacao)
    db.flush()
    vistos: set[str] = set()
    registros: list[LeadImportacaoItem] = []
    for numero_linha, dados, aviso in payloads:
        numero, motivo_numero = normalizar_celular(dados.get("telefone"))
        acao = "CRIAR"
        motivo = aviso
        existente = None
        if not dados.get("nome"):
            acao, motivo = "ERRO", "Nome não informado"
        elif motivo_numero or not numero:
            acao, motivo = "ERRO", motivo_numero or "Telefone inválido"
        elif "consentimento_status" not in dados:
            acao, motivo = "ERRO", aviso or "Consentimento inválido"
        elif dados.get("status_funil") not in STATUS_FUNIL_VALIDOS:
            acao, motivo = "ERRO", "Status do funil inválido"
        elif numero in vistos:
            acao, motivo = "IGNORAR", "Telefone duplicado na própria planilha"
        else:
            vistos.add(numero)
            existente = db.scalar(
                select(Lead).where(Lead.telefone_normalizado == numero)
            )
            if existente:
                acao = "ATUALIZAR"
                if (
                    existente.consentimento_status == "REVOGADO"
                    and dados.get("consentimento_status") != "REVOGADO"
                ):
                    motivo = "Opt-out existente será preservado"
        registro = LeadImportacaoItem(
            importacao_id=importacao.id,
            numero_linha=numero_linha,
            nome=dados.get("nome"),
            telefone=dados.get("telefone"),
            telefone_normalizado=numero,
            acao=acao,
            motivo=motivo,
            lead_existente_id=existente.id if existente else None,
            payload_json=json.dumps(dados, ensure_ascii=False),
        )
        db.add(registro)
        registros.append(registro)
        if acao in {"CRIAR", "ATUALIZAR"}:
            importacao.total_validos += 1
        elif acao == "IGNORAR":
            importacao.total_ignorados += 1
        else:
            importacao.total_erros += 1
    db.commit()
    for item in registros:
        db.refresh(item)
    return _importacao_dict(importacao, registros)


@router.post("/importacoes/{importacao_id}/confirmar")
def confirmar_importacao(
    importacao_id: int,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    importacao = db.get(LeadImportacao, importacao_id)
    if not importacao:
        raise HTTPException(404, "Importação não encontrada.")
    if importacao.status != "PREVIA":
        raise HTTPException(409, "Esta importação já foi processada.")
    itens = list(
        db.scalars(
            select(LeadImportacaoItem)
            .where(LeadImportacaoItem.importacao_id == importacao_id)
            .order_by(LeadImportacaoItem.numero_linha)
        )
    )
    agora = _agora()
    for item in itens:
        if item.acao not in {"CRIAR", "ATUALIZAR"}:
            continue
        dados = json.loads(item.payload_json)
        consentimento = dados.get("consentimento_status") or "PENDENTE"
        if item.acao == "CRIAR":
            lead = Lead(
                nome=dados["nome"],
                telefone=dados["telefone"],
                telefone_normalizado=item.telefone_normalizado,
                e_mail=dados.get("e_mail"),
                origem=dados.get("origem"),
                campanha=dados.get("campanha"),
                captado_em=date.fromisoformat(dados["captado_em"])
                if dados.get("captado_em")
                else date.today(),
                tags=dados.get("tags"),
                status="INATIVO" if consentimento == "RECUSADO" else "ATIVO",
                status_funil=dados.get("status_funil") or "NOVO",
                consentimento_status=consentimento,
                consentimento_origem=f"PLANILHA:{importacao.arquivo_nome}",
                consentimento_em=agora if consentimento == "CONFIRMADO" else None,
                origem_importacao=importacao.arquivo_nome,
                criado_por=usuario,
                criado_em=agora,
                atualizado_em=agora,
            )
            db.add(lead)
            db.flush()
            db.add(
                LeadConsentimentoEvento(
                    lead_id=lead.id,
                    status_anterior=None,
                    status_novo=consentimento,
                    origem=f"PLANILHA:{importacao.arquivo_nome}",
                    usuario=usuario,
                    detalhes=f"Importação, linha {item.numero_linha}",
                    criado_em=agora,
                )
            )
            importacao.total_criados += 1
        else:
            lead = db.get(Lead, item.lead_existente_id)
            if not lead:
                importacao.total_erros += 1
                item.acao, item.motivo = "ERRO", "Lead existente não foi encontrado"
                continue
            for campo in ("nome", "e_mail", "origem", "campanha", "tags"):
                if dados.get(campo):
                    setattr(lead, campo, dados[campo])
            lead.telefone = dados["telefone"]
            if dados.get("captado_em"):
                lead.captado_em = date.fromisoformat(dados["captado_em"])
            lead.status_funil = dados.get("status_funil") or lead.status_funil
            if (
                lead.consentimento_status != "REVOGADO"
                and consentimento != "PENDENTE"
            ):
                _registrar_consentimento(
                    db,
                    lead,
                    consentimento,
                    origem=f"PLANILHA:{importacao.arquivo_nome}",
                    usuario=usuario,
                    detalhes=f"Importação, linha {item.numero_linha}",
                )
            if lead.consentimento_status in {"RECUSADO", "REVOGADO"}:
                lead.status = "INATIVO"
            lead.origem_importacao = importacao.arquivo_nome
            lead.atualizado_em = agora
            importacao.total_atualizados += 1
    importacao.status = "CONCLUIDA"
    importacao.concluido_em = agora
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            409,
            "A base mudou desde a prévia. Gere uma nova prévia para tratar duplicados.",
        ) from exc
    return _importacao_dict(importacao, itens)
