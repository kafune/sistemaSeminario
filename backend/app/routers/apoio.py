"""CRUD generico das tabelas de apoio (cadastros simples)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db, row_to_dict
from .. import models

router = APIRouter(prefix="/apoio", tags=["apoio"])

# nome na URL -> (model, coluna de ordenacao)
TABELAS = {
    "cidades": models.Cidade,
    "areas": models.Area,
    "escolaridades": models.Escolaridade,
    "estados-civis": models.EstadoCivil,
    "horarios": models.Horario,
    "cursos": models.Curso,
    "titulos": models.Titulo,
    "congregacoes": models.Congregacao,
    "registros": models.Registro,
}


def _model(tabela: str):
    model = TABELAS.get(tabela)
    if not model:
        raise HTTPException(404, f"Tabela de apoio desconhecida: {tabela}")
    return model


def _aplicar(obj, dados: dict):
    """Copia para o objeto apenas chaves que existem como coluna."""
    cols = {c.name for c in obj.__table__.columns}
    pk = {c.name for c in obj.__table__.primary_key.columns}
    for k, v in dados.items():
        if k in cols and k not in pk:
            setattr(obj, k, v.strip() if isinstance(v, str) else v)


@router.get("/{tabela}")
def listar(tabela: str, busca: str = "", db: Session = Depends(get_db)):
    model = _model(tabela)
    q = select(model)
    if busca and hasattr(model, "nome"):
        q = q.where(model.nome.like(f"%{busca}%"))
    if hasattr(model, "nome"):
        q = q.order_by(model.nome)
    return [row_to_dict(r) for r in db.scalars(q.limit(6000))]


@router.post("/{tabela}")
def criar(tabela: str, dados: dict, db: Session = Depends(get_db)):
    model = _model(tabela)
    obj = model()
    _aplicar(obj, dados)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return row_to_dict(obj)


@router.put("/{tabela}/{item_id}")
def atualizar(tabela: str, item_id: int, dados: dict, db: Session = Depends(get_db)):
    model = _model(tabela)
    obj = db.get(model, item_id)
    if not obj:
        raise HTTPException(404, "Registro não encontrado")
    _aplicar(obj, dados)
    db.commit()
    return row_to_dict(obj)


@router.delete("/{tabela}/{item_id}")
def excluir(tabela: str, item_id: int, db: Session = Depends(get_db)):
    model = _model(tabela)
    obj = db.get(model, item_id)
    if not obj:
        raise HTTPException(404, "Registro não encontrado")
    db.delete(obj)
    db.commit()
    return {"ok": True}
