from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=3600)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


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
