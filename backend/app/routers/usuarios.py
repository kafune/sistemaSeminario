from fastapi import APIRouter, Depends, HTTPException
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Professor, Usuario
from ..security import gerar_hash, usuario_atual

router = APIRouter(prefix="/usuarios", tags=["usuarios"])

SENHA_MINIMA = 6


class UsuarioInput(BaseModel):
    user: str
    senha: str
    perfil: Literal["ADMIN", "SECRETARIA", "MARKETING", "FINANCEIRO", "PROFESSOR"] = "SECRETARIA"
    cod_pro: int | None = None


class SenhaInput(BaseModel):
    senha: str


class PerfilInput(BaseModel):
    perfil: Literal["ADMIN", "SECRETARIA", "MARKETING", "FINANCEIRO", "PROFESSOR"]
    cod_pro: int | None = None


def _validar_senha(senha: str) -> None:
    if len(senha) < SENHA_MINIMA:
        raise HTTPException(400, f"A senha deve ter pelo menos {SENHA_MINIMA} caracteres")


@router.get("")
def listar(db: Session = Depends(get_db)):
    """Lista os usuários de acesso (nunca expõe o hash da senha)."""
    return [
        {
            "user": usuario.user,
            "perfil": usuario.perfil or "ADMIN",
            "cod_pro": usuario.cod_pro,
            "professor_nome": professor_nome,
        }
        for usuario, professor_nome in db.execute(
            select(Usuario, Professor.nome)
            .join(Professor, Professor.cod_pro == Usuario.cod_pro, isouter=True)
            .order_by(Usuario.user)
        )
    ]


@router.post("")
def criar(dados: UsuarioInput, db: Session = Depends(get_db)):
    user = dados.user.strip().upper()
    if not user:
        raise HTTPException(400, "Informe o nome do usuário")
    _validar_senha(dados.senha)
    if db.get(Usuario, user):
        raise HTTPException(409, "Já existe um usuário com esse nome")
    if dados.perfil == "PROFESSOR":
        if dados.cod_pro is None or not db.get(Professor, dados.cod_pro):
            raise HTTPException(400, "Selecione o professor vinculado ao acesso")
        if db.scalar(select(Usuario).where(Usuario.cod_pro == dados.cod_pro)):
            raise HTTPException(409, "Este professor já possui acesso")
    novo = Usuario(
        user=user,
        senha_hash=gerar_hash(dados.senha),
        perfil=dados.perfil,
        cod_pro=dados.cod_pro if dados.perfil == "PROFESSOR" else None,
    )
    db.add(novo)
    db.commit()
    return {"user": novo.user, "perfil": novo.perfil}


@router.put("/{user}/perfil")
def alterar_perfil(
    user: str,
    dados: PerfilInput,
    atual: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
):
    usuario = db.get(Usuario, user)
    if not usuario:
        raise HTTPException(404, "Usuário não encontrado")
    if dados.perfil == "PROFESSOR":
        cod_pro = dados.cod_pro if dados.cod_pro is not None else usuario.cod_pro
        if cod_pro is None or not db.get(Professor, cod_pro):
            raise HTTPException(400, "Selecione o professor vinculado ao acesso")
        ocupado = db.scalar(
            select(Usuario).where(
                Usuario.cod_pro == cod_pro,
                Usuario.user != usuario.user,
            )
        )
        if ocupado:
            raise HTTPException(409, "Este professor já possui acesso")
        usuario.cod_pro = cod_pro
    else:
        usuario.cod_pro = None
    if user == atual and dados.perfil != "ADMIN":
        administradores = db.scalar(
            select(func.count())
            .select_from(Usuario)
            .where(Usuario.perfil == "ADMIN")
        ) or 0
        if administradores <= 1:
            raise HTTPException(400, "O sistema precisa manter ao menos um administrador")
    usuario.perfil = dados.perfil
    db.commit()
    return {"user": usuario.user, "perfil": usuario.perfil}


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
