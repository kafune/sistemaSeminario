import unittest
from datetime import date, datetime
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException
from starlette.datastructures import UploadFile
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    Lead,
    LeadConsentimentoEvento,
    LeadInteracao,
    WhatsappDestinatario,
    WhatsappDisparo,
)
from app.routers.leads import (
    _consentimento,
    _payloads,
    confirmar_importacao,
    previsualizar_importacao,
)
from app.routers.whatsapp import (
    _cancelar_campanhas_por_optout,
    _processar_interacoes_webhook,
)


class ImportacaoLeadsTest(unittest.TestCase):
    def test_consentimento_ausente_fica_pendente(self):
        self.assertEqual(
            _consentimento(""),
            ("PENDENTE", "Consentimento não informado; marcado como pendente"),
        )

    def test_mapeia_cabecalhos_de_marketing(self):
        itens = _payloads([
            ["Nome", "Celular", "Campanha", "Data de captação", "Opt-in"],
            ["Maria", "(11) 99999-8888", "Curso 2026", "28/07/2026", "Sim"],
        ])
        _, dados, aviso = itens[0]
        self.assertEqual(dados["nome"], "Maria")
        self.assertEqual(dados["campanha"], "Curso 2026")
        self.assertEqual(dados["captado_em"], "2026-07-28")
        self.assertEqual(dados["consentimento_status"], "CONFIRMADO")
        self.assertIsNone(aviso)


class OptOutWebhookTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)

    def tearDown(self):
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_optout_atualiza_lead_auditoria_e_metricas_com_idempotencia(self):
        db = self.Session()
        agora = datetime(2026, 7, 28, 12, 0)
        lead = Lead(
            nome="Maria",
            telefone="(11) 99999-8888",
            telefone_normalizado="5511999998888",
            captado_em=date(2026, 7, 1),
            status="ATIVO",
            status_funil="NUTRICAO",
            consentimento_status="CONFIRMADO",
            consentimento_origem="FORMULARIO",
            consentimento_em=agora,
            criado_por="MARKETING",
            criado_em=agora,
            atualizado_em=agora,
        )
        db.add(lead)
        db.flush()
        disparo = WhatsappDisparo(
            usuario="MARKETING",
            tipo_publico="leads",
            publico_descricao="Todos os leads",
            mensagem_modelo="Olá",
            tipo_mensagem="text",
            link_preview="N",
            status="CONCLUIDO",
            total_selecionados=1,
            total_validos=1,
            total_mensagens=1,
            total_invalidos=0,
            total_agendados=0,
            total_enviados=1,
            total_falhos=0,
            total_entregues=1,
            total_lidos=1,
            total_reproduzidos=0,
            total_respostas=0,
            total_optouts=0,
            categoria_api="MARKETING",
            finalidade="NUTRICAO",
            criado_em=agora,
            atualizado_em=agora,
        )
        db.add(disparo)
        db.flush()
        db.add(
            WhatsappDestinatario(
                disparo_id=disparo.id,
                lead_id=lead.id,
                nome=lead.nome,
                celular_original=lead.telefone,
                numero_normalizado=lead.telefone_normalizado,
                valido="S",
                status="ENVIADO",
            )
        )
        db.commit()

        payload = {
            "event": "messages",
            "instance": "instancia-1",
            "data": {
                "messageid": "msg-1",
                "chatid": "5511999998888@s.whatsapp.net",
                "fromMe": False,
                "isGroup": False,
                "text": "SAIR",
            },
        }
        optouts = set()
        self.assertEqual(_processar_interacoes_webhook(db, payload, optouts), 1)
        self.assertEqual(_processar_interacoes_webhook(db, payload), 0)
        self.assertEqual(optouts, {lead.id})
        db.refresh(lead)
        db.refresh(disparo)
        self.assertEqual(lead.consentimento_status, "REVOGADO")
        self.assertEqual(lead.status, "INATIVO")
        self.assertEqual(disparo.total_respostas, 1)
        self.assertEqual(disparo.total_optouts, 1)
        self.assertEqual(
            db.scalar(select(func.count()).select_from(LeadInteracao)),
            1,
        )
        self.assertEqual(
            db.scalar(select(func.count()).select_from(LeadConsentimentoEvento)),
            1,
        )
        db.close()

    def test_importacao_nao_sobrescreve_optout_revogado(self):
        db = self.Session()
        agora = datetime(2026, 7, 28, 12, 0)
        lead = Lead(
            nome="Maria",
            telefone="(11) 99999-8888",
            telefone_normalizado="5511999998888",
            captado_em=date(2026, 7, 1),
            status="INATIVO",
            status_funil="NUTRICAO",
            consentimento_status="REVOGADO",
            consentimento_origem="WHATSAPP",
            opt_out_em=agora,
            opt_out_origem="WHATSAPP",
            criado_por="MARKETING",
            criado_em=agora,
            atualizado_em=agora,
        )
        db.add(lead)
        db.commit()

        csv = (
            "Nome;Celular;Campanha;Opt-in\n"
            "Maria atualizada;(11) 99999-8888;Curso 2026;Não\n"
        ).encode()
        previa = previsualizar_importacao(
            UploadFile(file=BytesIO(csv), filename="leads.csv"),
            db=db,
            usuario="MARKETING",
        )
        self.assertEqual(previa["itens"][0]["acao"], "ATUALIZAR")
        self.assertIn("preservado", previa["itens"][0]["motivo"])
        confirmar_importacao(previa["id"], db=db, usuario="MARKETING")
        db.refresh(lead)
        self.assertEqual(lead.consentimento_status, "REVOGADO")
        self.assertEqual(lead.status, "INATIVO")
        self.assertEqual(lead.opt_out_origem, "WHATSAPP")
        db.close()

    def test_optout_cancela_campanha_ainda_na_fila(self):
        db = self.Session()
        agora = datetime(2026, 7, 28, 12, 0)
        lead = Lead(
            nome="Maria",
            telefone="(11) 99999-8888",
            telefone_normalizado="5511999998888",
            captado_em=date(2026, 7, 1),
            status="INATIVO",
            status_funil="NUTRICAO",
            consentimento_status="REVOGADO",
            consentimento_origem="WHATSAPP",
            opt_out_em=agora,
            opt_out_origem="WHATSAPP",
            criado_por="MARKETING",
            criado_em=agora,
            atualizado_em=agora,
        )
        db.add(lead)
        db.flush()
        disparo = WhatsappDisparo(
            usuario="MARKETING",
            tipo_publico="leads",
            publico_descricao="Todos os leads",
            mensagem_modelo="Olá",
            tipo_mensagem="text",
            link_preview="N",
            pasta_uazapi_id="folder-1",
            status="NA_FILA",
            total_selecionados=1,
            total_validos=1,
            total_mensagens=2,
            total_invalidos=0,
            total_agendados=2,
            total_enviados=0,
            total_falhos=0,
            total_entregues=0,
            total_lidos=0,
            total_reproduzidos=0,
            total_respostas=1,
            total_optouts=1,
            categoria_api="MARKETING",
            finalidade="NUTRICAO",
            criado_em=agora,
            atualizado_em=agora,
        )
        db.add(disparo)
        db.flush()
        destinatario = WhatsappDestinatario(
            disparo_id=disparo.id,
            lead_id=lead.id,
            nome=lead.nome,
            celular_original=lead.telefone,
            numero_normalizado=lead.telefone_normalizado,
            valido="S",
            status="AGENDADO",
        )
        db.add(destinatario)
        db.commit()
        disparo_id = disparo.id
        destinatario_id = destinatario.id
        cliente = SimpleNamespace(controlar_campanha=Mock(return_value={}))

        with (
            patch("app.routers.whatsapp.SessionLocal", return_value=db),
            patch(
                "app.routers.whatsapp._cliente_instancia",
                return_value=(None, cliente),
            ),
        ):
            _cancelar_campanhas_por_optout([lead.id])

        cliente.controlar_campanha.assert_called_once_with("folder-1", "delete")
        verificacao = self.Session()
        disparo_salvo = verificacao.get(WhatsappDisparo, disparo_id)
        destinatario_salvo = verificacao.get(
            WhatsappDestinatario,
            destinatario_id,
        )
        self.assertEqual(disparo_salvo.status, "CANCELADO")
        self.assertEqual(disparo_salvo.total_agendados, 0)
        self.assertEqual(destinatario_salvo.status, "CANCELADO")
        verificacao.close()

    def test_importacao_exige_previa_e_trata_duplicados(self):
        db = self.Session()
        csv = (
            "Nome;Celular;Campanha;Opt-in\n"
            "Maria;(11) 99999-8888;Curso 2026;Sim\n"
            "João;(11) 98888-7777;Curso 2026;\n"
            "Maria duplicada;(11) 99999-8888;Curso 2026;Sim\n"
        ).encode()
        previa = previsualizar_importacao(
            UploadFile(file=BytesIO(csv), filename="leads.csv"),
            db=db,
            usuario="MARKETING",
        )
        self.assertEqual(previa["total_validos"], 2)
        self.assertEqual(previa["total_ignorados"], 1)
        resultado = confirmar_importacao(
            previa["id"],
            db=db,
            usuario="MARKETING",
        )
        self.assertEqual(resultado["total_criados"], 2)
        leads = list(db.scalars(select(Lead).order_by(Lead.nome)))
        self.assertEqual(
            [lead.consentimento_status for lead in leads],
            ["PENDENTE", "CONFIRMADO"],
        )
        with self.assertRaises(HTTPException):
            confirmar_importacao(
                previa["id"],
                db=db,
                usuario="MARKETING",
            )
        db.close()


if __name__ == "__main__":
    unittest.main()
