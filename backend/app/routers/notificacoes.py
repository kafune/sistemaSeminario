from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import Notificacao, NotificacaoPreferencia, PushInscricao
from ..security import usuario_atual
from ..services.notificacoes import agora_utc, hash_endpoint, preferencias_para, push_configurado

router = APIRouter(prefix="/notificacoes", tags=["notificações"])


def _dict(item: Notificacao) -> dict:
    return {
        "id": item.id,
        "categoria": item.categoria,
        "titulo": item.titulo,
        "corpo": item.corpo,
        "rota": item.rota,
        "criado_em": item.criado_em.isoformat(),
        "lido_em": item.lido_em.isoformat() if item.lido_em else None,
        "lida": item.lido_em is not None,
    }


@router.get("")
def listar(
    pagina: int = 1,
    por_pagina: int = 50,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    pagina = max(1, pagina)
    por_pagina = min(max(1, por_pagina), 100)
    consulta = select(Notificacao).where(Notificacao.usuario == usuario)
    total = db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    itens = list(
        db.scalars(
            consulta.order_by(Notificacao.criado_em.desc(), Notificacao.id.desc())
            .offset((pagina - 1) * por_pagina)
            .limit(por_pagina)
        )
    )
    return {"total": total, "pagina": pagina, "itens": [_dict(item) for item in itens]}


@router.get("/nao-lidas")
def nao_lidas(
    db: Session = Depends(get_db), usuario: str = Depends(usuario_atual)
):
    quantidade = db.scalar(
        select(func.count()).select_from(Notificacao).where(
            Notificacao.usuario == usuario, Notificacao.lido_em.is_(None)
        )
    ) or 0
    return {"quantidade": quantidade}


@router.post("/{notificacao_id}/ler")
def marcar_lida(
    notificacao_id: int,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    item = db.get(Notificacao, notificacao_id)
    if not item or item.usuario != usuario:
        raise HTTPException(404, "Notificação não encontrada")
    if item.lido_em is None:
        item.lido_em = agora_utc()
        db.commit()
    return _dict(item)


@router.post("/ler-todas")
def marcar_todas_lidas(
    db: Session = Depends(get_db), usuario: str = Depends(usuario_atual)
):
    itens = list(
        db.scalars(
            select(Notificacao).where(
                Notificacao.usuario == usuario, Notificacao.lido_em.is_(None)
            )
        )
    )
    for item in itens:
        item.lido_em = agora_utc()
    db.commit()
    return {"ok": True, "quantidade": len(itens)}


class PreferenciasInput(BaseModel):
    push_whatsapp: bool = True
    push_cadastros: bool = True
    push_aulas: bool = True


def _preferencias_dict(item: NotificacaoPreferencia) -> dict:
    return {
        "push_whatsapp": item.push_whatsapp,
        "push_cadastros": item.push_cadastros,
        "push_aulas": item.push_aulas,
    }


@router.get("/preferencias")
def obter_preferencias(
    db: Session = Depends(get_db), usuario: str = Depends(usuario_atual)
):
    preferencias = preferencias_para(db, usuario)
    db.commit()
    return _preferencias_dict(preferencias)


@router.put("/preferencias")
def atualizar_preferencias(
    dados: PreferenciasInput,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    preferencias = preferencias_para(db, usuario)
    for campo, valor in dados.model_dump().items():
        setattr(preferencias, campo, valor)
    preferencias.atualizado_em = agora_utc()
    db.commit()
    return _preferencias_dict(preferencias)


@router.get("/push/configuracao")
def configuracao_push():
    return {
        "disponivel": push_configurado(),
        "chave_publica": settings.vapid_public_key if push_configurado() else None,
    }


class InscricaoInput(BaseModel):
    endpoint: str = Field(min_length=10, max_length=4000)
    keys: dict[str, str]


@router.post("/push/inscricoes")
def inscrever_push(
    dados: InscricaoInput,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    if not push_configurado():
        raise HTTPException(503, "Notificações push não estão configuradas")
    p256dh = dados.keys.get("p256dh", "")
    auth = dados.keys.get("auth", "")
    if not p256dh or not auth:
        raise HTTPException(400, "Inscrição push inválida")
    agora = agora_utc()
    endpoint_hash = hash_endpoint(dados.endpoint)
    inscricao = db.scalar(
        select(PushInscricao).where(PushInscricao.endpoint_hash == endpoint_hash)
    )
    if not inscricao:
        inscricao = PushInscricao(
            usuario=usuario,
            endpoint=dados.endpoint,
            endpoint_hash=endpoint_hash,
            chave_p256dh=p256dh,
            chave_auth=auth,
            ativo=True,
            criado_em=agora,
            atualizado_em=agora,
            usado_em=None,
        )
        db.add(inscricao)
    else:
        inscricao.usuario = usuario
        inscricao.endpoint = dados.endpoint
        inscricao.chave_p256dh = p256dh
        inscricao.chave_auth = auth
        inscricao.ativo = True
        inscricao.atualizado_em = agora
    db.commit()
    return {"ok": True}


class DesinscreverInput(BaseModel):
    endpoint: str = Field(min_length=10, max_length=4000)


@router.post("/push/desinscrever")
def desinscrever_push(
    dados: DesinscreverInput,
    db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    inscricao = db.scalar(
        select(PushInscricao).where(
            PushInscricao.usuario == usuario,
            PushInscricao.endpoint_hash == hash_endpoint(dados.endpoint),
        )
    )
    if inscricao:
        inscricao.ativo = False
        inscricao.atualizado_em = agora_utc()
        db.commit()
    return {"ok": True}
