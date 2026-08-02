import unittest
from datetime import date, datetime, time

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Aula, CalendarioPublico, DocTurma, Materia, Professor, Turma
from app.routers.calendario import calendario_publico


class CalendarioPublicoTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()

        noturno = Turma(nome="Noturno")
        sabado = Turma(nome="Sábado")
        materia = Materia(NOME="Hermenêutica")
        professor = Professor(nome="Professor TOV")
        self.db.add_all([noturno, sabado, materia, professor])
        self.db.flush()

        vinculo_noturno = DocTurma(
            cod_tur=noturno.cod_tur,
            cod_mat=materia.cod_mat,
            cod_pro=professor.cod_pro,
        )
        vinculo_sabado = DocTurma(
            cod_tur=sabado.cod_tur,
            cod_mat=materia.cod_mat,
            cod_pro=professor.cod_pro,
        )
        self.db.add_all([vinculo_noturno, vinculo_sabado])
        self.db.flush()
        self.db.add_all([
            Aula(
                docturma_id=vinculo_noturno.id,
                data=date(2026, 8, 3),
                hora_inicio=time(19, 15),
            ),
            Aula(
                docturma_id=vinculo_sabado.id,
                data=date(2026, 8, 8),
                hora_inicio=time(9, 0),
            ),
            CalendarioPublico(
                token="link-publico",
                ativo="S",
                criado_em=datetime(2026, 8, 1),
            ),
        ])
        self.db.commit()
        self.noturno = noturno

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_link_de_turma_retorna_apenas_a_agenda_escolhida(self):
        resposta = calendario_publico(
            token="link-publico",
            inicio=date(2026, 8, 1),
            fim=date(2026, 8, 31),
            cod_tur=self.noturno.cod_tur,
            db=self.db,
        )

        self.assertEqual(resposta["turma"], {
            "cod_tur": self.noturno.cod_tur,
            "nome": "Noturno",
        })
        self.assertEqual(len(resposta["aulas"]), 1)
        self.assertEqual(resposta["aulas"][0]["turma_nome"], "Noturno")
        self.assertNotIn("observacao", resposta["aulas"][0])
        self.assertNotIn("docturma_id", resposta["aulas"][0])

    def test_link_de_turma_inexistente_retorna_404(self):
        with self.assertRaises(HTTPException) as erro:
            calendario_publico(
                token="link-publico",
                inicio=date(2026, 8, 1),
                fim=date(2026, 8, 31),
                cod_tur=999,
                db=self.db,
            )

        self.assertEqual(erro.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
