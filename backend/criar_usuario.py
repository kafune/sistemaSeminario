"""Cria (ou redefine a senha de) um usuário de acesso ao sistema.

Uso, a partir da pasta backend/ com o .env configurado:

    python criar_usuario.py NOME_DO_USUARIO

A senha é pedida no terminal, sem eco. O nome é gravado em maiúsculas,
como o login espera.
"""

import sys
from getpass import getpass

from app.database import Base, SessionLocal, engine
from app.models import Usuario
from app.security import gerar_hash


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Uso: python criar_usuario.py NOME_DO_USUARIO")
    user = sys.argv[1].strip().upper()

    senha = getpass(f"Senha para {user}: ")
    if len(senha) < 6:
        sys.exit("A senha deve ter pelo menos 6 caracteres")
    if senha != getpass("Repita a senha: "):
        sys.exit("As senhas não conferem")

    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        usuario = db.get(Usuario, user)
        if usuario:
            usuario.senha_hash = gerar_hash(senha)
            print(f"Senha de {user} atualizada.")
        else:
            db.add(Usuario(user=user, senha_hash=gerar_hash(senha)))
            print(f"Usuário {user} criado.")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
