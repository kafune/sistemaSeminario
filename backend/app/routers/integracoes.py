import hmac
import json
import re
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import Aluno, ImportacaoGoogleForms, ItemImportacaoGoogleForms

router = APIRouter(prefix="/integracoes", tags=["integrações"])


class PreCadastroGoogleForms(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    inscricao_id: str = Field(min_length=16, max_length=64)
    nome: str = Field(min_length=1, max_length=100)
    turma_interesse: str | None = Field(default=None, max_length=100)
    telefone: str | None = Field(default=None, max_length=20)
    e_mail: str | None = Field(default=None, max_length=100)
    rg: str | None = Field(default=None, max_length=20)
    cpf: str | None = Field(default=None, max_length=20)
    escolaridade: str | None = Field(default=None, max_length=60)
    igreja: str | None = Field(default=None, max_length=100)
    endereco_igreja: str | None = Field(default=None, max_length=255)
    nome_pastor: str | None = Field(default=None, max_length=100)
    cur_teologicos: str | None = Field(default=None, max_length=255)
    nome_conjuge: str | None = Field(default=None, max_length=100)


def _validar_segredo(x_webhook_secret: str | None = Header(default=None)) -> None:
    segredo_configurado = settings.google_forms_webhook_secret
    if not segredo_configurado:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Integração com Google Forms não configurada",
        )
    if not x_webhook_secret or not hmac.compare_digest(
        x_webhook_secret, segredo_configurado
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Segredo inválido")


def _texto(valor: str | None) -> str | None:
    if valor is None:
        return None
    valor = valor.strip()
    return valor or None


def _somente_digitos(valor: str | None) -> str:
    return re.sub(r"\D", "", valor or "")


def _buscar_existente(dados: PreCadastroGoogleForms, db: Session) -> Aluno | None:
    aluno = db.scalar(
        select(Aluno).where(Aluno.inscricao_externa_id == dados.inscricao_id)
    )
    if aluno:
        return aluno

    cpf = _somente_digitos(dados.cpf)
    if cpf:
        cpf_banco = func.replace(
            func.replace(func.replace(Aluno.cpf, ".", ""), "-", ""), " ", ""
        )
        aluno = db.scalar(select(Aluno).where(cpf_banco == cpf).limit(1))
        if aluno:
            return aluno

    email = _texto(dados.e_mail)
    if email:
        return db.scalar(
            select(Aluno).where(func.lower(Aluno.e_mail) == email.lower()).limit(1)
        )
    return None


def _campos_aluno(dados: PreCadastroGoogleForms) -> dict:
    return {
        "nome": dados.nome,
        "turma_interesse": _texto(dados.turma_interesse),
        "celular": _texto(dados.telefone),
        "e_mail": _texto(dados.e_mail),
        "rg": _texto(dados.rg),
        "cpf": _texto(dados.cpf),
        "escolaridade": _texto(dados.escolaridade),
        "igreja": _texto(dados.igreja),
        "local_igreja": _texto(dados.endereco_igreja),
        "nome_pastor": _texto(dados.nome_pastor),
        "cur_teologicos": _texto(dados.cur_teologicos),
        "nome_conjuge": _texto(dados.nome_conjuge),
    }


def processar_pre_cadastro(
    dados: PreCadastroGoogleForms,
    db: Session,
    origem: str = "GOOGLE_FORMS",
):
    aluno = _buscar_existente(dados, db)
    if aluno and aluno.inscricao_externa_id == dados.inscricao_id:
        return {"ok": True, "acao": "ja_processado", "cod_alu": aluno.cod_alu}

    if aluno and aluno.status != "P":
        return {"ok": True, "acao": "ja_cadastrado", "cod_alu": aluno.cod_alu}

    agora = datetime.now()
    campos = _campos_aluno(dados)
    if aluno:
        for campo, valor in campos.items():
            if valor is not None:
                setattr(aluno, campo, valor)
        aluno.inscricao_externa_id = dados.inscricao_id
        aluno.inscricao_recebida_em = agora
        acao = "pre_cadastro_atualizado"
    else:
        aluno = Aluno(
            **campos,
            status="P",
            dat_cad=date.today(),
            origem_cadastro=origem,
            inscricao_externa_id=dados.inscricao_id,
            inscricao_recebida_em=agora,
        )
        db.add(aluno)
        acao = "pre_cadastro_criado"

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        aluno = db.scalar(
            select(Aluno).where(Aluno.inscricao_externa_id == dados.inscricao_id)
        )
        if aluno:
            return {"ok": True, "acao": "ja_processado", "cod_alu": aluno.cod_alu}
        raise

    db.refresh(aluno)
    return {"ok": True, "acao": acao, "cod_alu": aluno.cod_alu}


@router.post(
    "/google-forms/pre-cadastro",
    dependencies=[Depends(_validar_segredo)],
)
def receber_pre_cadastro(
    dados: PreCadastroGoogleForms, db: Session = Depends(get_db)
):
    return processar_pre_cadastro(dados, db)


class ResultadoImportacaoGoogleForms(BaseModel):
    criados: int = Field(default=0, ge=0)
    atualizados: int = Field(default=0, ge=0)
    ja_cadastrados: int = Field(default=0, ge=0)
    ja_processados: int = Field(default=0, ge=0)
    erros: int = Field(default=0, ge=0)
    mensagem: str | None = Field(default=None, max_length=255)


@router.post(
    "/google-forms/proxima-importacao",
    dependencies=[Depends(_validar_segredo)],
)
def proxima_importacao_google_forms(
    suporta_previa: bool = False,
    db: Session = Depends(get_db),
):
    limite_reprocessamento = datetime.now() - timedelta(minutes=15)
    consulta = (
        select(ImportacaoGoogleForms)
        .where(
            or_(
                ImportacaoGoogleForms.status == "PENDENTE",
                (
                    (ImportacaoGoogleForms.status == "PROCESSANDO")
                    & (ImportacaoGoogleForms.iniciada_em < limite_reprocessamento)
                ),
            )
        )
        .order_by(ImportacaoGoogleForms.id)
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    if not suporta_previa:
        # Versões antigas do Apps Script não conhecem prévias e importariam
        # todas as linhas. Só entregamos esse tipo ao script atualizado.
        consulta = consulta.where(ImportacaoGoogleForms.tipo == "IMPORTACAO")
    solicitacao = db.scalar(consulta)
    if not solicitacao:
        return {"id": None}

    solicitacao.status = "PROCESSANDO"
    solicitacao.iniciada_em = datetime.now()
    db.commit()
    return {
        "id": solicitacao.id,
        "tipo": solicitacao.tipo or "IMPORTACAO",
    }


class PreviaGoogleFormsInput(BaseModel):
    itens: list[dict] = Field(default_factory=list, max_length=5000)


@router.post(
    "/google-forms/importacoes/{importacao_id}/previa",
    dependencies=[Depends(_validar_segredo)],
)
def receber_previa_google_forms(
    importacao_id: int,
    dados: PreviaGoogleFormsInput,
    db: Session = Depends(get_db),
):
    solicitacao = db.get(ImportacaoGoogleForms, importacao_id)
    if not solicitacao or solicitacao.tipo != "PREVIA":
        raise HTTPException(404, "Solicitação de prévia não encontrada")
    if solicitacao.status != "PROCESSANDO":
        raise HTTPException(409, "Solicitação de prévia não está em processamento")

    db.execute(
        delete(ItemImportacaoGoogleForms).where(
            ItemImportacaoGoogleForms.importacao_id == importacao_id
        )
    )
    erros: list[str] = []
    quantidade = 0
    for indice, payload in enumerate(dados.itens, start=2):
        try:
            item = PreCadastroGoogleForms.model_validate(payload)
        except ValidationError as erro:
            erros.append(f"Linha {indice}: {erro}")
            continue
        db.add(
            ItemImportacaoGoogleForms(
                importacao_id=importacao_id,
                inscricao_id=item.inscricao_id,
                nome=item.nome,
                e_mail=_texto(item.e_mail),
                telefone=_texto(item.telefone),
                turma_interesse=_texto(item.turma_interesse),
                payload_json=json.dumps(
                    item.model_dump(mode="json"),
                    ensure_ascii=False,
                ),
            )
        )
        quantidade += 1

    solicitacao.status = "PREVIA_PRONTA"
    solicitacao.concluida_em = datetime.now()
    solicitacao.erros = len(erros)
    solicitacao.mensagem = (
        f"{quantidade} pessoas disponíveis para seleção"
        + (f"; {len(erros)} linhas ignoradas" if erros else "")
    )[:255]
    db.commit()
    return {
        "ok": True,
        "itens": quantidade,
        "erros": len(erros),
    }


@router.post(
    "/google-forms/importacoes/{importacao_id}/concluir",
    dependencies=[Depends(_validar_segredo)],
)
def concluir_importacao_google_forms(
    importacao_id: int,
    resultado: ResultadoImportacaoGoogleForms,
    db: Session = Depends(get_db),
):
    solicitacao = db.get(ImportacaoGoogleForms, importacao_id)
    if not solicitacao:
        raise HTTPException(404, "Solicitação de importação não encontrada")

    for campo, valor in resultado.model_dump().items():
        setattr(solicitacao, campo, valor)
    solicitacao.status = "CONCLUIDA"
    solicitacao.concluida_em = datetime.now()
    db.commit()
    return {"ok": True}
