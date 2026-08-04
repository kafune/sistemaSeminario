from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class MaterialDidatico(Base):
    """Arquivo de apoio de uma matéria, opcionalmente ligado a uma aula."""

    __tablename__ = "materiais_didaticos"
    __table_args__ = (
        Index("ix_materiais_docturma_aula", "docturma_id", "aula_id"),
        Index("ix_materiais_criado_em", "criado_em"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    docturma_id: Mapped[int] = mapped_column(Integer)
    aula_id: Mapped[int | None] = mapped_column(Integer)
    titulo: Mapped[str] = mapped_column(String(150))
    descricao: Mapped[str | None] = mapped_column(Text)
    nome_arquivo: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(120))
    tamanho: Mapped[int] = mapped_column(Integer)
    conteudo: Mapped[bytes] = mapped_column(LargeBinary(length=2**32 - 1))
    criado_por: Mapped[str] = mapped_column(String(50))
    criado_em: Mapped[datetime] = mapped_column(DateTime)
