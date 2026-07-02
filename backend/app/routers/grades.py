from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db, row_to_dict
from ..models import Grade, ItemGrade, Materia, Turma

router = APIRouter(prefix="/grades", tags=["grades"])


class GradeInput(BaseModel):
    nome: str
    dat_ini: date | None = None
    dat_fim: date | None = None
    observ: str | None = None


class ItemGradeInput(BaseModel):
    cod_mat: int
    creditos: int | None = None
    cargahor: int | None = None


@router.get("")
def listar(db: Session = Depends(get_db)):
    return [row_to_dict(g) for g in db.scalars(select(Grade).order_by(Grade.nome))]


@router.get("/{cod_gra}")
def obter(cod_gra: int, db: Session = Depends(get_db)):
    grade = db.get(Grade, cod_gra)
    if not grade:
        raise HTTPException(404, "Grade não encontrada")
    d = row_to_dict(grade)
    q = (
        select(ItemGrade, Materia.NOME)
        .join(Materia, Materia.cod_mat == ItemGrade.cod_mat, isouter=True)
        .where(ItemGrade.cod_gra == cod_gra)
        .order_by(ItemGrade.ite_gra)
    )
    d["itens"] = []
    for item, materia_nome in db.execute(q):
        i = row_to_dict(item)
        i["materia_nome"] = materia_nome
        d["itens"].append(i)
    return d


@router.post("")
def criar(dados: GradeInput, db: Session = Depends(get_db)):
    grade = Grade(**dados.model_dump(), qitens=0)
    db.add(grade)
    db.commit()
    db.refresh(grade)
    return row_to_dict(grade)


@router.put("/{cod_gra}")
def atualizar(cod_gra: int, dados: GradeInput, db: Session = Depends(get_db)):
    grade = db.get(Grade, cod_gra)
    if not grade:
        raise HTTPException(404, "Grade não encontrada")
    for k, v in dados.model_dump().items():
        setattr(grade, k, v)
    db.commit()
    return row_to_dict(grade)


@router.delete("/{cod_gra}")
def excluir(cod_gra: int, db: Session = Depends(get_db)):
    grade = db.get(Grade, cod_gra)
    if not grade:
        raise HTTPException(404, "Grade não encontrada")
    em_uso = db.scalar(
        select(func.count()).select_from(Turma).where(Turma.cod_gra == cod_gra)
    )
    if em_uso:
        raise HTTPException(400, "Grade está em uso por turmas; não pode ser excluída.")
    db.execute(ItemGrade.__table__.delete().where(ItemGrade.cod_gra == cod_gra))
    db.delete(grade)
    db.commit()
    return {"ok": True}


@router.post("/{cod_gra}/itens")
def adicionar_item(cod_gra: int, dados: ItemGradeInput, db: Session = Depends(get_db)):
    grade = db.get(Grade, cod_gra)
    if not grade:
        raise HTTPException(404, "Grade não encontrada")
    ja = db.scalar(
        select(ItemGrade).where(
            ItemGrade.cod_gra == cod_gra, ItemGrade.cod_mat == dados.cod_mat
        )
    )
    if ja:
        raise HTTPException(400, "Matéria já está na grade")
    prox = (db.scalar(
        select(func.max(ItemGrade.ite_gra)).where(ItemGrade.cod_gra == cod_gra)
    ) or 0) + 1
    item = ItemGrade(cod_gra=cod_gra, ite_gra=prox, **dados.model_dump())
    db.add(item)
    _atualizar_qitens(db, grade)
    db.commit()
    db.refresh(item)
    return row_to_dict(item)


@router.delete("/{cod_gra}/itens/{item_id}")
def remover_item(cod_gra: int, item_id: int, db: Session = Depends(get_db)):
    item = db.get(ItemGrade, item_id)
    if not item or item.cod_gra != cod_gra:
        raise HTTPException(404, "Item não encontrado")
    db.delete(item)
    grade = db.get(Grade, cod_gra)
    if grade:
        _atualizar_qitens(db, grade)
    db.commit()
    return {"ok": True}


def _atualizar_qitens(db: Session, grade: Grade):
    db.flush()
    grade.qitens = db.scalar(
        select(func.count()).select_from(ItemGrade).where(ItemGrade.cod_gra == grade.cod_gra)
    )
