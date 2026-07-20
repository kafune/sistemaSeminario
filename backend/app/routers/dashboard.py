"""Agregações somente-leitura para a tela de Dashboard.

Não altera nenhuma regra de negócio: apenas soma o que já existe no banco
(alunos, turmas, professores, matérias e lançamentos de notas).
"""

from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Aluno, AluNota, AluTurma, Materia, Professor, Turma

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
def resumo(db: Session = Depends(get_db)):
    alunos_total = db.scalar(select(func.count()).select_from(Aluno))
    alunos_ativos = db.scalar(
        select(func.count()).select_from(Aluno).where(Aluno.status == "A")
    )
    turmas_total = db.scalar(select(func.count()).select_from(Turma))
    cursos_total = db.scalar(
        select(func.count(func.distinct(Turma.curso))).where(Turma.curso.is_not(None))
    )
    professores_total = db.scalar(select(func.count()).select_from(Professor))
    professores_ativos = db.scalar(
        select(func.count()).select_from(Professor).where(Professor.status == "A")
    )
    materias_total = db.scalar(select(func.count()).select_from(Materia))
    lancamentos_total = db.scalar(select(func.count()).select_from(AluNota))

    # Matrículas por curso: soma as matrículas (aluturma) das turmas de cada curso.
    por_curso_q = (
        select(Turma.curso, func.count(AluTurma.id))
        .join(AluTurma, AluTurma.cod_tur == Turma.cod_tur, isouter=True)
        .group_by(Turma.curso)
        .order_by(desc(func.count(AluTurma.id)))
    )
    matriculas_por_curso = [
        {"curso": (curso or "Sem curso"), "total": total or 0}
        for curso, total in db.execute(por_curso_q)
    ]

    # Atividade recente: últimos alunos cadastrados (dado real, ordenado por dat_cad).
    recentes_q = (
        select(Aluno.cod_alu, Aluno.nome, Aluno.dat_cad)
        .order_by(desc(Aluno.dat_cad), desc(Aluno.cod_alu))
        .limit(6)
    )
    recentes = [
        {
            "cod_alu": cod_alu,
            "nome": nome,
            "dat_cad": dat_cad.isoformat() if dat_cad else None,
        }
        for cod_alu, nome, dat_cad in db.execute(recentes_q)
    ]

    return {
        "alunos_total": alunos_total,
        "alunos_ativos": alunos_ativos,
        "turmas_total": turmas_total,
        "cursos_total": cursos_total,
        "professores_total": professores_total,
        "professores_ativos": professores_ativos,
        "materias_total": materias_total,
        "lancamentos_total": lancamentos_total,
        "matriculas_por_curso": matriculas_por_curso,
        "recentes": recentes,
    }
