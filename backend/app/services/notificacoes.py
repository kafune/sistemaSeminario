"""Persistência e entrega de notificações internas e Web Push.

Os textos enviados por push são os mesmos textos seguros usados na central;
eventos acadêmicos detalhados nunca são serializados no payload do push.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Aula, Notificacao, NotificacaoPreferencia, PushInscricao, Usuario

CATEGORIAS = {"WHATSAPP", "CADASTROS", "AULAS"}
CAMPO_PREFERENCIA = {
    "WHATSAPP": "push_whatsapp",
    "CADASTROS": "push_cadastros",
    "AULAS": "push_aulas",
}


def agora_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def agora_local() -> datetime:
    return datetime.now(ZoneInfo(settings.timezone))


def push_configurado() -> bool:
    return bool(
        settings.vapid_public_key.strip()
        and settings.vapid_private_key.strip()
        and settings.vapid_subject.strip()
    )


def preferencias_para(db: Session, usuario: str) -> NotificacaoPreferencia:
    preferencias = db.get(NotificacaoPreferencia, usuario)
    if preferencias:
        return preferencias
    preferencias = NotificacaoPreferencia(usuario=usuario, atualizado_em=agora_utc())
    db.add(preferencias)
    db.flush()
    return preferencias


def criar_notificacao(
    db: Session,
    *,
    usuario: str,
    categoria: str,
    titulo: str,
    corpo: str,
    rota: str | None,
    chave_evento: str,
) -> Notificacao | None:
    """Cria um único item por usuário/evento, inclusive sob reexecuções."""
    if categoria not in CATEGORIAS:
        raise ValueError("Categoria de notificação inválida")
    existente = db.scalar(
        select(Notificacao).where(
            Notificacao.usuario == usuario,
            Notificacao.chave_evento == chave_evento,
        )
    )
    if existente:
        return None
    with db.begin_nested():
        notificacao = Notificacao(
            usuario=usuario,
            categoria=categoria,
            titulo=titulo[:120],
            corpo=corpo[:500],
            rota=rota[:500] if rota else None,
            chave_evento=chave_evento[:191],
            criado_em=agora_utc(),
            lido_em=None,
        )
        db.add(notificacao)
        try:
            db.flush()
        except Exception:
            # A restrição única é a proteção final para execuções concorrentes.
            return None
    return notificacao


def criar_para_todos(
    db: Session,
    *,
    categoria: str,
    titulo: str,
    corpo: str,
    rota: str | None,
    chave_evento: str,
) -> list[Notificacao]:
    criadas: list[Notificacao] = []
    for usuario in db.scalars(
        select(Usuario.user).where(Usuario.perfil != "PROFESSOR")
    ):
        item = criar_notificacao(
            db,
            usuario=usuario,
            categoria=categoria,
            titulo=titulo,
            corpo=corpo,
            rota=rota,
            chave_evento=chave_evento,
        )
        if item:
            criadas.append(item)
    return criadas


def _push_habilitado(db: Session, inscricao: PushInscricao, categoria: str) -> bool:
    preferencias = preferencias_para(db, inscricao.usuario)
    return bool(getattr(preferencias, CAMPO_PREFERENCIA[categoria]))


def entregar_push(db: Session, notificacao: Notificacao) -> int:
    """Entrega a todos os dispositivos ativos que optaram pela categoria."""
    if not push_configurado():
        return 0
    inscricoes = list(
        db.scalars(
            select(PushInscricao).where(
                PushInscricao.usuario == notificacao.usuario,
                PushInscricao.ativo.is_(True),
            )
        )
    )
    entregues = 0
    payload = json.dumps(
        {
            "notificacao_id": notificacao.id,
            "titulo": notificacao.titulo,
            "corpo": notificacao.corpo,
            "rota": notificacao.rota or "/",
        },
        ensure_ascii=False,
    )
    for inscricao in inscricoes:
        if not _push_habilitado(db, inscricao, notificacao.categoria):
            continue
        try:
            webpush(
                subscription_info={
                    "endpoint": inscricao.endpoint,
                    "keys": {"p256dh": inscricao.chave_p256dh, "auth": inscricao.chave_auth},
                },
                data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
            )
            inscricao.usado_em = agora_utc()
            entregues += 1
        except WebPushException as exc:
            resposta = getattr(exc, "response", None)
            if getattr(resposta, "status_code", None) in {404, 410}:
                inscricao.ativo = False
                inscricao.atualizado_em = agora_utc()
    db.commit()
    return entregues


def entregar_lista(db: Session, notificacoes: list[Notificacao]) -> int:
    total = 0
    for notificacao in notificacoes:
        total += entregar_push(db, notificacao)
    return total


def hash_endpoint(endpoint: str) -> str:
    return hashlib.sha256(endpoint.encode("utf-8")).hexdigest()


def limpar_notificacoes_antigas(db: Session) -> int:
    limite = agora_utc() - timedelta(days=90)
    resultado = db.execute(delete(Notificacao).where(Notificacao.criado_em < limite))
    db.commit()
    return int(resultado.rowcount or 0)


def gerar_lembretes_aulas(db: Session) -> list[Notificacao]:
    """Cria o resumo de amanhã após 18h de São Paulo, uma vez por usuário/data."""
    local = agora_local()
    if local.hour < 18:
        return []
    amanha = local.date() + timedelta(days=1)
    quantidade = db.scalar(
        select(func.count()).select_from(Aula).where(
            Aula.data == amanha, Aula.status == "AGENDADA"
        )
    ) or 0
    if not quantidade:
        return []
    criadas: list[Notificacao] = []
    plural = "aula agendada" if quantidade == 1 else "aulas agendadas"
    for usuario in db.scalars(select(Usuario.user)):
        item = criar_notificacao(
            db,
            usuario=usuario,
            categoria="AULAS",
            titulo="Aulas de amanhã",
            corpo=f"Há {quantidade} {plural} para amanhã.",
            rota="/calendario",
            chave_evento=f"aulas:{usuario}:{amanha.isoformat()}",
        )
        if item:
            criadas.append(item)
    if criadas:
        db.commit()
    return criadas
