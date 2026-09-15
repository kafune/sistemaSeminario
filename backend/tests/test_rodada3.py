"""Terceira rodada das auditorias, pela camada HTTP.

Cobre o que ganhou tela nesta rodada (AUDITORIA.md G1) e o que saiu de cena
(G2/G3): a ficha do professor agora responde a partir dos vínculos reais de
turma, e `matprof`/`titprof` não existem mais no modelo.
"""

import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models as modelos
from app.database import Base, get_db
from app.main import app
from app.models import DocTurma, Materia, Professor, Turma, Usuario
from app.security import gerar_hash


class RodadaTresTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.sessao = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.db = self.sessao()
        self.db.add(Usuario(user="ADM", senha_hash=gerar_hash("senha-de-teste"), perfil="ADMIN"))
        self.professor = Professor(nome="Rev. Ana Figueiredo", sigla="AF", status="A")
        self.turma = Turma(nome="Turma 2026.1", curso="Bacharel em Teologia", qtalu=0)
        self.materia = Materia(NOME="Introdução ao Antigo Testamento")
        self.db.add_all([self.professor, self.turma, self.materia])
        self.db.commit()
        self.vinculo = DocTurma(
            cod_tur=self.turma.cod_tur,
            cod_mat=self.materia.cod_mat,
            cod_pro=self.professor.cod_pro,
            Ano="2026",
            semestre="1",
        )
        self.db.add(self.vinculo)
        self.db.commit()

        sessao = self.sessao

        def get_db_teste():
            db = sessao()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = get_db_teste
        self.cliente = TestClient(app)
        resposta = self.cliente.post("/auth/login", json={"user": "ADM", "senha": "senha-de-teste"})
        self.assertEqual(resposta.status_code, 200, resposta.text)
        self.cabecalho = {"Authorization": f"Bearer {resposta.json()['token']}"}

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    # G1 — a ficha do professor agora tem tela e conteúdo real -------------
    def test_ficha_do_professor_traz_os_vinculos_de_turma(self):
        resposta = self.cliente.get(
            f"/professores/{self.professor.cod_pro}", headers=self.cabecalho
        )
        self.assertEqual(resposta.status_code, 200, resposta.text)
        dados = resposta.json()
        self.assertEqual(len(dados["vinculos"]), 1)
        vinculo = dados["vinculos"][0]
        self.assertEqual(vinculo["materia_nome"], "Introdução ao Antigo Testamento")
        self.assertEqual(vinculo["turma_nome"], "Turma 2026.1")
        self.assertEqual(vinculo["ano"], "2026")
        self.assertEqual(dados["notas_lancadas"], 0)
        # A resposta não fala mais das tabelas aposentadas.
        self.assertNotIn("titulos", dados)

    # G2/G3 — as tabelas mortas saíram do modelo e da API -------------------
    def test_matprof_e_titprof_nao_sao_mais_criadas(self):
        tabelas = set(inspect(self.engine).get_table_names())
        self.assertNotIn("matprof", tabelas)
        self.assertNotIn("titprof", tabelas)
        self.assertFalse(hasattr(modelos, "MatProf"))
        self.assertFalse(hasattr(modelos, "TitProf"))

    def test_definir_materias_do_professor_deixou_de_existir(self):
        resposta = self.cliente.put(
            f"/professores/{self.professor.cod_pro}/materias",
            json=[self.materia.cod_mat],
            headers=self.cabecalho,
        )
        # A rota sumiu: nenhum método responde nesse caminho.
        self.assertEqual(resposta.status_code, 404)

    # G1 — editar e excluir turma pela API que a tela agora usa -------------
    def test_editar_turma_pela_api_que_a_tela_usa(self):
        resposta = self.cliente.put(
            f"/turmas/{self.turma.cod_tur}",
            json={
                "nome": "Turma 2026.1 — noite",
                "curso": "Bacharel em Teologia",
                "horario": "Sábado 19h",
                "dat_ini": "2026-02-10",
            },
            headers=self.cabecalho,
        )
        self.assertEqual(resposta.status_code, 200, resposta.text)
        self.assertEqual(resposta.json()["horario"], "Sábado 19h")

    def test_editar_vinculo_troca_o_professor(self):
        outro = Professor(nome="Pr. Bruno Lima", status="A")
        self.db.add(outro)
        self.db.commit()
        resposta = self.cliente.put(
            f"/turmas/{self.turma.cod_tur}/materias/{self.vinculo.id}",
            json={
                "cod_mat": self.materia.cod_mat,
                "cod_pro": outro.cod_pro,
                "Ano": "2026",
                "semestre": "1",
            },
            headers=self.cabecalho,
        )
        self.assertEqual(resposta.status_code, 200, resposta.text)
        self.assertEqual(resposta.json()["cod_pro"], outro.cod_pro)


if __name__ == "__main__":
    unittest.main()
