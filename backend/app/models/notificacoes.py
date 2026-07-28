from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Notificacao(Base):
    __tablename__ = "notificacoes"
    __table_args__ = (
        UniqueConstraint("usuario", "chave_evento", name="uq_notificacoes_usuario_evento"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario: Mapped[str] = mapped_column(
        String(50), ForeignKey("usuarios.user", ondelete="CASCADE"), index=True
    )
    categoria: Mapped[str] = mapped_column(String(20), index=True)
    titulo: Mapped[str] = mapped_column(String(120))
    corpo: Mapped[str] = mapped_column(String(500))
    rota: Mapped[str | None] = mapped_column(String(500))
    chave_evento: Mapped[str] = mapped_column(String(191))
    criado_em: Mapped[datetime] = mapped_column(DateTime, index=True)
    lido_em: Mapped[datetime | None] = mapped_column(DateTime, index=True)


class PushInscricao(Base):
    __tablename__ = "push_inscricoes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario: Mapped[str] = mapped_column(
        String(50), ForeignKey("usuarios.user", ondelete="CASCADE"), index=True
    )
    endpoint: Mapped[str] = mapped_column(Text)
    endpoint_hash: Mapped[str] = mapped_column(String(64), unique=True)
    chave_p256dh: Mapped[str] = mapped_column(Text)
    chave_auth: Mapped[str] = mapped_column(Text)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime)
    usado_em: Mapped[datetime | None] = mapped_column(DateTime)


class NotificacaoPreferencia(Base):
    __tablename__ = "notificacao_preferencias"

    usuario: Mapped[str] = mapped_column(
        String(50), ForeignKey("usuarios.user", ondelete="CASCADE"), primary_key=True
    )
    push_whatsapp: Mapped[bool] = mapped_column(Boolean, default=True)
    push_cadastros: Mapped[bool] = mapped_column(Boolean, default=True)
    push_aulas: Mapped[bool] = mapped_column(Boolean, default=True)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime)
