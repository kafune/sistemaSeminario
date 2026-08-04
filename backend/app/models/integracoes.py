from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class ImportacaoGoogleForms(Base):
    __tablename__ = "importacoes_google_forms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tipo: Mapped[str] = mapped_column(String(20), default="IMPORTACAO")
    status: Mapped[str] = mapped_column(String(20), default="PENDENTE")
    solicitada_em: Mapped[datetime] = mapped_column(DateTime)
    iniciada_em: Mapped[datetime | None] = mapped_column(DateTime)
    concluida_em: Mapped[datetime | None] = mapped_column(DateTime)
    criados: Mapped[int] = mapped_column(Integer, default=0)
    atualizados: Mapped[int] = mapped_column(Integer, default=0)
    ja_cadastrados: Mapped[int] = mapped_column(Integer, default=0)
    ja_processados: Mapped[int] = mapped_column(Integer, default=0)
    erros: Mapped[int] = mapped_column(Integer, default=0)
    mensagem: Mapped[str | None] = mapped_column(String(255))


class ItemImportacaoGoogleForms(Base):
    __tablename__ = "itens_importacao_google_forms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    importacao_id: Mapped[int] = mapped_column(Integer, index=True)
    inscricao_id: Mapped[str] = mapped_column(String(64), index=True)
    nome: Mapped[str] = mapped_column(String(100), index=True)
    e_mail: Mapped[str | None] = mapped_column(String(100))
    telefone: Mapped[str | None] = mapped_column(String(20))
    turma_interesse: Mapped[str | None] = mapped_column(String(100))
    payload_json: Mapped[str] = mapped_column(Text)


class ConviteProfessor(Base):
    __tablename__ = "convites_professor"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token: Mapped[str] = mapped_column(String(64), unique=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime)
    expira_em: Mapped[datetime] = mapped_column(DateTime)
    usado_em: Mapped[datetime | None] = mapped_column(DateTime)
    ativo: Mapped[str] = mapped_column(String(1), default="S")
    professor_id: Mapped[int | None] = mapped_column(Integer)


class ConviteAcessoProfessor(Base):
    """Convite individual para o professor criar seu acesso autenticado."""

    __tablename__ = "convites_acesso_professor"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token: Mapped[str] = mapped_column(String(64), unique=True)
    cod_pro: Mapped[int] = mapped_column(Integer, index=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime)
    expira_em: Mapped[datetime] = mapped_column(DateTime)
    usado_em: Mapped[datetime | None] = mapped_column(DateTime)
    ativo: Mapped[str] = mapped_column(String(1), default="S")
