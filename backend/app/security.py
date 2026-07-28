from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import Usuario

ALGORITHM = "HS256"
_bearer = HTTPBearer(auto_error=False)


def verificar_senha(senha: str, senha_hash: str) -> bool:
    try:
        return bcrypt.checkpw(senha.encode(), senha_hash.encode())
    except ValueError:
        return False


def gerar_hash(senha: str) -> str:
    return bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()


def criar_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def usuario_atual(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Não autenticado")
    try:
        payload = jwt.decode(cred.credentials, settings.secret_key, algorithms=[ALGORITHM])
        return payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessão inválida ou expirada")


def perfil_atual(
    user: str = Depends(usuario_atual),
    db: Session = Depends(get_db),
) -> str:
    usuario = db.get(Usuario, user)
    if not usuario:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuário não encontrado")
    return (usuario.perfil or "ADMIN").upper()


def exigir_perfis(*perfis_permitidos: str):
    permitidos = {perfil.upper() for perfil in perfis_permitidos}

    def dependencia(perfil: str = Depends(perfil_atual)) -> str:
        if perfil not in permitidos:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Seu perfil não possui acesso a esta área.",
            )
        return perfil

    return dependencia
