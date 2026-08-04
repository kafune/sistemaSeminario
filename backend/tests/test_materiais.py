import asyncio
import unittest
from datetime import date
from io import BytesIO

from fastapi import HTTPException, UploadFile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.datastructures import Headers

from app.database import Base
from app.models import (
    Aula,
    DocTurma,
    Materia,
    MaterialDidatico,
    Professor,
    Turma,
    Usuario,
)
from app.routers.calendario import excluir_aula
from app.routers.materiais import (
    anexar_material,
    baixar_material,
    listar_materiais,
    opcoes_materiais,
)


class MateriaisDidaticosTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, expire_on_commit=False)()

        turma = Turma(nome="Turma A")
        materia = Materia(NOME="Introdução")
        outra_materia = Materia(NOME="História")
        professor = Professor(nome="Professor")
        outro_professor = Professor(nome="Outro")
        self.db.add_all(
            [turma, materia, outra_materia, professor, outro_professor]
        )
        self.db.flush()
        self.vinculo = DocTurma(
            cod_tur=turma.cod_tur,
            cod_mat=materia.cod_mat,
            cod_pro=professor.cod_pro,
        )
        self.outro_vinculo = DocTurma(
            cod_tur=turma.cod_tur,
            cod_mat=outra_materia.cod_mat,
            cod_pro=outro_professor.cod_pro,
        )
        self.db.add_all([self.vinculo, self.outro_vinculo])
        self.db.flush()
        self.aula = Aula(
            docturma_id=self.vinculo.id,
            data=date(2026, 8, 10),
            tema="Apresentação",
        )
        self.outra_aula = Aula(
            docturma_id=self.outro_vinculo.id,
            data=date(2026, 8, 11),
        )
        self.db.add_all([self.aula, self.outra_aula])
        self.db.add_all(
            [
                Usuario(
                    user="PROF1",
                    senha_hash="x",
                    perfil="PROFESSOR",
                    cod_pro=professor.cod_pro,
                ),
                Usuario(
                    user="PROF2",
                    senha_hash="x",
                    perfil="PROFESSOR",
                    cod_pro=outro_professor.cod_pro,
                ),
            ]
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    @staticmethod
    def _arquivo(conteudo=b"%PDF-material", mime="application/pdf"):
        return UploadFile(
            file=BytesIO(conteudo),
            filename="apoio.pdf",
            headers=Headers({"content-type": mime}),
        )

    def _anexar(self, *, aula_id=None, user="PROF1"):
        return asyncio.run(
            anexar_material(
                docturma_id=self.vinculo.id,
                aula_id=aula_id,
                titulo="Material de apoio",
                descricao="Leitura complementar",
                arquivo=self._arquivo(),
                db=self.db,
                user=user,
            )
        )

    def test_professor_ve_somente_as_proprias_materias_e_aulas(self):
        opcoes = opcoes_materiais(db=self.db, user="PROF1")

        self.assertEqual(
            [item["docturma_id"] for item in opcoes["vinculos"]],
            [self.vinculo.id],
        )
        self.assertEqual([item["id"] for item in opcoes["aulas"]], [self.aula.id])

    def test_anexa_na_materia_ou_em_aula_especifica_e_permite_download(self):
        geral = self._anexar()
        especifico = self._anexar(aula_id=self.aula.id)

        materiais = listar_materiais(
            docturma_id=self.vinculo.id,
            db=self.db,
            user="PROF1",
        )
        self.assertEqual({item["id"] for item in materiais}, {geral["id"], especifico["id"]})
        por_id = {item["id"]: item for item in materiais}
        self.assertIsNone(por_id[geral["id"]]["aula"])
        self.assertEqual(
            por_id[especifico["id"]]["aula"]["tema"],
            "Apresentação",
        )

        resposta = baixar_material(geral["id"], db=self.db, user="PROF1")
        self.assertEqual(resposta.body, b"%PDF-material")
        self.assertEqual(resposta.media_type, "application/pdf")

    def test_bloqueia_vinculo_de_outro_professor_e_aula_incompativel(self):
        with self.assertRaises(HTTPException) as erro:
            asyncio.run(
                anexar_material(
                    docturma_id=self.vinculo.id,
                    aula_id=None,
                    titulo="Sem acesso",
                    descricao=None,
                    arquivo=self._arquivo(),
                    db=self.db,
                    user="PROF2",
                )
            )
        self.assertEqual(erro.exception.status_code, 403)

        with self.assertRaises(HTTPException) as erro:
            asyncio.run(
                anexar_material(
                    docturma_id=self.vinculo.id,
                    aula_id=self.outra_aula.id,
                    titulo="Aula errada",
                    descricao=None,
                    arquivo=self._arquivo(),
                    db=self.db,
                    user="PROF1",
                )
            )
        self.assertEqual(erro.exception.status_code, 400)

    def test_excluir_aula_mantem_material_na_biblioteca_da_materia(self):
        material_id = self._anexar(aula_id=self.aula.id)["id"]

        excluir_aula(self.aula.id, db=self.db)
        self.db.expire_all()

        material = self.db.get(MaterialDidatico, material_id)
        self.assertIsNone(material.aula_id)
        self.assertEqual(material.docturma_id, self.vinculo.id)


if __name__ == "__main__":
    unittest.main()
