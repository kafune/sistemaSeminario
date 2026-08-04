import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    Aluno,
    AluTurma,
    Aula,
    DocTurma,
    Materia,
    Professor,
    Turma,
    Usuario,
)
from app.routers.portal_professor import (
    ComunicadoInput,
    PlanejamentoInput,
    criar_comunicado,
    detalhe_turma_professor,
    resumo_professor,
    salvar_planejamento,
)
from app.routers.presencas import (
    AbrirChamadaInput,
    _hoje_local,
    abrir_chamada,
    listar_chamadas,
)


class PortalProfessorTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()

        self.turma = Turma(nome="Turma A")
        materia = Materia(NOME="Introdução")
        outra_materia = Materia(NOME="História")
        self.professor = Professor(nome="Professor Um")
        self.outro_professor = Professor(nome="Professor Dois")
        aluno = Aluno(nome="Aluno")
        self.db.add_all(
            [
                self.turma,
                materia,
                outra_materia,
                self.professor,
                self.outro_professor,
                aluno,
            ]
        )
        self.db.flush()
        self.vinculo = DocTurma(
            cod_tur=self.turma.cod_tur,
            cod_mat=materia.cod_mat,
            cod_pro=self.professor.cod_pro,
            Ano="2026",
            semestre="2",
        )
        self.outro_vinculo = DocTurma(
            cod_tur=self.turma.cod_tur,
            cod_mat=outra_materia.cod_mat,
            cod_pro=self.outro_professor.cod_pro,
        )
        self.db.add_all([self.vinculo, self.outro_vinculo])
        self.db.flush()
        self.aula = Aula(
            docturma_id=self.vinculo.id,
            data=_hoje_local(),
            tema="Apresentação",
        )
        self.outra_aula = Aula(
            docturma_id=self.outro_vinculo.id,
            data=_hoje_local(),
            tema="Outra aula",
        )
        self.db.add_all([self.aula, self.outra_aula])
        self.db.add(AluTurma(cod_tur=self.turma.cod_tur, cod_alu=aluno.cod_alu))
        self.db.add_all(
            [
                Usuario(
                    user="PROF1",
                    senha_hash="x",
                    perfil="PROFESSOR",
                    cod_pro=self.professor.cod_pro,
                ),
                Usuario(
                    user="PROF2",
                    senha_hash="x",
                    perfil="PROFESSOR",
                    cod_pro=self.outro_professor.cod_pro,
                ),
            ]
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_dashboard_e_detalhe_mostram_somente_vinculos_do_professor(self):
        resumo = resumo_professor(db=self.db, user="PROF1")
        detalhe = detalhe_turma_professor(
            self.vinculo.id,
            db=self.db,
            user="PROF1",
        )

        self.assertEqual(resumo["professor"]["nome"], "Professor Um")
        self.assertEqual(
            [item["docturma_id"] for item in resumo["turmas"]],
            [self.vinculo.id],
        )
        self.assertEqual(detalhe["vinculo"]["materia_nome"], "Introdução")
        self.assertEqual(len(detalhe["alunos"]), 1)

        with self.assertRaises(HTTPException) as erro:
            detalhe_turma_professor(
                self.outro_vinculo.id,
                db=self.db,
                user="PROF1",
            )
        self.assertEqual(erro.exception.status_code, 403)

    def test_salva_planejamento_e_comunicado_na_propria_turma(self):
        salvar_planejamento(
            self.aula.id,
            PlanejamentoInput(
                objetivos="Compreender o tema",
                conteudo="Introdução",
                tarefa="Leitura",
                anotacoes_privadas="Rever exemplos",
            ),
            db=self.db,
            user="PROF1",
        )
        criar_comunicado(
            self.vinculo.id,
            ComunicadoInput(
                titulo="Leitura da semana",
                mensagem="Ler o capítulo 1.",
                status="PUBLICADO",
            ),
            db=self.db,
            user="PROF1",
        )

        detalhe = detalhe_turma_professor(
            self.vinculo.id,
            db=self.db,
            user="PROF1",
        )
        self.assertEqual(
            detalhe["aulas"][0]["planejamento"]["tarefa"],
            "Leitura",
        )
        self.assertEqual(detalhe["comunicados"][0]["status"], "PUBLICADO")

        with self.assertRaises(HTTPException) as erro:
            salvar_planejamento(
                self.outra_aula.id,
                PlanejamentoInput(),
                db=self.db,
                user="PROF1",
            )
        self.assertEqual(erro.exception.status_code, 403)

    def test_chamada_do_professor_fica_restrita_as_proprias_aulas(self):
        chamada = abrir_chamada(
            self.turma.cod_tur,
            AbrirChamadaInput(aula_id=self.aula.id),
            db=self.db,
            user="PROF1",
        )
        visiveis = listar_chamadas(
            self.turma.cod_tur,
            limite=30,
            db=self.db,
            user="PROF1",
        )

        self.assertEqual([item["id"] for item in visiveis], [chamada["id"]])

        with self.assertRaises(HTTPException) as erro:
            abrir_chamada(
                self.turma.cod_tur,
                AbrirChamadaInput(aula_id=self.outra_aula.id),
                db=self.db,
                user="PROF1",
            )
        self.assertEqual(erro.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
