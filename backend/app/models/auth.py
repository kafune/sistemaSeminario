from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Usuario(Base):
    __tablename__ = "usuarios"
    user: Mapped[str] = mapped_column(String(50), primary_key=True)
    senha_hash: Mapped[str] = mapped_column(String(100))
