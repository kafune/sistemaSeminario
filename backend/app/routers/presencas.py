import secrets
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import (
    Aluno,
    AluNota,
    AluTurma,
    Aula,
    Chamada,
    DocTurma,
    Materia,
    Presenca,
    Professor,
    Turma,
)
from ..services.faltas import faltas_do_vinculo

router = APIRouter(prefix="/turmas", tags=["presenças"])
public_router = APIRouter(prefix="/presenca-publica", tags=["presença pública"])


class MarcarPresencaInput(BaseModel):
    cod_alu: int


class AbrirChamadaInput(BaseModel):
    aula_id: int | None = None


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


def _resumo_chamada(
    chamada: Chamada,
    total: int,
    presentes: int,
    aula_info: dict | None = None,
) -> dict:
    resposta = {
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
    if aula_info:
        resposta["aula"] = aula_info
    return resposta


def _aula_info(db: Session, chamada: Chamada) -> dict | None:
    if chamada.aula_id is None:
        return None
    linha = db.execute(
        select(Aula, DocTurma, Materia.NOME, Professor.nome)
        .join(DocTurma, DocTurma.id == Aula.docturma_id)
        .join(Materia, Materia.cod_mat == DocTurma.cod_mat)
        .join(Professor, Professor.cod_pro == DocTurma.cod_pro, isouter=True)
        .where(Aula.id == chamada.aula_id)
    ).first()
    if not linha:
        return None
    aula, vinculo, materia_nome, professor_nome = linha
    return {
        "id": aula.id,
        "docturma_id": vinculo.id,
        "materia_nome": (materia_nome or "").strip(),
        "professor_nome": professor_nome,
        "hora_inicio": aula.hora_inicio.strftime("%H:%M") if aula.hora_inicio else None,
        "hora_fim": aula.hora_fim.strftime("%H:%M") if aula.hora_fim else None,
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
    resposta = _resumo_chamada(
        chamada,
        len(registros),
        presentes,
        _aula_info(db, chamada),
    )
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
    return [
        _resumo_chamada(
            chamada,
            total,
            presentes,
            _aula_info(db, chamada),
        )
        for chamada, total, presentes in db.execute(consulta)
    ]


@router.get("/{cod_tur}/chamadas/aulas-disponiveis")
def aulas_disponiveis(
    cod_tur: int,
    data: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    if not db.get(Turma, cod_tur):
        raise HTTPException(404, "Turma não encontrada")
    dia = data or _hoje_local()
    consulta = (
        select(Aula, DocTurma, Materia.NOME, Professor.nome, Chamada.id)
        .join(DocTurma, DocTurma.id == Aula.docturma_id)
        .join(Materia, Materia.cod_mat == DocTurma.cod_mat)
        .join(Professor, Professor.cod_pro == DocTurma.cod_pro, isouter=True)
        .join(Chamada, Chamada.aula_id == Aula.id, isouter=True)
        .where(
            DocTurma.cod_tur == cod_tur,
            Aula.data == dia,
            Aula.status != "CANCELADA",
        )
        .order_by(Aula.hora_inicio, Materia.NOME)
    )
    return [
        {
            "aula_id": aula.id,
            "docturma_id": vinculo.id,
            "data": aula.data.isoformat(),
            "hora_inicio": aula.hora_inicio.strftime("%H:%M") if aula.hora_inicio else None,
            "hora_fim": aula.hora_fim.strftime("%H:%M") if aula.hora_fim else None,
            "materia_nome": (materia_nome or "").strip(),
            "professor_nome": professor_nome,
            "chamada_id": chamada_id,
        }
        for aula, vinculo, materia_nome, professor_nome, chamada_id in db.execute(consulta)
    ]


@router.get("/{cod_tur}/chamadas/{chamada_id}")
def obter_chamada(cod_tur: int, chamada_id: int, db: Session = Depends(get_db)):
    chamada = db.get(Chamada, chamada_id)
    if not chamada or chamada.cod_tur != cod_tur:
        raise HTTPException(404, "Chamada não encontrada")
    return _detalhe_chamada(db, chamada)


@router.post("/{cod_tur}/chamadas/abrir")
def abrir_chamada(
    cod_tur: int,
    dados: AbrirChamadaInput | None = None,
    db: Session = Depends(get_db),
):
    turma = db.get(Turma, cod_tur)
    if not turma:
        raise HTTPException(404, "Turma não encontrada")

    hoje = _hoje_local()
    agora = _agora_utc()
    aula = None
    if dados and dados.aula_id is not None:
        aula = db.get(Aula, dados.aula_id)
        if not aula:
            raise HTTPException(404, "Aula não encontrada")
        vinculo = db.get(DocTurma, aula.docturma_id)
        if not vinculo or vinculo.cod_tur != cod_tur:
            raise HTTPException(400, "Aula não pertence a esta turma")
        if aula.data != hoje:
            raise HTTPException(400, "A chamada só pode ser aberta na data da aula")
        if aula.status == "CANCELADA":
            raise HTTPException(400, "Não é possível abrir chamada de aula cancelada")
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

    if aula:
        chamada = db.scalar(select(Chamada).where(Chamada.aula_id == aula.id))
    else:
        # Compatibilidade com chamadas antigas e integrações sem calendário.
        chamada = db.scalar(
            select(Chamada).where(
                Chamada.cod_tur == cod_tur,
                Chamada.data == hoje,
                Chamada.aula_id.is_(None),
            )
        )
    if chamada:
        chamada.status = "ABERTA"
        chamada.encerrada_em = None
    else:
        chamada = Chamada(
            cod_tur=cod_tur,
            aula_id=aula.id if aula else None,
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
    if chamada.aula_id is not None:
        aula = db.get(Aula, chamada.aula_id)
        if aula:
            aula.status = "REALIZADA"
            faltas = faltas_do_vinculo(db, aula.docturma_id)
            for nota in db.scalars(
                select(AluNota).where(AluNota.docturma_id == aula.docturma_id)
            ):
                nota.falta = faltas.get(nota.cod_alu, 0)
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
