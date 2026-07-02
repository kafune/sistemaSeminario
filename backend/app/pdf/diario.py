"""Diário de classe — lista de alunos da turma com colunas em branco para
presença/avaliação, no espírito do relatório Crystal 'diario.rpt'."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Aluno, AluTurma, DocTurma, Materia, Professor, Turma
from .base import PdfStg

N_COLUNAS_AULA = 10


def gerar_diario(db: Session, cod_tur: int, cod_mat: int | None = None) -> bytes:
    turma = db.get(Turma, cod_tur)
    if not turma:
        raise ValueError(f"Turma {cod_tur} não encontrada")

    materia = db.get(Materia, cod_mat) if cod_mat else None
    professor = None
    if cod_mat:
        dt = db.scalar(
            select(DocTurma).where(
                DocTurma.cod_tur == cod_tur, DocTurma.cod_mat == cod_mat
            )
        )
        if dt and dt.cod_pro:
            professor = db.get(Professor, dt.cod_pro)

    alunos = list(
        db.execute(
            select(Aluno.cod_alu, Aluno.nome)
            .join(AluTurma, AluTurma.cod_alu == Aluno.cod_alu)
            .where(AluTurma.cod_tur == cod_tur)
            .order_by(Aluno.nome)
        )
    )

    pdf = PdfStg(titulo="Diário de Classe", orientation="L")
    pdf.add_page()
    pdf.set_font("Helvetica", "", 11)
    linha_info = f"Turma: {turma.nome or cod_tur}"
    if materia:
        linha_info += f"   Matéria: {(materia.NOME or '').strip()}"
    if professor:
        linha_info += f"   Professor: {professor.nome}"
    pdf.cell(0, 7, linha_info, 0, 1)
    pdf.ln(2)

    larg_nome = 90
    larg_aula = int((277 - larg_nome - 12) / N_COLUNAS_AULA)
    colunas = [("Nº", 12), ("Aluno", larg_nome)] + [
        ("", larg_aula) for _ in range(N_COLUNAS_AULA)
    ]
    pdf.tabela_cabecalho(colunas)
    larguras = [c[1] for c in colunas]
    for i, (cod_alu, nome) in enumerate(alunos, start=1):
        pdf.tabela_linha([i, nome] + [""] * N_COLUNAS_AULA, larguras, altura=8)
    pdf.tabela_fim(larguras)
    return bytes(pdf.output())
