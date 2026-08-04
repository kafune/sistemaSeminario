import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Aluno, AluTurma, DocTurma, Materia, Professor, Turma, Usuario
from app.routers.notas import grade_por_vinculo, opcoes_lancamento
from app.routers.professores import (
    CriarAcessoProfessorInput,
    concluir_acesso_professor,
    criar_convite_acesso,
)


class AcessoProfessorTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()

        self.turma = Turma(nome="Turma")
        self.materia = Materia(NOME="Introdução")
        self.professor = Professor(nome="Professor", e_mail="professor@tov.test")
        self.outro = Professor(nome="Outro")
        self.aluno = Aluno(nome="Aluno")
        self.db.add_all([
            self.turma,
            self.materia,
            self.professor,
            self.outro,
            self.aluno,
        ])
        self.db.flush()
        self.vinculo = DocTurma(
            cod_tur=self.turma.cod_tur,
            cod_mat=self.materia.cod_mat,
            cod_pro=self.professor.cod_pro,
        )
        self.vinculo_outro = DocTurma(
            cod_tur=self.turma.cod_tur,
            cod_mat=self.materia.cod_mat,
            cod_pro=self.outro.cod_pro,
        )
        self.db.add_all([self.vinculo, self.vinculo_outro])
        self.db.add(AluTurma(cod_tur=self.turma.cod_tur, cod_alu=self.aluno.cod_alu))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_convite_cria_usuario_vinculado_e_restrito(self):
        convite = criar_convite_acesso(self.professor.cod_pro, db=self.db)
        concluir_acesso_professor(
            convite["token"],
            CriarAcessoProfessorInput(user="DOCENTE", senha="segredo123"),
            db=self.db,
        )

        usuario = self.db.get(Usuario, "DOCENTE")
        self.assertEqual(usuario.perfil, "PROFESSOR")
        self.assertEqual(usuario.cod_pro, self.professor.cod_pro)

        opcoes = opcoes_lancamento(db=self.db, user=usuario.user)
        self.assertEqual([item["id"] for item in opcoes["vinculos"]], [self.vinculo.id])

        with self.assertRaises(HTTPException) as erro:
            grade_por_vinculo(self.vinculo_outro.id, db=self.db, user=usuario.user)
        self.assertEqual(erro.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
