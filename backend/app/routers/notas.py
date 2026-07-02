"""Lançamento de notas e faltas (tabela alunota, o histórico oficial)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db, row_to_dict
from ..models import Aluno, AluNota, AluTurma, DocTurma, Materia, Professor

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
    creditos: int | None = None
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
    creditos: int | None = None
    alunos: list[LancamentoAluno]


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
    materia = db.get(Materia, dados.cod_mat)
    if not materia:
        raise HTTPException(404, "Matéria não encontrada")
    atualizados = criados = 0
    for lanc in dados.alunos:
        registro = db.scalar(
            select(AluNota).where(
                AluNota.cod_tur == dados.cod_tur,
                AluNota.cod_mat == dados.cod_mat,
                AluNota.cod_alu == lanc.cod_alu,
            )
        )
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
        registro.creditos = dados.creditos
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
    if not db.get(Materia, dados.cod_mat):
        raise HTTPException(404, "Matéria não encontrada")
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
