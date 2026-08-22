"""Importação da planilha de controle de matrículas e mensalidades.

A planilha de verdade não mora no repositório, então o teste monta uma com a
mesma forma: título, cabeçalho, bloco de regulares, bloco de transferência,
casais com as células de valor mescladas e as duas linhas de total.
"""

import unittest
from datetime import date
from decimal import Decimal
from io import BytesIO

import openpyxl
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Aluno, AluTurma, Cobranca, CondicaoFinanceiraAluno, Turma
from app.services import financeiro as servico
from importar_planilha_financeiro import importar, ler_planilha, normalizar

CABECALHO = [
    "Nº", "NOME", "C", "VALOR PAGO", "SENDO =\nMATRÍCULA",
    "E MENSALIDADE\nJÁ DE AGOSTO", "VALOR A PAGAR\nEM 10/AGO", "CONTA",
    "NOME NO RECIBO /\nEXTRATO DO DEPÓSITO",
]


def montar_planilha() -> BytesIO:
    """Reproduz a forma da planilha da secretaria, com números fechados.

    Matrícula 100, mensalidade 200, cônjuge com 50% nas duas. Regular deve 300;
    casal deve 450 (150 de matrículas + 300 de mensalidade); transferido deve
    200, sem matrícula.
    """
    livro = openpyxl.Workbook()
    aba = livro.active
    aba.title = "Alunos"
    aba.append(["CONTROLE DE MATRÍCULAS E MENSALIDADES – ALUNOS"])
    aba.append(["Valores em reais. Vencimento das pendências em 10/ago."])
    aba.append([])
    aba.append(CABECALHO)

    # 5-6: casal que pagou 300 (as duas matrículas + parte da mensalidade).
    aba.append([1, "Marcos Ferraz de Lima", "C", 300, 150, 150, 150, "Sicoob Uni Sudeste", None])
    aba.append([2, "Evaneide Maria"])
    # 7: regular que pagou só a matrícula.
    aba.append([3, "Daniel Marcolino da Silva", None, 100, 100, None, 200, "Sicoob Uni Sudeste", None])
    # 8-9: casal que pagou só as matrículas.
    aba.append([4, "Gerson Caristo", "C", 150, 150, None, 300, "Igreja Batista Urbana", None])
    aba.append([5, "Selma Caristo"])
    # 10: regular que quitou tudo, com nome diferente no extrato.
    aba.append([6, "Marcos Alex Sandro", None, 300, 100, "PG", 0, "Sicoob Uni Sudeste", "Central Mailing List"])
    # 11: regular que ainda não pagou nada.
    aba.append([7, "Agatha Cristina", None, None, None, None, 300, None, None])
    aba.append([None, "Valor total pago até agora", None, 850])
    aba.append([])
    aba.append(["TRANSFERÊNCIA"])
    aba.append(CABECALHO)
    # 16-17: casal transferido, sem matrícula.
    aba.append([1, "Celina Viana Osório", "C", None, None, None, 300, None, None])
    aba.append([2, "Ricardo Alexandre Osório"])
    # 18: transferido sozinho.
    aba.append([3, "Dayane Cristina da Silva", None, None, None, None, 200, None, None])
    aba.append([None, "Valor total a pagar em 10/ago", None, None, None, None, 1450])

    for primeira in (5, 8, 16):
        for coluna in "CDEFG":
            aba.merge_cells(f"{coluna}{primeira}:{coluna}{primeira + 1}")

    buffer = BytesIO()
    livro.save(buffer)
    buffer.seek(0)
    return buffer


class LeituraDaPlanilhaTest(unittest.TestCase):
    def setUp(self):
        self.pessoas, self.totais = ler_planilha(montar_planilha())

    def test_le_as_duas_listas(self):
        self.assertEqual(len(self.pessoas), 10)
        self.assertEqual(sum(1 for p in self.pessoas if p["bloco"] == "REGULAR"), 7)
        self.assertEqual(sum(1 for p in self.pessoas if p["bloco"] == "TRANSFERENCIA"), 3)

    def test_celula_mesclada_identifica_o_casal(self):
        conjuges = [p["nome"] for p in self.pessoas if p["conjuge"]]
        self.assertEqual(
            conjuges,
            ["Evaneide Maria", "Selma Caristo", "Ricardo Alexandre Osório"],
        )
        titulares = [p["nome"] for p in self.pessoas if p["titular_casal"]]
        self.assertEqual(
            titulares,
            ["Marcos Ferraz de Lima", "Gerson Caristo", "Celina Viana Osório"],
        )

    def test_le_valores_e_totais(self):
        por_nome = {p["nome"]: p for p in self.pessoas}
        self.assertEqual(por_nome["Marcos Ferraz de Lima"]["pago"], Decimal("300.00"))
        self.assertEqual(por_nome["Marcos Ferraz de Lima"]["a_pagar"], Decimal("150.00"))
        self.assertEqual(por_nome["Agatha Cristina"]["pago"], servico.ZERO)
        # "PG" na coluna da mensalidade não é número e não pode virar valor.
        self.assertEqual(por_nome["Marcos Alex Sandro"]["pago"], Decimal("300.00"))
        self.assertEqual(por_nome["Marcos Alex Sandro"]["a_pagar"], servico.ZERO)
        self.assertEqual(por_nome["Marcos Alex Sandro"]["recibo"], "Central Mailing List")
        self.assertEqual(self.totais, {"pago": Decimal("850.00"), "a_pagar": Decimal("1450.00")})


class ImportacaoTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()
        self.turma = Turma(nome="Turma da manhã")
        self.db.add(self.turma)
        self.db.commit()
        self.pessoas, self.totais = ler_planilha(montar_planilha())

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def importar(self, **ajustes):
        parametros = {
            "turma": self.turma,
            "parcelas": 1,
            "matricula": Decimal("100"),
            "mensalidade": Decimal("200"),
            "desconto_conjuge": Decimal("50"),
            "primeira_mensalidade": date(2026, 8, 10),
            "relatar": lambda *_: None,
        }
        parametros.update(ajustes)
        return importar(self.db, self.pessoas, self.totais, **parametros)

    def aluno(self, nome):
        return self.db.scalar(select(Aluno).where(Aluno.nome == nome))

    def cobrancas(self, nome):
        return list(
            self.db.scalars(
                select(Cobranca)
                .where(Cobranca.cod_alu == self.aluno(nome).cod_alu)
                .order_by(Cobranca.vencimento, Cobranca.id)
            )
        )

    def test_importacao_bate_com_os_totais_da_planilha(self):
        resultado = self.importar()
        self.assertTrue(resultado["confere"])
        self.assertEqual(resultado["alunos_criados"], 10)
        self.assertEqual(resultado["baixado"], Decimal("850.00"))

    def test_todo_mundo_fica_matriculado_na_turma(self):
        self.importar()
        matriculados = self.db.scalars(
            select(AluTurma.cod_alu).where(AluTurma.cod_tur == self.turma.cod_tur)
        )
        self.assertEqual(len(set(matriculados)), 10)

    def test_conjuge_paga_metade_das_duas_coisas(self):
        self.importar()
        titular = self.cobrancas("Marcos Ferraz de Lima")
        conjuge = self.cobrancas("Evaneide Maria")
        self.assertEqual([c.valor for c in titular], [Decimal("100.00"), Decimal("200.00")])
        self.assertEqual([c.valor for c in conjuge], [Decimal("50.00"), Decimal("100.00")])
        # O casal fecha nos 450 que a secretaria cobra hoje.
        self.assertEqual(
            sum(c.valor for c in titular + conjuge),
            Decimal("450.00"),
        )

    def test_transferido_nao_paga_matricula(self):
        self.importar()
        for nome in ("Celina Viana Osório", "Dayane Cristina da Silva"):
            tipos = [c.tipo for c in self.cobrancas(nome)]
            self.assertEqual(tipos, ["MENSALIDADE"], nome)
        condicao = self.db.scalar(
            select(CondicaoFinanceiraAluno).where(
                CondicaoFinanceiraAluno.cod_alu == self.aluno("Dayane Cristina da Silva").cod_alu
            )
        )
        self.assertEqual(condicao.tipo, "TRANSFERENCIA")
        self.assertEqual(condicao.cobra_matricula, "N")

    def test_pagamento_do_casal_transborda_para_o_conjuge(self):
        self.importar()
        # 300 pagos: matrícula e mensalidade do titular; o cônjuge fica devendo 150.
        titular = self.cobrancas("Marcos Ferraz de Lima")
        self.assertTrue(all(c.status == "PAGA" for c in titular))
        conjuge = self.cobrancas("Evaneide Maria")
        self.assertTrue(all(c.status == "ABERTA" for c in conjuge))
        self.assertEqual(sum(c.valor for c in conjuge), Decimal("150.00"))

    def test_quem_quitou_fica_sem_saldo(self):
        self.importar()
        cobrancas = self.cobrancas("Marcos Alex Sandro")
        self.assertTrue(all(c.status == "PAGA" for c in cobrancas))
        pagamentos = self.db.scalars(
            select(Cobranca).where(Cobranca.cod_alu == self.aluno("Marcos Alex Sandro").cod_alu)
        )
        self.assertEqual(sum(c.valor for c in pagamentos), Decimal("300.00"))

    def test_conta_e_nome_do_extrato_ficam_no_pagamento(self):
        self.importar()
        from app.models import Pagamento

        pagamento = self.db.scalar(
            select(Pagamento).where(Pagamento.observacao.like("%Central Mailing List%"))
        )
        self.assertIsNotNone(pagamento)
        self.assertIn("Sicoob Uni Sudeste", pagamento.observacao)
        self.assertEqual(pagamento.forma, "TRANSFERENCIA")

    def test_rodar_de_novo_nao_duplica_aluno_nem_cobranca(self):
        self.importar()
        antes = self.db.scalar(select(Aluno.cod_alu).order_by(Aluno.cod_alu.desc()))
        cobrancas_antes = len(self.cobrancas("Daniel Marcolino da Silva"))

        segunda = self.importar()
        self.assertEqual(segunda["alunos_criados"], 0)
        self.assertEqual(segunda["alunos_reaproveitados"], 10)
        self.assertEqual(
            self.db.scalar(select(Aluno.cod_alu).order_by(Aluno.cod_alu.desc())),
            antes,
        )
        self.assertEqual(len(self.cobrancas("Daniel Marcolino da Silva")), cobrancas_antes)

    def test_valores_errados_nao_batem_com_a_planilha(self):
        # Mensalidade de 300 quebraria a conta: o script precisa perceber.
        resultado = self.importar(mensalidade=Decimal("300"))
        self.assertFalse(resultado["confere"])

    def test_parcelas_futuras_nao_entram_na_conferencia(self):
        # O curso tem 12 meses, mas a planilha é a foto da primeira parcela.
        resultado = self.importar(parcelas=12)
        self.assertTrue(resultado["confere"])
        self.assertEqual(
            len([c for c in self.cobrancas("Daniel Marcolino da Silva") if c.tipo == "MENSALIDADE"]),
            12,
        )

    def test_aluno_ja_cadastrado_e_reaproveitado(self):
        existente = Aluno(nome="DANIEL MARCOLINO DA SILVA", status="A")
        self.db.add(existente)
        self.db.commit()

        resultado = self.importar()
        self.assertEqual(resultado["alunos_criados"], 9)
        self.assertEqual(resultado["alunos_reaproveitados"], 1)
        self.assertEqual(
            len(list(self.db.scalars(select(Aluno).where(Aluno.nome.ilike("daniel%"))))),
            1,
        )


class NormalizacaoTest(unittest.TestCase):
    def test_nome_sem_acento_maiusculo_e_sem_espaco_dobrado(self):
        self.assertEqual(normalizar("  Márcia  Regina "), "MARCIA REGINA")
        self.assertEqual(normalizar("Marcos Antonio de Lima  Filho"), "MARCOS ANTONIO DE LIMA FILHO")
        self.assertEqual(normalizar(None), "")


if __name__ == "__main__":
    unittest.main()
