"""Testes automatizados do backend."""

import os

from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

# Estes testes chamam funções de router diretamente, sem passar pela resolução
# de dependências do FastAPI, então o argumento ``user`` precisa vir explícito.
# ``""`` é um login que nunca existe (``usuario_atual`` recusa ``sub`` vazio):
# a consulta ao usuário devolve ``None`` e o router trata como sem restrição de
# professor — sem nenhum desvio no código de produção (AUDITORIA.md F1).
SEM_LOGIN = ""

# Por padrão a suíte roda em SQLite, que é rápido e não precisa de serviço.
# Com ``TOV_TEST_DATABASE_URL`` apontando para um MySQL, a mesma suíte roda
# contra o banco de produção de verdade — `with_for_update`/`skip_locked`, o
# `LONGBLOB`, o `func.replace` aninhado e a colação do `LIKE` só existem lá
# (AUDITORIA.md F2). O CI roda as duas passagens.
URL_DE_TESTE = os.getenv("TOV_TEST_DATABASE_URL", "").strip()
EM_MYSQL = URL_DE_TESTE.startswith(("mysql", "mariadb"))


def criar_engine_de_teste():
    """Motor limpo para um caso de teste, em SQLite ou no MySQL configurado."""
    if not URL_DE_TESTE:
        return create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    from app.database import Base

    engine = create_engine(URL_DE_TESTE, pool_pre_ping=True)
    # O banco é o mesmo entre os casos: cada `setUp` começa do zero, como o
    # `sqlite://` em memória faz de graça.
    Base.metadata.drop_all(engine)
    return engine
