from datetime import date

from sqlalchemy import Date, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Aluno(Base):
    __tablename__ = "alunos"
    cod_alu: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))
    endereco: Mapped[str | None] = mapped_column(String(100))
    complemento: Mapped[str | None] = mapped_column(String(60))
    bairro: Mapped[str | None] = mapped_column(String(60))
    cidade: Mapped[str | None] = mapped_column(String(60))
    uf: Mapped[str | None] = mapped_column(String(2))
    cep: Mapped[str | None] = mapped_column(String(10))
    fone1: Mapped[str | None] = mapped_column(String(20))
    fone2: Mapped[str | None] = mapped_column(String(20))
    celular: Mapped[str | None] = mapped_column(String(20))
    e_mail: Mapped[str | None] = mapped_column(String(100))
    sexo: Mapped[str | None] = mapped_column(String(1))
    dat_cad: Mapped[date | None] = mapped_column(Date)
    dat_nas: Mapped[date | None] = mapped_column(Date)
    est_civ: Mapped[str | None] = mapped_column(String(30))
    escolaridade: Mapped[str | None] = mapped_column(String(60))
    rg: Mapped[str | None] = mapped_column(String(20))
    cpf: Mapped[str | None] = mapped_column(String(20))
    profissao: Mapped[str | None] = mapped_column(String(60))
    nacionalidade: Mapped[str | None] = mapped_column(String(30))
    cur_seculares: Mapped[str | None] = mapped_column(String(255))
    cur_teologicos: Mapped[str | None] = mapped_column(String(255))
    igreja: Mapped[str | None] = mapped_column(String(100))
    local_igreja: Mapped[str | None] = mapped_column(String(100))
    nome_pastor: Mapped[str | None] = mapped_column(String(100))
    membro_desde: Mapped[date | None] = mapped_column(Date)
    atividades: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str | None] = mapped_column(String(10))
    cod_tur: Mapped[int | None] = mapped_column(Integer)


class Professor(Base):
    __tablename__ = "professor"
    cod_pro: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))
    endereco: Mapped[str | None] = mapped_column(String(100))
    complemento: Mapped[str | None] = mapped_column(String(60))
    bairro: Mapped[str | None] = mapped_column(String(60))
    cidade: Mapped[str | None] = mapped_column(String(60))
    uf: Mapped[str | None] = mapped_column(String(2))
    cep: Mapped[str | None] = mapped_column(String(10))
    fone1: Mapped[str | None] = mapped_column(String(20))
    fone2: Mapped[str | None] = mapped_column(String(20))
    celular: Mapped[str | None] = mapped_column(String(20))
    e_mail: Mapped[str | None] = mapped_column(String(100))
    sexo: Mapped[str | None] = mapped_column(String(1))
    dat_nas: Mapped[date | None] = mapped_column(Date)
    rg: Mapped[str | None] = mapped_column(String(20))
    cpf: Mapped[str | None] = mapped_column(String(20))
    dat_cad: Mapped[date | None] = mapped_column(Date)
    est_civ: Mapped[str | None] = mapped_column(String(30))
    nacionalidade: Mapped[str | None] = mapped_column(String(30))
    status: Mapped[str | None] = mapped_column(String(10))
    sigla: Mapped[str | None] = mapped_column(String(10))


class MatProf(Base):
    __tablename__ = "matprof"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cod_mat: Mapped[int] = mapped_column(Integer)
    cod_pro: Mapped[int] = mapped_column(Integer)
    seq_mp: Mapped[int | None] = mapped_column(Integer)


class TitProf(Base):
    __tablename__ = "titprof"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cod_pro: Mapped[int] = mapped_column(Integer)
    seq_tp: Mapped[int | None] = mapped_column(Integer)
    nome: Mapped[str | None] = mapped_column(String(100))
    area: Mapped[str | None] = mapped_column(String(100))
    local: Mapped[str | None] = mapped_column(String(100))
