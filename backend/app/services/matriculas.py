from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Aluno, AluTurma, Turma


def atualizar_contagem_turma(db: Session, cod_tur: int) -> None:
    """Mantém o contador legado alinhado à tabela canônica de matrículas."""
    turma = db.get(Turma, cod_tur)
    if turma:
        turma.qtalu = db.scalar(
            select(func.count())
            .select_from(AluTurma)
            .where(AluTurma.cod_tur == cod_tur)
        ) or 0


def sincronizar_matricula(
    db: Session,
    aluno: Aluno,
    cod_tur: int | None,
) -> None:
    """Define a única turma atual do aluno nas duas estruturas legadas."""
    if cod_tur is not None and not db.get(Turma, cod_tur):
        raise HTTPException(404, "Turma não encontrada")

    vinculos = list(
        db.scalars(
            select(AluTurma)
            .where(AluTurma.cod_alu == aluno.cod_alu)
            .order_by(AluTurma.id)
        )
    )
    turmas_afetadas = {vinculo.cod_tur for vinculo in vinculos}
    if aluno.cod_tur is not None:
        turmas_afetadas.add(aluno.cod_tur)
    if cod_tur is not None:
        turmas_afetadas.add(cod_tur)

    vinculo_destino = None
    for vinculo in vinculos:
        if cod_tur is not None and vinculo.cod_tur == cod_tur and vinculo_destino is None:
            vinculo_destino = vinculo
        else:
            db.delete(vinculo)

    if cod_tur is not None and vinculo_destino is None:
        proximo_item = (
            db.scalar(
                select(func.max(AluTurma.item)).where(AluTurma.cod_tur == cod_tur)
            )
            or 0
        ) + 1
        db.add(
            AluTurma(
                cod_tur=cod_tur,
                cod_alu=aluno.cod_alu,
                item=proximo_item,
                status="A",
            )
        )

    aluno.cod_tur = cod_tur
    db.flush()
    for turma_afetada in turmas_afetadas:
        atualizar_contagem_turma(db, turma_afetada)
