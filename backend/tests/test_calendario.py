import unittest
from datetime import date, datetime, time

from fastapi import HTTPException
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Aula, CalendarioPublico, Chamada, DocTurma, Materia, Professor, Turma
from app.routers.calendario import (
    AulaInput,
    CompartilhamentoInput,
    calendario_publico,
    criar_aulas,
    criar_compartilhamento,
    excluir_aula,
    renovar_compartilhamento,
)
from tests import criar_engine_de_teste


class CalendarioPublicoTest(unittest.TestCase):
    def setUp(self):
        self.engine = criar_engine_de_teste()
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
                cod_tur=noturno.cod_tur,
                ativo="S",
                criado_em=datetime(2026, 8, 1),
            ),
            # Link antigo, anterior à amarração por turma: não vale mais.
            CalendarioPublico(
                token="link-global-antigo",
                ativo="S",
                criado_em=datetime(2026, 8, 1),
            ),
        ])
        self.db.commit()
        self.noturno = noturno
        self.sabado = sabado

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_link_de_turma_retorna_apenas_a_agenda_escolhida(self):
        resposta = calendario_publico(
            token="link-publico",
            inicio=date(2026, 8, 1),
            fim=date(2026, 8, 31),
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

    def test_link_global_antigo_nao_expoe_a_agenda_inteira(self):
        with self.assertRaises(HTTPException) as erro:
            calendario_publico(
                token="link-global-antigo",
                inicio=date(2026, 8, 1),
                fim=date(2026, 8, 31),
                db=self.db,
            )
        self.assertEqual(erro.exception.status_code, 404)

    def test_token_desconhecido_retorna_404(self):
        with self.assertRaises(HTTPException) as erro:
            calendario_publico(token="nao-existe", db=self.db)
        self.assertEqual(erro.exception.status_code, 404)

    def test_link_e_criado_por_turma(self):
        primeiro = criar_compartilhamento(CompartilhamentoInput(cod_tur=self.sabado.cod_tur), db=self.db)
        repetido = criar_compartilhamento(CompartilhamentoInput(cod_tur=self.sabado.cod_tur), db=self.db)
        self.assertEqual(primeiro["token"], repetido["token"])
        self.assertNotEqual(primeiro["token"], "link-publico")

        resposta = calendario_publico(
            token=primeiro["token"], inicio=date(2026, 8, 1), fim=date(2026, 8, 31), db=self.db
        )
        self.assertEqual([a["turma_nome"] for a in resposta["aulas"]], ["Sábado"])

        renovado = renovar_compartilhamento(CompartilhamentoInput(cod_tur=self.sabado.cod_tur), db=self.db)
        self.assertNotEqual(renovado["token"], primeiro["token"])
        with self.assertRaises(HTTPException):
            calendario_publico(token=primeiro["token"], db=self.db)
        # Renovar a turma de sábado não derruba o link da turma noturna.
        calendario_publico(token="link-publico", db=self.db)


class AulasTest(unittest.TestCase):
    def setUp(self):
        self.engine = criar_engine_de_teste()
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()
        turma = Turma(nome="T")
        materia = Materia(NOME="M")
        self.db.add_all([turma, materia])
        self.db.flush()
        self.vinculo = DocTurma(cod_tur=turma.cod_tur, cod_mat=materia.cod_mat)
        self.db.add(self.vinculo)
        self.db.commit()
        self.turma = turma

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_repeticao_tem_teto(self):
        with self.assertRaises(ValueError):
            AulaInput(docturma_id=self.vinculo.id, data=date(2026, 1, 1), repetir_ate=date(2126, 1, 1))
        resultado = criar_aulas(
            AulaInput(docturma_id=self.vinculo.id, data=date(2026, 1, 5), repetir_ate=date(2026, 2, 2)),
            db=self.db,
        )
        self.assertEqual(resultado, {"ok": True, "criadas": 5, "ignoradas": 0})
        repetido = criar_aulas(
            AulaInput(docturma_id=self.vinculo.id, data=date(2026, 1, 5), repetir_ate=date(2026, 1, 19)),
            db=self.db,
        )
        self.assertEqual(repetido, {"ok": True, "criadas": 0, "ignoradas": 3})

    def test_aula_com_chamada_nao_pode_ser_excluida(self):
        aula = Aula(docturma_id=self.vinculo.id, data=date(2026, 3, 2), status="AGENDADA")
        self.db.add(aula)
        self.db.flush()
        self.db.add(
            Chamada(
                cod_tur=self.turma.cod_tur,
                aula_id=aula.id,
                data=aula.data,
                token="tok",
                status="ENCERRADA",
                aberta_em=datetime(2026, 3, 2, 22, 0),
            )
        )
        self.db.commit()
        with self.assertRaises(HTTPException) as erro:
            excluir_aula(aula.id, db=self.db)
        self.assertEqual(erro.exception.status_code, 400)
        self.assertIn("chamada", erro.exception.detail)
        self.assertIsNotNone(self.db.get(Aula, aula.id))

        solta = Aula(docturma_id=self.vinculo.id, data=date(2026, 3, 9), status="AGENDADA")
        self.db.add(solta)
        self.db.commit()
        self.assertEqual(excluir_aula(solta.id, db=self.db), {"ok": True})


if __name__ == "__main__":
    unittest.main()
