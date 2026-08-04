import unittest
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Aluno, AluNota, AluTurma, DocTurma, Materia, Turma
from app.routers.notas import (
    AtividadeInput,
    ConfiguracaoAtividadesInput,
    LancamentoAluno,
    LancamentoInput,
    NotaAtividadeInput,
    configurar_atividades,
    grade_por_vinculo,
    lancar,
)


class NotasAtividadesTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()

        turma = Turma(nome="Turma")
        materia = Materia(NOME="Introdução")
        aluno = Aluno(nome="Aluno")
        self.db.add_all([turma, materia, aluno])
        self.db.flush()
        self.vinculo = DocTurma(
            cod_tur=turma.cod_tur,
            cod_mat=materia.cod_mat,
            Ano="2026",
            semestre="2",
        )
        self.db.add(self.vinculo)
        self.db.add(AluTurma(cod_tur=turma.cod_tur, cod_alu=aluno.cod_alu))
        self.db.commit()
        self.aluno = aluno

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _configurar(self):
        return configurar_atividades(
            self.vinculo.id,
            ConfiguracaoAtividadesInput(
                atividades=[
                    AtividadeInput(
                        tipo="LEITURA",
                        nome="Leitura 1",
                        valor_maximo=Decimal("2"),
                    ),
                    AtividadeInput(
                        tipo="LEITURA",
                        nome="Leitura 2",
                        valor_maximo=Decimal("1"),
                    ),
                    AtividadeInput(
                        tipo="PROVA",
                        nome="Prova final",
                        valor_maximo=Decimal("7"),
                    ),
                ]
            ),
            db=self.db,
            user="",
        )

    def test_aceita_atividades_repetidas_sem_exigir_os_tres_tipos(self):
        resposta = self._configurar()

        self.assertEqual(resposta["total"], 10.0)
        self.assertEqual(
            [item["tipo"] for item in resposta["atividades"]],
            ["LEITURA", "LEITURA", "PROVA"],
        )

    def test_rejeita_configuracao_que_ultrapassa_dez_pontos(self):
        with self.assertRaises(HTTPException) as erro:
            configurar_atividades(
                self.vinculo.id,
                ConfiguracaoAtividadesInput(
                    atividades=[
                        AtividadeInput(
                            tipo="TRABALHO",
                            nome="Trabalho",
                            valor_maximo=Decimal("4.01"),
                        ),
                        AtividadeInput(
                            tipo="PROVA",
                            nome="Prova",
                            valor_maximo=Decimal("6"),
                        ),
                    ]
                ),
                db=self.db,
                user="",
            )

        self.assertEqual(erro.exception.status_code, 400)
        self.assertIn("ultrapassar 10", erro.exception.detail)

    def test_soma_notas_parciais_na_nota_oficial(self):
        configuracao = self._configurar()
        atividades = configuracao["atividades"]

        lancar(
            LancamentoInput(
                docturma_id=self.vinculo.id,
                alunos=[
                    LancamentoAluno(
                        cod_alu=self.aluno.cod_alu,
                        notas_atividades=[
                            NotaAtividadeInput(
                                atividade_id=atividades[0]["id"],
                                nota=Decimal("1.5"),
                            ),
                            NotaAtividadeInput(
                                atividade_id=atividades[1]["id"],
                                nota=Decimal("0.75"),
                            ),
                            NotaAtividadeInput(
                                atividade_id=atividades[2]["id"],
                                nota=Decimal("6.25"),
                            ),
                        ],
                    )
                ],
            ),
            db=self.db,
            user="",
        )

        nota = self.db.query(AluNota).one()
        self.assertEqual(nota.nota, Decimal("8.50"))
        grade = grade_por_vinculo(self.vinculo.id, db=self.db, user="")
        self.assertEqual(grade["alunos"][0]["nota"], 8.5)
        self.assertEqual(len(grade["alunos"][0]["notas_atividades"]), 3)

    def test_rejeita_nota_acima_do_valor_da_atividade(self):
        atividade = self._configurar()["atividades"][0]

        with self.assertRaises(HTTPException) as erro:
            lancar(
                LancamentoInput(
                    docturma_id=self.vinculo.id,
                    alunos=[
                        LancamentoAluno(
                            cod_alu=self.aluno.cod_alu,
                            notas_atividades=[
                                NotaAtividadeInput(
                                    atividade_id=atividade["id"],
                                    nota=Decimal("2.01"),
                                )
                            ],
                        )
                    ],
                ),
                db=self.db,
                user="",
            )

        self.assertEqual(erro.exception.status_code, 400)
        self.assertIn("Leitura 1", erro.exception.detail)

    def test_nao_reduz_valor_maximo_abaixo_de_nota_ja_lancada(self):
        configuracao = self._configurar()
        atividade = configuracao["atividades"][0]
        lancar(
            LancamentoInput(
                docturma_id=self.vinculo.id,
                alunos=[
                    LancamentoAluno(
                        cod_alu=self.aluno.cod_alu,
                        notas_atividades=[
                            NotaAtividadeInput(
                                atividade_id=atividade["id"],
                                nota=Decimal("1.5"),
                            )
                        ],
                    )
                ],
            ),
            db=self.db,
            user="",
        )

        with self.assertRaises(HTTPException) as erro:
            configurar_atividades(
                self.vinculo.id,
                ConfiguracaoAtividadesInput(
                    atividades=[
                        AtividadeInput(
                            id=item["id"],
                            tipo=item["tipo"],
                            nome=item["nome"],
                            valor_maximo=(
                                Decimal("1")
                                if item["id"] == atividade["id"]
                                else Decimal(str(item["valor_maximo"]))
                            ),
                        )
                        for item in configuracao["atividades"]
                    ]
                ),
                db=self.db,
                user="",
            )

        self.assertEqual(erro.exception.status_code, 400)
        self.assertIn("nota lançada", erro.exception.detail)

    def test_remover_atividade_recalcula_a_nota_final(self):
        configuracao = self._configurar()
        atividades = configuracao["atividades"]
        lancar(
            LancamentoInput(
                docturma_id=self.vinculo.id,
                alunos=[
                    LancamentoAluno(
                        cod_alu=self.aluno.cod_alu,
                        notas_atividades=[
                            NotaAtividadeInput(
                                atividade_id=item["id"],
                                nota=Decimal("1") if indice < 2 else Decimal("5"),
                            )
                            for indice, item in enumerate(atividades)
                        ],
                    )
                ],
            ),
            db=self.db,
            user="",
        )

        configurar_atividades(
            self.vinculo.id,
            ConfiguracaoAtividadesInput(
                atividades=[
                    AtividadeInput(
                        id=item["id"],
                        tipo=item["tipo"],
                        nome=item["nome"],
                        valor_maximo=Decimal(str(item["valor_maximo"])),
                    )
                    for item in atividades[:2]
                ]
            ),
            db=self.db,
            user="",
        )

        self.db.expire_all()
        self.assertEqual(self.db.query(AluNota).one().nota, Decimal("2.00"))


if __name__ == "__main__":
    unittest.main()
