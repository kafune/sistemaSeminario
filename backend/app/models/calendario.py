from datetime import date, datetime, time

from sqlalchemy import Date, DateTime, Index, Integer, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Aula(Base):
    __tablename__ = "aulas"
    __table_args__ = (Index("ix_aulas_data_status", "data", "status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    docturma_id: Mapped[int] = mapped_column(Integer, index=True)
    data: Mapped[date] = mapped_column(Date, index=True)
    hora_inicio: Mapped[time | None] = mapped_column(Time)
    hora_fim: Mapped[time | None] = mapped_column(Time)
    local: Mapped[str | None] = mapped_column(String(100))
    tema: Mapped[str | None] = mapped_column(String(150))
    observacao: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="AGENDADA")


class CalendarioPublico(Base):
    """Link público da agenda de **uma** turma.

    A turma faz parte do token: o link enviado ao grupo de WhatsApp só sabe
    devolver as aulas daquela turma. Um filtro por parâmetro de URL seria
    ilusão de recorte — bastava apagá-lo para ver a agenda da escola inteira.
    Linhas antigas sem ``cod_tur`` são links globais aposentados.
    """

    __tablename__ = "calendario_publico"
    __table_args__ = (Index("ix_calendario_publico_turma", "cod_tur", "ativo"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token: Mapped[str] = mapped_column(String(64), unique=True)
    cod_tur: Mapped[int | None] = mapped_column(Integer)
    ativo: Mapped[str] = mapped_column(String(1), default="S")
    criado_em: Mapped[datetime] = mapped_column(DateTime)
