from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class ImportacaoGoogleForms(Base):
    __tablename__ = "importacoes_google_forms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDENTE")
    solicitada_em: Mapped[datetime] = mapped_column(DateTime)
    iniciada_em: Mapped[datetime | None] = mapped_column(DateTime)
    concluida_em: Mapped[datetime | None] = mapped_column(DateTime)
    criados: Mapped[int] = mapped_column(Integer, default=0)
    atualizados: Mapped[int] = mapped_column(Integer, default=0)
    ja_cadastrados: Mapped[int] = mapped_column(Integer, default=0)
    ja_processados: Mapped[int] = mapped_column(Integer, default=0)
    erros: Mapped[int] = mapped_column(Integer, default=0)
    mensagem: Mapped[str | None] = mapped_column(String(255))
