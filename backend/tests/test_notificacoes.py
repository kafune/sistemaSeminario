import unittest
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Aula, Notificacao, PushInscricao, Usuario
from app.services import notificacoes


class NotificacoesServiceTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()
        self.db.add_all([Usuario(user="ANA", senha_hash="x"), Usuario(user="BIA", senha_hash="x")])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_idempotencia_e_isolamento_por_usuario(self):
        primeiro = notificacoes.criar_notificacao(
            self.db, usuario="ANA", categoria="WHATSAPP", titulo="Campanha",
            corpo="Concluída", rota="/whatsapp?disparo=1", chave_evento="campanha:1",
        )
        repetido = notificacoes.criar_notificacao(
            self.db, usuario="ANA", categoria="WHATSAPP", titulo="Campanha",
            corpo="Concluída", rota="/whatsapp?disparo=1", chave_evento="campanha:1",
        )
        outro_usuario = notificacoes.criar_notificacao(
            self.db, usuario="BIA", categoria="WHATSAPP", titulo="Campanha",
            corpo="Concluída", rota="/whatsapp?disparo=1", chave_evento="campanha:1",
        )
        self.db.commit()
        self.assertIsNotNone(primeiro)
        self.assertIsNone(repetido)
        self.assertIsNotNone(outro_usuario)
        self.assertEqual(self.db.query(Notificacao).count(), 2)

    def test_preferencias_sao_criadas_habilitadas(self):
        preferencias = notificacoes.preferencias_para(self.db, "ANA")
        self.assertTrue(preferencias.push_whatsapp)
        self.assertTrue(preferencias.push_cadastros)
        self.assertTrue(preferencias.push_aulas)

    def test_lembrete_no_fuso_e_chave_diaria(self):
        self.db.add(Aula(docturma_id=1, data=date(2026, 7, 29), status="AGENDADA"))
        self.db.commit()
        agora = datetime(2026, 7, 28, 18, 5, tzinfo=timezone.utc)
        with patch.object(notificacoes, "agora_local", return_value=agora):
            criadas = notificacoes.gerar_lembretes_aulas(self.db)
            repetidas = notificacoes.gerar_lembretes_aulas(self.db)
        self.assertEqual(len(criadas), 2)
        self.assertEqual(repetidas, [])

    def test_endpoint_expirado_e_desativado(self):
        item = notificacoes.criar_notificacao(
            self.db, usuario="ANA", categoria="AULAS", titulo="Aulas",
            corpo="Há uma aula amanhã.", rota="/calendario", chave_evento="aulas:ana:1",
        )
        inscricao = PushInscricao(
            usuario="ANA", endpoint="https://push.example/expired",
            endpoint_hash=notificacoes.hash_endpoint("https://push.example/expired"),
            chave_p256dh="p256dh", chave_auth="auth", ativo=True,
            criado_em=notificacoes.agora_utc(), atualizado_em=notificacoes.agora_utc(), usado_em=None,
        )
        self.db.add(inscricao)
        self.db.commit()
        erro = notificacoes.WebPushException("gone")
        erro.response = SimpleNamespace(status_code=410)
        antigos = (
            notificacoes.settings.vapid_public_key,
            notificacoes.settings.vapid_private_key,
            notificacoes.settings.vapid_subject,
        )
        try:
            notificacoes.settings.vapid_public_key = "publica"
            notificacoes.settings.vapid_private_key = "privada"
            notificacoes.settings.vapid_subject = "mailto:test@example.com"
            with patch.object(notificacoes, "webpush", side_effect=erro):
                notificacoes.entregar_push(self.db, item)
        finally:
            (
                notificacoes.settings.vapid_public_key,
                notificacoes.settings.vapid_private_key,
                notificacoes.settings.vapid_subject,
            ) = antigos
        self.assertFalse(inscricao.ativo)

    def test_retencao_remove_historico_acima_de_noventa_dias(self):
        antiga = Notificacao(
            usuario="ANA", categoria="AULAS", titulo="Antiga", corpo="Antiga", rota=None,
            chave_evento="antiga", criado_em=datetime(2000, 1, 1), lido_em=None,
        )
        recente = Notificacao(
            usuario="ANA", categoria="AULAS", titulo="Recente", corpo="Recente", rota=None,
            chave_evento="recente", criado_em=notificacoes.agora_utc(), lido_em=None,
        )
        self.db.add_all([antiga, recente])
        self.db.commit()
        self.assertEqual(notificacoes.limpar_notificacoes_antigas(self.db), 1)
        self.assertEqual(self.db.query(Notificacao).count(), 1)


if __name__ == "__main__":
    unittest.main()
