from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db, row_to_dict
from ..models import Materia, MatProf, Professor, TitProf

router = APIRouter(prefix="/professores", tags=["professores"])


class ProfessorInput(BaseModel):
    nome: str
    endereco: str | None = None
    complemento: str | None = None
    bairro: str | None = None
    cidade: str | None = None
    uf: str | None = None
    cep: str | None = None
    fone1: str | None = None
    fone2: str | None = None
    celular: str | None = None
    e_mail: str | None = None
    sexo: str | None = None
    dat_nas: date | None = None
    rg: str | None = None
    cpf: str | None = None
    dat_cad: date | None = None
    est_civ: str | None = None
    status: str | None = None
    nacionalidade: str | None = None
    sigla: str | None = None


@router.get("")
def listar(busca: str = "", db: Session = Depends(get_db)):
    q = select(Professor)
    if busca:
        q = q.where(Professor.nome.like(f"%{busca}%"))
    return [row_to_dict(p) for p in db.scalars(q.order_by(Professor.nome))]


@router.get("/{cod_pro}")
def obter(cod_pro: int, db: Session = Depends(get_db)):
    prof = db.get(Professor, cod_pro)
    if not prof:
        raise HTTPException(404, "Professor não encontrado")
    dados = row_to_dict(prof)
    dados["materias"] = [
        {"cod_mat": m.cod_mat, "nome": m.NOME}
        for m in db.scalars(
            select(Materia)
            .join(MatProf, MatProf.cod_mat == Materia.cod_mat)
            .where(MatProf.cod_pro == cod_pro)
        )
    ]
    dados["titulos"] = [
        row_to_dict(t)
        for t in db.scalars(select(TitProf).where(TitProf.cod_pro == cod_pro))
    ]
    return dados


@router.post("")
def criar(dados: ProfessorInput, db: Session = Depends(get_db)):
    prof = Professor(**dados.model_dump())
    if not prof.dat_cad:
        prof.dat_cad = date.today()
    db.add(prof)
    db.commit()
    db.refresh(prof)
    return row_to_dict(prof)


@router.put("/{cod_pro}")
def atualizar(cod_pro: int, dados: ProfessorInput, db: Session = Depends(get_db)):
    prof = db.get(Professor, cod_pro)
    if not prof:
        raise HTTPException(404, "Professor não encontrado")
    for k, v in dados.model_dump().items():
        setattr(prof, k, v)
    db.commit()
    return row_to_dict(prof)


@router.delete("/{cod_pro}")
def excluir(cod_pro: int, db: Session = Depends(get_db)):
    prof = db.get(Professor, cod_pro)
    if not prof:
        raise HTTPException(404, "Professor não encontrado")
    db.execute(MatProf.__table__.delete().where(MatProf.cod_pro == cod_pro))
    db.execute(TitProf.__table__.delete().where(TitProf.cod_pro == cod_pro))
    db.delete(prof)
    db.commit()
    return {"ok": True}


@router.put("/{cod_pro}/materias")
def definir_materias(cod_pro: int, cod_mats: list[int], db: Session = Depends(get_db)):
    """Substitui o conjunto de matérias que o professor leciona."""
    if not db.get(Professor, cod_pro):
        raise HTTPException(404, "Professor não encontrado")
    db.execute(MatProf.__table__.delete().where(MatProf.cod_pro == cod_pro))
    for i, cod_mat in enumerate(cod_mats, start=1):
        db.add(MatProf(cod_mat=cod_mat, cod_pro=cod_pro, seq_mp=i))
    db.commit()
    return {"ok": True, "quantidade": len(cod_mats)}
