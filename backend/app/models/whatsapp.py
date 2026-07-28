from datetime import datetime

from sqlalchemy import DateTime, Integer, LargeBinary, String, Text
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
    tipo_mensagem: Mapped[str] = mapped_column(String(20), default="text")
    conteudo_json: Mapped[str | None] = mapped_column(Text)
    link_preview: Mapped[str] = mapped_column(String(1), default="N")
    agendado_para: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    pasta_uazapi_id: Mapped[str | None] = mapped_column(String(100), index=True)
    disparo_origem_id: Mapped[int | None] = mapped_column(Integer, index=True)
    status: Mapped[str] = mapped_column(String(30), index=True)
    total_selecionados: Mapped[int] = mapped_column(Integer, default=0)
    total_validos: Mapped[int] = mapped_column(Integer, default=0)
    total_mensagens: Mapped[int] = mapped_column(Integer, default=0)
    total_invalidos: Mapped[int] = mapped_column(Integer, default=0)
    total_agendados: Mapped[int] = mapped_column(Integer, default=0)
    total_enviados: Mapped[int] = mapped_column(Integer, default=0)
    total_falhos: Mapped[int] = mapped_column(Integer, default=0)
    total_entregues: Mapped[int] = mapped_column(Integer, default=0)
    total_lidos: Mapped[int] = mapped_column(Integer, default=0)
    total_reproduzidos: Mapped[int] = mapped_column(Integer, default=0)
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


class WhatsappArquivo(Base):
    __tablename__ = "whatsapp_arquivos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token_publico: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    nome: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(120))
    tamanho: Mapped[int] = mapped_column(Integer)
    conteudo: Mapped[bytes] = mapped_column(LargeBinary(length=2**32 - 1))
    criado_por: Mapped[str] = mapped_column(String(50))
    criado_em: Mapped[datetime] = mapped_column(DateTime, index=True)


class WhatsappTemplate(Base):
    __tablename__ = "whatsapp_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    tipo_mensagem: Mapped[str] = mapped_column(String(20))
    categoria: Mapped[str] = mapped_column(String(60), default="Geral", index=True)
    favorito: Mapped[str] = mapped_column(String(1), default="N", index=True)
    versao: Mapped[int] = mapped_column(Integer, default=1)
    conteudo_json: Mapped[str] = mapped_column(Text)
    criado_por: Mapped[str] = mapped_column(String(50))
    criado_em: Mapped[datetime] = mapped_column(DateTime)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, index=True)
