from datetime import date, datetime

from sqlalchemy import Date, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Lead(Base):
    __tablename__ = "leads"
    __table_args__ = (
        Index(
            "ix_leads_status_consentimento_nome",
            "status",
            "consentimento_status",
            "nome",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(100), index=True)
    telefone: Mapped[str] = mapped_column(String(30))
    telefone_normalizado: Mapped[str] = mapped_column(
        String(20), unique=True, index=True
    )
    e_mail: Mapped[str | None] = mapped_column(String(100), index=True)
    origem: Mapped[str | None] = mapped_column(String(100), index=True)
    campanha: Mapped[str | None] = mapped_column(String(100), index=True)
    captado_em: Mapped[date | None] = mapped_column(Date, index=True)
    tags: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="ATIVO", index=True)
    status_funil: Mapped[str] = mapped_column(
        String(30), default="NOVO", index=True
    )
    consentimento_status: Mapped[str] = mapped_column(
        String(20), default="PENDENTE", index=True
    )
    consentimento_origem: Mapped[str | None] = mapped_column(String(100))
    consentimento_em: Mapped[datetime | None] = mapped_column(DateTime)
    opt_out_em: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    opt_out_origem: Mapped[str | None] = mapped_column(String(100))
    origem_importacao: Mapped[str | None] = mapped_column(String(100))
    criado_por: Mapped[str] = mapped_column(String(50))
    criado_em: Mapped[datetime] = mapped_column(DateTime, index=True)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime)


class LeadConsentimentoEvento(Base):
    __tablename__ = "lead_consentimento_eventos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(Integer, index=True)
    status_anterior: Mapped[str | None] = mapped_column(String(20))
    status_novo: Mapped[str] = mapped_column(String(20), index=True)
    origem: Mapped[str] = mapped_column(String(100))
    usuario: Mapped[str | None] = mapped_column(String(50))
    detalhes: Mapped[str | None] = mapped_column(String(255))
    criado_em: Mapped[datetime] = mapped_column(DateTime, index=True)


class LeadImportacao(Base):
    __tablename__ = "lead_importacoes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario: Mapped[str] = mapped_column(String(50), index=True)
    arquivo_nome: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="PREVIA", index=True)
    total_linhas: Mapped[int] = mapped_column(Integer, default=0)
    total_validos: Mapped[int] = mapped_column(Integer, default=0)
    total_criados: Mapped[int] = mapped_column(Integer, default=0)
    total_atualizados: Mapped[int] = mapped_column(Integer, default=0)
    total_ignorados: Mapped[int] = mapped_column(Integer, default=0)
    total_erros: Mapped[int] = mapped_column(Integer, default=0)
    criado_em: Mapped[datetime] = mapped_column(DateTime, index=True)
    concluido_em: Mapped[datetime | None] = mapped_column(DateTime)


class LeadImportacaoItem(Base):
    __tablename__ = "lead_importacao_itens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    importacao_id: Mapped[int] = mapped_column(Integer, index=True)
    numero_linha: Mapped[int] = mapped_column(Integer)
    nome: Mapped[str | None] = mapped_column(String(100), index=True)
    telefone: Mapped[str | None] = mapped_column(String(30))
    telefone_normalizado: Mapped[str | None] = mapped_column(String(20), index=True)
    acao: Mapped[str] = mapped_column(String(20), index=True)
    motivo: Mapped[str | None] = mapped_column(String(255))
    lead_existente_id: Mapped[int | None] = mapped_column(Integer, index=True)
    payload_json: Mapped[str] = mapped_column(Text)


class LeadInteracao(Base):
    __tablename__ = "lead_interacoes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(Integer, index=True)
    disparo_id: Mapped[int | None] = mapped_column(Integer, index=True)
    tipo: Mapped[str] = mapped_column(String(20), index=True)
    mensagem_externa_id: Mapped[str] = mapped_column(
        String(150), unique=True, index=True
    )
    texto: Mapped[str | None] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(DateTime, index=True)
