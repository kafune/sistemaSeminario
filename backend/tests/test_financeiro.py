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
    ConfiguracaoInput,
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
    receber_do_banco,
    resumo,
    salvar_configuracao,
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
        self.assertEqual(segunda["existentes"], 10)
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
