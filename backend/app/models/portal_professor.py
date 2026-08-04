from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class PlanejamentoAula(Base):
    __tablename__ = "planejamentos_aula"
    __table_args__ = (
        UniqueConstraint("aula_id", name="uq_planejamentos_aula_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    aula_id: Mapped[int] = mapped_column(Integer, index=True)
    objetivos: Mapped[str | None] = mapped_column(Text)
    conteudo: Mapped[str | None] = mapped_column(Text)
    tarefa: Mapped[str | None] = mapped_column(Text)
    anotacoes_privadas: Mapped[str | None] = mapped_column(Text)
    atualizado_por: Mapped[str] = mapped_column(String(50))
    atualizado_em: Mapped[datetime] = mapped_column(DateTime)


class ComunicadoTurma(Base):
    __tablename__ = "comunicados_turma"
    __table_args__ = (
        Index("ix_comunicados_docturma_status", "docturma_id", "status"),
        Index("ix_comunicados_criado_em", "criado_em"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    docturma_id: Mapped[int] = mapped_column(Integer)
    titulo: Mapped[str] = mapped_column(String(150))
    mensagem: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="RASCUNHO")
    criado_por: Mapped[str] = mapped_column(String(50))
    criado_em: Mapped[datetime] = mapped_column(DateTime)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime)
