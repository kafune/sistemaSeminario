"""Números gerais e listas rápidas para a página inicial."""

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Aluno, AluTurma, Materia, Professor, Turma

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
def resumo(db: Session = Depends(get_db)):
    hoje = date.today()

    def contar(modelo, *filtros):
        q = select(func.count()).select_from(modelo)
        if filtros:
            q = q.where(*filtros)
        return db.scalar(q) or 0

    aniversariantes = [
        {
            "cod_alu": a.cod_alu,
            "nome": a.nome,
            "dia": a.dat_nas.day,
            "celular": a.celular,
        }
        for a in db.scalars(
            select(Aluno)
            .where(
                extract("month", Aluno.dat_nas) == hoje.month,
                func.coalesce(Aluno.status, "A") != "I",
            )
            .order_by(extract("day", Aluno.dat_nas), Aluno.nome)
        )
    ]

    turmas = [
        {"cod_tur": t.cod_tur, "nome": t.nome, "qtd_alunos": qtd}
        for t, qtd in db.execute(
            select(Turma, func.count(AluTurma.id))
            .join(AluTurma, AluTurma.cod_tur == Turma.cod_tur, isouter=True)
            .group_by(Turma.cod_tur)
            .order_by(Turma.nome)
        )
    ]

    ultimos_cadastros = [
        {"cod_alu": a.cod_alu, "nome": a.nome, "dat_cad": a.dat_cad}
        for a in db.scalars(select(Aluno).order_by(Aluno.cod_alu.desc()).limit(8))
    ]

    return {
        "alunos_ativos": contar(Aluno, func.coalesce(Aluno.status, "A") != "I"),
        "alunos_total": contar(Aluno),
        "professores": contar(Professor),
        "materias": contar(Materia),
        "turmas": contar(Turma),
        "alunos_por_turma": turmas,
        "aniversariantes_mes": aniversariantes,
        "ultimos_cadastros": ultimos_cadastros,
        "mes": hoje.month,
    }
