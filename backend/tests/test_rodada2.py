"""Achados da segunda rodada: nome normalizado, auditoria, assinatura do webhook."""

import hashlib
import hmac
import unittest

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Aluno, RegistroAuditoria, Usuario
from app.routers.alunos import listar as listar_alunos
from app.routers.financeiro import validar_assinatura_banco
from app.routers.usuarios import (
    PerfilInput,
    UsuarioInput,
    alterar_perfil,
    criar,
    listar_auditoria,
)
from app.security import gerar_hash
from tests import criar_engine_de_teste


class BaseTest(unittest.TestCase):
    def setUp(self):
        self.engine = criar_engine_de_teste()
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()


class NomeNormalizadoTest(BaseTest):
    def test_coluna_e_mantida_na_escrita(self):
        aluno = Aluno(nome="  José   da Conceição ")
        self.db.add(aluno)
        self.db.commit()
        self.assertEqual(aluno.nome_normalizado, "JOSE DA CONCEICAO")
        aluno.nome = "Maria Antônia"
        self.db.commit()
        self.assertEqual(aluno.nome_normalizado, "MARIA ANTONIA")

    def test_busca_numerica_tambem_procura_no_nome(self):
        self.db.add_all([Aluno(nome="Turma 2026 - Ana"), Aluno(nome="Bruno")])
        self.db.commit()
        resultado = listar_alunos(busca="2026", db=self.db)
        self.assertEqual([a["nome"] for a in resultado["itens"]], ["Turma 2026 - Ana"])
        resultado = listar_alunos(busca="2", db=self.db)
        self.assertEqual({a["nome"] for a in resultado["itens"]}, {"Turma 2026 - Ana", "Bruno"})


class AuditoriaTest(BaseTest):
    def test_operacoes_administrativas_deixam_rastro(self):
        self.db.add(Usuario(user="ADMIN", senha_hash=gerar_hash("senha-longa"), perfil="ADMIN"))
        self.db.commit()
        criar(UsuarioInput(user="maria", senha="senha-longa", perfil="SECRETARIA"), self.db, "ADMIN")
        alterar_perfil("MARIA", PerfilInput(perfil="MARKETING"), "ADMIN", self.db)
        registros = list(self.db.scalars(select(RegistroAuditoria).order_by(RegistroAuditoria.id)))
        self.assertEqual([r.acao for r in registros], ["CRIAR", "ALTERAR_PERFIL"])
        self.assertEqual({r.usuario for r in registros}, {"ADMIN"})
        self.assertEqual(registros[1].detalhes, "SECRETARIA -> MARKETING")
        listagem = listar_auditoria(db=self.db)
        self.assertEqual(listagem["total"], 2)
        self.assertEqual(listagem["itens"][0]["acao"], "ALTERAR_PERFIL")

    def test_chamada_direta_sem_usuario_nao_quebra(self):
        self.db.add(Usuario(user="ADMIN", senha_hash=gerar_hash("senha-longa"), perfil="ADMIN"))
        self.db.commit()
        criar(UsuarioInput(user="joao", senha="senha-longa"), self.db)
        registro = self.db.scalar(select(RegistroAuditoria))
        self.assertIsNone(registro.usuario)


class AssinaturaDoWebhookTest(unittest.TestCase):
    SEGREDO = "segredo-do-banco"

    def assinar(self, corpo: bytes, carimbo: int) -> str:
        return "sha256=" + hmac.new(
            self.SEGREDO.encode(), f"{carimbo}.".encode() + corpo, hashlib.sha256
        ).hexdigest()

    def test_assinatura_valida_dentro_da_janela(self):
        corpo = b'{"identificador": "E1"}'
        validar_assinatura_banco(
            corpo, self.assinar(corpo, 1_000_000), "1000000", segredo=self.SEGREDO, agora=1_000_100
        )

    def test_corpo_alterado_ou_janela_vencida_sao_recusados(self):
        corpo = b'{"identificador": "E1"}'
        with self.assertRaises(HTTPException) as erro:
            validar_assinatura_banco(
                b'{"identificador": "E2"}', self.assinar(corpo, 1_000_000), "1000000",
                segredo=self.SEGREDO, agora=1_000_100,
            )
        self.assertEqual(erro.exception.status_code, 401)
        with self.assertRaises(HTTPException):
            validar_assinatura_banco(
                corpo, self.assinar(corpo, 1_000_000), "1000000", segredo=self.SEGREDO, agora=1_001_000
            )
        with self.assertRaises(HTTPException):
            validar_assinatura_banco(corpo, "sha256=abc", None, segredo=self.SEGREDO, agora=1)


if __name__ == "__main__":
    unittest.main()
