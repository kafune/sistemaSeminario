"""Histórico escolar — notas agrupadas por ano/semestre."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Aluno, AluNota, Materia
from .base import PdfTov, formatar_nota
from ..services.faltas import subconsulta_faltas

LARGURAS = [96, 28, 28, 28]
COLUNAS = list(zip(["Matéria", "Nota", "Faltas", "Cursou"], LARGURAS))


def gerar_historico(db: Session, cod_alu: int) -> bytes:
    aluno = db.get(Aluno, cod_alu)
    if not aluno:
        raise ValueError(f"Aluno {cod_alu} não encontrado")

    faltas = subconsulta_faltas()
    q = (
        select(
            AluNota,
            Materia.NOME,
            func.coalesce(faltas.c.faltas, AluNota.falta, 0),
        )
        .join(Materia, Materia.cod_mat == AluNota.cod_mat, isouter=True)
        .join(
            faltas,
            (faltas.c.docturma_id == AluNota.docturma_id)
            & (faltas.c.cod_alu == AluNota.cod_alu),
            isouter=True,
        )
        .where(AluNota.cod_alu == cod_alu)
        .order_by(AluNota.ano, AluNota.semestre, Materia.NOME)
    )

    # Agrupa por (ano, semestre)
    grupos: dict[tuple, list] = {}
    for nota, materia_nome, total_faltas in db.execute(q):
        chave = (nota.ano or "", nota.semestre or "")
        grupos.setdefault(chave, []).append((materia_nome, nota, total_faltas))

    pdf = PdfTov(titulo="Histórico Escolar")
    pdf.add_page()

    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 6, f"Aluno: {aluno.nome}  (matrícula {aluno.cod_alu})", 0, 1)
    if aluno.dat_nas:
        pdf.cell(0, 6, f"Data de nascimento: {aluno.dat_nas.strftime('%d/%m/%Y')}", 0, 1)
    pdf.ln(4)

    for (ano, semestre), linhas in sorted(grupos.items()):
        rotulo = "Sem período informado"
        if ano or semestre:
            rotulo = f"Ano {ano}" + (f" - {semestre}º semestre" if semestre else "")
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, rotulo, 0, 1)
        pdf.tabela_cabecalho(COLUNAS)
        for materia_nome, nota, total_faltas in linhas:
            pdf.tabela_linha(
                [
                    (materia_nome or "").strip(),
                    formatar_nota(nota.nota),
                    int(total_faltas or 0),
                    nota.cursou or "",
                ],
                LARGURAS,
                altura=7,
            )
        pdf.tabela_fim(LARGURAS)

    return bytes(pdf.output())
