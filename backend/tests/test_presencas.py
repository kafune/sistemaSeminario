import unittest
from datetime import date, datetime
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Aluno, AluTurma, Presenca, Turma
from app.routers import presencas


class PresencasTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()
        self.turma = Turma(nome="Teologia — Noturno", curso="Teologia")
        self.ana = Aluno(nome="Ana Souza")
        self.bruno = Aluno(nome="Bruno Lima")
        self.db.add_all([self.turma, self.ana, self.bruno])
        self.db.flush()
        self.db.add_all([
            AluTurma(cod_tur=self.turma.cod_tur, cod_alu=self.ana.cod_alu, status="A"),
            AluTurma(cod_tur=self.turma.cod_tur, cod_alu=self.bruno.cod_alu, status="A"),
        ])
        self.db.commit()
        self.hoje = date(2026, 8, 2)
        self.agora = datetime(2026, 8, 2, 22, 15)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def abrir(self):
        with (
            patch.object(presencas, "_hoje_local", return_value=self.hoje),
            patch.object(presencas, "_agora_utc", return_value=self.agora),
        ):
            return presencas.abrir_chamada(self.turma.cod_tur, db=self.db)

    def test_abertura_cria_retrato_dos_matriculados(self):
        chamada = self.abrir()

        self.assertEqual(chamada["status"], "ABERTA")
        self.assertEqual(chamada["total"], 2)
        self.assertEqual(chamada["presentes"], 0)
        self.assertEqual([item["nome"] for item in chamada["alunos"]], ["Ana Souza", "Bruno Lima"])

    def test_aluno_marca_uma_unica_vez(self):
        chamada = self.abrir()
        with (
            patch.object(presencas, "_hoje_local", return_value=self.hoje),
            patch.object(presencas, "_agora_utc", return_value=self.agora),
        ):
            primeira = presencas.marcar_presenca(
                chamada["token"],
                presencas.MarcarPresencaInput(cod_alu=self.ana.cod_alu),
                db=self.db,
            )
            repetida = presencas.marcar_presenca(
                chamada["token"],
                presencas.MarcarPresencaInput(cod_alu=self.ana.cod_alu),
                db=self.db,
            )

        self.assertTrue(primeira["ok"])
        self.assertEqual(primeira["registrado_em"], repetida["registrado_em"])
        self.assertEqual(
            self.db.query(Presenca).filter(Presenca.registrado_em.is_not(None)).count(),
            1,
        )

    def test_chamada_encerrada_recusa_novas_presencas(self):
        chamada = self.abrir()
        with patch.object(presencas, "_agora_utc", return_value=self.agora):
            presencas.encerrar_chamada(self.turma.cod_tur, chamada["id"], db=self.db)

        with (
            patch.object(presencas, "_hoje_local", return_value=self.hoje),
            self.assertRaises(HTTPException) as erro,
        ):
            presencas.obter_chamada_publica(chamada["token"], db=self.db)

        self.assertEqual(erro.exception.status_code, 410)

    def test_reabrir_no_mesmo_dia_preserva_presencas_e_inclui_novo_aluno(self):
        primeira = self.abrir()
        carla = Aluno(nome="Carla Reis")
        self.db.add(carla)
        self.db.flush()
        self.db.add(AluTurma(cod_tur=self.turma.cod_tur, cod_alu=carla.cod_alu, status="A"))
        self.db.commit()

        segunda = self.abrir()

        self.assertEqual(segunda["id"], primeira["id"])
        self.assertEqual(segunda["token"], primeira["token"])
        self.assertEqual(segunda["total"], 3)


if __name__ == "__main__":
    unittest.main()
