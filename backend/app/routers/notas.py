"""Lançamento de notas e faltas (tabela alunota, o histórico oficial)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db, row_to_dict
from ..models import (
    Aluno,
    AluNota,
    AluTurma,
    DocTurma,
    Materia,
    Professor,
    Turma,
    Usuario,
)
from ..security import usuario_atual
from ..services.faltas import faltas_do_vinculo, subconsulta_faltas

router = APIRouter(prefix="/notas", tags=["notas"])


class NotaInput(BaseModel):
    """Lançamento individual de nota para um aluno."""

    cod_mat: int
    nota: float | None = None
    falta: int | None = None
    ano: str | None = None
    semestre: str | None = None
    cursou: str | None = "S"
    dispensa: str | None = None
    cod_pro: int | None = None
    cod_tur: int | None = None


class LancamentoAluno(BaseModel):
    cod_alu: int
    nota: float | None = None
    falta: int | None = None
    dispensa: str | None = None
    cursou: str | None = "S"


class LancamentoInput(BaseModel):
    cod_tur: int | None = None
    cod_mat: int | None = None
    docturma_id: int | None = None
    cod_pro: int | None = None
    ano: str | None = None
    semestre: str | None = None
    alunos: list[LancamentoAluno]


def _usuario_logado(db: Session, user) -> Usuario | None:
    # Chamadas diretas nos testes não passam pela resolução de dependências.
    return db.get(Usuario, user) if isinstance(user, str) else None


def _validar_acesso_vinculo(db: Session, user, vinculo: DocTurma) -> None:
    usuario = _usuario_logado(db, user)
    if usuario and (usuario.perfil or "ADMIN").upper() == "PROFESSOR":
        if usuario.cod_pro is None or vinculo.cod_pro != usuario.cod_pro:
            raise HTTPException(403, "Você não possui acesso a esta turma e matéria")


def _resolver_vinculo(db: Session, dados: LancamentoInput) -> DocTurma:
    if dados.docturma_id is not None:
        vinculo = db.get(DocTurma, dados.docturma_id)
    elif dados.cod_tur is not None and dados.cod_mat is not None:
        candidatos = list(
            db.scalars(
                select(DocTurma).where(
                    DocTurma.cod_tur == dados.cod_tur,
                    DocTurma.cod_mat == dados.cod_mat,
                )
            )
        )
        if len(candidatos) > 1:
            raise HTTPException(400, "Informe o vínculo exato da turma e matéria")
        vinculo = candidatos[0] if candidatos else None
    else:
        vinculo = None
    if not vinculo:
        raise HTTPException(404, "Matéria da turma não encontrada")
    return vinculo


def _grade_vinculo(db: Session, vinculo: DocTurma) -> dict:
    alunos = list(
        db.execute(
            select(Aluno.cod_alu, Aluno.nome)
            .join(AluTurma, AluTurma.cod_alu == Aluno.cod_alu)
            .where(AluTurma.cod_tur == vinculo.cod_tur)
            .order_by(Aluno.nome)
        )
    )
    notas = {
        n.cod_alu: n
        for n in db.scalars(
            select(AluNota).where(
                or_(
                    AluNota.docturma_id == vinculo.id,
                    (
                        AluNota.docturma_id.is_(None)
                        & (AluNota.cod_tur == vinculo.cod_tur)
                        & (AluNota.cod_mat == vinculo.cod_mat)
                    ),
                )
            )
        )
    }
    faltas = faltas_do_vinculo(db, vinculo.id)
    linhas = []
    for cod_alu, nome in alunos:
        n = notas.get(cod_alu)
        linhas.append(
            {
                "cod_alu": cod_alu,
                "nome": nome,
                "nota": float(n.nota) if n and n.nota is not None else None,
                "falta": faltas.get(cod_alu, 0),
                "dispensa": n.dispensa if n else None,
                "cursou": n.cursou if n else None,
                "ja_lancado": n is not None,
            }
        )
    return {"docturma": row_to_dict(vinculo), "alunos": linhas}


def _validar_referencias_nota(db: Session, dados: NotaInput) -> None:
    if not db.get(Materia, dados.cod_mat):
        raise HTTPException(404, "Matéria não encontrada")
    if dados.cod_tur is not None and not db.get(Turma, dados.cod_tur):
        raise HTTPException(404, "Turma não encontrada")
    if dados.cod_pro is not None and not db.get(Professor, dados.cod_pro):
        raise HTTPException(404, "Professor não encontrado")


@router.get("/opcoes")
def opcoes_lancamento(
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    usuario = _usuario_logado(db, user)
    consulta = (
        select(DocTurma, Turma.nome, Materia.NOME, Professor.nome)
        .join(Turma, Turma.cod_tur == DocTurma.cod_tur)
        .join(Materia, Materia.cod_mat == DocTurma.cod_mat)
        .join(Professor, Professor.cod_pro == DocTurma.cod_pro, isouter=True)
        .order_by(Turma.nome, Materia.NOME, DocTurma.Ano, DocTurma.semestre)
    )
    if usuario and (usuario.perfil or "ADMIN").upper() == "PROFESSOR":
        if usuario.cod_pro is None:
            return {"turmas": [], "vinculos": []}
        consulta = consulta.where(DocTurma.cod_pro == usuario.cod_pro)

    vinculos = []
    turmas: dict[int, dict] = {}
    for vinculo, turma_nome, materia_nome, professor_nome in db.execute(consulta):
        turmas[vinculo.cod_tur] = {
            "cod_tur": vinculo.cod_tur,
            "nome": turma_nome,
        }
        item = row_to_dict(vinculo)
        item["turma_nome"] = turma_nome
        item["materia_nome"] = (materia_nome or "").strip()
        item["professor_nome"] = professor_nome
        vinculos.append(item)
    return {"turmas": list(turmas.values()), "vinculos": vinculos}


@router.get("/turma/{cod_tur}/materia/{cod_mat}")
def grade_lancamento(
    cod_tur: int,
    cod_mat: int,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    """Compatibilidade: só funciona quando há um único vínculo possível."""
    vinculo = _resolver_vinculo(
        db,
        LancamentoInput(cod_tur=cod_tur, cod_mat=cod_mat, alunos=[]),
    )
    _validar_acesso_vinculo(db, user, vinculo)
    return _grade_vinculo(db, vinculo)


@router.get("/vinculo/{docturma_id}")
def grade_por_vinculo(
    docturma_id: int,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    vinculo = db.get(DocTurma, docturma_id)
    if not vinculo:
        raise HTTPException(404, "Matéria da turma não encontrada")
    _validar_acesso_vinculo(db, user, vinculo)
    return _grade_vinculo(db, vinculo)


@router.post("/lancar")
def lancar(
    dados: LancamentoInput,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    """Upsert das notas da turma+matéria para os alunos informados."""
    vinculo = _resolver_vinculo(db, dados)
    _validar_acesso_vinculo(db, user, vinculo)
    if not db.get(Turma, vinculo.cod_tur):
        raise HTTPException(404, "Turma não encontrada")
    codigos_alunos = [item.cod_alu for item in dados.alunos]
    if len(codigos_alunos) != len(set(codigos_alunos)):
        raise HTTPException(400, "A lista contém alunos repetidos")
    matriculados = set(
        db.scalars(
            select(AluTurma.cod_alu).where(
                AluTurma.cod_tur == vinculo.cod_tur,
                AluTurma.cod_alu.in_(codigos_alunos),
            )
        )
    ) if codigos_alunos else set()
    nao_matriculados = sorted(set(codigos_alunos) - matriculados)
    if nao_matriculados:
        raise HTTPException(
            400,
            "Aluno(s) não matriculado(s) na turma: "
            + ", ".join(map(str, nao_matriculados)),
        )
    existentes = {
        registro.cod_alu: registro
        for registro in db.scalars(
            select(AluNota).where(
                or_(
                    AluNota.docturma_id == vinculo.id,
                    (
                        AluNota.docturma_id.is_(None)
                        & (AluNota.cod_tur == vinculo.cod_tur)
                        & (AluNota.cod_mat == vinculo.cod_mat)
                    ),
                ),
                AluNota.cod_alu.in_(codigos_alunos),
            )
        )
    } if codigos_alunos else {}
    faltas = faltas_do_vinculo(db, vinculo.id)
    atualizados = criados = 0
    for lanc in dados.alunos:
        registro = existentes.get(lanc.cod_alu)
        if registro:
            atualizados += 1
        else:
            registro = AluNota(cod_alu=lanc.cod_alu)
            db.add(registro)
            criados += 1
        registro.nota = lanc.nota
        registro.docturma_id = vinculo.id
        registro.cod_tur = vinculo.cod_tur
        registro.cod_mat = vinculo.cod_mat
        registro.falta = faltas.get(lanc.cod_alu, 0)
        registro.dispensa = lanc.dispensa
        registro.cursou = lanc.cursou
        registro.cod_pro = vinculo.cod_pro
        registro.ano = vinculo.Ano
        registro.semestre = vinculo.semestre
        registro.status = "L"
    db.commit()
    return {"ok": True, "criados": criados, "atualizados": atualizados}


@router.get("/aluno/{cod_alu}")
def notas_do_aluno(
    cod_alu: int,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    """Todas as notas do aluno (usado na tela do aluno e no boletim)."""
    aluno = db.get(Aluno, cod_alu)
    if not aluno:
        raise HTTPException(404, "Aluno não encontrado")
    usuario = _usuario_logado(db, user)
    if usuario and (usuario.perfil or "ADMIN").upper() == "PROFESSOR":
        matriculado_em_turma_do_professor = db.scalar(
            select(func.count())
            .select_from(AluTurma)
            .join(DocTurma, DocTurma.cod_tur == AluTurma.cod_tur)
            .where(
                AluTurma.cod_alu == cod_alu,
                DocTurma.cod_pro == usuario.cod_pro,
            )
        ) or 0
        if not matriculado_em_turma_do_professor:
            raise HTTPException(403, "Você não possui acesso a este aluno")
    faltas = subconsulta_faltas()
    q = (
        select(
            AluNota,
            Materia.NOME,
            Professor.nome,
            func.coalesce(faltas.c.faltas, AluNota.falta, 0),
        )
        .join(Materia, Materia.cod_mat == AluNota.cod_mat, isouter=True)
        .join(Professor, Professor.cod_pro == AluNota.cod_pro, isouter=True)
        .join(
            faltas,
            (faltas.c.docturma_id == AluNota.docturma_id)
            & (faltas.c.cod_alu == AluNota.cod_alu),
            isouter=True,
        )
        .where(AluNota.cod_alu == cod_alu)
        .order_by(AluNota.ano, AluNota.semestre, Materia.NOME)
    )
    if usuario and (usuario.perfil or "ADMIN").upper() == "PROFESSOR":
        q = q.where(
            AluNota.docturma_id.in_(
                select(DocTurma.id).where(DocTurma.cod_pro == usuario.cod_pro)
            )
        )
    out = []
    for nota, materia_nome, professor_nome, total_faltas in db.execute(q):
        d = row_to_dict(nota)
        d["falta"] = int(total_faltas or 0)
        d["materia_nome"] = materia_nome.strip() if materia_nome else None
        d["professor_nome"] = professor_nome
        out.append(d)
    return {"aluno": {"cod_alu": aluno.cod_alu, "nome": aluno.nome}, "notas": out}


@router.post("/aluno/{cod_alu}")
def adicionar_nota(
    cod_alu: int,
    dados: NotaInput,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    """Adiciona um lançamento de nota direto para o aluno."""
    aluno = db.get(Aluno, cod_alu)
    if not aluno:
        raise HTTPException(404, "Aluno não encontrado")
    usuario = _usuario_logado(db, user)
    if usuario and (usuario.perfil or "").upper() == "PROFESSOR":
        raise HTTPException(403, "Use a grade da sua turma para lançar notas")
    _validar_referencias_nota(db, dados)
    registro = AluNota(
        cod_alu=cod_alu,
        status="L",
        cod_tur=dados.cod_tur if dados.cod_tur is not None else aluno.cod_tur,
        **dados.model_dump(exclude={"cod_tur"}),
    )
    db.add(registro)
    db.commit()
    db.refresh(registro)
    return row_to_dict(registro)


@router.put("/{alunota_id}")
def atualizar_nota(
    alunota_id: int,
    dados: NotaInput,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    registro = db.get(AluNota, alunota_id)
    if not registro:
        raise HTTPException(404, "Lançamento não encontrado")
    usuario = _usuario_logado(db, user)
    if usuario and (usuario.perfil or "").upper() == "PROFESSOR":
        raise HTTPException(403, "Use a grade da sua turma para lançar notas")
    _validar_referencias_nota(db, dados)
    for k, v in dados.model_dump().items():
        setattr(registro, k, v)
    db.commit()
    return row_to_dict(registro)


@router.delete("/{alunota_id}")
def excluir_lancamento(
    alunota_id: int,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    registro = db.get(AluNota, alunota_id)
    if not registro:
        raise HTTPException(404, "Lançamento não encontrado")
    usuario = _usuario_logado(db, user)
    if usuario and (usuario.perfil or "").upper() == "PROFESSOR":
        raise HTTPException(403, "Use a grade da sua turma para lançar notas")
    db.delete(registro)
    db.commit()
    return {"ok": True}
