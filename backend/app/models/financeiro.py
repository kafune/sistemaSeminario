from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    DECIMAL,
    Date,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class PlanoFinanceiro(Base):
    """Regra de cobrança de uma turma: matrícula inicial e mensalidades.

    É o plano que liga o aluno ao dinheiro: ao gerar as cobranças, cada aluno
    matriculado na turma recebe a matrícula e as parcelas descritas aqui.
    """

    __tablename__ = "planos_financeiros"
    __table_args__ = (
        UniqueConstraint("cod_tur", name="uq_planos_financeiros_cod_tur"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cod_tur: Mapped[int] = mapped_column(Integer)
    valor_matricula: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), default=0)
    valor_mensalidade: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), default=0)
    parcelas: Mapped[int] = mapped_column(Integer, default=0)
    dia_vencimento: Mapped[int] = mapped_column(Integer, default=10)
    primeira_mensalidade: Mapped[date | None] = mapped_column(Date)
    vencimento_matricula: Mapped[date | None] = mapped_column(Date)
    observacao: Mapped[str | None] = mapped_column(Text)
    atualizado_em: Mapped[datetime | None] = mapped_column(DateTime)
    atualizado_por: Mapped[str | None] = mapped_column(String(50))


class Cobranca(Base):
    """Título a receber de um aluno (matrícula, mensalidade ou avulso)."""

    __tablename__ = "cobrancas"
    __table_args__ = (
        # A geração do plano é idempotente por esta chave lógica.
        UniqueConstraint(
            "cod_alu",
            "cod_tur",
            "tipo",
            "parcela",
            name="uq_cobrancas_aluno_turma_tipo_parcela",
        ),
        Index("ix_cobrancas_turma_vencimento", "cod_tur", "vencimento"),
        Index("ix_cobrancas_aluno_vencimento", "cod_alu", "vencimento"),
        Index("ix_cobrancas_status_vencimento", "status", "vencimento"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cod_alu: Mapped[int] = mapped_column(Integer)
    cod_tur: Mapped[int | None] = mapped_column(Integer)
    plano_id: Mapped[int | None] = mapped_column(Integer)
    tipo: Mapped[str] = mapped_column(String(15))
    descricao: Mapped[str] = mapped_column(String(120))
    parcela: Mapped[int | None] = mapped_column(Integer)
    total_parcelas: Mapped[int | None] = mapped_column(Integer)
    competencia: Mapped[str | None] = mapped_column(String(7))
    valor: Mapped[Decimal] = mapped_column(DECIMAL(10, 2))
    vencimento: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(12), default="ABERTA")
    # Código curto informado no PIX/boleto; é por ele que a conciliação
    # bancária identifica o título sem depender de nome ou valor.
    referencia: Mapped[str | None] = mapped_column(String(20), unique=True)
    observacao: Mapped[str | None] = mapped_column(Text)
    criado_em: Mapped[datetime | None] = mapped_column(DateTime)
    criado_por: Mapped[str | None] = mapped_column(String(50))


class Pagamento(Base):
    """Baixa (total ou parcial) lançada sobre uma cobrança."""

    __tablename__ = "pagamentos"
    __table_args__ = (
        Index("ix_pagamentos_cobranca", "cobranca_id"),
        Index("ix_pagamentos_data", "data_pagamento"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cobranca_id: Mapped[int] = mapped_column(Integer)
    valor: Mapped[Decimal] = mapped_column(DECIMAL(10, 2))
    data_pagamento: Mapped[date] = mapped_column(Date)
    forma: Mapped[str] = mapped_column(String(15), default="PIX")
    observacao: Mapped[str | None] = mapped_column(Text)
    # Preenchido quando a baixa nasceu de um recebimento informado pelo banco.
    transacao_id: Mapped[int | None] = mapped_column(Integer)
    registrado_por: Mapped[str | None] = mapped_column(String(50))
    registrado_em: Mapped[datetime | None] = mapped_column(DateTime)


class TransacaoBancaria(Base):
    """Recebimento PIX/boleto informado pelo banco, à espera de conciliação."""

    __tablename__ = "transacoes_bancarias"
    __table_args__ = (
        UniqueConstraint(
            "identificador",
            name="uq_transacoes_bancarias_identificador",
        ),
        Index("ix_transacoes_bancarias_status_data", "status", "data"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # E2E do PIX ou nosso número do boleto: garante que o mesmo aviso
    # reenviado pelo banco não vire dois pagamentos.
    identificador: Mapped[str] = mapped_column(String(80))
    meio: Mapped[str] = mapped_column(String(10), default="PIX")
    valor: Mapped[Decimal] = mapped_column(DECIMAL(10, 2))
    data: Mapped[date] = mapped_column(Date)
    pagador_nome: Mapped[str | None] = mapped_column(String(120))
    pagador_documento: Mapped[str | None] = mapped_column(String(20))
    referencia: Mapped[str | None] = mapped_column(String(20))
    descricao: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(12), default="PENDENTE")
    cobranca_id: Mapped[int | None] = mapped_column(Integer)
    motivo: Mapped[str | None] = mapped_column(String(120))
    payload_json: Mapped[str | None] = mapped_column(Text)
    recebida_em: Mapped[datetime | None] = mapped_column(DateTime)
    conciliada_em: Mapped[datetime | None] = mapped_column(DateTime)
    conciliada_por: Mapped[str | None] = mapped_column(String(50))


class AcessoFinanceiroAluno(Base):
    """Link pessoal do aluno para consultar a própria situação financeira.

    Serve enquanto não existe login de aluno e continua valendo depois: o
    extrato é o mesmo, só muda quem prova a identidade de quem consulta.
    """

    __tablename__ = "acessos_financeiro_aluno"
    __table_args__ = (
        UniqueConstraint("cod_alu", name="uq_acessos_financeiro_aluno_cod_alu"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cod_alu: Mapped[int] = mapped_column(Integer)
    token: Mapped[str] = mapped_column(String(64), unique=True)
    ativo: Mapped[str] = mapped_column(String(1), default="S")
    criado_em: Mapped[datetime | None] = mapped_column(DateTime)
    ultimo_acesso_em: Mapped[datetime | None] = mapped_column(DateTime)


class ConfiguracaoFinanceira(Base):
    """Dados de recebimento exibidos ao aluno e regras da conciliação."""

    __tablename__ = "configuracao_financeira"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    beneficiario: Mapped[str | None] = mapped_column(String(120))
    chave_pix: Mapped[str | None] = mapped_column(String(140))
    instrucoes: Mapped[str | None] = mapped_column(Text)
    conciliacao_automatica: Mapped[str] = mapped_column(String(1), default="S")
    tolerancia_dias: Mapped[int] = mapped_column(Integer, default=5)
    atualizado_em: Mapped[datetime | None] = mapped_column(DateTime)
    atualizado_por: Mapped[str | None] = mapped_column(String(50))
