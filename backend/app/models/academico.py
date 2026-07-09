from datetime import date
from decimal import Decimal

from sqlalchemy import DECIMAL, Date, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Materia(Base):
    __tablename__ = "materias"
    cod_mat: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    NOME: Mapped[str | None] = mapped_column(String(100))
    area: Mapped[str | None] = mapped_column(String(100))
    APELIDO: Mapped[str | None] = mapped_column(String(20))
    observa: Mapped[str | None] = mapped_column(String(255))


class Turma(Base):
    __tablename__ = "turma"
    cod_tur: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))
    curso: Mapped[str | None] = mapped_column(String(100))
    horario: Mapped[str | None] = mapped_column(String(100))
    dat_ini: Mapped[date | None] = mapped_column(Date)
    qtalu: Mapped[int | None] = mapped_column(Integer)


class AluTurma(Base):
    __tablename__ = "aluturma"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cod_tur: Mapped[int] = mapped_column(Integer)
    item: Mapped[int | None] = mapped_column(Integer)
    cod_alu: Mapped[int] = mapped_column(Integer)
    status: Mapped[str | None] = mapped_column(String(10))


class DocTurma(Base):
    __tablename__ = "docturma"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cod_tur: Mapped[int] = mapped_column(Integer)
    cod_mat: Mapped[int] = mapped_column(Integer)
    cod_pro: Mapped[int | None] = mapped_column(Integer)
    dat_ini: Mapped[date | None] = mapped_column(Date)
    dat_fim: Mapped[date | None] = mapped_column(Date)
    Ano: Mapped[str | None] = mapped_column(String(10))
    semestre: Mapped[str | None] = mapped_column(String(5))


class AluNota(Base):
    __tablename__ = "alunota"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cod_alu: Mapped[int] = mapped_column(Integer)
    cod_mat: Mapped[int] = mapped_column(Integer)
    cod_tur: Mapped[int | None] = mapped_column(Integer)
    cod_pro: Mapped[int | None] = mapped_column(Integer)
    nota: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2))
    falta: Mapped[int | None] = mapped_column(Integer)
    dispensa: Mapped[str | None] = mapped_column(String(5))
    status: Mapped[str | None] = mapped_column(String(10))
    ano: Mapped[str | None] = mapped_column(String(10))
    semestre: Mapped[str | None] = mapped_column(String(5))
    cursou: Mapped[str | None] = mapped_column(String(10))
