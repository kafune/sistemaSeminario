from datetime import date

from sqlalchemy import Date, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Aluno(Base):
    __tablename__ = "alunos"
    cod_alu: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))
    endereco: Mapped[str | None] = mapped_column(String(100))
    bairro: Mapped[str | None] = mapped_column(String(60))
    cod_cid: Mapped[int | None] = mapped_column(Integer)
    cod_nat: Mapped[int | None] = mapped_column(Integer)
    cep: Mapped[str | None] = mapped_column(String(10))
    fone1: Mapped[str | None] = mapped_column(String(20))
    fone2: Mapped[str | None] = mapped_column(String(20))
    celular: Mapped[str | None] = mapped_column(String(20))
    e_mail: Mapped[str | None] = mapped_column(String(100))
    sexo: Mapped[str | None] = mapped_column(String(1))
    cod_esc: Mapped[int | None] = mapped_column(Integer)
    dat_cad: Mapped[date | None] = mapped_column(Date)
    est_civ: Mapped[int | None] = mapped_column(Integer)
    dat_nas: Mapped[date | None] = mapped_column(Date)
    rg: Mapped[str | None] = mapped_column(String(20))
    profissao: Mapped[str | None] = mapped_column(String(60))
    cur_seculares: Mapped[str | None] = mapped_column(String(255))
    igreja: Mapped[str | None] = mapped_column(String(100))
    local_igreja: Mapped[str | None] = mapped_column(String(100))
    cod_ass_mad: Mapped[int | None] = mapped_column(Integer)
    rol_ass_mad: Mapped[int | None] = mapped_column(Integer)
    atividades: Mapped[str | None] = mapped_column(String(255))
    cur_teologicos: Mapped[str | None] = mapped_column(String(255))
    local_cur_teo: Mapped[str | None] = mapped_column(String(100))
    nome_pastor: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str | None] = mapped_column(String(10))
    membro_desde: Mapped[date | None] = mapped_column(Date)
    endereco_igr: Mapped[str | None] = mapped_column(String(100))
    bairro_igr: Mapped[str | None] = mapped_column(String(60))
    cidade_igr: Mapped[int | None] = mapped_column(Integer)
    fone_igr: Mapped[str | None] = mapped_column(String(20))
    cep_igr: Mapped[str | None] = mapped_column(String(10))
    site_igr: Mapped[str | None] = mapped_column(String(100))
    e_mail_igr: Mapped[str | None] = mapped_column(String(100))
    aniversario: Mapped[str | None] = mapped_column(String(10))
    complemento: Mapped[str | None] = mapped_column(String(60))
    nacionalidade: Mapped[str | None] = mapped_column(String(30))
    cpf: Mapped[str | None] = mapped_column(String(20))
    cd_cur: Mapped[int | None] = mapped_column(Integer)
    cod_tur: Mapped[int | None] = mapped_column(Integer)
    cod_gra: Mapped[int | None] = mapped_column(Integer)


class Professor(Base):
    __tablename__ = "professor"
    cod_pro: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str | None] = mapped_column(String(100))
    endereco: Mapped[str | None] = mapped_column(String(100))
    bairro: Mapped[str | None] = mapped_column(String(60))
    cod_cid: Mapped[int | None] = mapped_column(Integer)
    cep: Mapped[str | None] = mapped_column(String(10))
    fone1: Mapped[str | None] = mapped_column(String(20))
    fone2: Mapped[str | None] = mapped_column(String(20))
    celular: Mapped[str | None] = mapped_column(String(20))
    e_mail: Mapped[str | None] = mapped_column(String(100))
    sexo: Mapped[str | None] = mapped_column(String(1))
    dat_nas: Mapped[date | None] = mapped_column(Date)
    rg: Mapped[str | None] = mapped_column(String(20))
    cpf: Mapped[str | None] = mapped_column(String(20))
    bco: Mapped[str | None] = mapped_column(String(30))
    agencia: Mapped[str | None] = mapped_column(String(20))
    conta: Mapped[str | None] = mapped_column(String(20))
    cod_nat: Mapped[int | None] = mapped_column(Integer)
    dat_cad: Mapped[date | None] = mapped_column(Date)
    est_civ: Mapped[str | None] = mapped_column(String(30))
    complemento: Mapped[str | None] = mapped_column(String(60))
    status: Mapped[str | None] = mapped_column(String(10))
    nacionalidade: Mapped[str | None] = mapped_column(String(30))
    aniversario: Mapped[str | None] = mapped_column(String(10))
    qtmat: Mapped[int | None] = mapped_column(Integer)
    qttit: Mapped[int | None] = mapped_column(Integer)
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
    cod_tit: Mapped[int | None] = mapped_column(Integer)
    cod_pro: Mapped[int] = mapped_column(Integer)
    seq_tp: Mapped[int | None] = mapped_column(Integer)
    nome: Mapped[str | None] = mapped_column(String(100))
    area: Mapped[str | None] = mapped_column(String(100))
    local: Mapped[str | None] = mapped_column(String(100))


class EscProf(Base):
    __tablename__ = "escprof"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cod_esc: Mapped[int | None] = mapped_column(Integer)
    cod_pro: Mapped[int] = mapped_column(Integer)
    seq_ep: Mapped[int | None] = mapped_column(Integer)
    area: Mapped[str | None] = mapped_column(String(100))
