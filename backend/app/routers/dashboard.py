"""Agregações somente-leitura para a tela de Dashboard.

Não altera nenhuma regra de negócio: apenas soma o que já existe no banco
(alunos, turmas, professores, matérias e lançamentos de notas).

Além do censo, devolve as *pendências*: o que está parado esperando alguém da
secretaria agir. É o que o painel precisa mostrar primeiro — número que não
leva a uma lista não muda decisão nenhuma.
"""

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Aluno,
    AluNota,
    AluTurma,
    Chamada,
    DocTurma,
    Materia,
    Professor,
    Turma,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def periodo_corrente(hoje: date) -> tuple[str, str]:
    """Ano e semestre no formato gravado em ``docturma``."""
    return str(hoje.year), "1" if hoje.month <= 6 else "2"


@router.get("")
def resumo(db: Session = Depends(get_db)):
    ano, semestre = periodo_corrente(date.today())

    # Vínculo turma×matéria do período corrente com pelo menos um aluno
    # matriculado ainda sem nota lançada.
    matriculas_periodo = (
        select(
            DocTurma.id.label("docturma_id"),
            AluTurma.cod_alu.label("cod_alu"),
        )
        .join(AluTurma, AluTurma.cod_tur == DocTurma.cod_tur)
        .where(DocTurma.Ano == ano, DocTurma.semestre == semestre)
        .subquery()
    )
    notas_em_aberto_sq = (
        select(func.count(func.distinct(matriculas_periodo.c.docturma_id)))
        .select_from(matriculas_periodo)
        .join(
            AluNota,
            and_(
                AluNota.docturma_id == matriculas_periodo.c.docturma_id,
                AluNota.cod_alu == matriculas_periodo.c.cod_alu,
            ),
            isouter=True,
        )
        .where(or_(AluNota.id.is_(None), AluNota.nota.is_(None)))
        .scalar_subquery()
    )

    (
        alunos_total,
        alunos_ativos,
        turmas_total,
        cursos_total,
        professores_total,
        professores_ativos,
        materias_total,
        lancamentos_total,
        pre_cadastros,
        alunos_sem_turma,
        notas_em_aberto,
        chamadas_abertas,
        turmas_com_chamada_aberta,
        primeira_turma_com_chamada,
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
            select(func.count())
            .select_from(Aluno)
            .where(Aluno.status == "P")
            .scalar_subquery(),
            select(func.count())
            .select_from(Aluno)
            .where(
                Aluno.status == "A",
                ~select(AluTurma.id)
                .where(AluTurma.cod_alu == Aluno.cod_alu)
                .exists(),
            )
            .scalar_subquery(),
            notas_em_aberto_sq,
            select(func.count())
            .select_from(Chamada)
            .where(Chamada.status == "ABERTA")
            .scalar_subquery(),
            # Quantas turmas têm chamada aberta, e qual é a primeira delas:
            # com uma só, o painel leva direto para a chamada em vez de
            # devolver o usuário à lista de turmas para procurar qual é.
            select(func.count(func.distinct(Chamada.cod_tur)))
            .select_from(Chamada)
            .where(Chamada.status == "ABERTA")
            .scalar_subquery(),
            select(func.min(Chamada.cod_tur))
            .select_from(Chamada)
            .where(Chamada.status == "ABERTA")
            .scalar_subquery(),
        )
    ).one()

    # Duas chamadas abertas da mesma turma continuam sendo um destino só.
    turma_da_chamada_aberta = (
        primeira_turma_com_chamada if turmas_com_chamada_aberta == 1 else None
    )

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
        # Ordenadas por urgência: a chamada aberta trava a aula de hoje; o
        # pré-cadastro trava a matrícula; nota e turma são acúmulo do semestre.
        "pendencias": [
            {
                "chave": "chamadas_abertas",
                "rotulo": "Chamadas não encerradas",
                "total": chamadas_abertas or 0,
                "nota": "presenças ainda não viram faltas",
                # Preenchido só quando o destino é inequívoco.
                "cod_tur": turma_da_chamada_aberta,
            },
            {
                "chave": "pre_cadastros",
                "rotulo": "Pré-cadastros",
                "total": pre_cadastros or 0,
                "nota": "aguardando triagem",
            },
            {
                "chave": "notas_em_aberto",
                "rotulo": "Notas em aberto",
                "total": notas_em_aberto or 0,
                "nota": f"turmas e matérias em {ano}.{semestre}",
            },
            {
                "chave": "alunos_sem_turma",
                "rotulo": "Alunos sem turma",
                "total": alunos_sem_turma or 0,
                "nota": "ativos e não matriculados",
            },
        ],
    }
