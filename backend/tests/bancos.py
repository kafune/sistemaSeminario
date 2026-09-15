"""Banco de testes: SQLite em memória por padrão, MySQL/MariaDB quando pedido.

``TOV_TEST_DATABASE_URL=mysql+pymysql://tov:tov@127.0.0.1:3306/tov_test``
faz a mesma suíte rodar contra o banco de produção — é onde vivem
``with_for_update``, ``LONGBLOB``, a sensibilidade a maiúsculas do ``LIKE`` e
todo o caminho MySQL-only de ``schema.py``, que o SQLite não exercita.
Cada teste recria o schema, então o banco indicado é descartável.
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.database import Base

URL_MYSQL = os.environ.get("TOV_TEST_DATABASE_URL", "").strip()


def usando_mysql() -> bool:
    return bool(URL_MYSQL)


def engine_de_teste():
    """Motor com o schema recém-criado e vazio."""
    if not URL_MYSQL:
        return create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    engine = create_engine(URL_MYSQL, pool_pre_ping=True)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    return engine
