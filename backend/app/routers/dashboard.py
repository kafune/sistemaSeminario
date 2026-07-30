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
    (
        alunos_total,
        alunos_ativos,
        turmas_total,
        cursos_total,
        professores_total,
        professores_ativos,
        materias_total,
        lancamentos_total,
    ) = db.execute(
        select(
            select(func.count()).select_from(Aluno).scalar_subquery(),
            select(func.count())
            .select_from(Aluno)
            .where(Aluno.status == "A")
            .scalar_subquery(),
            select(func.count()).select_from(Turma).scalar_subquery(),
            select(func.count(func.distinct(Turma.curso)))
            .where(Turma.curso.is_not(None))
            .scalar_subquery(),
            select(func.count()).select_from(Professor).scalar_subquery(),
            select(func.count())
            .select_from(Professor)
            .where(Professor.status == "A")
            .scalar_subquery(),
            select(func.count()).select_from(Materia).scalar_subquery(),
            select(func.count()).select_from(AluNota).scalar_subquery(),
        )
    ).one()

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
