"""Boletim de notas — portado do projetoGi/backendPythonPdf (fpdf -> fpdf2)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Aluno, AluNota, Materia
from .base import PdfTov, formatar_nota

LARGURAS = [82, 30, 30, 30]
COLUNAS = list(zip(["Matéria", "Nota", "Faltas", "Cursou"], LARGURAS))


def notas_do_aluno(db: Session, cod_alu: int):
    q = (
        select(Materia.NOME, AluNota.nota, AluNota.falta, AluNota.cursou)
        .join(Materia, Materia.cod_mat == AluNota.cod_mat)
        .where(AluNota.cod_alu == cod_alu)
        .order_by(Materia.NOME)
    )
    return [
        (nome.strip() if nome else "", nota, falta, cursou)
        for nome, nota, falta, cursou in db.execute(q)
    ]


def gerar_boletim(db: Session, cod_alu: int) -> bytes:
    aluno = db.get(Aluno, cod_alu)
    if not aluno:
        raise ValueError(f"Aluno {cod_alu} não encontrado")
    notas = notas_do_aluno(db, cod_alu)

    pdf = PdfTov(titulo=f"Boletim de: {aluno.nome}")
    pdf.add_page()
    pdf.tabela_cabecalho(COLUNAS)
    for nome, nota, falta, cursou in notas:
        pdf.tabela_linha(
            [
                nome,
                formatar_nota(nota),
                falta if falta is not None else "N/C",
                cursou or "",
            ],
            LARGURAS,
        )
    pdf.tabela_fim(LARGURAS)
    return bytes(pdf.output())
