"""Painel e espaço de trabalho do professor."""

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, load_only

from ..config import settings
from ..database import get_db
from ..models import (
    Aluno,
    AluNota,
    AluTurma,
    AtividadeAvaliativa,
    Aula,
    Chamada,
    ComunicadoTurma,
    DocTurma,
    Materia,
    MaterialDidatico,
    PlanejamentoAula,
    Professor,
    Turma,
    Usuario,
)
from ..security import usuario_atual
from ..services.faltas import faltas_do_vinculo

router = APIRouter(prefix="/portal-professor", tags=["portal do professor"])


class PlanejamentoInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    objetivos: str | None = Field(default=None, max_length=5000)
    conteudo: str | None = Field(default=None, max_length=10000)
    tarefa: str | None = Field(default=None, max_length=5000)
    anotacoes_privadas: str | None = Field(default=None, max_length=10000)


class ComunicadoInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    titulo: str = Field(min_length=1, max_length=150)
    mensagem: str = Field(min_length=1, max_length=5000)
    status: str = Field(default="RASCUNHO", pattern="^(RASCUNHO|PUBLICADO)$")


def _agora() -> datetime:
    return datetime.now(ZoneInfo(settings.timezone)).replace(tzinfo=None)


def _professor_logado(db: Session, user: str) -> tuple[Usuario, Professor]:
    usuario = db.get(Usuario, user) if isinstance(user, str) else None
    if (
        not usuario
        or (usuario.perfil or "").upper() != "PROFESSOR"
        or usuario.cod_pro is None
    ):
        raise HTTPException(403, "Acesso exclusivo do professor")
    professor = db.get(Professor, usuario.cod_pro)
    if not professor:
        raise HTTPException(404, "Cadastro do professor não encontrado")
    return usuario, professor


def _vinculo_do_professor(
    db: Session,
    user: str,
    docturma_id: int,
) -> tuple[Usuario, Professor, DocTurma]:
    usuario, professor = _professor_logado(db, user)
    vinculo = db.get(DocTurma, docturma_id)
    if not vinculo:
        raise HTTPException(404, "Matéria da turma não encontrada")
    if vinculo.cod_pro != professor.cod_pro:
        raise HTTPException(403, "Você não possui acesso a esta turma e matéria")
    return usuario, professor, vinculo


def _contagens_vinculos(db: Session, cod_pro: int) -> list[dict]:
    alunos = (
        select(
            AluTurma.cod_tur.label("cod_tur"),
            func.count(AluTurma.id).label("total_alunos"),
        )
        .group_by(AluTurma.cod_tur)
        .subquery()
    )
    aulas = (
        select(
            Aula.docturma_id.label("docturma_id"),
            func.count(Aula.id).label("total_aulas"),
        )
        .group_by(Aula.docturma_id)
        .subquery()
    )
    materiais = (
        select(
            MaterialDidatico.docturma_id.label("docturma_id"),
            func.count(MaterialDidatico.id).label("total_materiais"),
        )
        .group_by(MaterialDidatico.docturma_id)
        .subquery()
    )
    notas = (
        select(
            AluNota.docturma_id.label("docturma_id"),
            func.count(AluNota.id).label("notas_lancadas"),
            func.avg(AluNota.nota).label("media"),
        )
        .where(AluNota.nota.is_not(None))
        .group_by(AluNota.docturma_id)
        .subquery()
    )
    consulta = (
        select(
            DocTurma,
            Turma,
            Materia,
            func.coalesce(alunos.c.total_alunos, 0),
            func.coalesce(aulas.c.total_aulas, 0),
            func.coalesce(materiais.c.total_materiais, 0),
            func.coalesce(notas.c.notas_lancadas, 0),
            notas.c.media,
        )
        .join(Turma, Turma.cod_tur == DocTurma.cod_tur)
        .join(Materia, Materia.cod_mat == DocTurma.cod_mat)
        .join(alunos, alunos.c.cod_tur == DocTurma.cod_tur, isouter=True)
        .join(aulas, aulas.c.docturma_id == DocTurma.id, isouter=True)
        .join(materiais, materiais.c.docturma_id == DocTurma.id, isouter=True)
        .join(notas, notas.c.docturma_id == DocTurma.id, isouter=True)
        .where(DocTurma.cod_pro == cod_pro)
        .order_by(Turma.nome, Materia.NOME, DocTurma.Ano, DocTurma.semestre)
    )
    resultado = []
    for (
        vinculo,
        turma,
        materia,
        total_alunos,
        total_aulas,
        total_materiais,
        notas_lancadas,
        media,
    ) in db.execute(consulta):
        resultado.append(
            {
                "docturma_id": vinculo.id,
                "cod_tur": vinculo.cod_tur,
                "cod_mat": vinculo.cod_mat,
                "turma_nome": turma.nome,
                "curso": turma.curso,
                "horario": turma.horario,
                "materia_nome": (materia.NOME or "").strip(),
                "ano": vinculo.Ano,
                "semestre": vinculo.semestre,
                "total_alunos": int(total_alunos or 0),
                "total_aulas": int(total_aulas or 0),
                "total_materiais": int(total_materiais or 0),
                "notas_lancadas": int(notas_lancadas or 0),
                "notas_pendentes": max(
                    0,
                    int(total_alunos or 0) - int(notas_lancadas or 0),
                ),
                "media": float(media) if media is not None else None,
            }
        )
    return resultado


def _aula_resumo(
    aula: Aula,
    planejamento: PlanejamentoAula | None,
    chamada: Chamada | None,
    total_materiais: int = 0,
) -> dict:
    return {
        "id": aula.id,
        "docturma_id": aula.docturma_id,
        "data": aula.data.isoformat(),
        "hora_inicio": aula.hora_inicio.strftime("%H:%M") if aula.hora_inicio else None,
        "hora_fim": aula.hora_fim.strftime("%H:%M") if aula.hora_fim else None,
        "local": aula.local,
        "tema": aula.tema,
        "observacao": aula.observacao,
        "status": aula.status,
        "chamada": (
            {"id": chamada.id, "status": chamada.status, "token": chamada.token}
            if chamada
            else None
        ),
        "total_materiais": int(total_materiais or 0),
        "planejamento": (
            {
                "objetivos": planejamento.objetivos,
                "conteudo": planejamento.conteudo,
                "tarefa": planejamento.tarefa,
                "anotacoes_privadas": planejamento.anotacoes_privadas,
                "atualizado_em": planejamento.atualizado_em.isoformat(),
            }
            if planejamento
            else None
        ),
    }


def _comunicado_dict(comunicado: ComunicadoTurma) -> dict:
    return {
        "id": comunicado.id,
        "docturma_id": comunicado.docturma_id,
        "titulo": comunicado.titulo,
        "mensagem": comunicado.mensagem,
        "status": comunicado.status,
        "criado_por": comunicado.criado_por,
        "criado_em": comunicado.criado_em.isoformat(),
        "atualizado_em": comunicado.atualizado_em.isoformat(),
    }


@router.get("/resumo")
def resumo_professor(
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    _, professor = _professor_logado(db, user)
    turmas = _contagens_vinculos(db, professor.cod_pro)
    hoje = _agora().date()
    consulta_aulas = (
        select(Aula, DocTurma, Turma.nome, Materia.NOME)
        .join(DocTurma, DocTurma.id == Aula.docturma_id)
        .join(Turma, Turma.cod_tur == DocTurma.cod_tur)
        .join(Materia, Materia.cod_mat == DocTurma.cod_mat)
        .where(
            DocTurma.cod_pro == professor.cod_pro,
            Aula.data >= hoje,
            Aula.status != "CANCELADA",
        )
        .order_by(Aula.data, Aula.hora_inicio)
        .limit(6)
    )
    proximas_aulas = [
        {
            "id": aula.id,
            "docturma_id": vinculo.id,
            "cod_tur": vinculo.cod_tur,
            "turma_nome": turma_nome,
            "materia_nome": (materia_nome or "").strip(),
            "data": aula.data.isoformat(),
            "hora_inicio": aula.hora_inicio.strftime("%H:%M") if aula.hora_inicio else None,
            "tema": aula.tema,
            "status": aula.status,
        }
        for aula, vinculo, turma_nome, materia_nome in db.execute(consulta_aulas)
    ]
    total_alunos = db.scalar(
        select(func.count(func.distinct(AluTurma.cod_alu)))
        .select_from(AluTurma)
        .join(DocTurma, DocTurma.cod_tur == AluTurma.cod_tur)
        .where(DocTurma.cod_pro == professor.cod_pro)
    ) or 0
    aulas_hoje = db.scalar(
        select(func.count())
        .select_from(Aula)
        .join(DocTurma, DocTurma.id == Aula.docturma_id)
        .where(
            DocTurma.cod_pro == professor.cod_pro,
            Aula.data == hoje,
            Aula.status != "CANCELADA",
        )
    ) or 0
    return {
        "professor": {"cod_pro": professor.cod_pro, "nome": professor.nome},
        "metricas": {
            "materias": len(turmas),
            "turmas": len({item["cod_tur"] for item in turmas}),
            "alunos": int(total_alunos),
            "notas_pendentes": sum(item["notas_pendentes"] for item in turmas),
            "aulas_hoje": int(aulas_hoje),
        },
        "proximas_aulas": proximas_aulas,
        "turmas": turmas,
    }


@router.get("/turmas")
def turmas_professor(
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    _, professor = _professor_logado(db, user)
    return _contagens_vinculos(db, professor.cod_pro)


@router.get("/turmas/{docturma_id}")
def detalhe_turma_professor(
    docturma_id: int,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    _, professor, vinculo = _vinculo_do_professor(db, user, docturma_id)
    turma = db.get(Turma, vinculo.cod_tur)
    materia = db.get(Materia, vinculo.cod_mat)
    if not turma or not materia:
        raise HTTPException(404, "Turma ou matéria não encontrada")

    notas = {
        nota.cod_alu: nota
        for nota in db.scalars(
            select(AluNota).where(AluNota.docturma_id == docturma_id)
        )
    }
    faltas = faltas_do_vinculo(db, docturma_id)
    alunos = [
        {
            "cod_alu": aluno.cod_alu,
            "nome": aluno.nome,
            "nota": (
                float(notas[aluno.cod_alu].nota)
                if aluno.cod_alu in notas and notas[aluno.cod_alu].nota is not None
                else None
            ),
            "faltas": int(faltas.get(aluno.cod_alu, 0)),
            "cursou": (
                notas[aluno.cod_alu].cursou
                if aluno.cod_alu in notas
                else None
            ),
        }
        for aluno in db.scalars(
            select(Aluno)
            .join(AluTurma, AluTurma.cod_alu == Aluno.cod_alu)
            .where(AluTurma.cod_tur == vinculo.cod_tur)
            .order_by(Aluno.nome)
        )
    ]

    materiais_por_aula = (
        select(
            MaterialDidatico.aula_id.label("aula_id"),
            func.count(MaterialDidatico.id).label("total"),
        )
        .where(
            MaterialDidatico.docturma_id == docturma_id,
            MaterialDidatico.aula_id.is_not(None),
        )
        .group_by(MaterialDidatico.aula_id)
        .subquery()
    )
    aulas = [
        _aula_resumo(aula, planejamento, chamada, total_materiais)
        for aula, planejamento, chamada, total_materiais in db.execute(
            select(
                Aula,
                PlanejamentoAula,
                Chamada,
                func.coalesce(materiais_por_aula.c.total, 0),
            )
            .join(
                PlanejamentoAula,
                PlanejamentoAula.aula_id == Aula.id,
                isouter=True,
            )
            .join(Chamada, Chamada.aula_id == Aula.id, isouter=True)
            .join(
                materiais_por_aula,
                materiais_por_aula.c.aula_id == Aula.id,
                isouter=True,
            )
            .where(Aula.docturma_id == docturma_id)
            .order_by(Aula.data.desc(), Aula.hora_inicio.desc())
        )
    ]

    materiais = [
        {
            "id": item.id,
            "aula_id": item.aula_id,
            "titulo": item.titulo,
            "descricao": item.descricao,
            "nome_arquivo": item.nome_arquivo,
            "mime_type": item.mime_type,
            "tamanho": item.tamanho,
            "criado_em": item.criado_em.isoformat(),
            "url": f"/materiais/{item.id}/arquivo",
        }
        for item in db.scalars(
            select(MaterialDidatico)
            .options(
                load_only(
                    MaterialDidatico.id,
                    MaterialDidatico.aula_id,
                    MaterialDidatico.titulo,
                    MaterialDidatico.descricao,
                    MaterialDidatico.nome_arquivo,
                    MaterialDidatico.mime_type,
                    MaterialDidatico.tamanho,
                    MaterialDidatico.criado_em,
                )
            )
            .where(MaterialDidatico.docturma_id == docturma_id)
            .order_by(MaterialDidatico.criado_em.desc())
        )
    ]
    comunicados = [
        _comunicado_dict(item)
        for item in db.scalars(
            select(ComunicadoTurma)
            .where(ComunicadoTurma.docturma_id == docturma_id)
            .order_by(ComunicadoTurma.criado_em.desc())
        )
    ]
    notas_validas = [item["nota"] for item in alunos if item["nota"] is not None]
    return {
        "vinculo": {
            "docturma_id": vinculo.id,
            "cod_tur": vinculo.cod_tur,
            "cod_mat": vinculo.cod_mat,
            "turma_nome": turma.nome,
            "curso": turma.curso,
            "horario": turma.horario,
            "materia_nome": (materia.NOME or "").strip(),
            "professor_nome": professor.nome,
            "ano": vinculo.Ano,
            "semestre": vinculo.semestre,
        },
        "alunos": alunos,
        "aulas": aulas,
        "materiais": materiais,
        "comunicados": comunicados,
        "notas_resumo": {
            "total_alunos": len(alunos),
            "lancadas": len(notas_validas),
            "pendentes": len(alunos) - len(notas_validas),
            "media": (
                round(sum(notas_validas) / len(notas_validas), 2)
                if notas_validas
                else None
            ),
            "atividades": db.scalar(
                select(func.count())
                .select_from(AtividadeAvaliativa)
                .where(AtividadeAvaliativa.docturma_id == docturma_id)
            ) or 0,
        },
    }


@router.put("/aulas/{aula_id}/planejamento")
def salvar_planejamento(
    aula_id: int,
    dados: PlanejamentoInput,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    aula = db.get(Aula, aula_id)
    if not aula:
        raise HTTPException(404, "Aula não encontrada")
    _vinculo_do_professor(db, user, aula.docturma_id)
    planejamento = db.scalar(
        select(PlanejamentoAula).where(PlanejamentoAula.aula_id == aula_id)
    )
    if not planejamento:
        planejamento = PlanejamentoAula(aula_id=aula_id)
        db.add(planejamento)
    for campo, valor in dados.model_dump().items():
        setattr(planejamento, campo, valor or None)
    planejamento.atualizado_por = user
    planejamento.atualizado_em = _agora()
    db.commit()
    return {"ok": True}


@router.post("/turmas/{docturma_id}/comunicados")
def criar_comunicado(
    docturma_id: int,
    dados: ComunicadoInput,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    _vinculo_do_professor(db, user, docturma_id)
    agora = _agora()
    comunicado = ComunicadoTurma(
        docturma_id=docturma_id,
        **dados.model_dump(),
        criado_por=user,
        criado_em=agora,
        atualizado_em=agora,
    )
    db.add(comunicado)
    db.commit()
    db.refresh(comunicado)
    return _comunicado_dict(comunicado)


@router.put("/comunicados/{comunicado_id}")
def atualizar_comunicado(
    comunicado_id: int,
    dados: ComunicadoInput,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    comunicado = db.get(ComunicadoTurma, comunicado_id)
    if not comunicado:
        raise HTTPException(404, "Comunicado não encontrado")
    _vinculo_do_professor(db, user, comunicado.docturma_id)
    for campo, valor in dados.model_dump().items():
        setattr(comunicado, campo, valor)
    comunicado.atualizado_em = _agora()
    db.commit()
    return _comunicado_dict(comunicado)


@router.delete("/comunicados/{comunicado_id}")
def excluir_comunicado(
    comunicado_id: int,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    comunicado = db.get(ComunicadoTurma, comunicado_id)
    if not comunicado:
        raise HTTPException(404, "Comunicado não encontrado")
    _vinculo_do_professor(db, user, comunicado.docturma_id)
    db.delete(comunicado)
    db.commit()
    return {"ok": True}
