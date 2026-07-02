"""Base dos PDFs institucionais — cabeçalho portado do gerador de boletim
do projetoGi (backendPythonPdf/main.py)."""

import os

from fpdf import FPDF

LOGO = os.path.join(os.path.dirname(__file__), "logo.png")

INSTITUICAO = "Seminário Teológico de Guarulhos"
ENDERECO = "Rua Itaverava, 445 - Macedo, Guarulhos - SP"
CNPJ = "CNPJ: 04.273.604/0001-62"
TELEFONE = "Tel: (11) 2408-8819"


class PdfStg(FPDF):
    """PDF A4 retrato com o cabeçalho padrão do seminário."""

    def __init__(self, titulo: str = "", orientation: str = "P"):
        super().__init__(orientation=orientation)
        self.titulo = titulo
        self.set_auto_page_break(True, margin=15)

    def header(self):
        self.image(LOGO, 40, 10, 33)
        self.set_xy(75, 10)
        self.set_font("Helvetica", "B", 12)
        self.cell(0, 6, INSTITUICAO, 0, 1, "L")
        self.set_xy(75, 15)
        self.set_font("Helvetica", "", 10)
        self.cell(0, 6, ENDERECO, 0, 1, "L")
        self.set_xy(90, 20)
        self.cell(0, 6, CNPJ, 0, 1, "L")
        self.set_xy(94, 25)
        self.cell(0, 6, TELEFONE, 0, 1, "L")
        self.ln(7)
        if self.titulo:
            self.set_font("Helvetica", "B", 16)
            self.cell(0, 10, self.titulo, 0, 1, "C")
            self.ln(4)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.cell(0, 8, f"Página {self.page_no()}/{{nb}}", 0, 0, "C")

    def tabela_cabecalho(self, colunas: list[tuple[str, int]]):
        """colunas: lista de (rotulo, largura_mm)."""
        self.set_fill_color(172, 193, 4)  # verde do boletim original
        self.set_text_color(0)
        self.set_draw_color(0, 0, 0)
        self.set_line_width(0.3)
        self.set_font("Helvetica", "B", 11)
        for rotulo, largura in colunas:
            self.cell(largura, 9, rotulo, 1, 0, "C", True)
        self.ln()

    def tabela_linha(self, valores: list, larguras: list[int], altura: int = 8):
        self.set_font("Helvetica", "", 10)
        self.set_fill_color(255, 255, 255)
        for i, (v, largura) in enumerate(zip(valores, larguras)):
            align = "L" if i == 0 else "C"
            self.cell(largura, altura, "" if v is None else str(v), "LR", 0, align, True)
        self.ln()

    def tabela_fim(self, larguras: list[int]):
        self.cell(sum(larguras), 0, "", "T")
        self.ln(4)


def formatar_nota(nota) -> str:
    if nota is None:
        return "N/C"
    return f"{float(nota):.2f}".replace(".", ",")
