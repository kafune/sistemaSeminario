"""Matriz de perfis exercitada pela camada HTTP.

Os demais testes chamam as funções dos routers diretamente e nunca passam por
``Depends(exigir_perfis(...))``. Este passa: cada perfil contra as portas que
ele deve e não deve abrir.
"""

import unittest

from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Usuario
from app.security import gerar_hash
from tests import criar_engine_de_teste

PERFIS = ("ADMIN", "SECRETARIA", "MARKETING", "FINANCEIRO", "PROFESSOR")


class MatrizDePerfisTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = criar_engine_de_teste()
        Base.metadata.create_all(cls.engine)
        cls.sessao = sessionmaker(bind=cls.engine, expire_on_commit=False)
        db = cls.sessao()
        for perfil in PERFIS:
            db.add(Usuario(user=perfil, senha_hash=gerar_hash("senha-de-teste"), perfil=perfil))
        db.commit()
        db.close()

        def get_db_teste():
            db = cls.sessao()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = get_db_teste
        cls.cliente = TestClient(app)
        cls.tokens = {}
        for perfil in PERFIS:
            resposta = cls.cliente.post("/auth/login", json={"user": perfil, "senha": "senha-de-teste"})
            assert resposta.status_code == 200, resposta.text
            cls.tokens[perfil] = resposta.json()["token"]

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        cls.engine.dispose()

    def get(self, perfil, rota):
        return self.cliente.get(rota, headers={"Authorization": f"Bearer {self.tokens[perfil]}"})

    def test_sem_token_e_401(self):
        self.assertEqual(self.cliente.get("/alunos").status_code, 401)

    def test_token_sem_sub_e_401_e_nao_500(self):
        import jwt

        from app.config import settings

        token = jwt.encode({"exp": 4102444800}, settings.secret_key, algorithm="HS256")
        resposta = self.cliente.get("/alunos", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(resposta.status_code, 401)

    def test_whatsapp_e_so_de_quem_comunica(self):
        for perfil in ("ADMIN", "SECRETARIA", "MARKETING"):
            self.assertNotEqual(self.get(perfil, "/whatsapp/disparos").status_code, 403, perfil)
        for perfil in ("PROFESSOR", "FINANCEIRO"):
            self.assertEqual(self.get(perfil, "/whatsapp/disparos").status_code, 403, perfil)

    def test_leads_e_so_de_marketing_e_admin(self):
        for perfil in ("ADMIN", "MARKETING"):
            self.assertEqual(self.get(perfil, "/leads").status_code, 200, perfil)
        for perfil in ("SECRETARIA", "PROFESSOR", "FINANCEIRO"):
            self.assertEqual(self.get(perfil, "/leads").status_code, 403, perfil)

    def test_academico_fecha_para_marketing_financeiro_e_professor(self):
        for perfil in ("ADMIN", "SECRETARIA"):
            self.assertEqual(self.get(perfil, "/alunos").status_code, 200, perfil)
        for perfil in ("MARKETING", "FINANCEIRO", "PROFESSOR"):
            self.assertEqual(self.get(perfil, "/alunos").status_code, 403, perfil)

    def test_tesouraria(self):
        for perfil in ("ADMIN", "SECRETARIA", "FINANCEIRO"):
            self.assertEqual(self.get(perfil, "/financeiro/resumo").status_code, 200, perfil)
        for perfil in ("MARKETING", "PROFESSOR"):
            self.assertEqual(self.get(perfil, "/financeiro/resumo").status_code, 403, perfil)

    def test_usuarios_e_so_de_admin(self):
        self.assertEqual(self.get("ADMIN", "/usuarios").status_code, 200)
        for perfil in ("SECRETARIA", "MARKETING", "FINANCEIRO", "PROFESSOR"):
            self.assertEqual(self.get(perfil, "/usuarios").status_code, 403, perfil)

    def test_me_devolve_o_perfil_real(self):
        resposta = self.get("SECRETARIA", "/auth/me")
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.json()["perfil"], "SECRETARIA")

    def test_trocar_senha_exige_a_atual_e_minimo(self):
        cabecalho = {"Authorization": f"Bearer {self.tokens['SECRETARIA']}"}
        resposta = self.cliente.post(
            "/auth/trocar-senha", json={"senha_atual": "errada", "senha_nova": "nova-senha-longa"}, headers=cabecalho
        )
        self.assertEqual(resposta.status_code, 400)
        resposta = self.cliente.post(
            "/auth/trocar-senha", json={"senha_atual": "senha-de-teste", "senha_nova": "curta"}, headers=cabecalho
        )
        self.assertEqual(resposta.status_code, 400)


if __name__ == "__main__":
    unittest.main()
