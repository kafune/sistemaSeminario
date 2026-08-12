"""Consultas canônicas de faltas derivadas das chamadas encerradas."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import AluNota, Aula, Chamada, Presenca


def subconsulta_faltas():
    """Uma linha por vínculo acadêmico e aluno com o total de ausências."""
    return (
        select(
            Aula.docturma_id.label("docturma_id"),
            Presenca.cod_alu.label("cod_alu"),
            func.count(Presenca.id).label("faltas"),
        )
        .join(Chamada, Chamada.aula_id == Aula.id)
        .join(Presenca, Presenca.chamada_id == Chamada.id)
        .where(
            Chamada.status == "ENCERRADA",
            Presenca.registrado_em.is_(None),
            Aula.status != "CANCELADA",
        )
        .group_by(Aula.docturma_id, Presenca.cod_alu)
        .subquery()
    )


def faltas_do_vinculo(db: Session, docturma_id: int) -> dict[int, int]:
    faltas = subconsulta_faltas()
    return {
        int(cod_alu): int(total or 0)
        for cod_alu, total in db.execute(
            select(faltas.c.cod_alu, faltas.c.faltas).where(
                faltas.c.docturma_id == docturma_id
            )
        )
    }


def sincronizar_faltas(db: Session, docturma_id: int) -> dict[int, int]:
    """Reescreve o cache ``AluNota.falta`` a partir das chamadas encerradas.

    Não faz commit: quem chama decide o momento de persistir.
    """
    faltas = faltas_do_vinculo(db, docturma_id)
    for nota in db.scalars(
        select(AluNota).where(AluNota.docturma_id == docturma_id)
    ):
        nota.falta = faltas.get(nota.cod_alu, 0)
    return faltas
