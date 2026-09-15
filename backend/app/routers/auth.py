from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Usuario
from ..security import criar_token, gerar_hash, perfil_de, usuario_atual, verificar_senha

router = APIRouter(prefix="/auth", tags=["auth"])

SENHA_MINIMA = 8


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
    return {
        "token": criar_token(usuario.user),
        "user": usuario.user,
        "perfil": perfil_de(usuario),
        "cod_pro": usuario.cod_pro,
    }


@router.get("/me")
def obter_sessao(
    user: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    usuario = db.get(Usuario, user)
    if not usuario:
        raise HTTPException(404, "Usuário não encontrado")
    return {
        "user": usuario.user,
        "perfil": perfil_de(usuario),
        "cod_pro": usuario.cod_pro,
    }


@router.post("/trocar-senha")
def trocar_senha(
    dados: TrocaSenhaInput,
    user: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    usuario = db.get(Usuario, user)
    if not usuario or not verificar_senha(dados.senha_atual, usuario.senha_hash):
        raise HTTPException(400, "Senha atual incorreta")
    if len(dados.senha_nova) < SENHA_MINIMA:
        raise HTTPException(400, f"A senha nova deve ter pelo menos {SENHA_MINIMA} caracteres")
    if dados.senha_nova == dados.senha_atual:
        raise HTTPException(400, "A senha nova deve ser diferente da atual")
    usuario.senha_hash = gerar_hash(dados.senha_nova)
    db.commit()
    return {"ok": True}
