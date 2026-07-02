from datetime import date

from sqlalchemy import Date, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class TipoLivro(Base):
    __tablename__ = "tipolivro"
    tip_liv: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))


class Editora(Base):
    __tablename__ = "editora"
    cod_editora: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))
    contato: Mapped[str | None] = mapped_column(String(100))
    telefone: Mapped[str | None] = mapped_column(String(20))
    endereco: Mapped[str | None] = mapped_column(String(100))
    bairro: Mapped[str | None] = mapped_column(String(60))
    cod_cid: Mapped[int | None] = mapped_column(Integer)
    cep: Mapped[str | None] = mapped_column(String(10))
    e_mail: Mapped[str | None] = mapped_column(String(100))
    site: Mapped[str | None] = mapped_column(String(100))


class Livro(Base):
    __tablename__ = "livro"
    cod_liv: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tip_liv: Mapped[int | None] = mapped_column(Integer)
    titulo: Mapped[str | None] = mapped_column(String(150))
    traducao: Mapped[str | None] = mapped_column(String(150))
    titulo_ori: Mapped[str | None] = mapped_column(String(150))
    autor1: Mapped[str | None] = mapped_column(String(100))
    autor2: Mapped[str | None] = mapped_column(String(100))
    autor3: Mapped[str | None] = mapped_column(String(100))
    tradutor1: Mapped[str | None] = mapped_column(String(100))
    tradutor2: Mapped[str | None] = mapped_column(String(100))
    tradutor3: Mapped[str | None] = mapped_column(String(100))
    dat_cad: Mapped[date | None] = mapped_column(Date)
    isbn: Mapped[str | None] = mapped_column(String(30))
    cod_editora: Mapped[int | None] = mapped_column(Integer)


class Emprestimo(Base):
    __tablename__ = "emprestimo"
    seq_emp: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cod_liv: Mapped[int | None] = mapped_column(Integer)
    cod_alu: Mapped[int | None] = mapped_column(Integer)
    dat_ini: Mapped[date | None] = mapped_column(Date)
    dat_pre: Mapped[date | None] = mapped_column(Date)
    dat_dev: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str | None] = mapped_column(String(10))


class UsuarioBiblioteca(Base):
    __tablename__ = "usabli"
    codigo: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))
    endereco: Mapped[str | None] = mapped_column(String(100))
    bairro: Mapped[str | None] = mapped_column(String(60))
    cod_cid: Mapped[int | None] = mapped_column(Integer)
    fone1: Mapped[str | None] = mapped_column(String(20))
    fone2: Mapped[str | None] = mapped_column(String(20))
    celular: Mapped[str | None] = mapped_column(String(20))
    complemento: Mapped[str | None] = mapped_column(String(60))
    sexo: Mapped[str | None] = mapped_column(String(1))
    cpf: Mapped[str | None] = mapped_column(String(20))
    rg: Mapped[str | None] = mapped_column(String(20))
    e_mail: Mapped[str | None] = mapped_column(String(100))
    dat_nas: Mapped[date | None] = mapped_column(Date)
    curso_stg: Mapped[int | None] = mapped_column(Integer)
    cep: Mapped[str | None] = mapped_column(String(10))
    cod_stg: Mapped[int | None] = mapped_column(Integer)
