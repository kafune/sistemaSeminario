from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Usuario(Base):
    __tablename__ = "usuarios"
    __table_args__ = (
        UniqueConstraint("cod_pro", name="uq_usuarios_cod_pro"),
        Index("ix_usuarios_cod_pro", "cod_pro"),
    )
    user: Mapped[str] = mapped_column(String(50), primary_key=True)
    senha_hash: Mapped[str] = mapped_column(String(100))
    perfil: Mapped[str] = mapped_column(String(20), default="ADMIN", index=True)
    # Preenchido apenas para acessos com perfil PROFESSOR.
    cod_pro: Mapped[int | None] = mapped_column(Integer)


class RegistroAuditoria(Base):
    """Quem fez o quê, e quando, nas operações administrativas.

    Só o estado atual de um registro (``atualizado_por``) não conta a história;
    aqui fica o histórico de exclusões, estornos, mudanças de perfil e de
    senha — o que se quer ter à mão quando alguém pergunta "quem apagou isso?".
    """

    __tablename__ = "auditoria"
    __table_args__ = (
        Index("ix_auditoria_criado_em", "criado_em"),
        Index("ix_auditoria_entidade", "entidade", "entidade_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario: Mapped[str | None] = mapped_column(String(50))
    acao: Mapped[str] = mapped_column(String(40))
    entidade: Mapped[str] = mapped_column(String(40))
    entidade_id: Mapped[str | None] = mapped_column(String(40))
    detalhes: Mapped[str | None] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(DateTime)
