import io
import re
import unicodedata
from datetime import time

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    Aluno,
    AluTurma,
    Aula,
    DocTurma,
    Materia,
    Professor,
    Turma,
)

COR_CABECALHO = "E94A4A"
COR_ESCURO = "202934"
COR_CLARO = "F4F1EC"
BORDA_FINA = Side(style="thin", color="777777")


def _hora(valor: time | None) -> str:
    return valor.strftime("%H:%M") if valor else ""


def _nome_arquivo(valor: str) -> str:
    normalizado = unicodedata.normalize("NFKD", valor)
    sem_acentos = normalizado.encode("ascii", "ignore").decode("ascii")
    limpo = re.sub(r"[^A-Za-z0-9_-]+", "_", sem_acentos.strip())
    return limpo.strip("_") or "diario"


def _configurar_pagina(ws) -> None:
    ws.sheet_view.showGridLines = False
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins.left = 0.25
    ws.page_margins.right = 0.25
    ws.page_margins.top = 0.35
    ws.page_margins.bottom = 0.35
    ws.freeze_panes = "D7"


def _cabecalho(
    ws,
    turma: Turma,
    materia: Materia,
    professor: Professor | None,
    total_colunas: int,
) -> None:
    ultima = get_column_letter(total_colunas)
    ws.merge_cells(f"A1:{ultima}1")
    ws["A1"] = "DIÁRIO DE CLASSE"
    ws["A1"].font = Font(size=18, bold=True, color="FFFFFF")
    ws["A1"].fill = PatternFill("solid", fgColor=COR_ESCURO)
    ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 28

    ws.merge_cells(f"A2:C2")
    ws["A2"] = f"Turma: {turma.nome or turma.cod_tur}"
    ws.merge_cells(f"D2:{ultima}2")
    ws["D2"] = f"Matéria: {(materia.NOME or '').strip()}"
    ws.merge_cells(f"A3:C3")
    ws["A3"] = f"Horário: {turma.horario or ''}"
    ws.merge_cells(f"D3:{ultima}3")
    ws["D3"] = f"Professor(a): {professor.nome if professor else ''}"
    ws.merge_cells(f"A4:{ultima}4")
    ws["A4"] = "Legenda sugerida: P = presença · F = falta"

    for linha in range(2, 5):
        for cell in ws[linha]:
            cell.fill = PatternFill("solid", fgColor=COR_CLARO)
            cell.font = Font(bold=linha < 4, color=COR_ESCURO)
            cell.alignment = Alignment(vertical="center")


def _aba_presenca(
    workbook: Workbook,
    indice: int,
    turma: Turma,
    materia: Materia,
    professor: Professor | None,
    alunos: list,
    aulas: list[Aula],
) -> None:
    ws = workbook.create_sheet(f"Presença {indice}")
    total_colunas = 3 + len(aulas)
    _configurar_pagina(ws)
    _cabecalho(ws, turma, materia, professor, total_colunas)

    titulos = ["Nº", "Matrícula", "Nome"] + [aula.data for aula in aulas]
    linha_cabecalho = 6
    for coluna, valor in enumerate(titulos, start=1):
        cell = ws.cell(linha_cabecalho, coluna, valor)
        cell.fill = PatternFill("solid", fgColor=COR_CABECALHO)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.border = Border(
            left=BORDA_FINA, right=BORDA_FINA, top=BORDA_FINA, bottom=BORDA_FINA
        )
        cell.alignment = Alignment(
            horizontal="center", vertical="center", text_rotation=90 if coluna > 3 else 0
        )
        if coluna > 3:
            cell.number_format = "dd/mm"
    ws.row_dimensions[linha_cabecalho].height = 54

    primeira_linha = linha_cabecalho + 1
    for numero, (cod_alu, nome) in enumerate(alunos, start=1):
        linha = primeira_linha + numero - 1
        valores = [numero, cod_alu, nome] + [""] * len(aulas)
        for coluna, valor in enumerate(valores, start=1):
            cell = ws.cell(linha, coluna, valor)
            cell.border = Border(
                left=BORDA_FINA,
                right=BORDA_FINA,
                top=BORDA_FINA,
                bottom=BORDA_FINA,
            )
            cell.alignment = Alignment(
                horizontal="left" if coluna == 3 else "center", vertical="center"
            )
            if numero % 2 == 0:
                cell.fill = PatternFill("solid", fgColor="FAFAFA")
        ws.row_dimensions[linha].height = 21

    ws.column_dimensions["A"].width = 5
    ws.column_dimensions["B"].width = 12
    ws.column_dimensions["C"].width = 38
    for coluna in range(4, total_colunas + 1):
        ws.column_dimensions[get_column_letter(coluna)].width = 5.2

    ultima_linha = primeira_linha + max(len(alunos), 1) - 1
    assinatura = ultima_linha + 3
    ws.merge_cells(start_row=assinatura, start_column=3, end_row=assinatura, end_column=min(total_colunas, 8))
    ws.cell(assinatura, 3, "Assinatura do(a) professor(a): __________________________________________")
    ws.cell(assinatura, 3).font = Font(italic=True, color=COR_ESCURO)
    ws.print_title_rows = "1:6"
    ws.print_area = f"A1:{get_column_letter(total_colunas)}{assinatura + 1}"


def _aba_plano(
    workbook: Workbook,
    turma: Turma,
    materia: Materia,
    professor: Professor | None,
    aulas: list[Aula],
) -> None:
    ws = workbook.create_sheet("Plano de aulas")
    _configurar_pagina(ws)
    _cabecalho(ws, turma, materia, professor, 7)
    titulos = ["Data", "Início", "Fim", "Tema / conteúdo", "Local", "Status", "Observações"]
    for coluna, titulo in enumerate(titulos, start=1):
        cell = ws.cell(6, coluna, titulo)
        cell.fill = PatternFill("solid", fgColor=COR_CABECALHO)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = Border(
            left=BORDA_FINA, right=BORDA_FINA, top=BORDA_FINA, bottom=BORDA_FINA
        )
    for linha, aula in enumerate(aulas, start=7):
        valores = [
            aula.data,
            _hora(aula.hora_inicio),
            _hora(aula.hora_fim),
            aula.tema or "",
            aula.local or "",
            aula.status,
            aula.observacao or "",
        ]
        for coluna, valor in enumerate(valores, start=1):
            cell = ws.cell(linha, coluna, valor)
            cell.border = Border(
                left=BORDA_FINA,
                right=BORDA_FINA,
                top=BORDA_FINA,
                bottom=BORDA_FINA,
            )
            cell.alignment = Alignment(vertical="top", wrap_text=True)
        ws.cell(linha, 1).number_format = "dd/mm/yyyy"
        ws.row_dimensions[linha].height = 30
    for coluna, largura in enumerate([13, 9, 9, 35, 18, 14, 42], start=1):
        ws.column_dimensions[get_column_letter(coluna)].width = largura
    ws.print_title_rows = "1:6"
    ws.print_area = f"A1:G{max(7, 6 + len(aulas))}"


def gerar_diario_xlsx(db: Session, docturma_id: int) -> tuple[bytes, str]:
    vinculo = db.get(DocTurma, docturma_id)
    if not vinculo:
        raise ValueError("Matéria da turma não encontrada")
    turma = db.get(Turma, vinculo.cod_tur)
    materia = db.get(Materia, vinculo.cod_mat)
    professor = db.get(Professor, vinculo.cod_pro) if vinculo.cod_pro else None
    if not turma or not materia:
        raise ValueError("Turma ou matéria não encontrada")

    aulas = list(
        db.scalars(
            select(Aula)
            .where(
                Aula.docturma_id == docturma_id,
                Aula.status != "CANCELADA",
            )
            .order_by(Aula.data, Aula.hora_inicio)
        )
    )
    if not aulas:
        raise ValueError("Cadastre ao menos uma aula desta matéria no calendário")

    alunos = list(
        db.execute(
            select(Aluno.cod_alu, Aluno.nome)
            .join(AluTurma, AluTurma.cod_alu == Aluno.cod_alu)
            .where(
                AluTurma.cod_tur == vinculo.cod_tur,
                # Matrículas antigas podem não ter status preenchido; apenas
                # vínculos explicitamente inativos ficam fora do diário.
                (AluTurma.status.is_(None))
                | (~AluTurma.status.in_(["I", "INATIVO"])),
            )
            .order_by(Aluno.nome)
        )
    )

    workbook = Workbook()
    workbook.remove(workbook.active)
    for indice, inicio in enumerate(range(0, len(aulas), 15), start=1):
        _aba_presenca(
            workbook,
            indice,
            turma,
            materia,
            professor,
            alunos,
            aulas[inicio : inicio + 15],
        )
    _aba_plano(workbook, turma, materia, professor, aulas)

    buffer = io.BytesIO()
    workbook.save(buffer)
    nome = f"Diario_{_nome_arquivo(turma.nome or str(turma.cod_tur))}_{_nome_arquivo((materia.NOME or '').strip())}.xlsx"
    return buffer.getvalue(), nome
