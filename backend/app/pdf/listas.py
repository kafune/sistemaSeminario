"""Listagens simples: alunos por turma e ficha do aluno."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Aluno, AluTurma, Turma
from .base import PdfTov


def gerar_lista_turma(db: Session, cod_tur: int) -> bytes:
    turma = db.get(Turma, cod_tur)
    if not turma:
        raise ValueError(f"Turma {cod_tur} não encontrada")
    alunos = list(
        db.execute(
            select(Aluno)
            .join(AluTurma, AluTurma.cod_alu == Aluno.cod_alu)
            .where(AluTurma.cod_tur == cod_tur)
            .order_by(Aluno.nome)
        ).scalars()
    )

    pdf = PdfTov(titulo=f"Alunos da Turma: {turma.nome or cod_tur}")
    pdf.add_page()
    larguras = [12, 80, 30, 30, 40]
    pdf.tabela_cabecalho(
        list(zip(["Nº", "Nome", "Matrícula", "Telefone", "Celular"], larguras))
    )
    for i, aluno in enumerate(alunos, start=1):
        pdf.tabela_linha(
            [i, aluno.nome, aluno.cod_alu, aluno.fone1 or "", aluno.celular or ""],
            larguras,
            altura=7,
        )
    pdf.tabela_fim(larguras)
    return bytes(pdf.output())


def gerar_ficha_aluno(db: Session, cod_alu: int) -> bytes:
    aluno = db.get(Aluno, cod_alu)
    if not aluno:
        raise ValueError(f"Aluno {cod_alu} não encontrado")

    turma = db.get(Turma, aluno.cod_tur) if aluno.cod_tur else None

    def d(v):
        return v.strftime("%d/%m/%Y") if v else ""

    pdf = PdfTov(titulo="Ficha do Aluno")
    pdf.add_page()

    def secao(titulo):
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_fill_color(230, 230, 230)
        pdf.cell(0, 8, titulo, 0, 1, "L", True)
        pdf.ln(1)

    def campo(rotulo, valor):
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(45, 6, rotulo, 0, 0)
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(0, 6, str(valor or ""), 0, 1)

    secao("Dados pessoais")
    campo("Matrícula:", aluno.cod_alu)
    campo("Nome:", aluno.nome)
    campo("Nascimento:", d(aluno.dat_nas))
    campo("Sexo:", aluno.sexo)
    campo("Estado civil:", aluno.est_civ)
    campo("RG:", aluno.rg)
    campo("CPF:", aluno.cpf)
    campo("Profissão:", aluno.profissao)
    campo("Escolaridade:", aluno.escolaridade)
    campo("Nacionalidade:", aluno.nacionalidade)
    pdf.ln(3)

    secao("Contato")
    campo("Endereço:", f"{aluno.endereco or ''} {aluno.complemento or ''}".strip())
    campo("Bairro:", aluno.bairro)
    campo("Cidade:", f"{aluno.cidade or ''}{' - ' + aluno.uf if aluno.uf else ''}".strip())
    campo("CEP:", aluno.cep)
    campo("Telefones:", " / ".join(x for x in [aluno.fone1, aluno.fone2, aluno.celular] if x))
    campo("E-mail:", aluno.e_mail)
    pdf.ln(3)

    secao("Vida acadêmica")
    campo("Turma:", turma.nome if turma else "")
    campo("Cadastrado em:", d(aluno.dat_cad))
    campo("Status:", aluno.status)
    pdf.ln(3)

    secao("Vida eclesiástica")
    campo("Igreja:", aluno.igreja)
    campo("Local:", aluno.local_igreja)
    campo("Pastor:", aluno.nome_pastor)
    campo("Membro desde:", d(aluno.membro_desde))
    campo("Atividades:", aluno.atividades)

    return bytes(pdf.output())
