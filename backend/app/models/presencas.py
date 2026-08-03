from datetime import date, datetime

from sqlalchemy import Date, DateTime, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Chamada(Base):
    __tablename__ = "chamadas"
    __table_args__ = (
        UniqueConstraint("cod_tur", "data", name="uq_chamadas_turma_data"),
        Index("ix_chamadas_turma_data", "cod_tur", "data"),
        Index("ix_chamadas_token_status", "token", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cod_tur: Mapped[int] = mapped_column(Integer)
    data: Mapped[date] = mapped_column(Date)
    token: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(12), default="ABERTA")
    aberta_em: Mapped[datetime] = mapped_column(DateTime)
    encerrada_em: Mapped[datetime | None] = mapped_column(DateTime)


class Presenca(Base):
    """Aluno incluído na chamada; ``registrado_em`` nulo significa ausência."""

    __tablename__ = "presencas"
    __table_args__ = (
        UniqueConstraint("chamada_id", "cod_alu", name="uq_presencas_chamada_aluno"),
        Index("ix_presencas_chamada_nome", "chamada_id", "nome_aluno"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    chamada_id: Mapped[int] = mapped_column(Integer)
    cod_alu: Mapped[int] = mapped_column(Integer)
    # O nome fica congelado para preservar o histórico mesmo após alterações cadastrais.
    nome_aluno: Mapped[str] = mapped_column(String(150))
    registrado_em: Mapped[datetime | None] = mapped_column(DateTime)
