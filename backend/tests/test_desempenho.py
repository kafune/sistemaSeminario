import unittest

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    Aluno,
    AluNota,
    AluTurma,
    Materia,
    Notificacao,
    Professor,
    Turma,
    Usuario,
)
from app.routers.dashboard import resumo as resumo_dashboard
from app.routers.notas import LancamentoAluno, LancamentoInput, lancar
from app.routers.notificacoes import listar as listar_notificacoes
from app.routers.notificacoes import marcar_todas_lidas
from app.routers.turmas import listar as listar_turmas
from app.services.notificacoes import agora_utc


class ConsultasEscalaveisTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def contar_selects(self, funcao):
        comandos = []

        def registrar(_conn, _cursor, statement, _parameters, _context, _many):
            if statement.lstrip().upper().startswith("SELECT"):
                comandos.append(statement)

        event.listen(self.engine, "before_cursor_execute", registrar)
        try:
            resultado = funcao()
        finally:
            event.remove(self.engine, "before_cursor_execute", registrar)
        return resultado, len(comandos)

    def test_listagem_de_turmas_usa_uma_consulta_para_as_contagens(self):
        turmas = [Turma(nome=f"Turma {indice}", qtalu=0) for indice in range(5)]
        self.db.add_all(turmas)
        self.db.flush()
        alunos = [Aluno(nome=f"Aluno {indice}") for indice in range(10)]
        self.db.add_all(alunos)
        self.db.flush()
        self.db.add_all(
            AluTurma(cod_tur=turmas[indice % 5].cod_tur, cod_alu=aluno.cod_alu)
            for indice, aluno in enumerate(alunos)
        )
        self.db.commit()

        resposta, quantidade_selects = self.contar_selects(
            lambda: listar_turmas(db=self.db)
        )

        self.assertEqual(quantidade_selects, 1)
        self.assertEqual(sum(item["qtd_alunos"] for item in resposta), 10)

    def test_lancamento_de_notas_busca_existentes_em_lote(self):
        materia = Materia(NOME="Introdução")
        alunos = [Aluno(nome=f"Aluno {indice}") for indice in range(20)]
        self.db.add(materia)
        self.db.add_all(alunos)
        self.db.commit()
        dados = LancamentoInput(
            cod_tur=1,
            cod_mat=materia.cod_mat,
            alunos=[
                LancamentoAluno(cod_alu=aluno.cod_alu, nota=8, falta=0)
                for aluno in alunos
            ],
        )

        resposta, quantidade_selects = self.contar_selects(
            lambda: lancar(dados, db=self.db)
        )

        self.assertLessEqual(quantidade_selects, 2)
        self.assertEqual(resposta["criados"], 20)

    def test_notificacoes_agregam_contagem_e_marcam_em_lote(self):
        self.db.add(Usuario(user="ANA", senha_hash="x"))
        self.db.add_all(
            Notificacao(
                usuario="ANA",
                categoria="AULAS",
                titulo=f"Item {indice}",
                corpo="Corpo",
                rota=None,
                chave_evento=f"evento:{indice}",
                criado_em=agora_utc(),
                lido_em=None,
            )
            for indice in range(8)
        )
        self.db.commit()

        resposta = listar_notificacoes(
            pagina=1,
            por_pagina=50,
            db=self.db,
            usuario="ANA",
        )
        atualizacao = marcar_todas_lidas(db=self.db, usuario="ANA")

        self.assertEqual(resposta["nao_lidas"], 8)
        self.assertEqual(atualizacao["quantidade"], 8)

    def test_dashboard_combina_metricas_em_tres_consultas(self):
        turma = Turma(nome="Turma A", curso="Teologia", qtalu=0)
        materia = Materia(NOME="Introdução")
        professor = Professor(nome="Docente", status="A")
        aluno = Aluno(nome="Aluno", status="A")
        self.db.add_all([turma, materia, professor, aluno])
        self.db.flush()
        self.db.add(AluTurma(cod_tur=turma.cod_tur, cod_alu=aluno.cod_alu))
        self.db.add(
            AluNota(
                cod_tur=turma.cod_tur,
                cod_mat=materia.cod_mat,
                cod_alu=aluno.cod_alu,
                nota=9,
            )
        )
        self.db.commit()

        resposta, quantidade_selects = self.contar_selects(
            lambda: resumo_dashboard(db=self.db)
        )

        self.assertEqual(quantidade_selects, 3)
        self.assertEqual(resposta["alunos_ativos"], 1)
        self.assertEqual(resposta["lancamentos_total"], 1)


if __name__ == "__main__":
    unittest.main()
