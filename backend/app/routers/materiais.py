"""Biblioteca de materiais das matérias e de aulas específicas."""

from datetime import datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session, load_only

from ..config import settings
from ..database import get_db
from ..models import (
    Aula,
    DocTurma,
    Materia,
    MaterialDidatico,
    Professor,
    Turma,
    Usuario,
)
from ..security import usuario_atual

router = APIRouter(prefix="/materiais", tags=["materiais didáticos"])

MIMES_PERMITIDOS = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    "application/epub+zip",
    "text/plain",
    "text/csv",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "audio/mpeg",
    "audio/mp4",
    "audio/ogg",
    "audio/wav",
    "audio/x-wav",
    "video/mp4",
    "video/webm",
}


def _usuario_logado(db: Session, user: str) -> Usuario | None:
    return db.get(Usuario, user) if isinstance(user, str) and user else None


def _validar_acesso_vinculo(
    db: Session,
    user: str,
    vinculo: DocTurma,
) -> None:
    usuario = _usuario_logado(db, user)
    if usuario and (usuario.perfil or "ADMIN").upper() == "PROFESSOR":
        if usuario.cod_pro is None or vinculo.cod_pro != usuario.cod_pro:
            raise HTTPException(
                403,
                "Você não possui acesso a esta turma e matéria",
            )


def _validar_destino(
    db: Session,
    user: str,
    docturma_id: int,
    aula_id: int | None,
) -> tuple[DocTurma, Aula | None]:
    vinculo = db.get(DocTurma, docturma_id)
    if not vinculo:
        raise HTTPException(404, "Matéria da turma não encontrada")
    _validar_acesso_vinculo(db, user, vinculo)
    aula = db.get(Aula, aula_id) if aula_id is not None else None
    if aula_id is not None and not aula:
        raise HTTPException(404, "Aula não encontrada")
    if aula and aula.docturma_id != vinculo.id:
        raise HTTPException(400, "A aula não pertence à matéria selecionada")
    return vinculo, aula


def _material_dict(
    material: MaterialDidatico,
    vinculo: DocTurma,
    turma: Turma,
    materia: Materia,
    professor: Professor | None,
    aula: Aula | None,
) -> dict:
    return {
        "id": material.id,
        "docturma_id": material.docturma_id,
        "aula_id": material.aula_id,
        "titulo": material.titulo,
        "descricao": material.descricao,
        "nome_arquivo": material.nome_arquivo,
        "mime_type": material.mime_type,
        "tamanho": material.tamanho,
        "criado_por": material.criado_por,
        "criado_em": material.criado_em.isoformat(),
        "turma_nome": turma.nome,
        "materia_nome": (materia.NOME or "").strip(),
        "professor_nome": professor.nome if professor else None,
        "aula": (
            {
                "id": aula.id,
                "data": aula.data.isoformat(),
                "tema": aula.tema,
                "hora_inicio": (
                    aula.hora_inicio.strftime("%H:%M")
                    if aula.hora_inicio
                    else None
                ),
            }
            if aula
            else None
        ),
        "url": f"/materiais/{material.id}/arquivo",
    }


def _consulta_materiais():
    return (
        select(MaterialDidatico, DocTurma, Turma, Materia, Professor, Aula)
        .options(
            load_only(
                MaterialDidatico.id,
                MaterialDidatico.docturma_id,
                MaterialDidatico.aula_id,
                MaterialDidatico.titulo,
                MaterialDidatico.descricao,
                MaterialDidatico.nome_arquivo,
                MaterialDidatico.mime_type,
                MaterialDidatico.tamanho,
                MaterialDidatico.criado_por,
                MaterialDidatico.criado_em,
            )
        )
        .join(DocTurma, DocTurma.id == MaterialDidatico.docturma_id)
        .join(Turma, Turma.cod_tur == DocTurma.cod_tur)
        .join(Materia, Materia.cod_mat == DocTurma.cod_mat)
        .join(Professor, Professor.cod_pro == DocTurma.cod_pro, isouter=True)
        .join(Aula, Aula.id == MaterialDidatico.aula_id, isouter=True)
    )


@router.get("/opcoes")
def opcoes_materiais(
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    usuario = _usuario_logado(db, user)
    consulta = (
        select(DocTurma, Turma, Materia, Professor)
        .join(Turma, Turma.cod_tur == DocTurma.cod_tur)
        .join(Materia, Materia.cod_mat == DocTurma.cod_mat)
        .join(Professor, Professor.cod_pro == DocTurma.cod_pro, isouter=True)
        .order_by(Turma.nome, Materia.NOME, DocTurma.Ano, DocTurma.semestre)
    )
    if usuario and (usuario.perfil or "ADMIN").upper() == "PROFESSOR":
        if usuario.cod_pro is None:
            return {
                "vinculos": [],
                "aulas": [],
                "limite_upload_mb": max(1, settings.materiais_upload_max_mb),
            }
        consulta = consulta.where(DocTurma.cod_pro == usuario.cod_pro)

    vinculos = []
    ids_vinculos = []
    for vinculo, turma, materia, professor in db.execute(consulta):
        ids_vinculos.append(vinculo.id)
        vinculos.append(
            {
                "docturma_id": vinculo.id,
                "cod_tur": vinculo.cod_tur,
                "turma_nome": turma.nome,
                "cod_mat": vinculo.cod_mat,
                "materia_nome": (materia.NOME or "").strip(),
                "professor_nome": professor.nome if professor else None,
                "ano": vinculo.Ano,
                "semestre": vinculo.semestre,
            }
        )
    aulas = [
        {
            "id": aula.id,
            "docturma_id": aula.docturma_id,
            "data": aula.data.isoformat(),
            "hora_inicio": (
                aula.hora_inicio.strftime("%H:%M") if aula.hora_inicio else None
            ),
            "tema": aula.tema,
            "status": aula.status,
        }
        for aula in db.scalars(
            select(Aula)
            .where(Aula.docturma_id.in_(ids_vinculos))
            .order_by(Aula.data.desc(), Aula.hora_inicio.desc())
        )
    ] if ids_vinculos else []
    return {
        "vinculos": vinculos,
        "aulas": aulas,
        "limite_upload_mb": max(1, settings.materiais_upload_max_mb),
    }


@router.get("")
def listar_materiais(
    docturma_id: int | None = None,
    aula_id: int | None = None,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    usuario = _usuario_logado(db, user)
    consulta = _consulta_materiais()
    if docturma_id is not None:
        vinculo = db.get(DocTurma, docturma_id)
        if not vinculo:
            raise HTTPException(404, "Matéria da turma não encontrada")
        _validar_acesso_vinculo(db, user, vinculo)
        consulta = consulta.where(MaterialDidatico.docturma_id == docturma_id)
    if aula_id is not None:
        consulta = consulta.where(MaterialDidatico.aula_id == aula_id)
    if usuario and (usuario.perfil or "ADMIN").upper() == "PROFESSOR":
        if usuario.cod_pro is None:
            return []
        consulta = consulta.where(DocTurma.cod_pro == usuario.cod_pro)
    consulta = consulta.order_by(
        MaterialDidatico.criado_em.desc(),
        MaterialDidatico.id.desc(),
    )
    return [_material_dict(*linha) for linha in db.execute(consulta)]


@router.post("")
async def anexar_material(
    docturma_id: int = Form(...),
    aula_id: int | None = Form(default=None),
    titulo: str | None = Form(default=None),
    descricao: str | None = Form(default=None),
    arquivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    _validar_destino(db, user, docturma_id, aula_id)
    mime = (arquivo.content_type or "application/octet-stream").lower()
    if mime not in MIMES_PERMITIDOS:
        raise HTTPException(400, f"Tipo de arquivo não permitido: {mime}")
    limite_mb = max(1, settings.materiais_upload_max_mb)
    limite = limite_mb * 1024 * 1024
    conteudo = await arquivo.read(limite + 1)
    if len(conteudo) > limite:
        raise HTTPException(400, f"O arquivo deve ter no máximo {limite_mb} MB")
    if not conteudo:
        raise HTTPException(400, "O arquivo está vazio")

    nome_arquivo = (
        (arquivo.filename or "material").replace("\\", "/").split("/")[-1][:255]
    )
    titulo_limpo = (titulo or "").strip() or Path(nome_arquivo).stem
    descricao_limpa = (descricao or "").strip() or None
    if len(titulo_limpo) > 150:
        raise HTTPException(400, "O título deve ter até 150 caracteres")
    if descricao_limpa and len(descricao_limpa) > 2000:
        raise HTTPException(400, "A descrição deve ter até 2.000 caracteres")

    material = MaterialDidatico(
        docturma_id=docturma_id,
        aula_id=aula_id,
        titulo=titulo_limpo,
        descricao=descricao_limpa,
        nome_arquivo=nome_arquivo,
        mime_type=mime,
        tamanho=len(conteudo),
        conteudo=conteudo,
        criado_por=user,
        criado_em=datetime.now(),
    )
    db.add(material)
    db.commit()
    db.refresh(material)
    return {"ok": True, "id": material.id}


@router.get("/{material_id}/arquivo")
def baixar_material(
    material_id: int,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    material = db.get(MaterialDidatico, material_id)
    if not material:
        raise HTTPException(404, "Material não encontrado")
    vinculo = db.get(DocTurma, material.docturma_id)
    if not vinculo:
        raise HTTPException(404, "Matéria da turma não encontrada")
    _validar_acesso_vinculo(db, user, vinculo)
    nome = quote(material.nome_arquivo)
    return Response(
        content=material.conteudo,
        media_type=material.mime_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{nome}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=300",
        },
    )


@router.delete("/{material_id}")
def excluir_material(
    material_id: int,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    material = db.get(MaterialDidatico, material_id)
    if not material:
        raise HTTPException(404, "Material não encontrado")
    vinculo = db.get(DocTurma, material.docturma_id)
    if not vinculo:
        raise HTTPException(404, "Matéria da turma não encontrada")
    _validar_acesso_vinculo(db, user, vinculo)
    db.delete(material)
    db.commit()
    return {"ok": True}
