from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db, row_to_dict
from ..models import AluNota, Area, ItemGrade, Materia

router = APIRouter(prefix="/materias", tags=["materias"])


class MateriaInput(BaseModel):
    NOME: str
    area: int | None = None
    APELIDO: str | None = None
    observa: str | None = None


@router.get("")
def listar(busca: str = "", db: Session = Depends(get_db)):
    q = select(Materia, Area.nome.label("area_nome")).join(
        Area, Area.cod_are == Materia.area, isouter=True
    )
    if busca:
        q = q.where(Materia.NOME.like(f"%{busca}%"))
    out = []
    for mat, area_nome in db.execute(q.order_by(Materia.NOME)):
        d = row_to_dict(mat)
        d["area_nome"] = area_nome
        out.append(d)
    return out


@router.post("")
def criar(dados: MateriaInput, db: Session = Depends(get_db)):
    mat = Materia(**dados.model_dump())
    db.add(mat)
    db.commit()
    db.refresh(mat)
    return row_to_dict(mat)


@router.put("/{cod_mat}")
def atualizar(cod_mat: int, dados: MateriaInput, db: Session = Depends(get_db)):
    mat = db.get(Materia, cod_mat)
    if not mat:
        raise HTTPException(404, "Matéria não encontrada")
    for k, v in dados.model_dump().items():
        setattr(mat, k, v)
    db.commit()
    return row_to_dict(mat)


@router.delete("/{cod_mat}")
def excluir(cod_mat: int, db: Session = Depends(get_db)):
    mat = db.get(Materia, cod_mat)
    if not mat:
        raise HTTPException(404, "Matéria não encontrada")
    em_uso = db.scalar(
        select(func.count()).select_from(AluNota).where(AluNota.cod_mat == cod_mat)
    )
    if em_uso:
        raise HTTPException(400, f"Matéria tem {em_uso} notas lançadas; não pode ser excluída.")
    em_grade = db.scalar(
        select(func.count()).select_from(ItemGrade).where(ItemGrade.cod_mat == cod_mat)
    )
    if em_grade:
        raise HTTPException(400, "Matéria faz parte de uma grade curricular; remova da grade antes.")
    db.delete(mat)
    db.commit()
    return {"ok": True}
