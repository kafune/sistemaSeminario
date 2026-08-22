"""Área financeira: cobranças, baixas, conciliação bancária e extrato do aluno.

Três públicos usam este router:

* **secretaria e financeiro** (autenticados) lançam pagamentos, configuram o
  plano de cada turma e conciliam o que o banco informou;
* **o aluno** consulta a própria situação por um link pessoal, sem senha,
  enquanto o login de aluno não existe;
* **o banco/PSP** avisa recebimentos PIX e boleto no webhook, autenticado por
  segredo compartilhado.
"""

import hmac
import json
import secrets
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import (
    AcessoFinanceiroAluno,
    Aluno,
    AluTurma,
    Cobranca,
    CondicaoFinanceiraAluno,
    Pagamento,
    PlanoFinanceiro,
    TransacaoBancaria,
    Turma,
)
from ..security import usuario_atual
from ..services import financeiro as servico

router = APIRouter(prefix="/financeiro", tags=["financeiro"])
public_router = APIRouter(prefix="/financeiro-aluno", tags=["financeiro do aluno"])
webhook_router = APIRouter(prefix="/integracoes/banco", tags=["integração bancária"])

LIMITE_LISTA = 500


# ---- entradas --------------------------------------------------------------

class PlanoInput(BaseModel):
    valor_matricula: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("99999.99"))
    valor_mensalidade: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("99999.99"))
    parcelas: int = Field(default=0, ge=0, le=60)
    dia_vencimento: int = Field(default=10, ge=1, le=28)
    primeira_mensalidade: date | None = None
    vencimento_matricula: date | None = None
    observacao: str | None = Field(default=None, max_length=2000)


class CondicaoInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    tipo: str = "TRANSFERENCIA"
    # Nulo em qualquer campo abaixo significa "segue o plano da turma".
    parcelas: int | None = Field(default=None, ge=0, le=60)
    primeira_mensalidade: date | None = None
    valor_mensalidade: Decimal | None = Field(default=None, ge=0, le=Decimal("99999.99"))
    cobra_matricula: bool = True
    valor_matricula: Decimal | None = Field(default=None, ge=0, le=Decimal("99999.99"))
    observacao: str | None = Field(default=None, max_length=2000)
    # Ajusta as cobranças já geradas, e não só as próximas.
    aplicar: bool = True


class CobrancaInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    cod_alu: int
    cod_tur: int | None = None
    tipo: str = Field(default="AVULSA")
    descricao: str = Field(min_length=1, max_length=120)
    valor: Decimal = Field(gt=0, le=Decimal("99999.99"))
    vencimento: date
    observacao: str | None = Field(default=None, max_length=2000)


class CobrancaEdicao(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    descricao: str = Field(min_length=1, max_length=120)
    valor: Decimal = Field(gt=0, le=Decimal("99999.99"))
    vencimento: date
    observacao: str | None = Field(default=None, max_length=2000)


class StatusInput(BaseModel):
    status: str


class PagamentoInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    valor: Decimal | None = Field(default=None, gt=0, le=Decimal("99999.99"))
    data_pagamento: date | None = None
    forma: str = "PIX"
    observacao: str | None = Field(default=None, max_length=2000)


class PagamentoLoteInput(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=200)
    data_pagamento: date | None = None
    forma: str = "PIX"


class VinculoInput(BaseModel):
    cobranca_id: int


class ConfiguracaoInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    beneficiario: str | None = Field(default=None, max_length=120)
    chave_pix: str | None = Field(default=None, max_length=140)
    instrucoes: str | None = Field(default=None, max_length=2000)
    conciliacao_automatica: bool = True
    tolerancia_dias: int = Field(default=5, ge=0, le=30)


class RecebimentoBanco(BaseModel):
    """Aviso de crédito enviado pelo banco/PSP."""

    model_config = ConfigDict(str_strip_whitespace=True)

    identificador: str = Field(min_length=6, max_length=80)
    meio: str = Field(default="PIX")
    valor: Decimal = Field(gt=0, le=Decimal("999999.99"))
    data: date | None = None
    pagador_nome: str | None = Field(default=None, max_length=120)
    pagador_documento: str | None = Field(default=None, max_length=20)
    referencia: str | None = Field(default=None, max_length=20)
    descricao: str | None = Field(default=None, max_length=255)


# ---- apoio -----------------------------------------------------------------

def _validar_forma(forma: str) -> str:
    forma = (forma or "").upper()
    if forma not in servico.FORMAS:
        raise HTTPException(400, "Forma de pagamento inválida")
    return forma


def _cobranca_ou_404(db: Session, cobranca_id: int) -> Cobranca:
    cobranca = db.get(Cobranca, cobranca_id)
    if not cobranca:
        raise HTTPException(404, "Cobrança não encontrada")
    return cobranca


def _plano_dict(plano: PlanoFinanceiro | None) -> dict | None:
    if plano is None:
        return None
    return {
        "id": plano.id,
        "cod_tur": plano.cod_tur,
        "valor_matricula": float(servico.dinheiro(plano.valor_matricula)),
        "valor_mensalidade": float(servico.dinheiro(plano.valor_mensalidade)),
        "parcelas": plano.parcelas,
        "dia_vencimento": plano.dia_vencimento,
        "primeira_mensalidade": plano.primeira_mensalidade.isoformat()
        if plano.primeira_mensalidade
        else None,
        "vencimento_matricula": plano.vencimento_matricula.isoformat()
        if plano.vencimento_matricula
        else None,
        "observacao": plano.observacao,
        "atualizado_em": plano.atualizado_em.isoformat() if plano.atualizado_em else None,
        "atualizado_por": plano.atualizado_por,
    }


def _cobrancas_com_pagamento(db: Session, filtros=()) -> list[tuple[Cobranca, Decimal]]:
    """Cobranças e o total já pago em cada uma, em uma consulta só."""
    pagos = (
        select(
            Pagamento.cobranca_id.label("cobranca_id"),
            func.sum(Pagamento.valor).label("pago"),
        )
        .group_by(Pagamento.cobranca_id)
        .subquery()
    )
    consulta = (
        select(Cobranca, func.coalesce(pagos.c.pago, 0))
        .join(pagos, pagos.c.cobranca_id == Cobranca.id, isouter=True)
        .order_by(Cobranca.vencimento, Cobranca.id)
    )
    for filtro in filtros:
        consulta = consulta.where(filtro)
    return [
        (cobranca, servico.dinheiro(pago)) for cobranca, pago in db.execute(consulta)
    ]


def _subconsulta_pagos():
    """Total pago por cobrança, para entrar como coluna nas agregações."""
    return (
        select(
            Pagamento.cobranca_id.label("cobranca_id"),
            func.sum(Pagamento.valor).label("pago"),
        )
        .group_by(Pagamento.cobranca_id)
        .subquery()
    )


def _intervalo_do_mes(mes: str) -> tuple[date, date]:
    """Converte "AAAA-MM" no primeiro e no último dia daquele mês."""
    try:
        ano, numero = mes.split("-")
        inicio = date(int(ano), int(numero), 1)
    except (ValueError, TypeError):
        raise HTTPException(400, "Mês inválido; use o formato AAAA-MM.")
    return inicio, servico.somar_meses(inicio, 1) - timedelta(days=1)


# ---- painel ----------------------------------------------------------------

@router.get("/resumo")
def resumo(db: Session = Depends(get_db)):
    """Números do painel: o que está parado esperando alguém agir.

    Tudo sai de uma agregação por turma no banco — a tela nunca carrega a
    carteira inteira para somar em Python.
    """
    hoje = date.today()
    limite_proximo = hoje + timedelta(days=7)
    inicio_mes = date(hoje.year, hoje.month, 1)

    pagos = _subconsulta_pagos()
    pago = func.coalesce(pagos.c.pago, 0)
    saldo = Cobranca.valor - pago
    vencida = and_(Cobranca.status == "ABERTA", Cobranca.vencimento < hoje)
    proxima = and_(
        Cobranca.status == "ABERTA",
        Cobranca.vencimento >= hoje,
        Cobranca.vencimento <= limite_proximo,
    )

    linhas = db.execute(
        select(
            Cobranca.cod_tur,
            Turma.nome,
            func.count(Cobranca.id),
            func.count(func.distinct(Cobranca.cod_alu)),
            func.sum(Cobranca.valor),
            func.sum(pago),
            func.sum(case((vencida, saldo), else_=0)),
            func.sum(case((vencida, 1), else_=0)),
            func.sum(case((proxima, saldo), else_=0)),
        )
        .join(pagos, pagos.c.cobranca_id == Cobranca.id, isouter=True)
        .join(Turma, Turma.cod_tur == Cobranca.cod_tur, isouter=True)
        .where(Cobranca.status.not_in(("CANCELADA", "ISENTA")))
        .group_by(Cobranca.cod_tur, Turma.nome)
    ).all()

    turmas = []
    a_receber = vencido = a_vencer_semana = servico.ZERO
    vencidas = 0
    for (
        cod_tur,
        nome,
        cobrancas,
        alunos,
        previsto,
        recebido,
        turma_vencido,
        turma_vencidas,
        turma_proximo,
    ) in linhas:
        previsto = servico.dinheiro(previsto)
        recebido = servico.dinheiro(recebido)
        em_aberto = max(previsto - recebido, servico.ZERO)
        a_receber += em_aberto
        vencido += servico.dinheiro(turma_vencido)
        vencidas += int(turma_vencidas or 0)
        a_vencer_semana += servico.dinheiro(turma_proximo)
        turmas.append(
            {
                "cod_tur": cod_tur,
                "turma_nome": nome or "Sem turma",
                "alunos": int(alunos or 0),
                "cobrancas": int(cobrancas or 0),
                "vencidas": int(turma_vencidas or 0),
                "previsto": float(previsto),
                "recebido": float(recebido),
                "em_aberto": float(em_aberto),
                "vencido": float(servico.dinheiro(turma_vencido)),
            }
        )
    turmas.sort(key=lambda item: (item["turma_nome"] or "").lower())

    recebido_mes = servico.dinheiro(
        db.scalar(
            select(func.sum(Pagamento.valor)).where(
                Pagamento.data_pagamento >= inicio_mes,
                Pagamento.data_pagamento <= hoje,
            )
        )
    )
    conciliacao_pendente = db.scalar(
        select(func.count())
        .select_from(TransacaoBancaria)
        .where(TransacaoBancaria.status == "PENDENTE")
    ) or 0
    return {
        "hoje": hoje.isoformat(),
        "mes_corrente": f"{hoje.year:04d}-{hoje.month:02d}",
        "a_receber": float(a_receber),
        "vencido": float(vencido),
        "vencidas": vencidas,
        "a_vencer_semana": float(a_vencer_semana),
        "recebido_mes": float(recebido_mes),
        "conciliacao_pendente": int(conciliacao_pendente),
        "turmas": turmas,
    }


@router.get("/opcoes")
def opcoes(db: Session = Depends(get_db)):
    """Turmas, meses com cobrança e formas de pagamento para os filtros.

    Leve de propósito: a lista de alunos só desce quando alguém abre o
    formulário que precisa dela.
    """
    turmas = [
        {"cod_tur": turma.cod_tur, "nome": turma.nome, "curso": turma.curso}
        for turma in db.scalars(select(Turma).order_by(Turma.nome))
    ]
    meses = [
        {"mes": competencia, "cobrancas": int(quantidade or 0)}
        for competencia, quantidade in db.execute(
            select(Cobranca.competencia, func.count(Cobranca.id))
            .where(Cobranca.competencia.is_not(None))
            .group_by(Cobranca.competencia)
            .order_by(Cobranca.competencia)
        )
    ]
    return {"turmas": turmas, "meses": meses, "formas": list(servico.FORMAS)}


@router.get("/opcoes/alunos")
def opcoes_alunos(
    busca: str | None = None,
    cod_tur: int | None = None,
    db: Session = Depends(get_db),
):
    """Alunos para os seletores, filtrados no banco e limitados."""
    consulta = select(Aluno.cod_alu, Aluno.nome, Aluno.cod_tur, Aluno.status)
    if busca and busca.strip():
        consulta = consulta.where(Aluno.nome.ilike(f"%{busca.strip()}%"))
    if cod_tur is not None:
        consulta = consulta.where(Aluno.cod_tur == cod_tur)
    return [
        {"cod_alu": cod_alu, "nome": nome, "cod_tur": turma, "status": situacao}
        for cod_alu, nome, turma, situacao in db.execute(
            consulta.order_by(Aluno.nome).limit(200)
        )
    ]


# ---- cobranças -------------------------------------------------------------

@router.get("/cobrancas")
def listar_cobrancas(
    cod_tur: int | None = None,
    cod_alu: int | None = None,
    tipo: str | None = None,
    situacao: str | None = None,
    mes: str | None = None,
    vencimento_de: date | None = None,
    vencimento_ate: date | None = None,
    busca: str | None = None,
    pagina: int = 1,
    por_pagina: int = 50,
    db: Session = Depends(get_db),
):
    """Lista paginada de cobranças.

    Busca, recorte e situação são resolvidos em SQL: a tela traz uma página de
    cada vez, e não a carteira inteira para filtrar no navegador.
    """
    hoje = date.today()
    # Página fora da faixa é apertada, não recusada: um filtro que devolve
    # menos resultados não deve virar erro na cara de quem está buscando.
    pagina = max(int(pagina or 1), 1)
    por_pagina = min(max(int(por_pagina or 50), 10), 200)
    pagos = _subconsulta_pagos()
    pago = func.coalesce(pagos.c.pago, 0)

    filtros = []
    if cod_tur is not None:
        filtros.append(Cobranca.cod_tur == cod_tur)
    if cod_alu is not None:
        filtros.append(Cobranca.cod_alu == cod_alu)
    if tipo:
        filtros.append(Cobranca.tipo == tipo.upper())
    if mes:
        inicio, fim = _intervalo_do_mes(mes)
        filtros.extend([Cobranca.vencimento >= inicio, Cobranca.vencimento <= fim])
    if vencimento_de:
        filtros.append(Cobranca.vencimento >= vencimento_de)
    if vencimento_ate:
        filtros.append(Cobranca.vencimento <= vencimento_ate)
    if busca and busca.strip():
        termo = f"%{busca.strip()}%"
        filtros.append(or_(Aluno.nome.ilike(termo), Cobranca.referencia.ilike(termo)))

    # Vencida e parcial não existem como coluna: são a data e o valor pago.
    escolhida = (situacao or "").upper()
    if escolhida in ("PAGA", "CANCELADA", "ISENTA"):
        filtros.append(Cobranca.status == escolhida)
    elif escolhida == "VENCIDA":
        filtros.extend([Cobranca.status == "ABERTA", Cobranca.vencimento < hoje])
    elif escolhida == "ABERTA":
        filtros.extend(
            [Cobranca.status == "ABERTA", Cobranca.vencimento >= hoje, pago <= 0]
        )
    elif escolhida == "PARCIAL":
        filtros.extend([Cobranca.status == "ABERTA", pago > 0])
    elif escolhida:
        raise HTTPException(400, "Situação inválida para filtro")

    def com_juncoes(consulta):
        consulta = (
            consulta.join(Aluno, Aluno.cod_alu == Cobranca.cod_alu, isouter=True)
            .join(Turma, Turma.cod_tur == Cobranca.cod_tur, isouter=True)
            .join(pagos, pagos.c.cobranca_id == Cobranca.id, isouter=True)
        )
        for filtro in filtros:
            consulta = consulta.where(filtro)
        return consulta

    saldo_visivel = case(
        (Cobranca.status.in_(("CANCELADA", "ISENTA")), 0),
        else_=Cobranca.valor - pago,
    )
    total, saldo = db.execute(
        com_juncoes(select(func.count(Cobranca.id), func.sum(saldo_visivel)))
    ).one()
    total = int(total or 0)

    itens = [
        servico.cobranca_dict(
            cobranca,
            servico.dinheiro(valor_pago),
            hoje,
            aluno_nome=aluno_nome or f"Aluno {cobranca.cod_alu}",
            turma_nome=turma_nome,
        )
        for cobranca, aluno_nome, turma_nome, valor_pago in db.execute(
            com_juncoes(select(Cobranca, Aluno.nome, Turma.nome, pago))
            .order_by(Cobranca.vencimento, Cobranca.id)
            .offset((pagina - 1) * por_pagina)
            .limit(por_pagina)
        )
    ]
    return {
        "total": total,
        "saldo": float(servico.dinheiro(saldo)),
        "pagina": pagina,
        "por_pagina": por_pagina,
        "paginas": max((total + por_pagina - 1) // por_pagina, 1),
        "cobrancas": itens,
    }


@router.post("/cobrancas")
def criar_cobranca(
    dados: CobrancaInput,
    usuario: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    if not db.get(Aluno, dados.cod_alu):
        raise HTTPException(404, "Aluno não encontrado")
    if dados.cod_tur is not None and not db.get(Turma, dados.cod_tur):
        raise HTTPException(404, "Turma não encontrada")
    tipo = dados.tipo.upper()
    if tipo not in servico.TIPOS:
        raise HTTPException(400, "Tipo de cobrança inválido")
    if tipo != "AVULSA":
        # Matrícula e mensalidade nascem do plano da turma; criar à mão aqui
        # duplicaria a chave lógica que torna a geração idempotente.
        raise HTTPException(
            400,
            "Matrícula e mensalidades são geradas pelo plano da turma; use o tipo avulso.",
        )
    cobranca = servico.criar_cobranca(
        db,
        cod_alu=dados.cod_alu,
        cod_tur=dados.cod_tur,
        plano_id=None,
        tipo=tipo,
        descricao=dados.descricao,
        valor=dados.valor,
        vencimento=dados.vencimento,
        observacao=dados.observacao,
        criado_por=usuario,
    )
    db.commit()
    return servico.cobranca_dict(cobranca, servico.ZERO, date.today())


@router.put("/cobrancas/{cobranca_id}")
def atualizar_cobranca(
    cobranca_id: int,
    dados: CobrancaEdicao,
    db: Session = Depends(get_db),
):
    cobranca = _cobranca_ou_404(db, cobranca_id)
    pago = servico.total_pago(db, cobranca.id)
    if servico.dinheiro(dados.valor) < pago:
        raise HTTPException(
            400,
            f"Já foram baixados R$ {pago} nesta cobrança; o valor não pode ficar menor.",
        )
    cobranca.descricao = dados.descricao
    cobranca.valor = servico.dinheiro(dados.valor)
    cobranca.vencimento = dados.vencimento
    cobranca.competencia = servico.competencia_de(dados.vencimento)
    cobranca.observacao = dados.observacao
    servico.sincronizar_status(db, cobranca)
    db.commit()
    return servico.cobranca_dict(cobranca, pago, date.today())


@router.put("/cobrancas/{cobranca_id}/status")
def alterar_status(
    cobranca_id: int,
    dados: StatusInput,
    db: Session = Depends(get_db),
):
    """Cancela, isenta ou reabre um título — pagar é sempre pelo pagamento."""
    novo = (dados.status or "").upper()
    if novo not in ("ABERTA", "CANCELADA", "ISENTA"):
        raise HTTPException(400, "Situação inválida para alteração manual")
    cobranca = _cobranca_ou_404(db, cobranca_id)
    pago = servico.total_pago(db, cobranca.id)
    if novo != "ABERTA" and pago > servico.ZERO:
        raise HTTPException(
            400,
            "Esta cobrança possui pagamento lançado; estorne a baixa antes.",
        )
    cobranca.status = novo
    servico.sincronizar_status(db, cobranca)
    db.commit()
    return servico.cobranca_dict(cobranca, pago, date.today())


@router.delete("/cobrancas/{cobranca_id}")
def excluir_cobranca(cobranca_id: int, db: Session = Depends(get_db)):
    cobranca = _cobranca_ou_404(db, cobranca_id)
    if servico.total_pago(db, cobranca.id) > servico.ZERO:
        raise HTTPException(
            400,
            "Esta cobrança possui pagamento lançado; estorne a baixa antes de excluir.",
        )
    vinculadas = db.scalar(
        select(func.count())
        .select_from(TransacaoBancaria)
        .where(TransacaoBancaria.cobranca_id == cobranca_id)
    ) or 0
    if vinculadas:
        raise HTTPException(400, "Há recebimento bancário conciliado com esta cobrança.")
    db.delete(cobranca)
    db.commit()
    return {"ok": True}


# ---- pagamentos ------------------------------------------------------------

@router.post("/cobrancas/{cobranca_id}/pagamentos")
def lancar_pagamento(
    cobranca_id: int,
    dados: PagamentoInput,
    usuario: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    cobranca = _cobranca_ou_404(db, cobranca_id)
    if cobranca.status in ("CANCELADA", "ISENTA"):
        raise HTTPException(400, "Cobrança cancelada ou isenta não recebe pagamento.")
    pago = servico.total_pago(db, cobranca.id)
    saldo = max(servico.dinheiro(cobranca.valor) - pago, servico.ZERO)
    if saldo <= servico.ZERO:
        raise HTTPException(400, "Esta cobrança já está quitada.")
    valor = servico.dinheiro(dados.valor) if dados.valor is not None else saldo
    if valor > saldo:
        raise HTTPException(400, f"O valor excede o saldo de R$ {saldo} desta cobrança.")
    if dados.data_pagamento and dados.data_pagamento > date.today():
        raise HTTPException(400, "A data do pagamento não pode ser futura.")
    pagamento = servico.registrar_pagamento(
        db,
        cobranca,
        valor=valor,
        data_pagamento=dados.data_pagamento,
        forma=_validar_forma(dados.forma),
        observacao=dados.observacao,
        registrado_por=usuario,
    )
    db.commit()
    return {
        "pagamento_id": pagamento.id,
        "cobranca": servico.cobranca_dict(cobranca, pago + valor, date.today()),
    }


@router.post("/cobrancas/pagamentos-lote")
def lancar_pagamentos_em_lote(
    dados: PagamentoLoteInput,
    usuario: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    """Marca vários títulos como pagos de uma vez — o "OK" da lista da turma."""
    forma = _validar_forma(dados.forma)
    if dados.data_pagamento and dados.data_pagamento > date.today():
        raise HTTPException(400, "A data do pagamento não pode ser futura.")
    quitadas = 0
    ignoradas = 0
    for cobranca_id in dict.fromkeys(dados.ids):
        cobranca = db.get(Cobranca, cobranca_id)
        if cobranca is None or cobranca.status in ("CANCELADA", "ISENTA"):
            ignoradas += 1
            continue
        pago = servico.total_pago(db, cobranca.id)
        if pago >= servico.dinheiro(cobranca.valor):
            ignoradas += 1
            continue
        servico.registrar_pagamento(
            db,
            cobranca,
            data_pagamento=dados.data_pagamento,
            forma=forma,
            registrado_por=usuario,
        )
        quitadas += 1
    db.commit()
    return {"quitadas": quitadas, "ignoradas": ignoradas}


@router.get("/cobrancas/{cobranca_id}/pagamentos")
def listar_pagamentos(cobranca_id: int, db: Session = Depends(get_db)):
    _cobranca_ou_404(db, cobranca_id)
    return [
        {
            "id": pagamento.id,
            "valor": float(servico.dinheiro(pagamento.valor)),
            "data_pagamento": pagamento.data_pagamento.isoformat()
            if pagamento.data_pagamento
            else None,
            "forma": pagamento.forma,
            "observacao": pagamento.observacao,
            "transacao_id": pagamento.transacao_id,
            "registrado_por": pagamento.registrado_por,
            "registrado_em": pagamento.registrado_em.isoformat()
            if pagamento.registrado_em
            else None,
        }
        for pagamento in db.scalars(
            select(Pagamento)
            .where(Pagamento.cobranca_id == cobranca_id)
            .order_by(Pagamento.data_pagamento, Pagamento.id)
        )
    ]


@router.delete("/pagamentos/{pagamento_id}")
def estornar_pagamento(pagamento_id: int, db: Session = Depends(get_db)):
    pagamento = db.get(Pagamento, pagamento_id)
    if not pagamento:
        raise HTTPException(404, "Pagamento não encontrado")
    cobranca = db.get(Cobranca, pagamento.cobranca_id)
    if pagamento.transacao_id:
        # O recebimento volta para a fila: o dinheiro entrou no banco de todo
        # jeito, só deixou de pertencer àquele título.
        transacao = db.get(TransacaoBancaria, pagamento.transacao_id)
        if transacao:
            transacao.status = "PENDENTE"
            transacao.cobranca_id = None
            transacao.motivo = "Baixa estornada pela secretaria"
            transacao.conciliada_em = None
            transacao.conciliada_por = None
    db.delete(pagamento)
    db.flush()
    if cobranca:
        servico.sincronizar_status(db, cobranca)
    db.commit()
    return {"ok": True}


# ---- turmas ----------------------------------------------------------------

@router.get("/turmas/{cod_tur}")
def situacao_da_turma(cod_tur: int, db: Session = Depends(get_db)):
    """Plano da turma e a régua de cada aluno matriculado nela."""
    turma = db.get(Turma, cod_tur)
    if not turma:
        raise HTTPException(404, "Turma não encontrada")
    hoje = date.today()
    plano = db.scalar(select(PlanoFinanceiro).where(PlanoFinanceiro.cod_tur == cod_tur))

    matriculados = {
        cod_alu: nome
        for cod_alu, nome in db.execute(
            select(AluTurma.cod_alu, Aluno.nome)
            .join(Aluno, Aluno.cod_alu == AluTurma.cod_alu)
            .where(AluTurma.cod_tur == cod_tur)
            .order_by(Aluno.nome)
        )
    }
    por_aluno: dict[int, dict] = {
        cod_alu: {
            "cod_alu": cod_alu,
            "nome": nome,
            "total": servico.ZERO,
            "pago": servico.ZERO,
            "vencido": servico.ZERO,
            "cobrancas": 0,
            "abertas": 0,
            "vencidas": 0,
            "matricula_paga": None,
            "proximo_vencimento": None,
        }
        for cod_alu, nome in matriculados.items()
    }
    condicoes = servico.condicoes_da_turma(db, cod_tur, list(matriculados))

    for cobranca, pago in _cobrancas_com_pagamento(db, [Cobranca.cod_tur == cod_tur]):
        aluno = por_aluno.get(cobranca.cod_alu)
        if aluno is None:
            # Aluno saiu da turma mas o título continua existindo; ele aparece
            # na lista de cobranças, não na régua da turma.
            continue
        if cobranca.status in ("CANCELADA", "ISENTA"):
            continue
        valor = servico.dinheiro(cobranca.valor)
        situacao = servico.situacao_de(cobranca, pago, hoje)
        aluno["total"] += valor
        aluno["pago"] += min(pago, valor)
        aluno["cobrancas"] += 1
        if cobranca.tipo == "MATRICULA":
            aluno["matricula_paga"] = situacao == "PAGA"
        if situacao == "PAGA":
            continue
        aluno["abertas"] += 1
        if situacao == "VENCIDA":
            aluno["vencido"] += max(valor - pago, servico.ZERO)
            aluno["vencidas"] += 1
        elif cobranca.vencimento and (
            aluno["proximo_vencimento"] is None
            or cobranca.vencimento.isoformat() < aluno["proximo_vencimento"]
        ):
            aluno["proximo_vencimento"] = cobranca.vencimento.isoformat()

    alunos = []
    for dados in por_aluno.values():
        em_aberto = max(dados["total"] - dados["pago"], servico.ZERO)
        condicao = condicoes.get(dados["cod_alu"])
        efetivo = servico.plano_efetivo(plano, condicao, hoje=hoje) if plano else None
        alunos.append(
            {
                **dados,
                "condicao": _condicao_dict(condicao),
                "transferencia": bool(efetivo and efetivo.transferencia),
                "mensalidades_previstas": efetivo.parcelas if efetivo else None,
                "total": float(dados["total"]),
                "pago": float(dados["pago"]),
                "vencido": float(dados["vencido"]),
                "em_aberto": float(em_aberto),
                "situacao": "SEM_COBRANCA"
                if dados["cobrancas"] == 0
                else "VENCIDA"
                if dados["vencidas"]
                else "QUITADO"
                if em_aberto <= servico.ZERO
                else "EM_DIA",
            }
        )

    return {
        "turma": {"cod_tur": turma.cod_tur, "nome": turma.nome, "curso": turma.curso},
        "plano": _plano_dict(plano),
        "alunos": alunos,
        "matriculados": len(matriculados),
        "transferencias": sum(1 for aluno in alunos if aluno["transferencia"]),
    }


@router.put("/turmas/{cod_tur}/plano")
def salvar_plano(
    cod_tur: int,
    dados: PlanoInput,
    usuario: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    if not db.get(Turma, cod_tur):
        raise HTTPException(404, "Turma não encontrada")
    if dados.parcelas and dados.valor_mensalidade <= 0:
        raise HTTPException(400, "Informe o valor da mensalidade para gerar parcelas.")
    if dados.valor_mensalidade > 0 and not dados.parcelas:
        raise HTTPException(400, "Informe quantas mensalidades a turma terá.")
    plano = db.scalar(select(PlanoFinanceiro).where(PlanoFinanceiro.cod_tur == cod_tur))
    if plano is None:
        plano = PlanoFinanceiro(cod_tur=cod_tur)
        db.add(plano)
    plano.valor_matricula = servico.dinheiro(dados.valor_matricula)
    plano.valor_mensalidade = servico.dinheiro(dados.valor_mensalidade)
    plano.parcelas = dados.parcelas
    plano.dia_vencimento = dados.dia_vencimento
    plano.primeira_mensalidade = dados.primeira_mensalidade
    plano.vencimento_matricula = dados.vencimento_matricula
    plano.observacao = dados.observacao
    plano.atualizado_em = datetime.now()
    plano.atualizado_por = usuario
    db.commit()
    db.refresh(plano)
    return _plano_dict(plano)


@router.post("/turmas/{cod_tur}/gerar")
def gerar_cobrancas(
    cod_tur: int,
    cod_alu: int | None = Query(default=None),
    usuario: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    """Cria as cobranças que faltam para os alunos matriculados na turma."""
    if not db.get(Turma, cod_tur):
        raise HTTPException(404, "Turma não encontrada")
    plano = db.scalar(select(PlanoFinanceiro).where(PlanoFinanceiro.cod_tur == cod_tur))
    if plano is None:
        raise HTTPException(400, "Defina o plano da turma antes de gerar as cobranças.")
    if servico.dinheiro(plano.valor_matricula) <= 0 and servico.dinheiro(plano.valor_mensalidade) <= 0:
        raise HTTPException(400, "O plano não tem valor de matrícula nem de mensalidade.")
    resultado = servico.gerar_cobrancas_do_plano(
        db,
        plano,
        criado_por=usuario,
        apenas_aluno=cod_alu,
    )
    db.commit()
    return resultado


# ---- condição do aluno na turma -------------------------------------------

def _condicao_dict(condicao: CondicaoFinanceiraAluno | None) -> dict | None:
    if condicao is None:
        return None
    return {
        "tipo": condicao.tipo,
        "parcelas": condicao.parcelas,
        "primeira_mensalidade": condicao.primeira_mensalidade.isoformat()
        if condicao.primeira_mensalidade
        else None,
        "valor_mensalidade": float(servico.dinheiro(condicao.valor_mensalidade))
        if condicao.valor_mensalidade is not None
        else None,
        "cobra_matricula": condicao.cobra_matricula == "S",
        "valor_matricula": float(servico.dinheiro(condicao.valor_matricula))
        if condicao.valor_matricula is not None
        else None,
        "observacao": condicao.observacao,
        "atualizado_em": condicao.atualizado_em.isoformat()
        if condicao.atualizado_em
        else None,
        "atualizado_por": condicao.atualizado_por,
    }


def _reaplicar_plano(
    db: Session,
    cod_tur: int,
    cod_alu: int,
    *,
    usuario: str,
) -> dict:
    """Refaz as cobranças do aluno a partir do plano dele, já com a condição."""
    plano = db.scalar(select(PlanoFinanceiro).where(PlanoFinanceiro.cod_tur == cod_tur))
    if plano is None:
        return {"criadas": 0, "atualizadas": 0, "removidas": 0, "preservadas": 0}
    turma = db.get(Turma, cod_tur)
    condicao = db.scalar(
        select(CondicaoFinanceiraAluno).where(
            CondicaoFinanceiraAluno.cod_tur == cod_tur,
            CondicaoFinanceiraAluno.cod_alu == cod_alu,
        )
    )
    return servico.aplicar_plano_ao_aluno(
        db,
        plano,
        cod_alu,
        efetivo=servico.plano_efetivo(plano, condicao),
        nome_turma=(turma.nome if turma else None) or f"Turma {cod_tur}",
        criado_por=usuario,
        ajustar_existentes=True,
    )


@router.put("/turmas/{cod_tur}/alunos/{cod_alu}/condicao")
def salvar_condicao(
    cod_tur: int,
    cod_alu: int,
    dados: CondicaoInput,
    usuario: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    """Define quanto e por quantos meses este aluno paga nesta turma.

    Existe para o aluno de transferência, que entra com o curso andando e vai
    cursar só alguns módulos: ele paga menos meses que a turma, às vezes a
    partir de outro mês e sem a matrícula inicial.
    """
    if not db.get(Turma, cod_tur):
        raise HTTPException(404, "Turma não encontrada")
    if not db.get(Aluno, cod_alu):
        raise HTTPException(404, "Aluno não encontrado")
    matriculado = db.scalar(
        select(AluTurma).where(AluTurma.cod_tur == cod_tur, AluTurma.cod_alu == cod_alu)
    )
    if matriculado is None:
        raise HTTPException(400, "Este aluno não está matriculado na turma.")
    tipo = (dados.tipo or "").upper()
    if tipo not in ("REGULAR", "TRANSFERENCIA"):
        raise HTTPException(400, "Condição inválida")
    if tipo == "TRANSFERENCIA" and dados.parcelas is None and dados.primeira_mensalidade is None:
        raise HTTPException(
            400,
            "Informe quantas mensalidades o aluno vai pagar ou a partir de qual mês.",
        )

    condicao = db.scalar(
        select(CondicaoFinanceiraAluno).where(
            CondicaoFinanceiraAluno.cod_tur == cod_tur,
            CondicaoFinanceiraAluno.cod_alu == cod_alu,
        )
    )
    if condicao is None:
        condicao = CondicaoFinanceiraAluno(
            cod_alu=cod_alu,
            cod_tur=cod_tur,
            criado_em=datetime.now(),
        )
        db.add(condicao)
    condicao.tipo = tipo
    condicao.parcelas = dados.parcelas
    condicao.primeira_mensalidade = dados.primeira_mensalidade
    condicao.valor_mensalidade = (
        servico.dinheiro(dados.valor_mensalidade)
        if dados.valor_mensalidade is not None
        else None
    )
    condicao.cobra_matricula = "S" if dados.cobra_matricula else "N"
    condicao.valor_matricula = (
        servico.dinheiro(dados.valor_matricula)
        if dados.valor_matricula is not None
        else None
    )
    condicao.observacao = dados.observacao
    condicao.atualizado_em = datetime.now()
    condicao.atualizado_por = usuario
    db.flush()

    ajuste = (
        _reaplicar_plano(db, cod_tur, cod_alu, usuario=usuario)
        if dados.aplicar
        else {"criadas": 0, "atualizadas": 0, "removidas": 0, "preservadas": 0}
    )
    db.commit()
    return {"condicao": _condicao_dict(condicao), "ajuste": ajuste}


@router.delete("/turmas/{cod_tur}/alunos/{cod_alu}/condicao")
def remover_condicao(
    cod_tur: int,
    cod_alu: int,
    aplicar: bool = True,
    usuario: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    """Devolve o aluno ao plano cheio da turma."""
    condicao = db.scalar(
        select(CondicaoFinanceiraAluno).where(
            CondicaoFinanceiraAluno.cod_tur == cod_tur,
            CondicaoFinanceiraAluno.cod_alu == cod_alu,
        )
    )
    if condicao is None:
        raise HTTPException(404, "Este aluno não possui condição própria")
    db.delete(condicao)
    db.flush()
    ajuste = (
        _reaplicar_plano(db, cod_tur, cod_alu, usuario=usuario)
        if aplicar
        else {"criadas": 0, "atualizadas": 0, "removidas": 0, "preservadas": 0}
    )
    db.commit()
    return {"ok": True, "ajuste": ajuste}


# ---- aluno -----------------------------------------------------------------

@router.get("/alunos/{cod_alu}")
def extrato_do_aluno(cod_alu: int, db: Session = Depends(get_db)):
    extrato = servico.extrato_aluno(db, cod_alu)
    if not extrato:
        raise HTTPException(404, "Aluno não encontrado")
    acesso = db.scalar(
        select(AcessoFinanceiroAluno).where(AcessoFinanceiroAluno.cod_alu == cod_alu)
    )
    db.commit()
    extrato["acesso"] = {
        "token": acesso.token if acesso and acesso.ativo == "S" else None,
        "ultimo_acesso_em": acesso.ultimo_acesso_em.isoformat()
        if acesso and acesso.ultimo_acesso_em
        else None,
    }
    return extrato


@router.post("/alunos/{cod_alu}/acesso")
def gerar_acesso_do_aluno(cod_alu: int, db: Session = Depends(get_db)):
    """Link pessoal para o aluno consultar a própria situação financeira."""
    if not db.get(Aluno, cod_alu):
        raise HTTPException(404, "Aluno não encontrado")
    acesso = db.scalar(
        select(AcessoFinanceiroAluno).where(AcessoFinanceiroAluno.cod_alu == cod_alu)
    )
    if acesso is None:
        acesso = AcessoFinanceiroAluno(cod_alu=cod_alu, criado_em=datetime.now())
        db.add(acesso)
    acesso.token = secrets.token_urlsafe(32)
    acesso.ativo = "S"
    acesso.criado_em = datetime.now()
    db.commit()
    return {"token": acesso.token}


@router.delete("/alunos/{cod_alu}/acesso")
def revogar_acesso_do_aluno(cod_alu: int, db: Session = Depends(get_db)):
    acesso = db.scalar(
        select(AcessoFinanceiroAluno).where(AcessoFinanceiroAluno.cod_alu == cod_alu)
    )
    if acesso is None:
        raise HTTPException(404, "Este aluno não possui link de consulta")
    acesso.ativo = "N"
    db.commit()
    return {"ok": True}


# ---- conciliação bancária --------------------------------------------------

@router.get("/conciliacao")
def listar_conciliacao(
    status_filtro: str = Query(default="PENDENTE", alias="status"),
    db: Session = Depends(get_db),
):
    """Recebimentos do banco e as cobranças que cada um pode quitar."""
    hoje = date.today()
    consulta = select(TransacaoBancaria).order_by(
        TransacaoBancaria.data.desc(), TransacaoBancaria.id.desc()
    )
    filtro = (status_filtro or "").upper()
    if filtro and filtro != "TODOS":
        consulta = consulta.where(TransacaoBancaria.status == filtro)

    transacoes = list(db.scalars(consulta.limit(200)))
    candidatas = {
        transacao.id: servico.candidatas_para(db, transacao)[:8]
        for transacao in transacoes
        if transacao.status == "PENDENTE"
    }
    # Só os nomes de quem aparece nas sugestões descem para a tela.
    codigos_aluno = {c.cod_alu for lista in candidatas.values() for c in lista}
    codigos_turma = {c.cod_tur for lista in candidatas.values() for c in lista if c.cod_tur}
    nomes_aluno = {
        codigo: nome
        for codigo, nome in db.execute(
            select(Aluno.cod_alu, Aluno.nome).where(Aluno.cod_alu.in_(codigos_aluno))
        )
    } if codigos_aluno else {}
    nomes_turma = {
        codigo: nome
        for codigo, nome in db.execute(
            select(Turma.cod_tur, Turma.nome).where(Turma.cod_tur.in_(codigos_turma))
        )
    } if codigos_turma else {}
    pagos = servico.pagos_por_cobranca(
        db,
        [c.id for lista in candidatas.values() for c in lista],
    )

    itens = []
    for transacao in transacoes:
        sugestoes = [
            servico.cobranca_dict(
                cobranca,
                pagos.get(cobranca.id, servico.ZERO),
                hoje,
                aluno_nome=nomes_aluno.get(cobranca.cod_alu),
                turma_nome=nomes_turma.get(cobranca.cod_tur),
            )
            for cobranca in candidatas.get(transacao.id, [])
        ]
        itens.append(
            {
                "id": transacao.id,
                "identificador": transacao.identificador,
                "meio": transacao.meio,
                "valor": float(servico.dinheiro(transacao.valor)),
                "data": transacao.data.isoformat() if transacao.data else None,
                "pagador_nome": transacao.pagador_nome,
                "pagador_documento": transacao.pagador_documento,
                "referencia": transacao.referencia,
                "descricao": transacao.descricao,
                "status": transacao.status,
                "motivo": transacao.motivo,
                "cobranca_id": transacao.cobranca_id,
                "recebida_em": transacao.recebida_em.isoformat()
                if transacao.recebida_em
                else None,
                "sugestoes": sugestoes,
            }
        )
    pendentes = db.scalar(
        select(func.count())
        .select_from(TransacaoBancaria)
        .where(TransacaoBancaria.status == "PENDENTE")
    ) or 0
    return {
        "pendentes": int(pendentes),
        "integracao_ativa": bool(settings.banco_webhook_secret.strip()),
        "transacoes": itens,
    }


@router.post("/conciliacao/{transacao_id}/vincular")
def vincular_recebimento(
    transacao_id: int,
    dados: VinculoInput,
    usuario: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    transacao = db.get(TransacaoBancaria, transacao_id)
    if not transacao:
        raise HTTPException(404, "Recebimento não encontrado")
    if transacao.status == "CONCILIADA":
        raise HTTPException(400, "Este recebimento já foi conciliado.")
    cobranca = _cobranca_ou_404(db, dados.cobranca_id)
    if cobranca.status in ("CANCELADA", "ISENTA"):
        raise HTTPException(400, "Cobrança cancelada ou isenta não recebe pagamento.")
    pago = servico.total_pago(db, cobranca.id)
    saldo = max(servico.dinheiro(cobranca.valor) - pago, servico.ZERO)
    if saldo <= servico.ZERO:
        raise HTTPException(400, "Esta cobrança já está quitada.")
    servico.conciliar(
        db,
        transacao,
        cobranca=cobranca,
        motivo=f"Conciliado manualmente por {usuario}",
        usuario=usuario,
    )
    db.commit()
    return {"ok": True, "cobranca_id": cobranca.id}


@router.post("/conciliacao/{transacao_id}/ignorar")
def ignorar_recebimento(
    transacao_id: int,
    usuario: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    transacao = db.get(TransacaoBancaria, transacao_id)
    if not transacao:
        raise HTTPException(404, "Recebimento não encontrado")
    if transacao.status == "CONCILIADA":
        raise HTTPException(400, "Estorne a baixa antes de ignorar este recebimento.")
    transacao.status = "IGNORADA"
    transacao.motivo = f"Marcado como não pertinente por {usuario}"[:120]
    transacao.conciliada_em = datetime.now()
    transacao.conciliada_por = usuario
    db.commit()
    return {"ok": True}


@router.post("/conciliacao/{transacao_id}/reabrir")
def reabrir_recebimento(transacao_id: int, db: Session = Depends(get_db)):
    transacao = db.get(TransacaoBancaria, transacao_id)
    if not transacao:
        raise HTTPException(404, "Recebimento não encontrado")
    if transacao.status == "CONCILIADA":
        raise HTTPException(400, "Estorne a baixa para reabrir este recebimento.")
    transacao.status = "PENDENTE"
    transacao.motivo = None
    transacao.conciliada_em = None
    transacao.conciliada_por = None
    db.commit()
    return {"ok": True}


@router.post("/conciliacao/manual")
def registrar_recebimento_manual(
    dados: RecebimentoBanco,
    usuario: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    """Lança na fila um PIX/boleto visto no extrato, sem esperar o banco.

    É a saída para quem ainda não conectou o PSP: o comprovante entra pela
    mesma porta e passa pela mesma identificação automática.
    """
    transacao = _registrar_transacao(db, dados, origem=usuario)
    db.commit()
    return {
        "id": transacao.id,
        "status": transacao.status,
        "motivo": transacao.motivo,
        "cobranca_id": transacao.cobranca_id,
    }


# ---- configuração ----------------------------------------------------------

@router.get("/configuracao")
def obter_configuracao(db: Session = Depends(get_db)):
    config = servico.configuracao(db)
    db.commit()
    return {
        "beneficiario": config.beneficiario,
        "chave_pix": config.chave_pix,
        "instrucoes": config.instrucoes,
        "conciliacao_automatica": config.conciliacao_automatica == "S",
        "tolerancia_dias": config.tolerancia_dias,
        "webhook_configurado": bool(settings.banco_webhook_secret.strip()),
        "webhook_url": "/integracoes/banco/recebimentos",
        "atualizado_em": config.atualizado_em.isoformat() if config.atualizado_em else None,
        "atualizado_por": config.atualizado_por,
    }


@router.put("/configuracao")
def salvar_configuracao(
    dados: ConfiguracaoInput,
    usuario: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    config = servico.configuracao(db)
    config.beneficiario = dados.beneficiario
    config.chave_pix = dados.chave_pix
    config.instrucoes = dados.instrucoes
    config.conciliacao_automatica = "S" if dados.conciliacao_automatica else "N"
    config.tolerancia_dias = dados.tolerancia_dias
    config.atualizado_em = datetime.now()
    config.atualizado_por = usuario
    db.commit()
    return obter_configuracao(db)


# ---- consulta do aluno (link pessoal, sem senha) ---------------------------

@public_router.get("/{token}")
def extrato_publico(token: str, db: Session = Depends(get_db)):
    acesso = db.scalar(
        select(AcessoFinanceiroAluno).where(
            AcessoFinanceiroAluno.token == token,
            AcessoFinanceiroAluno.ativo == "S",
        )
    )
    if acesso is None:
        raise HTTPException(404, "Link inválido ou desativado")
    extrato = servico.extrato_aluno(db, acesso.cod_alu)
    if not extrato:
        raise HTTPException(404, "Aluno não encontrado")
    acesso.ultimo_acesso_em = datetime.now()
    db.commit()
    # A consulta do aluno mostra a própria situação, nunca quem lançou a baixa.
    for cobranca in extrato["cobrancas"]:
        cobranca.pop("observacao", None)
    return extrato


# ---- webhook do banco ------------------------------------------------------

def _validar_segredo_banco(x_webhook_secret: str | None = Header(default=None)) -> None:
    segredo = settings.banco_webhook_secret
    if not segredo:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Integração bancária não configurada",
        )
    if not x_webhook_secret or not hmac.compare_digest(x_webhook_secret, segredo):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Segredo inválido")


def _registrar_transacao(
    db: Session,
    dados: RecebimentoBanco,
    *,
    origem: str,
) -> TransacaoBancaria:
    """Grava o aviso de crédito e tenta fechar o título correspondente."""
    meio = (dados.meio or "PIX").upper()
    if meio not in ("PIX", "BOLETO"):
        raise HTTPException(400, "Meio de recebimento inválido")
    try:
        valor = servico.dinheiro(dados.valor)
    except InvalidOperation:
        raise HTTPException(400, "Valor inválido")
    existente = db.scalar(
        select(TransacaoBancaria).where(
            TransacaoBancaria.identificador == dados.identificador
        )
    )
    if existente:
        # Reenvio do mesmo aviso: o banco repete quando não recebe o 200.
        return existente
    transacao = TransacaoBancaria(
        identificador=dados.identificador,
        meio=meio,
        valor=valor,
        data=dados.data or date.today(),
        pagador_nome=dados.pagador_nome,
        pagador_documento=dados.pagador_documento,
        referencia=(dados.referencia or "").upper() or None,
        descricao=dados.descricao,
        status="PENDENTE",
        payload_json=json.dumps(
            dados.model_dump(mode="json"), ensure_ascii=False
        )[:60000],
        recebida_em=datetime.now(),
    )
    db.add(transacao)
    db.flush()
    servico.processar_recebimento(db, transacao)
    return transacao


@webhook_router.post("/recebimentos", dependencies=[Depends(_validar_segredo_banco)])
def receber_do_banco(dados: RecebimentoBanco, db: Session = Depends(get_db)):
    """Porta de entrada do PSP para PIX e boletos liquidados."""
    transacao = _registrar_transacao(db, dados, origem="BANCO")
    db.commit()
    return {
        "id": transacao.id,
        "status": transacao.status,
        "cobranca_id": transacao.cobranca_id,
    }
