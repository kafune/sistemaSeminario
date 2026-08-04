from sqlalchemy import Index, Integer, String, UniqueConstraint
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
