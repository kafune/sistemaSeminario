from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Usuario
from ..security import gerar_hash, usuario_atual

router = APIRouter(prefix="/usuarios", tags=["usuarios"])

SENHA_MINIMA = 6


class UsuarioInput(BaseModel):
    user: str
    senha: str


class SenhaInput(BaseModel):
    senha: str


def _validar_senha(senha: str) -> None:
    if len(senha) < SENHA_MINIMA:
        raise HTTPException(400, f"A senha deve ter pelo menos {SENHA_MINIMA} caracteres")


@router.get("")
def listar(db: Session = Depends(get_db)):
    """Lista os usuários de acesso (nunca expõe o hash da senha)."""
    return [{"user": u.user} for u in db.scalars(select(Usuario).order_by(Usuario.user))]


@router.post("")
def criar(dados: UsuarioInput, db: Session = Depends(get_db)):
    user = dados.user.strip().upper()
    if not user:
        raise HTTPException(400, "Informe o nome do usuário")
    _validar_senha(dados.senha)
    if db.get(Usuario, user):
        raise HTTPException(409, "Já existe um usuário com esse nome")
    novo = Usuario(user=user, senha_hash=gerar_hash(dados.senha))
    db.add(novo)
    db.commit()
    return {"user": novo.user}


@router.put("/{user}/senha")
def redefinir_senha(user: str, dados: SenhaInput, db: Session = Depends(get_db)):
    usuario = db.get(Usuario, user)
    if not usuario:
        raise HTTPException(404, "Usuário não encontrado")
    _validar_senha(dados.senha)
    usuario.senha_hash = gerar_hash(dados.senha)
    db.commit()
    return {"ok": True}


@router.delete("/{user}")
def excluir(
    user: str,
    atual: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    usuario = db.get(Usuario, user)
    if not usuario:
        raise HTTPException(404, "Usuário não encontrado")
    if user == atual:
        raise HTTPException(400, "Você não pode excluir o próprio usuário conectado")
    if db.scalar(select(func.count()).select_from(Usuario)) <= 1:
        raise HTTPException(400, "Não é possível excluir o único usuário do sistema")
    db.delete(usuario)
    db.commit()
    return {"ok": True}
