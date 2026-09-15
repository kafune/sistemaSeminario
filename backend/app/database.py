from decimal import Decimal
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


@lru_cache(maxsize=1)
def get_engine():
    """Motor criado na primeira necessidade, não na importação.

    Importar um router (nos testes, com SQLite) não deve exigir ``pymysql``
    nem uma URL de MySQL resolvível.
    """
    return create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=3600)


_fabrica = sessionmaker(autoflush=False, expire_on_commit=False)


def SessionLocal(**opcoes) -> Session:
    """Sessão ligada ao motor real; mantém a assinatura ``SessionLocal()``."""
    return _fabrica(bind=get_engine(), **opcoes)


def __getattr__(nome: str):
    # ``from .database import engine`` continua funcionando, mas só cria o
    # motor quando alguém de fato pede por ele.
    if nome == "engine":
        return get_engine()
    raise AttributeError(nome)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def row_to_dict(obj) -> dict:
    """Serializa uma linha ORM em dict simples (datas viram ISO, Decimal vira float)."""
    out = {}
    for col in obj.__table__.columns:
        v = getattr(obj, col.name)
        if hasattr(v, "isoformat"):
            v = v.isoformat()
        elif isinstance(v, Decimal):
            v = float(v)
        out[col.name] = v
    return out
