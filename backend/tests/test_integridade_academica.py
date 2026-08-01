import unittest
from datetime import date

from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    Aluno,
    AluNota,
    AluTurma,
    Aula,
    DocTurma,
    Materia,
    Professor,
    Turma,
)
from app.routers.alunos import AlunoInput
from app.routers.alunos import atualizar as atualizar_aluno
from app.routers.alunos import criar as criar_aluno
from app.routers.materias import excluir as excluir_materia
from app.routers.professores import excluir as excluir_professor
from app.routers.turmas import (
    DocTurmaInput,
    adicionar_materia,
    desmatricular,
    matricular,
    remover_materia,
)
from app.schema import atualizar_schema


class IntegridadeAcademicaTest(unittest.TestCase):
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

    def _turmas(self):
        diurno = Turma(nome="Diurno", qtalu=0)
        noturno = Turma(nome="Noturno", qtalu=0)
        self.db.add_all([diurno, noturno])
        self.db.commit()
        return diurno, noturno

    def test_criacao_e_edicao_sincronizam_as_duas_fontes_de_matricula(self):
        diurno, noturno = self._turmas()
        criado = criar_aluno(
            AlunoInput(nome="Aluno", cod_tur=diurno.cod_tur),
            db=self.db,
        )

        vinculo = self.db.scalar(
            select(AluTurma).where(AluTurma.cod_alu == criado["cod_alu"])
        )
        self.assertEqual(vinculo.cod_tur, diurno.cod_tur)
        self.assertEqual(diurno.qtalu, 1)

        atualizar_aluno(
            criado["cod_alu"],
            AlunoInput(nome="Aluno", cod_tur=noturno.cod_tur),
            db=self.db,
        )

        vinculos = list(
            self.db.scalars(
                select(AluTurma).where(AluTurma.cod_alu == criado["cod_alu"])
            )
        )
        self.assertEqual([vinculo.cod_tur for vinculo in vinculos], [noturno.cod_tur])
        self.assertEqual(diurno.qtalu, 0)
        self.assertEqual(noturno.qtalu, 1)

    def test_fluxos_da_turma_movem_e_removem_a_matricula_por_completo(self):
        diurno, noturno = self._turmas()
        aluno = Aluno(nome="Aluno")
        self.db.add(aluno)
        self.db.commit()

        matricular(diurno.cod_tur, aluno.cod_alu, db=self.db)
        matricular(noturno.cod_tur, aluno.cod_alu, db=self.db)

        self.assertEqual(aluno.cod_tur, noturno.cod_tur)
        self.assertEqual(
            self.db.scalar(
                select(func.count())
                .select_from(AluTurma)
                .where(AluTurma.cod_alu == aluno.cod_alu)
            ),
            1,
        )
        self.assertEqual(diurno.qtalu, 0)
        self.assertEqual(noturno.qtalu, 1)

        desmatricular(noturno.cod_tur, aluno.cod_alu, db=self.db)
        self.assertIsNone(aluno.cod_tur)
        self.assertEqual(noturno.qtalu, 0)

    def test_reparo_de_schema_completa_matricula_e_remove_professor_orfao(self):
        turma = Turma(nome="Noturno", qtalu=0)
        materia = Materia(NOME="Introdução")
        self.db.add_all([turma, materia])
        self.db.flush()
        aluno = Aluno(nome="Aluno", cod_tur=turma.cod_tur)
        self.db.add(aluno)
        self.db.flush()
        nota = AluNota(
            cod_alu=aluno.cod_alu,
            cod_mat=materia.cod_mat,
            cod_tur=turma.cod_tur,
            cod_pro=999,
        )
        self.db.add(nota)
        self.db.commit()

        atualizar_schema(self.engine)
        atualizar_schema(self.engine)
        self.db.expire_all()

        self.assertIsNotNone(
            self.db.scalar(
                select(AluTurma).where(
                    AluTurma.cod_alu == aluno.cod_alu,
                    AluTurma.cod_tur == turma.cod_tur,
                )
            )
        )
        self.assertEqual(self.db.get(Turma, turma.cod_tur).qtalu, 1)
        self.assertEqual(
            self.db.scalar(
                select(func.count())
                .select_from(AluTurma)
                .where(AluTurma.cod_alu == aluno.cod_alu)
            ),
            1,
        )
        self.assertIsNone(self.db.get(AluNota, nota.id).cod_pro)

    def test_referencias_invalidas_e_historico_sao_protegidos(self):
        turma = Turma(nome="Noturno", qtalu=0)
        materia = Materia(NOME="Introdução")
        professor = Professor(nome="Professor")
        self.db.add_all([turma, materia, professor])
        self.db.commit()

        with self.assertRaises(HTTPException) as erro:
            adicionar_materia(
                turma.cod_tur,
                DocTurmaInput(cod_mat=materia.cod_mat, cod_pro=999),
                db=self.db,
            )
        self.assertEqual(erro.exception.status_code, 404)
        self.db.rollback()

        vinculo = DocTurma(
            cod_tur=turma.cod_tur,
            cod_mat=materia.cod_mat,
            cod_pro=professor.cod_pro,
        )
        self.db.add(vinculo)
        self.db.flush()
        self.db.add(Aula(docturma_id=vinculo.id, data=date(2026, 8, 1)))
        self.db.commit()

        with self.assertRaises(HTTPException):
            remover_materia(turma.cod_tur, vinculo.id, db=self.db)
        self.db.rollback()
        with self.assertRaises(HTTPException):
            excluir_materia(materia.cod_mat, db=self.db)
        self.db.rollback()
        with self.assertRaises(HTTPException):
            excluir_professor(professor.cod_pro, db=self.db)

    def test_materia_aceita_professores_diferentes_mas_rejeita_vinculo_identico(self):
        turma = Turma(nome="Sabado", qtalu=0)
        materia = Materia(NOME="Teologia Sistemática II")
        primeiro = Professor(nome="Primeiro professor")
        segundo = Professor(nome="Segundo professor")
        self.db.add_all([turma, materia, primeiro, segundo])
        self.db.commit()

        periodo = {"Ano": "2026", "semestre": "2"}
        adicionar_materia(
            turma.cod_tur,
            DocTurmaInput(
                cod_mat=materia.cod_mat,
                cod_pro=primeiro.cod_pro,
                **periodo,
            ),
            db=self.db,
        )
        try:
            adicionar_materia(
                turma.cod_tur,
                DocTurmaInput(
                    cod_mat=materia.cod_mat,
                    cod_pro=segundo.cod_pro,
                    **periodo,
                ),
                db=self.db,
            )
        except HTTPException as erro:
            self.fail(
                "Professores diferentes deveriam ser aceitos para a mesma "
                f"matéria e período, mas a API retornou {erro.status_code}."
            )

        vinculos = list(
            self.db.scalars(
                select(DocTurma).where(
                    DocTurma.cod_tur == turma.cod_tur,
                    DocTurma.cod_mat == materia.cod_mat,
                )
            )
        )
        self.assertEqual(
            {vinculo.cod_pro for vinculo in vinculos},
            {primeiro.cod_pro, segundo.cod_pro},
        )

        with self.assertRaises(HTTPException) as erro:
            adicionar_materia(
                turma.cod_tur,
                DocTurmaInput(
                    cod_mat=materia.cod_mat,
                    cod_pro=primeiro.cod_pro,
                    **periodo,
                ),
                db=self.db,
            )
        self.assertEqual(erro.exception.status_code, 400)
