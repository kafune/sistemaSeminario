from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class WhatsappConfiguracao(Base):
    __tablename__ = "whatsapp_configuracao"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    instancia_id: Mapped[str | None] = mapped_column(String(100))
    nome: Mapped[str] = mapped_column(String(100))
    token_criptografado: Mapped[str] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(DateTime)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime)


class WhatsappDisparo(Base):
    __tablename__ = "whatsapp_disparos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario: Mapped[str] = mapped_column(String(50), index=True)
    tipo_publico: Mapped[str] = mapped_column(String(20))
    cod_tur: Mapped[int | None] = mapped_column(Integer, index=True)
    publico_descricao: Mapped[str] = mapped_column(String(255))
    mensagem_modelo: Mapped[str] = mapped_column(Text)
    link_preview: Mapped[str] = mapped_column(String(1), default="N")
    pasta_uazapi_id: Mapped[str | None] = mapped_column(String(100), index=True)
    status: Mapped[str] = mapped_column(String(30), index=True)
    total_selecionados: Mapped[int] = mapped_column(Integer, default=0)
    total_validos: Mapped[int] = mapped_column(Integer, default=0)
    total_invalidos: Mapped[int] = mapped_column(Integer, default=0)
    total_agendados: Mapped[int] = mapped_column(Integer, default=0)
    total_enviados: Mapped[int] = mapped_column(Integer, default=0)
    total_falhos: Mapped[int] = mapped_column(Integer, default=0)
    erro: Mapped[str | None] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(DateTime, index=True)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime)


class WhatsappDestinatario(Base):
    __tablename__ = "whatsapp_destinatarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    disparo_id: Mapped[int] = mapped_column(Integer, index=True)
    cod_alu: Mapped[int] = mapped_column(Integer, index=True)
    nome: Mapped[str] = mapped_column(String(100))
    celular_original: Mapped[str | None] = mapped_column(String(30))
    numero_normalizado: Mapped[str | None] = mapped_column(String(20), index=True)
    mensagem_final: Mapped[str | None] = mapped_column(Text)
    valido: Mapped[str] = mapped_column(String(1))
    motivo: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), index=True)
    erro: Mapped[str | None] = mapped_column(Text)
