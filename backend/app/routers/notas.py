"""Lançamento de notas e faltas (tabela alunota, o histórico oficial)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db, row_to_dict
from ..models import (
    Aluno,
    AluNota,
    AluTurma,
    DocTurma,
    Materia,
    Professor,
    Turma,
)

router = APIRouter(prefix="/notas", tags=["notas"])


class NotaInput(BaseModel):
    """Lançamento individual de nota para um aluno."""

    cod_mat: int
    nota: float | None = None
    falta: int | None = None
    ano: str | None = None
    semestre: str | None = None
    cursou: str | None = "S"
    dispensa: str | None = None
    cod_pro: int | None = None
    cod_tur: int | None = None


class LancamentoAluno(BaseModel):
    cod_alu: int
    nota: float | None = None
    falta: int | None = None
    dispensa: str | None = None
    cursou: str | None = "S"


class LancamentoInput(BaseModel):
    cod_tur: int
    cod_mat: int
    cod_pro: int | None = None
    ano: str | None = None
    semestre: str | None = None
    alunos: list[LancamentoAluno]


def _validar_referencias_nota(db: Session, dados: NotaInput) -> None:
    if not db.get(Materia, dados.cod_mat):
        raise HTTPException(404, "Matéria não encontrada")
    if dados.cod_tur is not None and not db.get(Turma, dados.cod_tur):
        raise HTTPException(404, "Turma não encontrada")
    if dados.cod_pro is not None and not db.get(Professor, dados.cod_pro):
        raise HTTPException(404, "Professor não encontrado")


@router.get("/turma/{cod_tur}/materia/{cod_mat}")
def grade_lancamento(cod_tur: int, cod_mat: int, db: Session = Depends(get_db)):
    """Alunos da turma com a nota já lançada (se houver) nessa matéria."""
    docturma = db.scalar(
        select(DocTurma).where(DocTurma.cod_tur == cod_tur, DocTurma.cod_mat == cod_mat)
    )
    alunos = list(
        db.execute(
            select(Aluno.cod_alu, Aluno.nome)
            .join(AluTurma, AluTurma.cod_alu == Aluno.cod_alu)
            .where(AluTurma.cod_tur == cod_tur)
            .order_by(Aluno.nome)
        )
    )
    notas = {
        n.cod_alu: n
        for n in db.scalars(
            select(AluNota).where(
                AluNota.cod_tur == cod_tur, AluNota.cod_mat == cod_mat
            )
        )
    }
    linhas = []
    for cod_alu, nome in alunos:
        n = notas.get(cod_alu)
        linhas.append(
            {
                "cod_alu": cod_alu,
                "nome": nome,
                "nota": float(n.nota) if n and n.nota is not None else None,
                "falta": n.falta if n else None,
                "dispensa": n.dispensa if n else None,
                "cursou": n.cursou if n else None,
                "ja_lancado": n is not None,
            }
        )
    return {
        "docturma": row_to_dict(docturma) if docturma else None,
        "alunos": linhas,
    }


@router.post("/lancar")
def lancar(dados: LancamentoInput, db: Session = Depends(get_db)):
    """Upsert das notas da turma+matéria para os alunos informados."""
    if not db.get(Turma, dados.cod_tur):
        raise HTTPException(404, "Turma não encontrada")
    if not db.get(Materia, dados.cod_mat):
        raise HTTPException(404, "Matéria não encontrada")
    if not db.scalar(
        select(DocTurma).where(
            DocTurma.cod_tur == dados.cod_tur,
            DocTurma.cod_mat == dados.cod_mat,
        )
    ):
        raise HTTPException(404, "Matéria não está vinculada a esta turma")
    if dados.cod_pro is not None and not db.get(Professor, dados.cod_pro):
        raise HTTPException(404, "Professor não encontrado")
    codigos_alunos = [item.cod_alu for item in dados.alunos]
    if len(codigos_alunos) != len(set(codigos_alunos)):
        raise HTTPException(400, "A lista contém alunos repetidos")
    matriculados = set(
        db.scalars(
            select(AluTurma.cod_alu).where(
                AluTurma.cod_tur == dados.cod_tur,
                AluTurma.cod_alu.in_(codigos_alunos),
            )
        )
    ) if codigos_alunos else set()
    nao_matriculados = sorted(set(codigos_alunos) - matriculados)
    if nao_matriculados:
        raise HTTPException(
            400,
            "Aluno(s) não matriculado(s) na turma: "
            + ", ".join(map(str, nao_matriculados)),
        )
    existentes = {
        registro.cod_alu: registro
        for registro in db.scalars(
            select(AluNota).where(
                AluNota.cod_tur == dados.cod_tur,
                AluNota.cod_mat == dados.cod_mat,
                AluNota.cod_alu.in_(codigos_alunos),
            )
        )
    } if codigos_alunos else {}
    atualizados = criados = 0
    for lanc in dados.alunos:
        registro = existentes.get(lanc.cod_alu)
        if registro:
            atualizados += 1
        else:
            registro = AluNota(
                cod_alu=lanc.cod_alu, cod_mat=dados.cod_mat, cod_tur=dados.cod_tur
            )
            db.add(registro)
            criados += 1
        registro.nota = lanc.nota
        registro.falta = lanc.falta
        registro.dispensa = lanc.dispensa
        registro.cursou = lanc.cursou
        registro.cod_pro = dados.cod_pro
        registro.ano = dados.ano
        registro.semestre = dados.semestre
        registro.status = "L"
    db.commit()
    return {"ok": True, "criados": criados, "atualizados": atualizados}


@router.get("/aluno/{cod_alu}")
def notas_do_aluno(cod_alu: int, db: Session = Depends(get_db)):
    """Todas as notas do aluno (usado na tela do aluno e no boletim)."""
    aluno = db.get(Aluno, cod_alu)
    if not aluno:
        raise HTTPException(404, "Aluno não encontrado")
    q = (
        select(AluNota, Materia.NOME, Professor.nome)
        .join(Materia, Materia.cod_mat == AluNota.cod_mat, isouter=True)
        .join(Professor, Professor.cod_pro == AluNota.cod_pro, isouter=True)
        .where(AluNota.cod_alu == cod_alu)
        .order_by(AluNota.ano, AluNota.semestre, Materia.NOME)
    )
    out = []
    for nota, materia_nome, professor_nome in db.execute(q):
        d = row_to_dict(nota)
        d["materia_nome"] = materia_nome.strip() if materia_nome else None
        d["professor_nome"] = professor_nome
        out.append(d)
    return {"aluno": {"cod_alu": aluno.cod_alu, "nome": aluno.nome}, "notas": out}


@router.post("/aluno/{cod_alu}")
def adicionar_nota(cod_alu: int, dados: NotaInput, db: Session = Depends(get_db)):
    """Adiciona um lançamento de nota direto para o aluno."""
    aluno = db.get(Aluno, cod_alu)
    if not aluno:
        raise HTTPException(404, "Aluno não encontrado")
    _validar_referencias_nota(db, dados)
    registro = AluNota(
        cod_alu=cod_alu,
        status="L",
        cod_tur=dados.cod_tur if dados.cod_tur is not None else aluno.cod_tur,
        **dados.model_dump(exclude={"cod_tur"}),
    )
    db.add(registro)
    db.commit()
    db.refresh(registro)
    return row_to_dict(registro)


@router.put("/{alunota_id}")
def atualizar_nota(alunota_id: int, dados: NotaInput, db: Session = Depends(get_db)):
    registro = db.get(AluNota, alunota_id)
    if not registro:
        raise HTTPException(404, "Lançamento não encontrado")
    _validar_referencias_nota(db, dados)
    for k, v in dados.model_dump().items():
        setattr(registro, k, v)
    db.commit()
    return row_to_dict(registro)


@router.delete("/{alunota_id}")
def excluir_lancamento(alunota_id: int, db: Session = Depends(get_db)):
    registro = db.get(AluNota, alunota_id)
    if not registro:
        raise HTTPException(404, "Lançamento não encontrado")
    db.delete(registro)
    db.commit()
    return {"ok": True}
