import secrets
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import (
    Aluno,
    AluTurma,
    Aula,
    Chamada,
    DocTurma,
    Materia,
    Presenca,
    Professor,
    Turma,
    Usuario,
)
from ..security import usuario_atual
from ..services.faltas import faltas_do_vinculo, sincronizar_faltas
from ..xlsx.diario import gerar_diario_xlsx

router = APIRouter(prefix="/turmas", tags=["presenças"])
public_router = APIRouter(prefix="/presenca-publica", tags=["presença pública"])


class MarcarPresencaInput(BaseModel):
    cod_alu: int


class AbrirChamadaInput(BaseModel):
    aula_id: int | None = None


class RegistrarPresencaInput(BaseModel):
    presente: bool


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _hoje_local():
    return datetime.now(ZoneInfo(settings.timezone)).date()


def _cod_professor_usuario(db: Session, user) -> int | None:
    if not isinstance(user, str):
        return None
    usuario = db.get(Usuario, user)
    if usuario and (usuario.perfil or "").upper() == "PROFESSOR":
        if usuario.cod_pro is None:
            raise HTTPException(403, "Professor sem cadastro vinculado")
        return usuario.cod_pro
    return None


def _validar_acesso_chamada(
    db: Session,
    user,
    chamada: Chamada,
) -> None:
    cod_pro = _cod_professor_usuario(db, user)
    if cod_pro is None:
        return
    if chamada.aula_id is None:
        raise HTTPException(403, "A chamada não está vinculada a uma aula sua")
    permitido = db.scalar(
        select(func.count())
        .select_from(Aula)
        .join(DocTurma, DocTurma.id == Aula.docturma_id)
        .where(Aula.id == chamada.aula_id, DocTurma.cod_pro == cod_pro)
    ) or 0
    if not permitido:
        raise HTTPException(403, "Você não possui acesso a esta chamada")


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
    user: str = Depends(usuario_atual),
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
    cod_pro = _cod_professor_usuario(db, user)
    if cod_pro is not None:
        consulta = consulta.where(
            Chamada.aula_id.in_(
                select(Aula.id)
                .join(DocTurma, DocTurma.id == Aula.docturma_id)
                .where(DocTurma.cod_pro == cod_pro)
            )
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
    user: str = Depends(usuario_atual),
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
    cod_pro = _cod_professor_usuario(db, user)
    if cod_pro is not None:
        consulta = consulta.where(DocTurma.cod_pro == cod_pro)
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
def obter_chamada(
    cod_tur: int,
    chamada_id: int,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    chamada = db.get(Chamada, chamada_id)
    if not chamada or chamada.cod_tur != cod_tur:
        raise HTTPException(404, "Chamada não encontrada")
    _validar_acesso_chamada(db, user, chamada)
    return _detalhe_chamada(db, chamada)


@router.post("/{cod_tur}/chamadas/abrir")
def abrir_chamada(
    cod_tur: int,
    dados: AbrirChamadaInput | None = None,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    turma = db.get(Turma, cod_tur)
    if not turma:
        raise HTTPException(404, "Turma não encontrada")

    hoje = _hoje_local()
    agora = _agora_utc()
    aula = None
    cod_pro = _cod_professor_usuario(db, user)
    if cod_pro is not None and (not dados or dados.aula_id is None):
        raise HTTPException(400, "Selecione uma das suas aulas para abrir a chamada")
    if dados and dados.aula_id is not None:
        aula = db.get(Aula, dados.aula_id)
        if not aula:
            raise HTTPException(404, "Aula não encontrada")
        vinculo = db.get(DocTurma, aula.docturma_id)
        if not vinculo or vinculo.cod_tur != cod_tur:
            raise HTTPException(400, "Aula não pertence a esta turma")
        if cod_pro is not None and vinculo.cod_pro != cod_pro:
            raise HTTPException(403, "Você não possui acesso a esta aula")
        if aula.data != hoje:
            raise HTTPException(400, "A chamada só pode ser aberta na data da aula")
        if aula.status == "CANCELADA":
            raise HTTPException(400, "Não é possível abrir chamada de aula cancelada")
    # Chamadas esquecidas abertas em dias anteriores deixam de ser utilizáveis.
    consulta_antigas = select(Chamada).where(
            Chamada.cod_tur == cod_tur,
            Chamada.status == "ABERTA",
            Chamada.data != hoje,
        )
    if cod_pro is not None:
        consulta_antigas = consulta_antigas.where(
            Chamada.aula_id.in_(
                select(Aula.id)
                .join(DocTurma, DocTurma.id == Aula.docturma_id)
                .where(DocTurma.cod_pro == cod_pro)
            )
        )
    for antiga in db.scalars(consulta_antigas):
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
def encerrar_chamada(
    cod_tur: int,
    chamada_id: int,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    chamada = db.get(Chamada, chamada_id)
    if not chamada or chamada.cod_tur != cod_tur:
        raise HTTPException(404, "Chamada não encontrada")
    _validar_acesso_chamada(db, user, chamada)
    chamada.status = "ENCERRADA"
    chamada.encerrada_em = _agora_utc()
    db.commit()
    if chamada.aula_id is not None:
        aula = db.get(Aula, chamada.aula_id)
        if aula:
            aula.status = "REALIZADA"
            sincronizar_faltas(db, aula.docturma_id)
            db.commit()
    return _detalhe_chamada(db, chamada)


def _vinculo_do_diario(
    db: Session,
    user,
    cod_tur: int,
    docturma_id: int,
) -> DocTurma:
    """Valida que o vínculo pertence à turma e que o usuário pode vê-lo."""
    vinculo = db.get(DocTurma, docturma_id)
    if not vinculo or vinculo.cod_tur != cod_tur:
        raise HTTPException(404, "Matéria da turma não encontrada")
    cod_pro = _cod_professor_usuario(db, user)
    if cod_pro is not None and vinculo.cod_pro != cod_pro:
        raise HTTPException(403, "Você não possui acesso a esta turma e matéria")
    return vinculo


def _alunos_do_diario(db: Session, cod_tur: int) -> list[tuple[int, str]]:
    """Alunos ativos da turma, na mesma ordem usada pelo diário em XLSX."""
    return list(
        db.execute(
            select(Aluno.cod_alu, Aluno.nome)
            .join(AluTurma, AluTurma.cod_alu == Aluno.cod_alu)
            .where(
                AluTurma.cod_tur == cod_tur,
                (AluTurma.status.is_(None))
                | (~AluTurma.status.in_(["I", "INATIVO"])),
            )
            .order_by(Aluno.nome)
        )
    )


@router.get("/{cod_tur}/diario/vinculos")
def vinculos_do_diario(
    cod_tur: int,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    """Matérias da turma visíveis para quem consulta o diário."""
    if not db.get(Turma, cod_tur):
        raise HTTPException(404, "Turma não encontrada")
    aulas = (
        select(
            Aula.docturma_id.label("docturma_id"),
            func.count(Aula.id).label("total_aulas"),
        )
        .where(Aula.status != "CANCELADA")
        .group_by(Aula.docturma_id)
        .subquery()
    )
    consulta = (
        select(
            DocTurma,
            Materia.NOME,
            Professor.nome,
            func.coalesce(aulas.c.total_aulas, 0),
        )
        .join(Materia, Materia.cod_mat == DocTurma.cod_mat)
        .join(Professor, Professor.cod_pro == DocTurma.cod_pro, isouter=True)
        .join(aulas, aulas.c.docturma_id == DocTurma.id, isouter=True)
        .where(DocTurma.cod_tur == cod_tur)
        .order_by(Materia.NOME)
    )
    cod_pro = _cod_professor_usuario(db, user)
    if cod_pro is not None:
        consulta = consulta.where(DocTurma.cod_pro == cod_pro)
    return [
        {
            "docturma_id": vinculo.id,
            "cod_mat": vinculo.cod_mat,
            "materia_nome": (materia_nome or "").strip(),
            "professor_nome": professor_nome,
            "ano": vinculo.Ano,
            "semestre": vinculo.semestre,
            "total_aulas": int(total_aulas or 0),
        }
        for vinculo, materia_nome, professor_nome, total_aulas in db.execute(consulta)
    ]


@router.get("/{cod_tur}/diario")
def obter_diario(
    cod_tur: int,
    docturma_id: int = Query(...),
    inicio: date | None = Query(default=None),
    fim: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    """Grade alunos × aulas de uma matéria, no formato do diário de classe."""
    turma = db.get(Turma, cod_tur)
    if not turma:
        raise HTTPException(404, "Turma não encontrada")
    vinculo = _vinculo_do_diario(db, user, cod_tur, docturma_id)
    materia = db.get(Materia, vinculo.cod_mat)
    professor = db.get(Professor, vinculo.cod_pro) if vinculo.cod_pro else None

    consulta_aulas = select(Aula).where(
        Aula.docturma_id == docturma_id,
        Aula.status != "CANCELADA",
    )
    if inicio:
        consulta_aulas = consulta_aulas.where(Aula.data >= inicio)
    if fim:
        consulta_aulas = consulta_aulas.where(Aula.data <= fim)
    aulas = list(
        db.scalars(consulta_aulas.order_by(Aula.data, Aula.hora_inicio, Aula.id))
    )

    # As chamadas abertas também entram na grade; o status por aula avisa a UI.
    chamadas = {}
    # As chaves da grade são o id da aula em texto, como sai no JSON.
    celulas: dict[int, dict[str, str]] = {}
    if aulas:
        ids_aulas = [aula.id for aula in aulas]
        for chamada in db.scalars(
            select(Chamada).where(Chamada.aula_id.in_(ids_aulas))
        ):
            chamadas[chamada.aula_id] = chamada
        if chamadas:
            por_chamada = {
                chamada.id: aula_id for aula_id, chamada in chamadas.items()
            }
            for chamada_id, cod_alu, registrado_em in db.execute(
                select(
                    Presenca.chamada_id,
                    Presenca.cod_alu,
                    Presenca.registrado_em,
                ).where(Presenca.chamada_id.in_(list(por_chamada)))
            ):
                aula_id = por_chamada[chamada_id]
                celulas.setdefault(cod_alu, {})[str(aula_id)] = (
                    "P" if registrado_em is not None else "F"
                )

    faltas = faltas_do_vinculo(db, docturma_id)
    alunos = _alunos_do_diario(db, cod_tur)
    aulas_com_chamada = sum(
        1
        for aula in aulas
        if chamadas.get(aula.id) is not None
        and chamadas[aula.id].status == "ENCERRADA"
    )
    return {
        "vinculo": {
            "docturma_id": vinculo.id,
            "cod_tur": cod_tur,
            "cod_mat": vinculo.cod_mat,
            "turma_nome": turma.nome,
            "curso": turma.curso,
            "materia_nome": (materia.NOME or "").strip() if materia else "",
            "professor_nome": professor.nome if professor else None,
            "ano": vinculo.Ano,
            "semestre": vinculo.semestre,
        },
        "aulas": [
            {
                "id": aula.id,
                "data": aula.data.isoformat(),
                "hora_inicio": (
                    aula.hora_inicio.strftime("%H:%M") if aula.hora_inicio else None
                ),
                "status": aula.status,
                "tema": aula.tema,
                "chamada_status": (
                    chamadas[aula.id].status if aula.id in chamadas else None
                ),
            }
            for aula in aulas
        ],
        "alunos": [
            {
                "cod_alu": cod_alu,
                "nome": (nome or f"Aluno {cod_alu}").strip(),
                "faltas": faltas.get(cod_alu, 0),
                "celulas": celulas.get(cod_alu, {}),
            }
            for cod_alu, nome in alunos
        ],
        "resumo": {
            "total_aulas": len(aulas),
            "aulas_com_chamada": aulas_com_chamada,
            "total_alunos": len(alunos),
        },
    }


@router.put("/{cod_tur}/diario/aulas/{aula_id}/presencas/{cod_alu}")
def registrar_presenca_diario(
    cod_tur: int,
    aula_id: int,
    cod_alu: int,
    dados: RegistrarPresencaInput,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    """Corrige a presença de um aluno numa aula direto pelo diário."""
    aula = db.get(Aula, aula_id)
    if not aula:
        raise HTTPException(404, "Aula não encontrada")
    vinculo = _vinculo_do_diario(db, user, cod_tur, aula.docturma_id)
    if aula.status == "CANCELADA":
        raise HTTPException(400, "A aula foi cancelada")
    if aula.data > _hoje_local():
        raise HTTPException(400, "A aula ainda não aconteceu")

    agora = _agora_utc()
    chamada = db.scalar(select(Chamada).where(Chamada.aula_id == aula.id))
    if not chamada:
        # Aula passada sem chamada: nasce encerrada, então o totem público
        # devolve 410 e o token nunca chega a ser divulgado.
        chamada = Chamada(
            cod_tur=cod_tur,
            aula_id=aula.id,
            data=aula.data,
            token=secrets.token_urlsafe(32),
            status="ENCERRADA",
            aberta_em=agora,
            encerrada_em=agora,
        )
        db.add(chamada)
        db.flush()
        _sincronizar_alunos(db, chamada)
        db.flush()
        # No lançamento retroativo a turma inteira entra como presente: o
        # professor marca apenas quem faltou, e não o contrário.
        for presenca in db.scalars(
            select(Presenca).where(Presenca.chamada_id == chamada.id)
        ):
            presenca.registrado_em = agora
        db.flush()

    registro = db.scalar(
        select(Presenca).where(
            Presenca.chamada_id == chamada.id,
            Presenca.cod_alu == cod_alu,
        )
    )
    if not registro:
        raise HTTPException(404, "Aluno não está nesta chamada")
    registro.registrado_em = agora if dados.presente else None
    if chamada.status == "ENCERRADA" and aula.status != "REALIZADA":
        aula.status = "REALIZADA"
    faltas = sincronizar_faltas(db, vinculo.id)
    db.commit()
    return {
        "cod_alu": cod_alu,
        "aula_id": aula.id,
        "presente": dados.presente,
        "faltas": faltas.get(cod_alu, 0),
        "aula_status": aula.status,
        "chamada_status": chamada.status,
    }


@router.get("/{cod_tur}/diario.xlsx")
def diario_xlsx_turma(
    cod_tur: int,
    docturma_id: int = Query(...),
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    """Mesmo diário em XLSX, acessível também ao professor da matéria."""
    _vinculo_do_diario(db, user, cod_tur, docturma_id)
    try:
        conteudo, nome = gerar_diario_xlsx(db, docturma_id)
    except ValueError as erro:
        raise HTTPException(400, str(erro))
    return Response(
        content=conteudo,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )


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
