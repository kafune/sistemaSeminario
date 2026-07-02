from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Cidade(Base):
    __tablename__ = "cidade"
    cod_cid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))
    uf: Mapped[str | None] = mapped_column(String(2))
    ddd: Mapped[str | None] = mapped_column(String(5))


class Area(Base):
    __tablename__ = "areas"
    cod_are: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))


class Escolaridade(Base):
    __tablename__ = "escolaridade"
    cod_esc: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))


class EstadoCivil(Base):
    __tablename__ = "estciv"
    cod_est: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))


class Horario(Base):
    __tablename__ = "horarios"
    cod_hor: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))


class Curso(Base):
    __tablename__ = "curso"
    cod_cur: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))


class Titulo(Base):
    __tablename__ = "titulos"
    cod_tit: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))


class Congregacao(Base):
    __tablename__ = "congregacoes"
    codigo: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))
    endereco: Mapped[str | None] = mapped_column(String(100))
    bairro: Mapped[str | None] = mapped_column(String(60))
    cod_cid: Mapped[int | None] = mapped_column(Integer)
    cep: Mapped[str | None] = mapped_column(String(10))
    telefone: Mapped[str | None] = mapped_column(String(20))
    dirigente: Mapped[str | None] = mapped_column(String(100))


class Registro(Base):
    __tablename__ = "registros"
    codigo: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))
    endereco: Mapped[str | None] = mapped_column(String(100))
    bairro: Mapped[str | None] = mapped_column(String(60))
    cod_cid: Mapped[int | None] = mapped_column(Integer)
    cep: Mapped[str | None] = mapped_column(String(10))
    telefone: Mapped[str | None] = mapped_column(String(20))
    registro: Mapped[str | None] = mapped_column(String(50))
    responsavel: Mapped[str | None] = mapped_column(String(100))
