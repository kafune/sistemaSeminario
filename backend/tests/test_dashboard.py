"""Pendências do painel: o que está parado esperando a secretaria agir."""

import unittest
from datetime import date, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    Aluno,
    AluNota,
    AluTurma,
    Chamada,
    DocTurma,
    Materia,
    Turma,
)
from app.routers.alunos import listar as listar_alunos
from app.routers.dashboard import periodo_corrente
from app.routers.dashboard import resumo as resumo_dashboard
from app.routers.turmas import listar as listar_turmas


class PendenciasDoPainelTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()
        self.ano, self.semestre = periodo_corrente(date.today())

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def pendencia(self, resposta, chave):
        return next(p for p in resposta["pendencias"] if p["chave"] == chave)

    def cenario(self):
        turma = Turma(nome="Turma A", curso="Teologia", qtalu=0)
        materia = Materia(NOME="Hermenêutica")
        self.db.add_all([turma, materia])
        self.db.flush()

        com_nota = Aluno(nome="Com nota", status="A")
        sem_nota = Aluno(nome="Sem nota", status="A")
        sem_turma = Aluno(nome="Sem turma", status="A")
        pre_cadastro = Aluno(nome="Pré-cadastro", status="P")
        inativo_sem_turma = Aluno(nome="Inativo", status="I")
        self.db.add_all([com_nota, sem_nota, sem_turma, pre_cadastro, inativo_sem_turma])
        self.db.flush()

        vinculo = DocTurma(
            cod_tur=turma.cod_tur,
            cod_mat=materia.cod_mat,
            Ano=self.ano,
            semestre=self.semestre,
        )
        self.db.add(vinculo)
        self.db.flush()

        self.db.add_all([
            AluTurma(cod_tur=turma.cod_tur, cod_alu=com_nota.cod_alu),
            AluTurma(cod_tur=turma.cod_tur, cod_alu=sem_nota.cod_alu),
        ])
        self.db.add(
            AluNota(
                cod_tur=turma.cod_tur,
                cod_mat=materia.cod_mat,
                cod_alu=com_nota.cod_alu,
                docturma_id=vinculo.id,
                nota=9,
            )
        )
        self.db.add(
            Chamada(
                cod_tur=turma.cod_tur,
                data=date.today(),
                token="aberta",
                status="ABERTA",
                aberta_em=datetime.now(),
            )
        )
        self.db.add(
            Chamada(
                cod_tur=turma.cod_tur,
                data=date.today(),
                token="encerrada",
                status="ENCERRADA",
                aberta_em=datetime.now(),
                encerrada_em=datetime.now(),
            )
        )
        self.db.commit()
        return turma, vinculo

    def test_cada_pendencia_conta_so_o_que_esta_parado(self):
        self.cenario()
        resposta = resumo_dashboard(db=self.db)

        self.assertEqual(self.pendencia(resposta, "pre_cadastros")["total"], 1)
        self.assertEqual(self.pendencia(resposta, "chamadas_abertas")["total"], 1)
        # Só o aluno ativo sem matrícula; o inativo não é fila de trabalho.
        self.assertEqual(self.pendencia(resposta, "alunos_sem_turma")["total"], 1)
        # O vínculo entra uma vez, mesmo tendo um aluno já lançado.
        self.assertEqual(self.pendencia(resposta, "notas_em_aberto")["total"], 1)

    def test_vinculo_com_todos_os_alunos_lancados_sai_da_fila(self):
        turma, vinculo = self.cenario()
        pendente = self.db.query(Aluno).filter(Aluno.nome == "Sem nota").one()
        self.db.add(
            AluNota(
                cod_tur=turma.cod_tur,
                cod_mat=vinculo.cod_mat,
                cod_alu=pendente.cod_alu,
                docturma_id=vinculo.id,
                nota=7,
            )
        )
        self.db.commit()

        resposta = resumo_dashboard(db=self.db)
        self.assertEqual(self.pendencia(resposta, "notas_em_aberto")["total"], 0)

    def test_vinculo_de_outro_semestre_nao_entra_na_fila(self):
        turma, vinculo = self.cenario()
        vinculo.Ano = str(int(self.ano) - 1)
        self.db.commit()

        resposta = resumo_dashboard(db=self.db)
        self.assertEqual(self.pendencia(resposta, "notas_em_aberto")["total"], 0)

    def abrir_chamada(self, cod_tur, token):
        self.db.add(
            Chamada(
                cod_tur=cod_tur,
                data=date.today(),
                token=token,
                status="ABERTA",
                aberta_em=datetime.now(),
            )
        )
        self.db.commit()

    def test_chamada_aberta_em_uma_turma_so_leva_direto_para_ela(self):
        turma, _ = self.cenario()

        resposta = resumo_dashboard(db=self.db)

        self.assertEqual(
            self.pendencia(resposta, "chamadas_abertas")["cod_tur"], turma.cod_tur
        )

    def test_duas_chamadas_da_mesma_turma_continuam_um_destino_so(self):
        turma, _ = self.cenario()
        self.abrir_chamada(turma.cod_tur, "segunda-da-mesma")

        resposta = resumo_dashboard(db=self.db)
        pendencia = self.pendencia(resposta, "chamadas_abertas")

        self.assertEqual(pendencia["total"], 2)
        self.assertEqual(pendencia["cod_tur"], turma.cod_tur)

    def test_chamadas_em_turmas_diferentes_nao_tem_destino_unico(self):
        self.cenario()
        outra = Turma(nome="Turma B", curso="Teologia", qtalu=0)
        self.db.add(outra)
        self.db.flush()
        self.abrir_chamada(outra.cod_tur, "de-outra-turma")

        resposta = resumo_dashboard(db=self.db)
        pendencia = self.pendencia(resposta, "chamadas_abertas")

        self.assertEqual(pendencia["total"], 2)
        self.assertIsNone(pendencia["cod_tur"])

    def test_listagem_de_turmas_marca_quem_tem_chamada_aberta(self):
        turma, _ = self.cenario()
        outra = Turma(nome="Turma B", curso="Teologia", qtalu=0)
        self.db.add(outra)
        self.db.commit()

        por_nome = {t["nome"]: t for t in listar_turmas(db=self.db)}

        # A turma do cenário tem uma aberta e uma encerrada: só a aberta conta.
        self.assertEqual(por_nome[turma.nome]["chamadas_abertas"], 1)
        self.assertEqual(por_nome["Turma B"]["chamadas_abertas"], 0)

    def test_listagem_de_alunos_filtra_quem_nao_tem_turma(self):
        self.cenario()

        resposta = listar_alunos(sem_turma=True, status="A", db=self.db)

        self.assertEqual(resposta["total"], 1)
        self.assertEqual(resposta["itens"][0]["nome"], "Sem turma")


if __name__ == "__main__":
    unittest.main()
