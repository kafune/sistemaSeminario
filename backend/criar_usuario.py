"""Cria (ou redefine a senha de) um usuário de acesso ao sistema.

Uso, a partir da pasta backend/ com o .env configurado:

    python criar_usuario.py NOME_DO_USUARIO [PERFIL]

O primeiro argumento é o **nome de login**; o segundo, opcional, é o perfil:
ADMIN, SECRETARIA, MARKETING, FINANCEIRO ou PROFESSOR. Sem perfil informado,
um usuário novo nasce como SECRETARIA — o perfil de menor privilégio entre os
operacionais. Para um administrador, informe ADMIN explicitamente:

    python criar_usuario.py ADMIN ADMIN

Ao redefinir a senha de um usuário existente, o perfil só muda se for
informado. A senha é pedida no terminal, sem eco. O nome é gravado em
maiúsculas, como o login espera.
"""

import sys
from getpass import getpass

from app.database import Base, SessionLocal, engine
from app.models import Usuario
from app.schema import atualizar_schema
from app.security import gerar_hash

PERFIS = ("ADMIN", "SECRETARIA", "MARKETING", "FINANCEIRO", "PROFESSOR")
PERFIL_PADRAO = "SECRETARIA"
SENHA_MINIMA = 8


def main() -> None:
    if len(sys.argv) not in (2, 3):
        sys.exit("Uso: python criar_usuario.py NOME_DO_USUARIO [PERFIL]")
    user = sys.argv[1].strip().upper()
    if not user:
        sys.exit("Informe o nome do usuário")
    perfil = sys.argv[2].strip().upper() if len(sys.argv) == 3 else None
    if perfil is not None and perfil not in PERFIS:
        sys.exit(f"Perfil inválido: {perfil}. Use um de: {', '.join(PERFIS)}")
    if perfil == "PROFESSOR":
        sys.exit("Acesso de PROFESSOR é criado pela tela de usuários, vinculado ao professor.")

    senha = getpass(f"Senha para {user}: ")
    if len(senha) < SENHA_MINIMA:
        sys.exit(f"A senha deve ter pelo menos {SENHA_MINIMA} caracteres")
    if senha != getpass("Repita a senha: "):
        sys.exit("As senhas não conferem")

    Base.metadata.create_all(engine)
    atualizar_schema(engine)
    db = SessionLocal()
    try:
        usuario = db.get(Usuario, user)
        if usuario:
            usuario.senha_hash = gerar_hash(senha)
            if perfil and perfil != usuario.perfil:
                usuario.perfil = perfil
                print(f"Senha de {user} atualizada e perfil alterado para {perfil}.")
            else:
                print(f"Senha de {user} atualizada (perfil {usuario.perfil} mantido).")
        else:
            perfil_novo = perfil or PERFIL_PADRAO
            db.add(Usuario(user=user, senha_hash=gerar_hash(senha), perfil=perfil_novo))
            print(f"Usuário {user} criado com perfil {perfil_novo}.")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
