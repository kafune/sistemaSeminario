import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    Aluno,
    AluNota,
    AluTurma,
    Aula,
    Chamada,
    DocTurma,
    Materia,
    Professor,
    Turma,
    Usuario,
)
from app.routers import presencas


class DiarioTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()

        self.hoje = date(2026, 8, 12)
        self.agora = datetime(2026, 8, 12, 22, 15)

        self.turma = Turma(nome="Teologia — Noturno", curso="Teologia")
        self.ana = Aluno(nome="Ana Souza")
        self.bruno = Aluno(nome="Bruno Lima")
        self.carla = Aluno(nome="Carla Reis")
        self.professor = Professor(nome="Docente")
        self.outro_professor = Professor(nome="Outra Docente")
        self.materia = Materia(NOME="Introdução")
        self.db.add_all([
            self.turma, self.ana, self.bruno, self.carla,
            self.professor, self.outro_professor, self.materia,
        ])
        self.db.flush()
        self.db.add_all([
            AluTurma(cod_tur=self.turma.cod_tur, cod_alu=self.ana.cod_alu, status="A"),
            AluTurma(cod_tur=self.turma.cod_tur, cod_alu=self.bruno.cod_alu, status="A"),
            # Aluna desligada: não deve aparecer no diário.
            AluTurma(cod_tur=self.turma.cod_tur, cod_alu=self.carla.cod_alu, status="I"),
        ])
        self.vinculo = DocTurma(
            cod_tur=self.turma.cod_tur,
            cod_mat=self.materia.cod_mat,
            cod_pro=self.professor.cod_pro,
            Ano="2026",
            semestre="2",
        )
        self.db.add(self.vinculo)
        self.db.flush()
        self.aula_passada = Aula(
            docturma_id=self.vinculo.id,
            data=self.hoje - timedelta(days=7),
            status="AGENDADA",
        )
        self.aula_hoje = Aula(
            docturma_id=self.vinculo.id, data=self.hoje, status="AGENDADA"
        )
        self.aula_futura = Aula(
            docturma_id=self.vinculo.id,
            data=self.hoje + timedelta(days=7),
            status="AGENDADA",
        )
        self.aula_cancelada = Aula(
            docturma_id=self.vinculo.id,
            data=self.hoje - timedelta(days=1),
            status="CANCELADA",
        )
        self.db.add_all([
            self.aula_passada, self.aula_hoje, self.aula_futura, self.aula_cancelada,
        ])
        self.db.add_all([
            AluNota(
                cod_alu=aluno.cod_alu,
                cod_mat=self.materia.cod_mat,
                cod_tur=self.turma.cod_tur,
                docturma_id=self.vinculo.id,
            )
            for aluno in (self.ana, self.bruno)
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    # Helpers ---------------------------------------------------------------

    def diario(self, user=None):
        # Chamado fora do FastAPI: os defaults de Query precisam vir explícitos.
        return presencas.obter_diario(
            self.turma.cod_tur,
            docturma_id=self.vinculo.id,
            inicio=None,
            fim=None,
            db=self.db,
            **({"user": user} if user is not None else {}),
        )

    def registrar(self, aula, aluno, presente, user=None):
        with (
            patch.object(presencas, "_hoje_local", return_value=self.hoje),
            patch.object(presencas, "_agora_utc", return_value=self.agora),
        ):
            return presencas.registrar_presenca_diario(
                self.turma.cod_tur,
                aula.id,
                aluno.cod_alu,
                presencas.RegistrarPresencaInput(presente=presente),
                db=self.db,
                **({"user": user} if user is not None else {}),
            )

    def falta_registrada(self, cod_alu):
        return self.db.scalar(
            self.db.query(AluNota.falta)
            .filter(
                AluNota.docturma_id == self.vinculo.id,
                AluNota.cod_alu == cod_alu,
            )
            .statement
        )

    def usuario_professor(self, professor, login):
        self.db.add(
            Usuario(
                user=login,
                senha_hash="x",
                perfil="PROFESSOR",
                cod_pro=professor.cod_pro,
            )
        )
        self.db.commit()
        return login

    # Leitura ---------------------------------------------------------------

    def test_grade_lista_aulas_validas_e_alunos_ativos(self):
        diario = self.diario()

        self.assertEqual(
            [aula["data"] for aula in diario["aulas"]],
            [
                self.aula_passada.data.isoformat(),
                self.aula_hoje.data.isoformat(),
                self.aula_futura.data.isoformat(),
            ],
        )
        self.assertEqual(
            [aluno["nome"] for aluno in diario["alunos"]], ["Ana Souza", "Bruno Lima"]
        )
        # Sem chamada aberta, nenhuma célula é preenchida.
        self.assertEqual([aluno["celulas"] for aluno in diario["alunos"]], [{}, {}])
        self.assertEqual(diario["resumo"]["aulas_com_chamada"], 0)
        self.assertIsNone(diario["aulas"][0]["chamada_status"])

    def test_chamada_encerrada_vira_p_e_f_na_grade(self):
        with (
            patch.object(presencas, "_hoje_local", return_value=self.hoje),
            patch.object(presencas, "_agora_utc", return_value=self.agora),
        ):
            chamada = presencas.abrir_chamada(
                self.turma.cod_tur,
                presencas.AbrirChamadaInput(aula_id=self.aula_hoje.id),
                db=self.db,
            )
            presencas.marcar_presenca(
                chamada["token"],
                presencas.MarcarPresencaInput(cod_alu=self.ana.cod_alu),
                db=self.db,
            )
            presencas.encerrar_chamada(self.turma.cod_tur, chamada["id"], db=self.db)

        diario = self.diario()
        por_nome = {aluno["nome"]: aluno for aluno in diario["alunos"]}
        chave = str(self.aula_hoje.id)
        self.assertEqual(por_nome["Ana Souza"]["celulas"][chave], "P")
        self.assertEqual(por_nome["Bruno Lima"]["celulas"][chave], "F")
        self.assertEqual(por_nome["Ana Souza"]["faltas"], 0)
        self.assertEqual(por_nome["Bruno Lima"]["faltas"], 1)
        self.assertEqual(diario["resumo"]["aulas_com_chamada"], 1)

    # Edição ----------------------------------------------------------------

    def test_falta_retroativa_cria_chamada_encerrada_e_atualiza_cache(self):
        resposta = self.registrar(self.aula_passada, self.bruno, presente=False)

        self.assertEqual(resposta["faltas"], 1)
        self.assertEqual(resposta["chamada_status"], "ENCERRADA")
        self.assertEqual(resposta["aula_status"], "REALIZADA")
        self.assertEqual(self.falta_registrada(self.bruno.cod_alu), 1)

        diario = self.diario()
        por_nome = {aluno["nome"]: aluno for aluno in diario["alunos"]}
        chave = str(self.aula_passada.id)
        self.assertEqual(por_nome["Bruno Lima"]["celulas"][chave], "F")
        # A chamada retroativa nasce com a turma presente; só o marcado falta.
        self.assertEqual(por_nome["Ana Souza"]["celulas"][chave], "P")
        self.assertEqual(por_nome["Ana Souza"]["faltas"], 0)

    def test_marcar_presente_reverte_a_falta(self):
        self.registrar(self.aula_passada, self.bruno, presente=False)
        resposta = self.registrar(self.aula_passada, self.bruno, presente=True)

        self.assertEqual(resposta["faltas"], 0)
        self.assertEqual(self.falta_registrada(self.bruno.cod_alu), 0)
        diario = self.diario()
        por_nome = {aluno["nome"]: aluno for aluno in diario["alunos"]}
        self.assertEqual(por_nome["Bruno Lima"]["celulas"][str(self.aula_passada.id)], "P")

    def test_chamada_retroativa_nao_serve_ao_totem(self):
        self.registrar(self.aula_passada, self.bruno, presente=False)
        chamada = self.db.query(Chamada).filter(
            Chamada.aula_id == self.aula_passada.id
        ).one()

        with (
            patch.object(presencas, "_hoje_local", return_value=self.hoje),
            self.assertRaises(HTTPException) as erro,
        ):
            presencas.obter_chamada_publica(chamada.token, db=self.db)

        self.assertEqual(erro.exception.status_code, 410)

    def test_aula_futura_e_cancelada_sao_recusadas(self):
        for aula in (self.aula_futura, self.aula_cancelada):
            with self.subTest(aula=aula.status), self.assertRaises(HTTPException) as erro:
                self.registrar(aula, self.bruno, presente=False)
            self.assertEqual(erro.exception.status_code, 400)

    # Escopo do professor ---------------------------------------------------

    def test_professor_de_outra_materia_nao_acessa(self):
        login = self.usuario_professor(self.outro_professor, "outra")

        with self.assertRaises(HTTPException) as erro:
            self.diario(user=login)
        self.assertEqual(erro.exception.status_code, 403)

        with self.assertRaises(HTTPException) as erro:
            self.registrar(self.aula_passada, self.bruno, presente=False, user=login)
        self.assertEqual(erro.exception.status_code, 403)

    def test_vinculos_filtram_pelo_professor_logado(self):
        outro_vinculo = DocTurma(
            cod_tur=self.turma.cod_tur,
            cod_mat=self.materia.cod_mat,
            cod_pro=self.outro_professor.cod_pro,
            Ano="2026",
            semestre="2",
        )
        self.db.add(outro_vinculo)
        self.db.commit()
        login = self.usuario_professor(self.professor, "docente")

        todos = presencas.vinculos_do_diario(self.turma.cod_tur, db=self.db)
        do_professor = presencas.vinculos_do_diario(
            self.turma.cod_tur, db=self.db, user=login
        )

        self.assertEqual(len(todos), 2)
        self.assertEqual(
            [item["docturma_id"] for item in do_professor], [self.vinculo.id]
        )
        # Três aulas não canceladas no vínculo do professor.
        self.assertEqual(do_professor[0]["total_aulas"], 3)


if __name__ == "__main__":
    unittest.main()
