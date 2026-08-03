import secrets
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import Aluno, AluTurma, Chamada, Presenca, Turma

router = APIRouter(prefix="/turmas", tags=["presenças"])
public_router = APIRouter(prefix="/presenca-publica", tags=["presença pública"])


class MarcarPresencaInput(BaseModel):
    cod_alu: int


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _hoje_local():
    return datetime.now(ZoneInfo(settings.timezone)).date()


def _data_hora_publica(valor: datetime | None) -> str | None:
    # Os registros são persistidos em UTC sem timezone para compatibilidade com MySQL.
    return f"{valor.isoformat()}Z" if valor else None


def _sincronizar_alunos(db: Session, chamada: Chamada) -> None:
    existentes = set(
        db.scalars(select(Presenca.cod_alu).where(Presenca.chamada_id == chamada.id))
    )
    matriculados = db.execute(
        select(Aluno.cod_alu, Aluno.nome)
        .join(AluTurma, AluTurma.cod_alu == Aluno.cod_alu)
        .where(AluTurma.cod_tur == chamada.cod_tur)
        .order_by(Aluno.nome)
    )
    for cod_alu, nome in matriculados:
        if cod_alu not in existentes:
            db.add(
                Presenca(
                    chamada_id=chamada.id,
                    cod_alu=cod_alu,
                    nome_aluno=(nome or f"Aluno {cod_alu}").strip(),
                    registrado_em=None,
                )
            )


def _resumo_chamada(chamada: Chamada, total: int, presentes: int) -> dict:
    return {
        "id": chamada.id,
        "data": chamada.data.isoformat(),
        "status": chamada.status,
        "token": chamada.token,
        "aberta_em": _data_hora_publica(chamada.aberta_em),
        "encerrada_em": _data_hora_publica(chamada.encerrada_em),
        "total": int(total or 0),
        "presentes": int(presentes or 0),
        "ausentes": max(0, int(total or 0) - int(presentes or 0)),
    }


def _detalhe_chamada(db: Session, chamada: Chamada) -> dict:
    registros = list(
        db.scalars(
            select(Presenca)
            .where(Presenca.chamada_id == chamada.id)
            .order_by(Presenca.nome_aluno)
        )
    )
    presentes = sum(item.registrado_em is not None for item in registros)
    resposta = _resumo_chamada(chamada, len(registros), presentes)
    resposta["alunos"] = [
        {
            "cod_alu": item.cod_alu,
            "nome": item.nome_aluno,
            "presente": item.registrado_em is not None,
            "registrado_em": _data_hora_publica(item.registrado_em),
        }
        for item in registros
    ]
    return resposta


def _chamada_publica(db: Session, token: str) -> Chamada:
    chamada = db.scalar(select(Chamada).where(Chamada.token == token))
    if not chamada:
        raise HTTPException(404, "Chamada não encontrada")
    if chamada.status != "ABERTA" or chamada.data != _hoje_local():
        raise HTTPException(410, "Esta chamada já foi encerrada")
    return chamada


@router.get("/{cod_tur}/chamadas")
def listar_chamadas(
    cod_tur: int,
    limite: int = Query(default=30, ge=1, le=120),
    db: Session = Depends(get_db),
):
    if not db.get(Turma, cod_tur):
        raise HTTPException(404, "Turma não encontrada")
    contagens = (
        select(
            Presenca.chamada_id.label("chamada_id"),
            func.count(Presenca.id).label("total"),
            func.count(Presenca.registrado_em).label("presentes"),
        )
        .group_by(Presenca.chamada_id)
        .subquery()
    )
    consulta = (
        select(
            Chamada,
            func.coalesce(contagens.c.total, 0),
            func.coalesce(contagens.c.presentes, 0),
        )
        .join(contagens, contagens.c.chamada_id == Chamada.id, isouter=True)
        .where(Chamada.cod_tur == cod_tur)
        .order_by(Chamada.data.desc(), Chamada.id.desc())
        .limit(limite)
    )
    return [_resumo_chamada(chamada, total, presentes) for chamada, total, presentes in db.execute(consulta)]


@router.get("/{cod_tur}/chamadas/{chamada_id}")
def obter_chamada(cod_tur: int, chamada_id: int, db: Session = Depends(get_db)):
    chamada = db.get(Chamada, chamada_id)
    if not chamada or chamada.cod_tur != cod_tur:
        raise HTTPException(404, "Chamada não encontrada")
    return _detalhe_chamada(db, chamada)


@router.post("/{cod_tur}/chamadas/abrir")
def abrir_chamada(cod_tur: int, db: Session = Depends(get_db)):
    turma = db.get(Turma, cod_tur)
    if not turma:
        raise HTTPException(404, "Turma não encontrada")

    hoje = _hoje_local()
    agora = _agora_utc()
    # Chamadas esquecidas abertas em dias anteriores deixam de ser utilizáveis.
    for antiga in db.scalars(
        select(Chamada).where(
            Chamada.cod_tur == cod_tur,
            Chamada.status == "ABERTA",
            Chamada.data != hoje,
        )
    ):
        antiga.status = "ENCERRADA"
        antiga.encerrada_em = agora

    chamada = db.scalar(
        select(Chamada).where(Chamada.cod_tur == cod_tur, Chamada.data == hoje)
    )
    if chamada:
        chamada.status = "ABERTA"
        chamada.encerrada_em = None
    else:
        chamada = Chamada(
            cod_tur=cod_tur,
            data=hoje,
            token=secrets.token_urlsafe(32),
            status="ABERTA",
            aberta_em=agora,
            encerrada_em=None,
        )
        db.add(chamada)
        db.flush()

    _sincronizar_alunos(db, chamada)
    db.commit()
    db.refresh(chamada)
    return _detalhe_chamada(db, chamada)


@router.post("/{cod_tur}/chamadas/{chamada_id}/encerrar")
def encerrar_chamada(cod_tur: int, chamada_id: int, db: Session = Depends(get_db)):
    chamada = db.get(Chamada, chamada_id)
    if not chamada or chamada.cod_tur != cod_tur:
        raise HTTPException(404, "Chamada não encontrada")
    chamada.status = "ENCERRADA"
    chamada.encerrada_em = _agora_utc()
    db.commit()
    return _detalhe_chamada(db, chamada)


@public_router.get("/{token}")
def obter_chamada_publica(token: str, db: Session = Depends(get_db)):
    chamada = _chamada_publica(db, token)
    turma = db.get(Turma, chamada.cod_tur)
    if not turma:
        raise HTTPException(404, "Turma não encontrada")
    detalhe = _detalhe_chamada(db, chamada)
    # O token e os identificadores internos da chamada não precisam ir ao totem.
    detalhe.pop("id", None)
    detalhe.pop("token", None)
    detalhe.pop("encerrada_em", None)
    detalhe["turma"] = {
        "cod_tur": turma.cod_tur,
        "nome": turma.nome,
        "curso": turma.curso,
        "horario": turma.horario,
    }
    return detalhe


@public_router.post("/{token}")
def marcar_presenca(
    token: str,
    dados: MarcarPresencaInput,
    db: Session = Depends(get_db),
):
    chamada = _chamada_publica(db, token)
    registro = db.scalar(
        select(Presenca).where(
            Presenca.chamada_id == chamada.id,
            Presenca.cod_alu == dados.cod_alu,
        )
    )
    if not registro:
        raise HTTPException(404, "Aluno não está nesta chamada")
    if registro.registrado_em is None:
        registro.registrado_em = _agora_utc()
        db.commit()
    return {
        "ok": True,
        "nome": registro.nome_aluno,
        "registrado_em": _data_hora_publica(registro.registrado_em),
    }
