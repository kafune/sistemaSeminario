from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Usuario
from ..security import criar_token, gerar_hash, usuario_atual, verificar_senha

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginInput(BaseModel):
    user: str
    senha: str


class TrocaSenhaInput(BaseModel):
    senha_atual: str
    senha_nova: str


@router.post("/login")
def login(dados: LoginInput, db: Session = Depends(get_db)):
    usuario = db.get(Usuario, dados.user.strip().upper())
    if not usuario or not verificar_senha(dados.senha, usuario.senha_hash):
        raise HTTPException(401, "Usuário ou senha incorretos")
    return {"token": criar_token(usuario.user), "user": usuario.user}


@router.post("/trocar-senha")
def trocar_senha(
    dados: TrocaSenhaInput,
    user: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    usuario = db.get(Usuario, user)
    if not usuario or not verificar_senha(dados.senha_atual, usuario.senha_hash):
        raise HTTPException(400, "Senha atual incorreta")
    if len(dados.senha_nova) < 6:
        raise HTTPException(400, "A senha nova deve ter pelo menos 6 caracteres")
    usuario.senha_hash = gerar_hash(dados.senha_nova)
    db.commit()
    return {"ok": True}
