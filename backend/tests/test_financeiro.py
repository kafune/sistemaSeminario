import unittest
from datetime import date, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    AcessoFinanceiroAluno,
    Aluno,
    AluTurma,
    Cobranca,
    Pagamento,
    PlanoFinanceiro,
    TransacaoBancaria,
    Turma,
)
from app.routers.financeiro import (
    CobrancaInput,
    CondicaoInput,
    ConfiguracaoInput,
    DescontoInput,
    PagamentoInput,
    PagamentoLoteInput,
    PlanoInput,
    RecebimentoBanco,
    StatusInput,
    VinculoInput,
    alterar_status,
    criar_cobranca,
    estornar_pagamento,
    excluir_cobranca,
    extrato_do_aluno,
    extrato_publico,
    gerar_acesso_do_aluno,
    gerar_cobrancas,
    ignorar_recebimento,
    lancar_pagamento,
    lancar_pagamentos_em_lote,
    listar_cobrancas,
    listar_conciliacao,
    opcoes,
    opcoes_alunos,
    receber_do_banco,
    remover_condicao,
    resumo,
    salvar_condicao,
    salvar_configuracao,
    salvar_desconto,
    salvar_plano,
    situacao_da_turma,
    vincular_recebimento,
)
from app.services import financeiro as servico


class BaseFinanceiroTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()

        self.manha = Turma(nome="Turma da manhã", curso="Formação Teológica")
        self.noite = Turma(nome="Turma da noite", curso="Formação Teológica")
        self.db.add_all([self.manha, self.noite])
        self.db.flush()

        self.ana = Aluno(nome="Ana Souza", cpf="123.456.789-00", status="A")
        self.bruno = Aluno(nome="Bruno Lima", cpf="98765432100", status="A")
        self.carla = Aluno(nome="Carla Dias", status="A")
        self.db.add_all([self.ana, self.bruno, self.carla])
        self.db.flush()

        for aluno, turma in (
            (self.ana, self.manha),
            (self.bruno, self.manha),
            (self.carla, self.noite),
        ):
            aluno.cod_tur = turma.cod_tur
            self.db.add(
                AluTurma(cod_tur=turma.cod_tur, cod_alu=aluno.cod_alu, status="A")
            )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def plano_padrao(self, turma, **ajustes):
        dados = {
            "valor_matricula": Decimal("150.00"),
            "valor_mensalidade": Decimal("200.00"),
            "parcelas": 4,
            "dia_vencimento": 10,
            "primeira_mensalidade": date(2026, 3, 10),
            "vencimento_matricula": date(2026, 2, 5),
        }
        dados.update(ajustes)
        return salvar_plano(turma.cod_tur, PlanoInput(**dados), "SECRETARIA", self.db)

    def cobrancas_de(self, aluno):
        return list(
            self.db.scalars(
                select(Cobranca)
                .where(Cobranca.cod_alu == aluno.cod_alu)
                .order_by(Cobranca.vencimento, Cobranca.id)
            )
        )


class GeracaoDeCobrancasTest(BaseFinanceiroTest):
    def test_plano_gera_matricula_e_mensalidades_por_aluno(self):
        self.plano_padrao(self.manha)
        resultado = gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)

        self.assertEqual(resultado["alunos"], 2)
        self.assertEqual(resultado["criadas"], 10)  # 2 alunos × (1 matrícula + 4 parcelas)

        cobrancas = self.cobrancas_de(self.ana)
        self.assertEqual([c.tipo for c in cobrancas], ["MATRICULA"] + ["MENSALIDADE"] * 4)
        self.assertEqual(cobrancas[0].valor, Decimal("150.00"))
        self.assertEqual(cobrancas[0].vencimento, date(2026, 2, 5))
        self.assertEqual(
            [c.vencimento for c in cobrancas[1:]],
            [date(2026, 3, 10), date(2026, 4, 10), date(2026, 5, 10), date(2026, 6, 10)],
        )
        self.assertEqual([c.parcela for c in cobrancas[1:]], [1, 2, 3, 4])
        # A referência é o código que o aluno informa no PIX.
        self.assertTrue(all(c.referencia.startswith("TOV") for c in cobrancas))

    def test_gerar_de_novo_nao_duplica_e_alcanca_quem_entrou_depois(self):
        self.plano_padrao(self.manha)
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)

        novo = Aluno(nome="Davi Rocha", status="A", cod_tur=self.manha.cod_tur)
        self.db.add(novo)
        self.db.flush()
        self.db.add(AluTurma(cod_tur=self.manha.cod_tur, cod_alu=novo.cod_alu, status="A"))
        self.db.commit()

        segunda = gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        self.assertEqual(segunda["criadas"], 5)
        self.assertEqual(len(self.cobrancas_de(self.ana)), 5)
        self.assertEqual(len(self.cobrancas_de(novo)), 5)

    def test_turma_sem_plano_nao_gera(self):
        with self.assertRaises(HTTPException) as erro:
            gerar_cobrancas(self.noite.cod_tur, None, "SECRETARIA", self.db)
        self.assertEqual(erro.exception.status_code, 400)

    def test_dia_de_vencimento_respeita_mes_curto(self):
        self.plano_padrao(
            self.manha,
            valor_matricula=Decimal("0"),
            dia_vencimento=28,
            parcelas=2,
            primeira_mensalidade=date(2026, 1, 28),
        )
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        vencimentos = [c.vencimento for c in self.cobrancas_de(self.ana)]
        self.assertEqual(vencimentos, [date(2026, 1, 28), date(2026, 2, 28)])

    def test_primeira_parcela_vence_na_data_escolhida(self):
        # A data digitada manda na parcela 1; o dia do plano vale da 2 em diante.
        self.plano_padrao(
            self.manha,
            valor_matricula=Decimal("0"),
            dia_vencimento=10,
            parcelas=3,
            primeira_mensalidade=date(2026, 3, 15),
        )
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        self.assertEqual(
            [c.vencimento for c in self.cobrancas_de(self.ana)],
            [date(2026, 3, 15), date(2026, 4, 10), date(2026, 5, 10)],
        )

    def test_plano_das_duas_turmas_convive(self):
        self.plano_padrao(self.manha)
        self.plano_padrao(self.noite, valor_mensalidade=Decimal("250.00"), parcelas=2)
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        gerar_cobrancas(self.noite.cod_tur, None, "SECRETARIA", self.db)

        self.assertEqual(len(self.cobrancas_de(self.ana)), 5)
        carla = self.cobrancas_de(self.carla)
        self.assertEqual(len(carla), 3)
        self.assertEqual(
            {c.valor for c in carla if c.tipo == "MENSALIDADE"},
            {Decimal("250.00")},
        )


class PagamentoTest(BaseFinanceiroTest):
    def setUp(self):
        super().setUp()
        self.plano_padrao(self.manha)
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        self.matricula = self.cobrancas_de(self.ana)[0]

    def test_pagamento_parcial_e_quitacao(self):
        lancar_pagamento(
            self.matricula.id,
            PagamentoInput(valor=Decimal("50.00"), forma="PIX"),
            "FINANCEIRO",
            self.db,
        )
        self.db.refresh(self.matricula)
        self.assertEqual(self.matricula.status, "ABERTA")
        self.assertEqual(
            servico.situacao_de(self.matricula, servico.total_pago(self.db, self.matricula.id), date(2026, 2, 1)),
            "PARCIAL",
        )

        lancar_pagamento(self.matricula.id, PagamentoInput(), "FINANCEIRO", self.db)
        self.db.refresh(self.matricula)
        self.assertEqual(self.matricula.status, "PAGA")
        self.assertEqual(servico.total_pago(self.db, self.matricula.id), Decimal("150.00"))

    def test_pagamento_acima_do_saldo_e_recusado(self):
        with self.assertRaises(HTTPException) as erro:
            lancar_pagamento(
                self.matricula.id,
                PagamentoInput(valor=Decimal("999.00")),
                "FINANCEIRO",
                self.db,
            )
        self.assertEqual(erro.exception.status_code, 400)

    def test_data_futura_e_recusada(self):
        with self.assertRaises(HTTPException) as erro:
            lancar_pagamento(
                self.matricula.id,
                PagamentoInput(data_pagamento=date.today() + timedelta(days=1)),
                "FINANCEIRO",
                self.db,
            )
        self.assertEqual(erro.exception.status_code, 400)

    def test_cobranca_quitada_nao_aceita_novo_pagamento(self):
        lancar_pagamento(self.matricula.id, PagamentoInput(), "FINANCEIRO", self.db)
        with self.assertRaises(HTTPException) as erro:
            lancar_pagamento(self.matricula.id, PagamentoInput(), "FINANCEIRO", self.db)
        self.assertEqual(erro.exception.status_code, 400)

    def test_lote_quita_e_ignora_o_que_ja_estava_pago(self):
        cobrancas = self.cobrancas_de(self.ana)
        lancar_pagamento(cobrancas[0].id, PagamentoInput(), "FINANCEIRO", self.db)
        resultado = lancar_pagamentos_em_lote(
            PagamentoLoteInput(ids=[c.id for c in cobrancas], forma="DINHEIRO"),
            "FINANCEIRO",
            self.db,
        )
        self.assertEqual(resultado, {"quitadas": 4, "ignoradas": 1})
        for cobranca in self.cobrancas_de(self.ana):
            self.assertEqual(cobranca.status, "PAGA")

    def test_estorno_reabre_a_cobranca(self):
        lancar_pagamento(self.matricula.id, PagamentoInput(), "FINANCEIRO", self.db)
        pagamento = self.db.scalar(
            select(Pagamento).where(Pagamento.cobranca_id == self.matricula.id)
        )
        estornar_pagamento(pagamento.id, self.db)
        self.db.refresh(self.matricula)
        self.assertEqual(self.matricula.status, "ABERTA")
        self.assertEqual(servico.total_pago(self.db, self.matricula.id), Decimal("0.00"))

    def test_isentar_e_cancelar_saem_do_saldo(self):
        mensalidade = self.cobrancas_de(self.ana)[1]
        alterar_status(mensalidade.id, StatusInput(status="ISENTA"), self.db)
        self.db.refresh(mensalidade)
        self.assertEqual(mensalidade.status, "ISENTA")

        with self.assertRaises(HTTPException):
            lancar_pagamento(mensalidade.id, PagamentoInput(), "FINANCEIRO", self.db)

    def test_cobranca_com_pagamento_nao_pode_ser_excluida(self):
        lancar_pagamento(self.matricula.id, PagamentoInput(), "FINANCEIRO", self.db)
        with self.assertRaises(HTTPException) as erro:
            excluir_cobranca(self.matricula.id, self.db)
        self.assertEqual(erro.exception.status_code, 400)

    def test_cobranca_avulsa_para_aluno(self):
        criada = criar_cobranca(
            CobrancaInput(
                cod_alu=self.carla.cod_alu,
                cod_tur=self.noite.cod_tur,
                descricao="Segunda via de certificado",
                valor=Decimal("35.00"),
                vencimento=date(2026, 5, 20),
            ),
            "SECRETARIA",
            self.db,
        )
        self.assertEqual(criada["tipo"], "AVULSA")
        self.assertEqual(criada["saldo"], 35.0)

    def test_mensalidade_manual_e_recusada(self):
        with self.assertRaises(HTTPException) as erro:
            criar_cobranca(
                CobrancaInput(
                    cod_alu=self.carla.cod_alu,
                    tipo="MENSALIDADE",
                    descricao="Mensalidade avulsa",
                    valor=Decimal("200.00"),
                    vencimento=date(2026, 5, 20),
                ),
                "SECRETARIA",
                self.db,
            )
        self.assertEqual(erro.exception.status_code, 400)


class VisaoTest(BaseFinanceiroTest):
    def setUp(self):
        super().setUp()
        self.plano_padrao(
            self.manha,
            primeira_mensalidade=date.today() - timedelta(days=40),
            vencimento_matricula=date.today() - timedelta(days=60),
            dia_vencimento=min(date.today().day, 28),
            parcelas=2,
        )
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)

    def test_resumo_separa_vencido_do_que_esta_por_vir(self):
        painel = resumo(self.db)
        self.assertGreater(painel["vencido"], 0)
        self.assertGreater(painel["a_receber"], painel["vencido"])
        self.assertEqual(len(painel["turmas"]), 1)
        self.assertEqual(painel["turmas"][0]["cod_tur"], self.manha.cod_tur)
        self.assertEqual(painel["turmas"][0]["alunos"], 2)

    def test_pagamento_entra_no_recebido_do_mes(self):
        cobranca = self.cobrancas_de(self.ana)[0]
        lancar_pagamento(cobranca.id, PagamentoInput(), "FINANCEIRO", self.db)
        painel = resumo(self.db)
        self.assertEqual(painel["recebido_mes"], 150.0)

    def test_turma_mostra_regua_de_cada_aluno(self):
        cobrancas = self.cobrancas_de(self.ana)
        lancar_pagamentos_em_lote(
            PagamentoLoteInput(ids=[c.id for c in cobrancas]),
            "FINANCEIRO",
            self.db,
        )
        visao = situacao_da_turma(self.manha.cod_tur, self.db)
        por_nome = {aluno["nome"]: aluno for aluno in visao["alunos"]}
        self.assertEqual(por_nome["Ana Souza"]["situacao"], "QUITADO")
        self.assertTrue(por_nome["Ana Souza"]["matricula_paga"])
        self.assertEqual(por_nome["Bruno Lima"]["situacao"], "VENCIDA")
        self.assertFalse(por_nome["Bruno Lima"]["matricula_paga"])
        self.assertEqual(visao["matriculados"], 2)

    def test_lista_filtra_por_situacao_e_por_aluno(self):
        cobranca = self.cobrancas_de(self.ana)[0]
        lancar_pagamento(cobranca.id, PagamentoInput(), "FINANCEIRO", self.db)

        pagas = listar_cobrancas(situacao="PAGA", db=self.db)
        self.assertEqual(pagas["total"], 1)
        self.assertEqual(pagas["cobrancas"][0]["aluno_nome"], "Ana Souza")

        da_ana = listar_cobrancas(cod_alu=self.ana.cod_alu, db=self.db)
        self.assertEqual(da_ana["total"], 3)

        por_nome = listar_cobrancas(busca="bruno", db=self.db)
        self.assertEqual({c["aluno_nome"] for c in por_nome["cobrancas"]}, {"Bruno Lima"})

    def test_extrato_do_aluno_resume_a_situacao(self):
        cobrancas = self.cobrancas_de(self.ana)
        lancar_pagamento(cobrancas[0].id, PagamentoInput(), "FINANCEIRO", self.db)
        extrato = extrato_do_aluno(self.ana.cod_alu, self.db)

        self.assertEqual(extrato["aluno"]["nome"], "Ana Souza")
        self.assertEqual(extrato["resumo"]["pago"], 150.0)
        self.assertEqual(extrato["resumo"]["total"], 550.0)
        self.assertEqual(extrato["resumo"]["em_aberto"], 400.0)
        self.assertFalse(extrato["resumo"]["em_dia"])
        self.assertEqual(len(extrato["cobrancas"]), 3)
        self.assertIsNone(extrato["acesso"]["token"])

    def test_link_pessoal_do_aluno_abre_o_proprio_extrato(self):
        token = gerar_acesso_do_aluno(self.ana.cod_alu, self.db)["token"]
        extrato = extrato_publico(token, self.db)
        self.assertEqual(extrato["aluno"]["cod_alu"], self.ana.cod_alu)
        self.assertNotIn("observacao", extrato["cobrancas"][0])

        acesso = self.db.scalar(
            select(AcessoFinanceiroAluno).where(
                AcessoFinanceiroAluno.cod_alu == self.ana.cod_alu
            )
        )
        self.assertIsNotNone(acesso.ultimo_acesso_em)

        with self.assertRaises(HTTPException) as erro:
            extrato_publico("token-que-nao-existe", self.db)
        self.assertEqual(erro.exception.status_code, 404)


class ConciliacaoBancariaTest(BaseFinanceiroTest):
    def setUp(self):
        super().setUp()
        self.plano_padrao(self.manha)
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        self.matricula_ana = self.cobrancas_de(self.ana)[0]

    def recebimento(self, **ajustes):
        dados = {
            "identificador": "E123456789202603101200",
            "meio": "PIX",
            "valor": Decimal("150.00"),
            "data": date(2026, 2, 5),
        }
        dados.update(ajustes)
        return receber_do_banco(RecebimentoBanco(**dados), self.db)

    def test_referencia_no_pix_quita_o_titulo_sozinho(self):
        resposta = self.recebimento(descricao=f"PIX {self.matricula_ana.referencia}")
        self.assertEqual(resposta["status"], "CONCILIADA")
        self.assertEqual(resposta["cobranca_id"], self.matricula_ana.id)
        self.db.refresh(self.matricula_ana)
        self.assertEqual(self.matricula_ana.status, "PAGA")

    def test_cpf_do_pagador_com_valor_exato_quita(self):
        resposta = self.recebimento(pagador_documento="12345678900")
        self.assertEqual(resposta["status"], "CONCILIADA")
        self.db.refresh(self.matricula_ana)
        self.assertEqual(self.matricula_ana.status, "PAGA")

    def test_nome_do_pagador_identifica_quando_nao_ha_homonimo(self):
        resposta = self.recebimento(pagador_nome="ana souza")
        self.assertEqual(resposta["status"], "CONCILIADA")

    def test_pagador_desconhecido_fica_pendente_com_motivo(self):
        resposta = self.recebimento(pagador_nome="Fulano de Tal", valor=Decimal("77.00"))
        self.assertEqual(resposta["status"], "PENDENTE")
        transacao = self.db.get(TransacaoBancaria, resposta["id"])
        self.assertIn("não identificado", transacao.motivo)

        fila = listar_conciliacao("PENDENTE", self.db)
        self.assertEqual(fila["pendentes"], 1)
        self.assertEqual(len(fila["transacoes"]), 1)

    def test_valor_ambiguo_nao_escolhe_sozinho(self):
        # Duas mensalidades de R$ 200,00 em aberto e vencimentos distantes:
        # o sistema prefere a fila manual a fechar o título errado.
        resposta = self.recebimento(
            pagador_documento="12345678900",
            valor=Decimal("200.00"),
            data=date(2026, 8, 1),
        )
        self.assertEqual(resposta["status"], "PENDENTE")
        transacao = self.db.get(TransacaoBancaria, resposta["id"])
        self.assertIn("mais de uma cobrança", transacao.motivo)

    def test_reenvio_do_mesmo_aviso_nao_duplica_pagamento(self):
        primeira = self.recebimento(descricao=f"PIX {self.matricula_ana.referencia}")
        segunda = self.recebimento(descricao=f"PIX {self.matricula_ana.referencia}")
        self.assertEqual(primeira["id"], segunda["id"])
        self.assertEqual(servico.total_pago(self.db, self.matricula_ana.id), Decimal("150.00"))
        self.assertEqual(
            self.db.scalar(select(TransacaoBancaria.id).where(TransacaoBancaria.id > 0)),
            primeira["id"],
        )

    def test_conciliacao_manual_vincula_a_cobranca_escolhida(self):
        pendente = self.recebimento(pagador_nome="Fulano de Tal")
        vincular_recebimento(
            pendente["id"],
            VinculoInput(cobranca_id=self.matricula_ana.id),
            "FINANCEIRO",
            self.db,
        )
        self.db.refresh(self.matricula_ana)
        self.assertEqual(self.matricula_ana.status, "PAGA")
        transacao = self.db.get(TransacaoBancaria, pendente["id"])
        self.assertEqual(transacao.status, "CONCILIADA")

    def test_estorno_devolve_o_recebimento_para_a_fila(self):
        conciliada = self.recebimento(descricao=f"PIX {self.matricula_ana.referencia}")
        pagamento = self.db.scalar(
            select(Pagamento).where(Pagamento.transacao_id == conciliada["id"])
        )
        estornar_pagamento(pagamento.id, self.db)
        transacao = self.db.get(TransacaoBancaria, conciliada["id"])
        self.assertEqual(transacao.status, "PENDENTE")
        self.assertIsNone(transacao.cobranca_id)
        self.db.refresh(self.matricula_ana)
        self.assertEqual(self.matricula_ana.status, "ABERTA")

    def test_recebimento_ignorado_sai_da_fila(self):
        pendente = self.recebimento(pagador_nome="Fulano de Tal")
        ignorar_recebimento(pendente["id"], "FINANCEIRO", self.db)
        self.assertEqual(listar_conciliacao("PENDENTE", self.db)["pendentes"], 0)

    def test_conciliacao_automatica_desligada_mantem_tudo_na_fila(self):
        salvar_configuracao(
            ConfiguracaoInput(
                chave_pix="financeiro@centrotov.com.br",
                conciliacao_automatica=False,
            ),
            "ADMIN",
            self.db,
        )
        resposta = self.recebimento(descricao=f"PIX {self.matricula_ana.referencia}")
        self.assertEqual(resposta["status"], "PENDENTE")
        self.db.refresh(self.matricula_ana)
        self.assertEqual(self.matricula_ana.status, "ABERTA")

    def test_sugestoes_apontam_o_titulo_do_pagador(self):
        pendente = self.recebimento(
            pagador_documento="98765432100",
            valor=Decimal("999.00"),
        )
        fila = listar_conciliacao("PENDENTE", self.db)
        sugestoes = fila["transacoes"][0]["sugestoes"]
        self.assertTrue(sugestoes)
        self.assertEqual({s["aluno_nome"] for s in sugestoes}, {"Bruno Lima"})
        self.assertEqual(pendente["status"], "PENDENTE")


class ExtracaoDeReferenciaTest(unittest.TestCase):
    def test_le_o_codigo_em_descricoes_livres(self):
        self.assertEqual(servico.extrair_referencia("Pagamento TOV000123"), "TOV000123")
        self.assertEqual(servico.extrair_referencia("tov-000123 mensalidade"), "TOV000123")
        self.assertEqual(servico.extrair_referencia("TOV 000123"), "TOV000123")
        self.assertIsNone(servico.extrair_referencia("PIX recebido"))
        self.assertIsNone(servico.extrair_referencia(None))


class AlunoDeTransferenciaTest(BaseFinanceiroTest):
    def setUp(self):
        super().setUp()
        self.plano_padrao(self.manha, parcelas=6, primeira_mensalidade=date(2026, 3, 10))

    def condicao(self, aluno, **ajustes):
        dados = {"tipo": "TRANSFERENCIA", "parcelas": 2}
        dados.update(ajustes)
        return salvar_condicao(
            self.manha.cod_tur,
            aluno.cod_alu,
            CondicaoInput(**dados),
            "SECRETARIA",
            self.db,
        )

    def test_transferencia_paga_menos_meses_que_a_turma(self):
        self.condicao(self.ana, primeira_mensalidade=date(2026, 5, 10))
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)

        mensalidades = [c for c in self.cobrancas_de(self.ana) if c.tipo == "MENSALIDADE"]
        self.assertEqual(len(mensalidades), 2)
        self.assertEqual(
            [c.vencimento for c in mensalidades],
            [date(2026, 5, 10), date(2026, 6, 10)],
        )
        self.assertTrue(all(c.total_parcelas == 2 for c in mensalidades))
        self.assertIn("transferência", mensalidades[0].descricao)
        # O colega regular continua com o plano cheio da turma.
        self.assertEqual(
            len([c for c in self.cobrancas_de(self.bruno) if c.tipo == "MENSALIDADE"]),
            6,
        )

    def test_condicao_encolhe_cobranca_ja_gerada(self):
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        self.assertEqual(len(self.cobrancas_de(self.ana)), 7)  # matrícula + 6

        resposta = self.condicao(self.ana, parcelas=2)
        self.assertEqual(resposta["ajuste"]["removidas"], 4)
        self.assertEqual(len(self.cobrancas_de(self.ana)), 3)

    def test_parcela_paga_nunca_e_removida_pelo_ajuste(self):
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        ultima = [c for c in self.cobrancas_de(self.ana) if c.parcela == 6][0]
        lancar_pagamento(ultima.id, PagamentoInput(), "FINANCEIRO", self.db)

        resposta = self.condicao(self.ana, parcelas=2)
        self.assertEqual(resposta["ajuste"]["preservadas"], 1)
        self.assertEqual(resposta["ajuste"]["removidas"], 3)
        self.db.refresh(ultima)
        self.assertEqual(ultima.status, "PAGA")

    def test_transferencia_sem_matricula_inicial(self):
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        self.condicao(self.ana, parcelas=3, cobra_matricula=False)
        self.assertEqual(
            [c.tipo for c in self.cobrancas_de(self.ana)],
            ["MENSALIDADE"] * 3,
        )

    def test_transferencia_com_mensalidade_propria(self):
        self.condicao(self.ana, parcelas=2, valor_mensalidade=Decimal("180.00"))
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        mensalidades = [c for c in self.cobrancas_de(self.ana) if c.tipo == "MENSALIDADE"]
        self.assertEqual({c.valor for c in mensalidades}, {Decimal("180.00")})

    def test_voltar_a_regular_devolve_o_plano_cheio(self):
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        self.condicao(self.ana, parcelas=2)
        self.assertEqual(len(self.cobrancas_de(self.ana)), 3)

        resposta = remover_condicao(self.manha.cod_tur, self.ana.cod_alu, True, "SECRETARIA", self.db)
        self.assertEqual(resposta["ajuste"]["criadas"], 4)
        self.assertEqual(len(self.cobrancas_de(self.ana)), 7)

    def test_condicao_exige_algum_recorte(self):
        with self.assertRaises(HTTPException) as erro:
            salvar_condicao(
                self.manha.cod_tur,
                self.ana.cod_alu,
                CondicaoInput(tipo="TRANSFERENCIA"),
                "SECRETARIA",
                self.db,
            )
        self.assertEqual(erro.exception.status_code, 400)

    def test_condicao_so_vale_para_aluno_matriculado(self):
        with self.assertRaises(HTTPException) as erro:
            salvar_condicao(
                self.manha.cod_tur,
                self.carla.cod_alu,
                CondicaoInput(parcelas=2),
                "SECRETARIA",
                self.db,
            )
        self.assertEqual(erro.exception.status_code, 400)

    def test_turma_mostra_quem_e_transferencia(self):
        self.condicao(self.ana, parcelas=2)
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        visao = situacao_da_turma(self.manha.cod_tur, self.db)

        por_nome = {aluno["nome"]: aluno for aluno in visao["alunos"]}
        self.assertTrue(por_nome["Ana Souza"]["transferencia"])
        self.assertEqual(por_nome["Ana Souza"]["mensalidades_previstas"], 2)
        self.assertEqual(por_nome["Ana Souza"]["condicao"]["parcelas"], 2)
        self.assertFalse(por_nome["Bruno Lima"]["transferencia"])
        self.assertEqual(por_nome["Bruno Lima"]["mensalidades_previstas"], 6)
        self.assertEqual(visao["transferencias"], 1)


class FiltrosDaListaTest(BaseFinanceiroTest):
    def setUp(self):
        super().setUp()
        self.plano_padrao(
            self.manha,
            valor_matricula=Decimal("0"),
            parcelas=4,
            primeira_mensalidade=date(2026, 3, 10),
        )
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)

    def test_filtro_por_mes(self):
        marco = listar_cobrancas(mes="2026-03", db=self.db)
        self.assertEqual(marco["total"], 2)  # dois alunos, uma parcela cada
        self.assertTrue(all(c["vencimento"].startswith("2026-03") for c in marco["cobrancas"]))

        maio = listar_cobrancas(mes="2026-05", db=self.db)
        self.assertEqual(maio["total"], 2)
        self.assertEqual(listar_cobrancas(mes="2026-12", db=self.db)["total"], 0)

    def test_mes_invalido_e_recusado(self):
        with self.assertRaises(HTTPException) as erro:
            listar_cobrancas(mes="marco", db=self.db)
        self.assertEqual(erro.exception.status_code, 400)

    def test_paginacao_devolve_o_total_do_recorte(self):
        pagina = listar_cobrancas(por_pagina=10, db=self.db)
        self.assertEqual(pagina["total"], 8)
        self.assertEqual(len(pagina["cobrancas"]), 8)
        self.assertEqual(pagina["paginas"], 1)

        primeira = listar_cobrancas(por_pagina=10, pagina=1, db=self.db)
        segunda = listar_cobrancas(por_pagina=10, pagina=2, db=self.db)
        self.assertEqual(segunda["total"], 8)
        self.assertEqual(segunda["cobrancas"], [])
        self.assertEqual(primeira["saldo"], 1600.0)

    def test_saldo_do_recorte_acompanha_o_filtro(self):
        marco = listar_cobrancas(mes="2026-03", db=self.db)
        self.assertEqual(marco["saldo"], 400.0)

    def test_busca_por_nome_roda_no_banco(self):
        resultado = listar_cobrancas(busca="ana", db=self.db)
        self.assertEqual({c["aluno_nome"] for c in resultado["cobrancas"]}, {"Ana Souza"})
        self.assertEqual(resultado["total"], 4)

    def test_busca_pelo_codigo_da_cobranca(self):
        alvo = self.cobrancas_de(self.bruno)[0]
        resultado = listar_cobrancas(busca=alvo.referencia, db=self.db)
        self.assertEqual(resultado["total"], 1)
        self.assertEqual(resultado["cobrancas"][0]["id"], alvo.id)

    def test_opcoes_trazem_os_meses_com_cobranca(self):
        meses = [item["mes"] for item in opcoes(self.db)["meses"]]
        self.assertEqual(meses, ["2026-03", "2026-04", "2026-05", "2026-06"])

    def test_opcoes_de_alunos_filtram_no_banco(self):
        self.assertEqual(len(opcoes_alunos(db=self.db)), 3)
        self.assertEqual(
            [aluno["nome"] for aluno in opcoes_alunos(busca="lima", db=self.db)],
            ["Bruno Lima"],
        )
        self.assertEqual(
            {aluno["nome"] for aluno in opcoes_alunos(cod_tur=self.noite.cod_tur, db=self.db)},
            {"Carla Dias"},
        )



class DescontoDoAlunoTest(BaseFinanceiroTest):
    def setUp(self):
        super().setUp()
        self.plano_padrao(self.manha, parcelas=4)

    def desconto(self, aluno, percentual, motivo="Desconto de casal", aplicar=True, na_matricula=True):
        return salvar_desconto(
            aluno.cod_alu,
            DescontoInput(
                percentual=Decimal(str(percentual)),
                motivo=motivo,
                aplicar=aplicar,
                na_matricula=na_matricula,
            ),
            "SECRETARIA",
            self.db,
        )

    def test_desconto_abate_matricula_e_mensalidade(self):
        self.desconto(self.ana, 10)
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)

        cobrancas = self.cobrancas_de(self.ana)
        matricula = [c for c in cobrancas if c.tipo == "MATRICULA"][0]
        mensalidades = [c for c in cobrancas if c.tipo == "MENSALIDADE"]
        self.assertEqual(matricula.valor, Decimal("135.00"))
        self.assertEqual({c.valor for c in mensalidades}, {Decimal("180.00")})
        self.assertIn("desconto 10%", matricula.descricao)
        self.assertIn("desconto 10%", mensalidades[0].descricao)
        # O colega sem desconto continua nos valores cheios.
        self.assertEqual(
            {c.valor for c in self.cobrancas_de(self.bruno) if c.tipo == "MENSALIDADE"},
            {Decimal("200.00")},
        )

    def test_desconto_pode_ficar_so_na_mensalidade(self):
        self.desconto(self.ana, 10, na_matricula=False)
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)

        cobrancas = self.cobrancas_de(self.ana)
        matricula = [c for c in cobrancas if c.tipo == "MATRICULA"][0]
        self.assertEqual(matricula.valor, Decimal("150.00"))
        self.assertNotIn("desconto", matricula.descricao)
        self.assertEqual(
            {c.valor for c in cobrancas if c.tipo == "MENSALIDADE"},
            {Decimal("180.00")},
        )

    def test_regra_de_casal_do_centro_tov(self):
        """A planilha de matrículas: matrícula 100, mensalidade 200, cônjuge com 50%.

        O casal fecha em 150 de matrículas e 300 de mensalidade, que é o que a
        secretaria cobra hoje na mão.
        """
        salvar_plano(
            self.noite.cod_tur,
            PlanoInput(
                valor_matricula=Decimal("100.00"),
                valor_mensalidade=Decimal("200.00"),
                parcelas=1,
                dia_vencimento=10,
                primeira_mensalidade=date(2026, 8, 10),
                vencimento_matricula=date(2026, 8, 10),
            ),
            "SECRETARIA",
            self.db,
        )
        titular = self.carla
        conjuge = Aluno(nome="Cônjuge da Carla", status="A", cod_tur=self.noite.cod_tur)
        self.db.add(conjuge)
        self.db.flush()
        self.db.add(AluTurma(cod_tur=self.noite.cod_tur, cod_alu=conjuge.cod_alu, status="A"))
        self.db.commit()

        self.desconto(conjuge, 50, motivo="Casal — cônjuge com 50%")
        gerar_cobrancas(self.noite.cod_tur, None, "SECRETARIA", self.db)

        def total(aluno):
            return sum(c.valor for c in self.cobrancas_de(aluno))

        self.assertEqual(total(titular), Decimal("300.00"))   # 100 + 200
        self.assertEqual(total(conjuge), Decimal("150.00"))   # 50 + 100
        self.assertEqual(total(titular) + total(conjuge), Decimal("450.00"))

    def test_desconto_ajusta_mensalidade_ja_gerada(self):
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        resposta = self.desconto(self.ana, 50)

        # Quatro mensalidades e a matrícula.
        self.assertEqual(resposta["ajuste"]["atualizadas"], 5)
        self.assertEqual(
            {c.valor for c in self.cobrancas_de(self.ana) if c.tipo == "MENSALIDADE"},
            {Decimal("100.00")},
        )

    def test_mensalidade_paga_nao_muda_de_valor(self):
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        primeira = [c for c in self.cobrancas_de(self.ana) if c.parcela == 1 and c.tipo == "MENSALIDADE"][0]
        lancar_pagamento(primeira.id, PagamentoInput(), "FINANCEIRO", self.db)

        resposta = self.desconto(self.ana, 25)
        # A matrícula não entra: ela não tem desconto e continua igual.
        self.assertEqual(resposta["ajuste"]["preservadas"], 1)
        self.db.refresh(primeira)
        self.assertEqual(primeira.valor, Decimal("200.00"))
        self.assertEqual(
            {c.valor for c in self.cobrancas_de(self.ana) if c.tipo == "MENSALIDADE" and c.parcela > 1},
            {Decimal("150.00")},
        )

    def test_percentual_quebrado_arredonda_ao_centavo(self):
        self.desconto(self.ana, Decimal("12.5"))
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        mensalidades = [c for c in self.cobrancas_de(self.ana) if c.tipo == "MENSALIDADE"]
        self.assertEqual({c.valor for c in mensalidades}, {Decimal("175.00")})
        self.assertIn("desconto 12,5%", mensalidades[0].descricao)

    def test_desconto_exige_motivo(self):
        with self.assertRaises(HTTPException) as erro:
            salvar_desconto(
                self.ana.cod_alu,
                DescontoInput(percentual=Decimal("10"), motivo="  "),
                "SECRETARIA",
                self.db,
            )
        self.assertEqual(erro.exception.status_code, 400)

    def test_zerar_o_desconto_devolve_a_mensalidade_cheia(self):
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        self.desconto(self.ana, 30)
        self.desconto(self.ana, 0, motivo=None)
        self.assertEqual(
            {c.valor for c in self.cobrancas_de(self.ana) if c.tipo == "MENSALIDADE"},
            {Decimal("200.00")},
        )

    def test_desconto_convive_com_transferencia(self):
        salvar_condicao(
            self.manha.cod_tur,
            self.ana.cod_alu,
            CondicaoInput(tipo="TRANSFERENCIA", parcelas=2, cobra_matricula=False),
            "SECRETARIA",
            self.db,
        )
        self.desconto(self.ana, 20)
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)

        cobrancas = self.cobrancas_de(self.ana)
        self.assertEqual([c.tipo for c in cobrancas], ["MENSALIDADE"] * 2)
        self.assertEqual({c.valor for c in cobrancas}, {Decimal("160.00")})
        self.assertIn("transferência", cobrancas[0].descricao)
        self.assertIn("desconto 20%", cobrancas[0].descricao)

    def test_voltar_ao_plano_da_turma_nao_apaga_o_desconto(self):
        salvar_condicao(
            self.manha.cod_tur,
            self.ana.cod_alu,
            CondicaoInput(tipo="TRANSFERENCIA", parcelas=2),
            "SECRETARIA",
            self.db,
        )
        self.desconto(self.ana, 10)
        remover_condicao(self.manha.cod_tur, self.ana.cod_alu, True, "SECRETARIA", self.db)

        mensalidades = [c for c in self.cobrancas_de(self.ana) if c.tipo == "MENSALIDADE"]
        self.assertEqual(len(mensalidades), 4)  # voltou ao plano cheio da turma
        self.assertEqual({c.valor for c in mensalidades}, {Decimal("180.00")})  # com o desconto

    def test_extrato_mostra_o_desconto_vigente(self):
        self.desconto(self.ana, 10, motivo="Casal — cônjuge paga integral")
        gerar_cobrancas(self.manha.cod_tur, None, "SECRETARIA", self.db)
        extrato = extrato_do_aluno(self.ana.cod_alu, self.db)

        self.assertEqual(extrato["condicao"]["desconto_percentual"], 10.0)
        self.assertEqual(extrato["condicao"]["desconto_motivo"], "Casal — cônjuge paga integral")
        self.assertEqual(extrato["condicao"]["mensalidade_cheia"], 200.0)
        self.assertEqual(extrato["condicao"]["mensalidade_com_desconto"], 180.0)
        self.assertEqual(extrato["condicao"]["matricula_cheia"], 150.0)
        self.assertEqual(extrato["condicao"]["matricula_com_desconto"], 135.0)
        self.assertTrue(extrato["condicao"]["desconto_na_matricula"])
        self.assertEqual(extrato["condicao"]["mensalidades_previstas"], 4)

    def test_aluno_sem_turma_nao_recebe_desconto(self):
        solto = Aluno(nome="Sem Turma", status="A")
        self.db.add(solto)
        self.db.commit()
        with self.assertRaises(HTTPException) as erro:
            self.desconto(solto, 10)
        self.assertEqual(erro.exception.status_code, 400)

    def test_turma_mostra_quem_tem_desconto(self):
        self.desconto(self.ana, 10)
        visao = situacao_da_turma(self.manha.cod_tur, self.db)
        por_nome = {aluno["nome"]: aluno for aluno in visao["alunos"]}
        self.assertEqual(por_nome["Ana Souza"]["condicao"]["desconto_percentual"], 10.0)
        self.assertIsNone(por_nome["Bruno Lima"]["condicao"])


class ArredondamentoDoDescontoTest(unittest.TestCase):
    def test_desconto_e_percentual_formatado(self):
        self.assertEqual(servico.aplicar_desconto(Decimal("200.00"), Decimal("10")), Decimal("180.00"))
        self.assertEqual(servico.aplicar_desconto(Decimal("333.33"), Decimal("33")), Decimal("223.33"))
        self.assertEqual(servico.aplicar_desconto(Decimal("200.00"), Decimal("0")), Decimal("200.00"))
        self.assertEqual(servico.aplicar_desconto(Decimal("200.00"), Decimal("100")), Decimal("0.00"))
        self.assertEqual(servico.formatar_percentual(Decimal("10.00")), "10%")
        self.assertEqual(servico.formatar_percentual(Decimal("12.50")), "12,5%")



class AcessoDaAreaFinanceiraTest(unittest.TestCase):
    """Garante que o perfil do dinheiro só alcança o dinheiro.

    O teste lê as dependências que o ``main`` realmente aplica em cada router,
    e não uma cópia da lista de perfis — trocar a regra lá quebra aqui.
    """

    def _guarda_de_perfil(self, dependencias):
        # A primeira dependência é a sessão; a segunda é o filtro de perfil.
        return dependencias[1].dependency

    def test_financeiro_entra_na_tesouraria(self):
        from app import main

        guarda = self._guarda_de_perfil(main.tesouraria)
        self.assertEqual(guarda(perfil="FINANCEIRO"), "FINANCEIRO")
        self.assertEqual(guarda(perfil="SECRETARIA"), "SECRETARIA")

    def test_financeiro_nao_alcanca_o_academico_nem_o_marketing(self):
        from app import main

        for dependencias in (main.academico, main.notas_acesso, main.operacional, main.administracao):
            with self.assertRaises(HTTPException) as erro:
                self._guarda_de_perfil(dependencias)(perfil="FINANCEIRO")
            self.assertEqual(erro.exception.status_code, 403)


class SegredoDoWebhookTest(unittest.TestCase):
    def test_sem_segredo_configurado_a_integracao_fica_desligada(self):
        from app.config import settings
        from app.routers.financeiro import _validar_segredo_banco

        original = settings.banco_webhook_secret
        try:
            settings.banco_webhook_secret = ""
            with self.assertRaises(HTTPException) as erro:
                _validar_segredo_banco("qualquer-coisa")
            self.assertEqual(erro.exception.status_code, 503)

            settings.banco_webhook_secret = "segredo-do-banco"
            with self.assertRaises(HTTPException) as erro:
                _validar_segredo_banco("errado")
            self.assertEqual(erro.exception.status_code, 401)
            with self.assertRaises(HTTPException):
                _validar_segredo_banco(None)
            self.assertIsNone(_validar_segredo_banco("segredo-do-banco"))
        finally:
            settings.banco_webhook_secret = original


if __name__ == "__main__":
    unittest.main()
