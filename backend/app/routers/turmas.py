from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db, row_to_dict
from ..models import (
    Aluno,
    AluTurma,
    Curso,
    DocTurma,
    Grade,
    Horario,
    Materia,
    Professor,
    Turma,
)

router = APIRouter(prefix="/turmas", tags=["turmas"])


class TurmaInput(BaseModel):
    nome: str
    cod_cur: int | None = None
    dat_ini: date | None = None
    cod_gra: int | None = None
    cod_hor: int | None = None


class DocTurmaInput(BaseModel):
    cod_mat: int
    cod_pro: int | None = None
    dat_ini: date | None = None
    dat_fim: date | None = None
    Ano: str | None = None
    semestre: str | None = None


def _turma_dict(db: Session, turma: Turma) -> dict:
    d = row_to_dict(turma)
    curso = db.get(Curso, turma.cod_cur) if turma.cod_cur else None
    grade = db.get(Grade, turma.cod_gra) if turma.cod_gra else None
    horario = db.get(Horario, turma.cod_hor) if turma.cod_hor else None
    d["curso_nome"] = curso.nome if curso else None
    d["grade_nome"] = grade.nome if grade else None
    d["horario_nome"] = horario.nome if horario else None
    d["qtd_alunos"] = db.scalar(
        select(func.count()).select_from(AluTurma).where(AluTurma.cod_tur == turma.cod_tur)
    )
    return d


@router.get("")
def listar(db: Session = Depends(get_db)):
    return [_turma_dict(db, t) for t in db.scalars(select(Turma).order_by(Turma.nome))]


@router.get("/{cod_tur}")
def obter(cod_tur: int, db: Session = Depends(get_db)):
    turma = db.get(Turma, cod_tur)
    if not turma:
        raise HTTPException(404, "Turma não encontrada")
    return _turma_dict(db, turma)


@router.post("")
def criar(dados: TurmaInput, db: Session = Depends(get_db)):
    turma = Turma(**dados.model_dump(), qtalu=0)
    db.add(turma)
    db.commit()
    db.refresh(turma)
    return row_to_dict(turma)


@router.put("/{cod_tur}")
def atualizar(cod_tur: int, dados: TurmaInput, db: Session = Depends(get_db)):
    turma = db.get(Turma, cod_tur)
    if not turma:
        raise HTTPException(404, "Turma não encontrada")
    for k, v in dados.model_dump().items():
        setattr(turma, k, v)
    db.commit()
    return row_to_dict(turma)


@router.delete("/{cod_tur}")
def excluir(cod_tur: int, db: Session = Depends(get_db)):
    turma = db.get(Turma, cod_tur)
    if not turma:
        raise HTTPException(404, "Turma não encontrada")
    tem_alunos = db.scalar(
        select(func.count()).select_from(AluTurma).where(AluTurma.cod_tur == cod_tur)
    )
    if tem_alunos:
        raise HTTPException(400, "Turma possui alunos matriculados; remova-os antes.")
    db.execute(DocTurma.__table__.delete().where(DocTurma.cod_tur == cod_tur))
    db.delete(turma)
    db.commit()
    return {"ok": True}


# ---- alunos da turma -------------------------------------------------------

@router.get("/{cod_tur}/alunos")
def alunos_da_turma(cod_tur: int, db: Session = Depends(get_db)):
    q = (
        select(AluTurma, Aluno)
        .join(Aluno, Aluno.cod_alu == AluTurma.cod_alu)
        .where(AluTurma.cod_tur == cod_tur)
        .order_by(Aluno.nome)
    )
    return [
        {
            "id": at.id,
            "cod_alu": alu.cod_alu,
            "nome": alu.nome,
            "status": at.status,
            "celular": alu.celular,
            "e_mail": alu.e_mail,
        }
        for at, alu in db.execute(q)
    ]


@router.post("/{cod_tur}/alunos/{cod_alu}")
def matricular(cod_tur: int, cod_alu: int, db: Session = Depends(get_db)):
    if not db.get(Turma, cod_tur):
        raise HTTPException(404, "Turma não encontrada")
    aluno = db.get(Aluno, cod_alu)
    if not aluno:
        raise HTTPException(404, "Aluno não encontrado")
    ja = db.scalar(
        select(AluTurma).where(AluTurma.cod_tur == cod_tur, AluTurma.cod_alu == cod_alu)
    )
    if ja:
        raise HTTPException(400, "Aluno já está nesta turma")
    prox = (db.scalar(
        select(func.max(AluTurma.item)).where(AluTurma.cod_tur == cod_tur)
    ) or 0) + 1
    db.add(AluTurma(cod_tur=cod_tur, cod_alu=cod_alu, item=prox, status="A"))
    aluno.cod_tur = cod_tur
    _atualizar_qtalu(db, cod_tur)
    db.commit()
    return {"ok": True}


@router.delete("/{cod_tur}/alunos/{cod_alu}")
def desmatricular(cod_tur: int, cod_alu: int, db: Session = Depends(get_db)):
    vinculo = db.scalar(
        select(AluTurma).where(AluTurma.cod_tur == cod_tur, AluTurma.cod_alu == cod_alu)
    )
    if not vinculo:
        raise HTTPException(404, "Aluno não está nesta turma")
    db.delete(vinculo)
    aluno = db.get(Aluno, cod_alu)
    if aluno and aluno.cod_tur == cod_tur:
        aluno.cod_tur = None
    _atualizar_qtalu(db, cod_tur)
    db.commit()
    return {"ok": True}


def _atualizar_qtalu(db: Session, cod_tur: int):
    turma = db.get(Turma, cod_tur)
    if turma:
        turma.qtalu = db.scalar(
            select(func.count()).select_from(AluTurma).where(AluTurma.cod_tur == cod_tur)
        )


# ---- materias/professores da turma (docturma) ------------------------------

@router.get("/{cod_tur}/materias")
def materias_da_turma(cod_tur: int, db: Session = Depends(get_db)):
    q = (
        select(DocTurma, Materia.NOME, Professor.nome)
        .join(Materia, Materia.cod_mat == DocTurma.cod_mat, isouter=True)
        .join(Professor, Professor.cod_pro == DocTurma.cod_pro, isouter=True)
        .where(DocTurma.cod_tur == cod_tur)
        .order_by(Materia.NOME)
    )
    out = []
    for dt, materia_nome, professor_nome in db.execute(q):
        d = row_to_dict(dt)
        d["materia_nome"] = materia_nome
        d["professor_nome"] = professor_nome
        out.append(d)
    return out


@router.post("/{cod_tur}/materias")
def adicionar_materia(cod_tur: int, dados: DocTurmaInput, db: Session = Depends(get_db)):
    if not db.get(Turma, cod_tur):
        raise HTTPException(404, "Turma não encontrada")
    ja = db.scalar(
        select(DocTurma).where(
            DocTurma.cod_tur == cod_tur,
            DocTurma.cod_mat == dados.cod_mat,
            DocTurma.Ano == dados.Ano,
            DocTurma.semestre == dados.semestre,
        )
    )
    if ja:
        raise HTTPException(400, "Matéria já vinculada à turma neste ano/semestre")
    dt = DocTurma(cod_tur=cod_tur, **dados.model_dump())
    db.add(dt)
    db.commit()
    db.refresh(dt)
    return row_to_dict(dt)


@router.put("/{cod_tur}/materias/{docturma_id}")
def atualizar_materia(
    cod_tur: int, docturma_id: int, dados: DocTurmaInput, db: Session = Depends(get_db)
):
    dt = db.get(DocTurma, docturma_id)
    if not dt or dt.cod_tur != cod_tur:
        raise HTTPException(404, "Vínculo não encontrado")
    for k, v in dados.model_dump().items():
        setattr(dt, k, v)
    db.commit()
    return row_to_dict(dt)


@router.delete("/{cod_tur}/materias/{docturma_id}")
def remover_materia(cod_tur: int, docturma_id: int, db: Session = Depends(get_db)):
    dt = db.get(DocTurma, docturma_id)
    if not dt or dt.cod_tur != cod_tur:
        raise HTTPException(404, "Vínculo não encontrado")
    db.delete(dt)
    db.commit()
    return {"ok": True}
