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
from app.models import Aluno, AluTurma, Cobranca, CondicaoFinanceiraAluno, Pagamento, Turma
from app.services import financeiro as servico
from importar_planilha_financeiro import (
    assinatura,
    casar_nomes,
    diagnosticar,
    chave_curta,
    importar,
    ler_planilha,
    limpar_importacao,
    nome_contido,
    normalizar,
    selecionar,
    sobrescrever,
)

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


TODOS = [
    "Marcos Ferraz de Lima", "Evaneide Maria", "Daniel Marcolino da Silva",
    "Gerson Caristo", "Selma Caristo", "Marcos Alex Sandro", "Agatha Cristina",
    "Celina Viana Osório", "Ricardo Alexandre Osório", "Dayane Cristina da Silva",
]


class LeituraDaPlanilhaTest(unittest.TestCase):
    def setUp(self):
        self.pessoas, self.totais = ler_planilha(montar_planilha())

    def test_le_as_duas_listas(self):
        self.assertEqual(len(self.pessoas), 10)
        self.assertEqual(sum(1 for p in self.pessoas if p["bloco"] == "REGULAR"), 7)
        self.assertEqual(sum(1 for p in self.pessoas if p["bloco"] == "TRANSFERENCIA"), 3)

    def test_celula_mesclada_identifica_o_casal(self):
        self.assertEqual(
            [p["nome"] for p in self.pessoas if p["conjuge"]],
            ["Evaneide Maria", "Selma Caristo", "Ricardo Alexandre Osório"],
        )
        self.assertEqual(
            [p["nome"] for p in self.pessoas if p["titular_casal"]],
            ["Marcos Ferraz de Lima", "Gerson Caristo", "Celina Viana Osório"],
        )

    def test_le_valores_e_totais(self):
        por_nome = {p["nome"]: p for p in self.pessoas}
        self.assertEqual(por_nome["Marcos Ferraz de Lima"]["pago"], Decimal("300.00"))
        self.assertEqual(por_nome["Marcos Ferraz de Lima"]["a_pagar"], Decimal("150.00"))
        self.assertEqual(por_nome["Agatha Cristina"]["pago"], servico.ZERO)
        # "PG" na coluna da mensalidade não é número e não pode virar valor.
        self.assertEqual(por_nome["Marcos Alex Sandro"]["pago"], Decimal("300.00"))
        self.assertEqual(por_nome["Marcos Alex Sandro"]["recibo"], "Central Mailing List")
        self.assertEqual(self.totais, {"pago": Decimal("850.00"), "a_pagar": Decimal("1450.00")})


class BaseCadastroTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()
        self.manha = Turma(nome="Turma da manhã")
        self.noite = Turma(nome="Turma da noite")
        self.db.add_all([self.manha, self.noite])
        self.db.flush()
        self.pessoas, self.totais = ler_planilha(montar_planilha())

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def cadastrar(self, nome, turma):
        aluno = Aluno(nome=nome, status="A", cod_tur=turma.cod_tur if turma else None)
        self.db.add(aluno)
        self.db.flush()
        if turma is not None:
            self.db.add(AluTurma(cod_tur=turma.cod_tur, cod_alu=aluno.cod_alu, status="A"))
        self.db.commit()
        return aluno

    def cadastrar_todos(self):
        """Metade na manhã, metade na noite — como a secretaria descreveu."""
        for indice, nome in enumerate(TODOS):
            self.cadastrar(nome, self.manha if indice % 2 == 0 else self.noite)


class CasamentoDeNomesTest(BaseCadastroTest):
    def test_nome_identico_casa_exato(self):
        self.cadastrar("Daniel Marcolino da Silva", self.manha)
        por_nome = {c["nome"]: c for c in casar_nomes(self.db, self.pessoas)}
        self.assertEqual(por_nome["Daniel Marcolino da Silva"]["situacao"], "EXATO")
        self.assertEqual(por_nome["Agatha Cristina"]["situacao"], "NOVO")

    def test_acento_e_caixa_nao_atrapalham(self):
        self.cadastrar("CELINA VIANA OSORIO", self.noite)
        por_nome = {c["nome"]: c for c in casar_nomes(self.db, self.pessoas)}
        self.assertEqual(por_nome["Celina Viana Osório"]["situacao"], "EXATO")

    def test_particula_e_ordem_nao_separam_a_mesma_pessoa(self):
        # "da" entra e sai conforme quem digitou; é ruído como o acento.
        aluno = self.cadastrar("Daniel Marcolino Silva", self.manha)
        por_nome = {c["nome"]: c for c in casar_nomes(self.db, self.pessoas)}
        item = por_nome["Daniel Marcolino da Silva"]
        self.assertEqual(item["situacao"], "EXATO")
        self.assertEqual(item["aluno"].cod_alu, aluno.cod_alu)

    def test_nome_incompleto_na_planilha_encontra_o_completo(self):
        # A planilha traz "Evaneide Maria"; o cadastro tem o nome inteiro.
        aluno = self.cadastrar("Evaneide Maria da Silva Santos", self.noite)
        por_nome = {c["nome"]: c for c in casar_nomes(self.db, self.pessoas)}
        item = por_nome["Evaneide Maria"]
        self.assertEqual(item["situacao"], "PARCIAL")
        self.assertEqual(item["aluno"].cod_alu, aluno.cod_alu)

    def test_incompleto_exige_o_mesmo_primeiro_nome(self):
        self.cadastrar("Joana Evaneide Maria Costa", self.noite)
        por_nome = {c["nome"]: c for c in casar_nomes(self.db, self.pessoas)}
        self.assertEqual(por_nome["Evaneide Maria"]["situacao"], "NOVO")

    def test_incompleto_exige_dois_nomes(self):
        # Um token só casaria com meia escola.
        self.cadastrar("Agatha", self.manha)
        por_nome = {c["nome"]: c for c in casar_nomes(self.db, self.pessoas)}
        self.assertEqual(por_nome["Agatha Cristina"]["situacao"], "NOVO")

    def test_dois_completos_para_o_mesmo_incompleto_viram_ambiguo(self):
        self.cadastrar("Evaneide Maria da Silva", self.manha)
        self.cadastrar("Evaneide Maria de Souza", self.noite)
        por_nome = {c["nome"]: c for c in casar_nomes(self.db, self.pessoas)}
        self.assertEqual(por_nome["Evaneide Maria"]["situacao"], "AMBIGUO")

    def test_erro_de_digitacao_vira_aproximado(self):
        aluno = self.cadastrar("Gerson Caristto", self.manha)
        por_nome = {c["nome"]: c for c in casar_nomes(self.db, self.pessoas)}
        item = por_nome["Gerson Caristo"]
        self.assertEqual(item["situacao"], "APROXIMADO")
        self.assertEqual(item["aluno"].cod_alu, aluno.cod_alu)

    def test_nome_completo_na_planilha_e_curto_no_cadastro(self):
        # A direção contrária também vale: quem cadastrou é que abreviou.
        aluno = self.cadastrar("Marcos Ferraz", self.manha)
        por_nome = {c["nome"]: c for c in casar_nomes(self.db, self.pessoas)}
        item = por_nome["Marcos Ferraz de Lima"]
        self.assertEqual(item["situacao"], "PARCIAL")
        self.assertEqual(item["aluno"].cod_alu, aluno.cod_alu)

    def test_dois_candidatos_nunca_sao_escolhidos_pelo_script(self):
        self.cadastrar("Daniel Marcolino da Silva", self.manha)
        self.cadastrar("Daniel Marcolino da Silva", self.noite)
        por_nome = {c["nome"]: c for c in casar_nomes(self.db, self.pessoas)}
        self.assertEqual(por_nome["Daniel Marcolino da Silva"]["situacao"], "AMBIGUO")

    def test_homonimo_de_outra_familia_nao_casa(self):
        self.cadastrar("Daniel Marcolino da Costa Pereira", self.manha)
        por_nome = {c["nome"]: c for c in casar_nomes(self.db, self.pessoas)}
        self.assertEqual(por_nome["Daniel Marcolino da Silva"]["situacao"], "NOVO")


class SelecaoTest(BaseCadastroTest):
    def selecionar(self, **ajustes):
        parametros = {
            "aceitar_aproximados": False,
            "criar_novos": False,
            "turma_novos": None,
        }
        parametros.update(ajustes)
        return selecionar(self.db, casar_nomes(self.db, self.pessoas), **parametros)

    def test_por_padrao_so_entra_quem_casou_exato(self):
        self.cadastrar("Daniel Marcolino da Silva", self.manha)
        entram, de_fora = self.selecionar()
        self.assertEqual([i["nome"] for i in entram], ["Daniel Marcolino da Silva"])
        self.assertEqual(len(de_fora), 9)
        self.assertTrue(all("não está no cadastro" in motivo for _, motivo in de_fora))

    def test_cada_um_vai_para_a_propria_turma(self):
        self.cadastrar("Daniel Marcolino da Silva", self.manha)
        self.cadastrar("Agatha Cristina", self.noite)
        entram, _ = self.selecionar()
        por_nome = {i["nome"]: i["cod_tur"] for i in entram}
        self.assertEqual(por_nome["Daniel Marcolino da Silva"], self.manha.cod_tur)
        self.assertEqual(por_nome["Agatha Cristina"], self.noite.cod_tur)

    def test_aproximado_so_entra_quando_autorizado(self):
        self.cadastrar("Gerson Caristto", self.manha)
        _, de_fora = self.selecionar()
        motivos = {i["nome"]: m for i, m in de_fora}
        self.assertIn("parecido com", motivos["Gerson Caristo"])
        self.assertIn("--aceitar-aproximados", motivos["Gerson Caristo"])

        entram, _ = self.selecionar(aceitar_aproximados=True)
        self.assertIn("Gerson Caristo", [i["nome"] for i in entram])

    def test_incompleto_so_entra_quando_autorizado(self):
        self.cadastrar("Evaneide Maria da Silva Santos", self.noite)
        _, de_fora = self.selecionar()
        motivos = {i["nome"]: m for i, m in de_fora}
        self.assertIn("nome incompleto de", motivos["Evaneide Maria"])

        entram, _ = self.selecionar(aceitar_aproximados=True)
        casada = next(i for i in entram if i["nome"] == "Evaneide Maria")
        self.assertEqual(casada["aluno"].nome, "Evaneide Maria da Silva Santos")
        self.assertEqual(casada["cod_tur"], self.noite.cod_tur)

    def test_novo_precisa_de_turma(self):
        entram, de_fora = self.selecionar(criar_novos=True)
        self.assertEqual(entram, [])
        self.assertTrue(all("--turma-novos" in motivo for _, motivo in de_fora))

        entram, _ = self.selecionar(criar_novos=True, turma_novos=self.manha.cod_tur)
        self.assertEqual(len(entram), 10)
        self.assertTrue(all(i["cod_tur"] == self.manha.cod_tur for i in entram))

    def test_aluno_sem_turma_cai_na_turma_dos_novos(self):
        self.cadastrar("Daniel Marcolino da Silva", None)
        entram, de_fora = self.selecionar()
        self.assertEqual(entram, [])
        self.assertIn("sem turma", de_fora[0][1] + de_fora[1][1] + de_fora[2][1])

        entram, _ = self.selecionar(turma_novos=self.noite.cod_tur)
        self.assertEqual([i["cod_tur"] for i in entram], [self.noite.cod_tur])


class ImportacaoTest(BaseCadastroTest):
    def importar(self, **ajustes):
        if not self.db.scalar(select(Aluno)):
            self.cadastrar_todos()
        entram, de_fora = selecionar(
            self.db,
            casar_nomes(self.db, self.pessoas),
            aceitar_aproximados=False,
            criar_novos=False,
            turma_novos=None,
        )
        self.assertEqual(de_fora, [])
        parametros = {
            "parcelas": 24,
            "matricula": Decimal("100"),
            "mensalidade": Decimal("200"),
            "desconto_conjuge": Decimal("50"),
            "primeira_mensalidade": date(2026, 8, 10),
            "relatar": lambda *_: None,
        }
        parametros.update(ajustes)
        return importar(self.db, entram, self.totais, **parametros)

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

    def test_importacao_bate_com_a_planilha_mesmo_com_duas_turmas(self):
        resultado = self.importar()
        self.assertTrue(resultado["confere"])
        self.assertEqual(resultado["alunos_criados"], 0)
        self.assertEqual(resultado["alunos_reaproveitados"], 10)
        self.assertEqual(len(resultado["turmas"]), 2)
        self.assertEqual(resultado["baixado"], Decimal("850.00"))

    def test_ninguem_e_movido_de_turma(self):
        self.cadastrar_todos()
        antes = {aluno.nome: aluno.cod_tur for aluno in self.db.scalars(select(Aluno))}
        self.assertEqual(len(set(antes.values())), 2)
        self.importar()
        for aluno in self.db.scalars(select(Aluno)):
            self.assertEqual(aluno.cod_tur, antes[aluno.nome], aluno.nome)

    def test_plano_vale_para_as_duas_turmas(self):
        self.importar()
        from app.models import PlanoFinanceiro

        planos = list(self.db.scalars(select(PlanoFinanceiro)))
        self.assertEqual(len(planos), 2)
        self.assertTrue(all(p.parcelas == 24 for p in planos))
        self.assertTrue(all(p.valor_mensalidade == Decimal("200.00") for p in planos))

    def test_curso_de_dois_anos_gera_24_mensalidades(self):
        self.importar()
        mensalidades = [c for c in self.cobrancas("Daniel Marcolino da Silva") if c.tipo == "MENSALIDADE"]
        self.assertEqual(len(mensalidades), 24)
        self.assertEqual(mensalidades[0].vencimento, date(2026, 8, 10))
        self.assertEqual(mensalidades[-1].vencimento, date(2028, 7, 10))

    def test_conjuge_paga_metade_das_duas_coisas(self):
        self.importar()
        titular = self.cobrancas("Marcos Ferraz de Lima")[:2]
        conjuge = self.cobrancas("Evaneide Maria")[:2]
        self.assertEqual([c.valor for c in titular], [Decimal("100.00"), Decimal("200.00")])
        self.assertEqual([c.valor for c in conjuge], [Decimal("50.00"), Decimal("100.00")])

    def test_casal_em_turmas_diferentes_continua_fechando(self):
        # Marcos na manhã e Evaneide na noite: o pagamento do casal é um só.
        self.importar()
        self.assertNotEqual(
            self.aluno("Marcos Ferraz de Lima").cod_tur,
            self.aluno("Evaneide Maria").cod_tur,
        )
        titular = [c for c in self.cobrancas("Marcos Ferraz de Lima") if c.parcela == 1]
        conjuge = [c for c in self.cobrancas("Evaneide Maria") if c.parcela == 1]
        pagos = servico.pagos_por_cobranca(self.db, [c.id for c in titular + conjuge])
        aberto = sum(
            max(servico.dinheiro(c.valor) - pagos.get(c.id, servico.ZERO), servico.ZERO)
            for c in titular + conjuge
        )
        self.assertEqual(aberto, Decimal("150.00"))

    def test_transferido_nao_paga_matricula(self):
        self.importar()
        for nome in ("Celina Viana Osório", "Dayane Cristina da Silva"):
            tipos = {c.tipo for c in self.cobrancas(nome)}
            self.assertEqual(tipos, {"MENSALIDADE"}, nome)

    def test_parcelas_da_transferencia_podem_ser_menos(self):
        resultado = self.importar(parcelas_transferencia=6)
        self.assertTrue(resultado["confere"])
        self.assertEqual(
            len([c for c in self.cobrancas("Dayane Cristina da Silva") if c.tipo == "MENSALIDADE"]),
            6,
        )
        # Quem não é transferido segue com as 24 da turma.
        self.assertEqual(
            len([c for c in self.cobrancas("Daniel Marcolino da Silva") if c.tipo == "MENSALIDADE"]),
            24,
        )

    def test_conta_e_nome_do_extrato_ficam_no_pagamento(self):
        self.importar()
        pagamento = self.db.scalar(
            select(Pagamento).where(Pagamento.observacao.like("%Central Mailing List%"))
        )
        self.assertIsNotNone(pagamento)
        self.assertIn("Sicoob Uni Sudeste", pagamento.observacao)
        self.assertEqual(pagamento.forma, "TRANSFERENCIA")

    def test_rodar_de_novo_nao_duplica(self):
        self.importar()
        cobrancas_antes = len(self.cobrancas("Daniel Marcolino da Silva"))
        alunos_antes = len(list(self.db.scalars(select(Aluno))))

        entram, _ = selecionar(
            self.db,
            casar_nomes(self.db, self.pessoas),
            aceitar_aproximados=False,
            criar_novos=False,
            turma_novos=None,
        )
        segunda = importar(
            self.db,
            entram,
            self.totais,
            parcelas=24,
            matricula=Decimal("100"),
            mensalidade=Decimal("200"),
            desconto_conjuge=Decimal("50"),
            primeira_mensalidade=date(2026, 8, 10),
            relatar=lambda *_: None,
        )
        self.assertTrue(segunda["confere"])
        self.assertEqual(segunda["cobrancas_criadas"], 0)
        self.assertEqual(len(self.cobrancas("Daniel Marcolino da Silva")), cobrancas_antes)
        self.assertEqual(len(list(self.db.scalars(select(Aluno)))), alunos_antes)

    def test_valores_errados_nao_batem_com_a_planilha(self):
        resultado = self.importar(mensalidade=Decimal("300"))
        self.assertFalse(resultado["confere"])

    def test_condicao_registra_o_motivo_de_cada_desvio(self):
        self.importar()
        condicoes = {
            self.db.get(Aluno, c.cod_alu).nome: c
            for c in self.db.scalars(select(CondicaoFinanceiraAluno))
        }
        self.assertIn("Casal", condicoes["Evaneide Maria"].desconto_motivo)
        self.assertEqual(condicoes["Evaneide Maria"].desconto_percentual, Decimal("50.00"))
        self.assertIn("Transferido", condicoes["Dayane Cristina da Silva"].observacao)
        self.assertEqual(condicoes["Dayane Cristina da Silva"].tipo, "TRANSFERENCIA")

    def test_conjuge_do_bloco_regular_nao_vira_transferido(self):
        resultado = self.importar()
        condicoes = {
            self.db.get(Aluno, c.cod_alu).nome: c
            for c in self.db.scalars(select(CondicaoFinanceiraAluno))
        }
        self.assertEqual(condicoes["Evaneide Maria"].tipo, "REGULAR")
        self.assertEqual(condicoes["Selma Caristo"].tipo, "REGULAR")
        # O cônjuge transferido é as duas coisas ao mesmo tempo.
        self.assertEqual(condicoes["Ricardo Alexandre Osório"].tipo, "TRANSFERENCIA")
        self.assertEqual(condicoes["Ricardo Alexandre Osório"].desconto_percentual, Decimal("50.00"))
        # Três transferidos na planilha, e só eles.
        self.assertEqual(resultado["transferencias"], 3)
        for nome in ("Evaneide Maria", "Selma Caristo"):
            descricoes = " ".join(c.descricao for c in self.cobrancas(nome))
            self.assertNotIn("transferência", descricoes)
            self.assertIn("desconto 50%", descricoes)


class ImportacaoParcialTest(BaseCadastroTest):
    def test_conferencia_so_olha_quem_entrou(self):
        # Só três nomes no cadastro: o resto fica de fora e não pode derrubar
        # a conferência de quem entrou.
        for nome in ("Daniel Marcolino da Silva", "Marcos Alex Sandro", "Agatha Cristina"):
            self.cadastrar(nome, self.manha)
        entram, de_fora = selecionar(
            self.db,
            casar_nomes(self.db, self.pessoas),
            aceitar_aproximados=False,
            criar_novos=False,
            turma_novos=None,
        )
        self.assertEqual(len(entram), 3)
        self.assertEqual(len(de_fora), 7)

        resultado = importar(
            self.db,
            entram,
            self.totais,
            parcelas=24,
            matricula=Decimal("100"),
            mensalidade=Decimal("200"),
            desconto_conjuge=Decimal("50"),
            primeira_mensalidade=date(2026, 8, 10),
            relatar=lambda *_: None,
        )
        self.assertTrue(resultado["confere"])
        self.assertEqual(resultado["baixado"], Decimal("400.00"))  # 100 + 300 + 0

    def test_titular_sem_o_conjuge_no_lote_e_denunciado(self):
        # Só o titular do casal está no cadastro: a linha da planilha cobre os
        # dois, então o script avisa em vez de fingir que fechou.
        self.cadastrar("Marcos Ferraz de Lima", self.manha)
        entram, _ = selecionar(
            self.db,
            casar_nomes(self.db, self.pessoas),
            aceitar_aproximados=False,
            criar_novos=False,
            turma_novos=None,
        )
        resultado = importar(
            self.db,
            entram,
            self.totais,
            parcelas=24,
            matricula=Decimal("100"),
            mensalidade=Decimal("200"),
            desconto_conjuge=Decimal("50"),
            primeira_mensalidade=date(2026, 8, 10),
            relatar=lambda *_: None,
        )
        self.assertFalse(resultado["confere"])



class ResiduoDeImportacaoAnteriorTest(BaseCadastroTest):
    """O cenário que apareceu no servidor: já havia cobrança de antes.

    Uma rodada anterior gerou as cobranças com todo mundo numa turma só. Agora
    cada aluno está na turma dele, e a chave é (aluno, turma, tipo, parcela) —
    então o mesmo mês passa a existir duas vezes e a conferência estoura.
    """

    def preparar(self):
        self.cadastrar_todos()
        return selecionar(
            self.db,
            casar_nomes(self.db, self.pessoas),
            aceitar_aproximados=False,
            criar_novos=False,
            turma_novos=None,
        )[0]

    def importar(self, entram, **ajustes):
        parametros = {
            "parcelas": 24,
            "matricula": Decimal("100"),
            "mensalidade": Decimal("200"),
            "desconto_conjuge": Decimal("50"),
            "primeira_mensalidade": date(2026, 8, 10),
            "relatar": lambda *_: None,
        }
        parametros.update(ajustes)
        return importar(self.db, entram, self.totais, **parametros)

    def test_cobranca_de_outra_turma_derruba_a_conferencia(self):
        entram = self.preparar()
        # A rodada antiga jogou todo mundo na turma da manhã.
        antiga = [{**item, "cod_tur": self.manha.cod_tur} for item in entram]
        primeira = self.importar(antiga)
        self.assertTrue(primeira["confere"])

        # Agora, com cada um na turma real, o conjunto duplica.
        segunda = self.importar(entram)
        self.assertFalse(segunda["confere"])

    def test_diagnostico_aponta_o_aluno_em_duas_turmas(self):
        entram = self.preparar()
        self.importar([{**item, "cod_tur": self.manha.cod_tur} for item in entram])
        self.importar(entram)

        correspondencias = casar_nomes(self.db, self.pessoas)
        resumo = diagnosticar(self.db, correspondencias, relatar=lambda *_: None)
        self.assertGreater(resumo["em_mais_de_uma_turma"], 0)
        self.assertIn("PLANILHA", resumo["por_origem"])

    def test_limpeza_devolve_o_banco_ao_estado_de_antes(self):
        entram = self.preparar()
        self.importar([{**item, "cod_tur": self.manha.cod_tur} for item in entram])

        correspondencias = casar_nomes(self.db, self.pessoas)
        limpeza = limpar_importacao(self.db, correspondencias, relatar=lambda *_: None)
        self.assertGreater(limpeza["pagamentos"], 0)
        self.assertGreater(limpeza["cobrancas"], 0)
        self.assertEqual(limpeza["preservadas"], 0)
        self.assertEqual(list(self.db.scalars(select(Cobranca))), [])

        # Limpo, o import na turma certa fecha.
        entram = selecionar(
            self.db,
            casar_nomes(self.db, self.pessoas),
            aceitar_aproximados=False,
            criar_novos=False,
            turma_novos=None,
        )[0]
        self.assertTrue(self.importar(entram)["confere"])

    def test_limpeza_nao_apaga_baixa_lancada_na_tela(self):
        entram = self.preparar()
        self.importar(entram)
        # A secretaria quitou uma parcela pela tela, fora da planilha.
        alvo = self.db.scalar(
            select(Cobranca).where(Cobranca.status == "ABERTA").order_by(Cobranca.id)
        )
        servico.registrar_pagamento(self.db, alvo, registrado_por="SECRETARIA")
        self.db.flush()

        limpeza = limpar_importacao(
            self.db, casar_nomes(self.db, self.pessoas), relatar=lambda *_: None
        )
        self.assertEqual(limpeza["preservadas"], 1)
        sobrou = self.db.scalar(select(Cobranca).where(Cobranca.id == alvo.id))
        self.assertIsNotNone(sobrou)
        self.assertEqual(
            len(list(self.db.scalars(select(Pagamento).where(Pagamento.registrado_por == "SECRETARIA")))),
            1,
        )

    def test_geracao_nao_cobra_quem_esta_fora_da_planilha(self):
        entram = self.preparar()
        de_fora = self.cadastrar("Aluno Que Nao Esta Na Planilha", self.manha)
        self.importar(entram)
        self.assertEqual(
            list(self.db.scalars(select(Cobranca).where(Cobranca.cod_alu == de_fora.cod_alu))),
            [],
        )



class SobrescritaTest(BaseCadastroTest):
    """A planilha vira a verdade sobre o que o banco já tem.

    É o caso do servidor: cobrança gerada e baixa dada pela tela antes da
    importação, e a planilha não conhece nada disso.
    """

    def preparar(self):
        self.cadastrar_todos()
        return selecionar(
            self.db,
            casar_nomes(self.db, self.pessoas),
            aceitar_aproximados=False,
            criar_novos=False,
            turma_novos=None,
        )[0]

    def importar(self, entram, **ajustes):
        parametros = {
            "parcelas": 24,
            "matricula": Decimal("100"),
            "mensalidade": Decimal("200"),
            "desconto_conjuge": Decimal("50"),
            "primeira_mensalidade": date(2026, 8, 10),
            "relatar": lambda *_: None,
        }
        parametros.update(ajustes)
        return importar(self.db, entram, self.totais, **parametros)

    def sujar(self, entram):
        """Gera as cobranças pela turma e quita tudo pela tela, como no sistema."""
        from app.models import PlanoFinanceiro

        for cod_tur in {item["cod_tur"] for item in entram}:
            plano = PlanoFinanceiro(
                cod_tur=cod_tur,
                valor_matricula=Decimal("100"),
                valor_mensalidade=Decimal("200"),
                parcelas=1,
                dia_vencimento=10,
                primeira_mensalidade=date(2026, 8, 10),
                vencimento_matricula=date(2026, 8, 10),
            )
            self.db.add(plano)
            self.db.flush()
            servico.gerar_cobrancas_do_plano(self.db, plano, criado_por="SECRETARIA")
        for cobranca in self.db.scalars(select(Cobranca).where(Cobranca.status == "ABERTA")):
            servico.registrar_pagamento(self.db, cobranca, registrado_por="SECRETARIA")
        self.db.flush()

    def test_sem_sobrescrever_a_conferencia_reprova(self):
        entram = self.preparar()
        self.sujar(entram)
        self.assertFalse(self.importar(entram)["confere"])

    def test_sobrescrita_faz_a_planilha_valer(self):
        entram = self.preparar()
        self.sujar(entram)
        pagas_antes = len(list(self.db.scalars(select(Pagamento))))
        self.assertGreater(pagas_antes, 0)

        resumo = sobrescrever(self.db, entram, relatar=lambda *_: None)
        self.assertGreater(resumo["cobrancas"], 0)
        self.assertEqual(resumo["pagamentos"], pagas_antes)
        self.assertEqual(list(self.db.scalars(select(Pagamento))), [])

        resultado = self.importar(entram)
        self.assertTrue(resultado["confere"])
        self.assertEqual(resultado["baixado"], Decimal("850.00"))

    def test_sobrescrita_preserva_cobranca_avulsa(self):
        entram = self.preparar()
        self.sujar(entram)
        alvo = entram[0]["aluno"]
        servico.criar_cobranca(
            self.db,
            cod_alu=alvo.cod_alu,
            cod_tur=entram[0]["cod_tur"],
            plano_id=None,
            tipo="AVULSA",
            descricao="Segunda via de certificado",
            valor=Decimal("35.00"),
            vencimento=date(2026, 9, 1),
            criado_por="SECRETARIA",
        )
        self.db.flush()

        resumo = sobrescrever(self.db, entram, relatar=lambda *_: None)
        self.assertEqual(resumo["avulsas"], 1)
        avulsas = list(self.db.scalars(select(Cobranca).where(Cobranca.tipo == "AVULSA")))
        self.assertEqual(len(avulsas), 1)
        self.assertEqual(avulsas[0].valor, Decimal("35.00"))

    def test_recebimento_bancario_volta_para_a_fila(self):
        from app.models import TransacaoBancaria

        entram = self.preparar()
        self.sujar(entram)
        cobranca = self.db.scalar(select(Cobranca).order_by(Cobranca.id))
        transacao = TransacaoBancaria(
            identificador="E123456789012345678901234",
            meio="PIX",
            valor=Decimal("100.00"),
            data=date(2026, 8, 10),
            status="CONCILIADA",
            cobranca_id=cobranca.id,
        )
        self.db.add(transacao)
        self.db.flush()
        pagamento = self.db.scalar(
            select(Pagamento).where(Pagamento.cobranca_id == cobranca.id)
        )
        pagamento.transacao_id = transacao.id
        self.db.flush()

        sobrescrever(self.db, entram, relatar=lambda *_: None)
        self.db.refresh(transacao)
        self.assertEqual(transacao.status, "PENDENTE")
        self.assertIsNone(transacao.cobranca_id)

    def test_sobrescrita_nao_mexe_em_quem_esta_fora_da_planilha(self):
        entram = self.preparar()
        de_fora = self.cadastrar("Aluno Fora da Planilha", self.manha)
        self.sujar(entram)
        cobrancas_dele = list(
            self.db.scalars(select(Cobranca).where(Cobranca.cod_alu == de_fora.cod_alu))
        )
        self.assertGreater(len(cobrancas_dele), 0)

        sobrescrever(self.db, entram, relatar=lambda *_: None)
        ainda = list(
            self.db.scalars(select(Cobranca).where(Cobranca.cod_alu == de_fora.cod_alu))
        )
        self.assertEqual(len(ainda), len(cobrancas_dele))


class CamadasDeNomeTest(unittest.TestCase):
    def test_assinatura_ignora_particula_e_ordem(self):
        self.assertEqual(assinatura("Maria de Souza"), assinatura("Maria Souza"))
        self.assertEqual(assinatura("Souza Maria"), assinatura("Maria Souza"))
        self.assertNotEqual(assinatura("Maria Souza"), assinatura("Maria Sousa"))

    def test_nome_contido_nos_dois_sentidos(self):
        self.assertTrue(nome_contido("Evaneide Maria", "Evaneide Maria da Silva Santos"))
        self.assertTrue(nome_contido("Evaneide Maria da Silva Santos", "Evaneide Maria"))

    def test_nome_contido_recusa_primeiro_nome_diferente(self):
        self.assertFalse(nome_contido("Evaneide Maria", "Joana Evaneide Maria"))

    def test_nome_contido_recusa_um_token_so(self):
        self.assertFalse(nome_contido("Maria", "Maria da Silva Santos"))

    def test_nome_contido_recusa_sobrenome_estranho(self):
        self.assertFalse(nome_contido("Marcos Ferraz de Lima", "Marcos Antonio de Lima"))


class NormalizacaoTest(unittest.TestCase):
    def test_nome_sem_acento_maiusculo_e_sem_espaco_dobrado(self):
        self.assertEqual(normalizar("  Márcia  Regina "), "MARCIA REGINA")
        self.assertEqual(normalizar("Marcos Antonio de Lima  Filho"), "MARCOS ANTONIO DE LIMA FILHO")
        self.assertEqual(normalizar(None), "")

    def test_chave_curta_ignora_particulas_e_meio(self):
        self.assertEqual(chave_curta("Marcos Antonio de Lima Filho"), "MARCOS FILHO")
        self.assertEqual(chave_curta("Marcos Antônio Lima Filho"), "MARCOS FILHO")
        self.assertEqual(chave_curta("Ana"), "ANA")


if __name__ == "__main__":
    unittest.main()
