from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db, row_to_dict
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
    NotaAtividade,
    Professor,
    Turma,
)
from ..services.matriculas import atualizar_contagem_turma, sincronizar_matricula

router = APIRouter(prefix="/turmas", tags=["turmas"])


class TurmaInput(BaseModel):
    nome: str
    curso: str | None = None
    horario: str | None = None
    dat_ini: date | None = None


class DocTurmaInput(BaseModel):
    cod_mat: int
    cod_pro: int | None = None
    dat_ini: date | None = None
    dat_fim: date | None = None
    Ano: str | None = None
    semestre: str | None = None


def _turma_dict(db: Session, turma: Turma) -> dict:
    d = row_to_dict(turma)
    d["qtd_alunos"] = db.scalar(
        select(func.count()).select_from(AluTurma).where(AluTurma.cod_tur == turma.cod_tur)
    )
    return d


@router.get("")
def listar(db: Session = Depends(get_db)):
    contagens = (
        select(
            AluTurma.cod_tur.label("cod_tur"),
            func.count(AluTurma.id).label("qtd_alunos"),
        )
        .group_by(AluTurma.cod_tur)
        .subquery()
    )
    # Chamada aberta é a única informação da turma que pede ação hoje: entra
    # na mesma consulta para a lista poder marcar quais turmas estão travadas.
    abertas = (
        select(
            Chamada.cod_tur.label("cod_tur"),
            func.count(Chamada.id).label("chamadas_abertas"),
        )
        .where(Chamada.status == "ABERTA")
        .group_by(Chamada.cod_tur)
        .subquery()
    )
    consulta = (
        select(
            Turma,
            func.coalesce(contagens.c.qtd_alunos, 0),
            func.coalesce(abertas.c.chamadas_abertas, 0),
        )
        .join(contagens, contagens.c.cod_tur == Turma.cod_tur, isouter=True)
        .join(abertas, abertas.c.cod_tur == Turma.cod_tur, isouter=True)
        .order_by(Turma.nome)
    )
    itens = []
    for turma, quantidade, chamadas_abertas in db.execute(consulta):
        dados = row_to_dict(turma)
        dados["qtd_alunos"] = int(quantidade or 0)
        dados["chamadas_abertas"] = int(chamadas_abertas or 0)
        itens.append(dados)
    return itens


@router.get("/{cod_tur}")
def obter(cod_tur: int, db: Session = Depends(get_db)):
    turma = db.get(Turma, cod_tur)
    if not turma:
        raise HTTPException(404, "Turma não encontrada")
    return _turma_dict(db, turma)


@router.post("")
def criar(dados: TurmaInput, db: Session = Depends(get_db)):
    turma = Turma(**dados.model_dump(), qtalu=0)
    db.add(turma)
    db.commit()
    db.refresh(turma)
    return row_to_dict(turma)


@router.put("/{cod_tur}")
def atualizar(cod_tur: int, dados: TurmaInput, db: Session = Depends(get_db)):
    turma = db.get(Turma, cod_tur)
    if not turma:
        raise HTTPException(404, "Turma não encontrada")
    for k, v in dados.model_dump().items():
        setattr(turma, k, v)
    db.commit()
    return row_to_dict(turma)


@router.delete("/{cod_tur}")
def excluir(cod_tur: int, db: Session = Depends(get_db)):
    turma = db.get(Turma, cod_tur)
    if not turma:
        raise HTTPException(404, "Turma não encontrada")
    tem_alunos = db.scalar(
        select(func.count()).select_from(AluTurma).where(AluTurma.cod_tur == cod_tur)
    ) or 0
    cadastros_na_turma = db.scalar(
        select(func.count()).select_from(Aluno).where(Aluno.cod_tur == cod_tur)
    ) or 0
    if tem_alunos or cadastros_na_turma:
        raise HTTPException(400, "Turma possui alunos matriculados; remova-os antes.")
    tem_notas = db.scalar(
        select(func.count()).select_from(AluNota).where(AluNota.cod_tur == cod_tur)
    ) or 0
    if tem_notas:
        raise HTTPException(
            400,
            f"Turma possui {tem_notas} nota(s) lançada(s); não pode ser excluída.",
        )
    tem_aulas = db.scalar(
        select(func.count())
        .select_from(Aula)
        .join(DocTurma, DocTurma.id == Aula.docturma_id)
        .where(DocTurma.cod_tur == cod_tur)
    ) or 0
    if tem_aulas:
        raise HTTPException(
            400,
            f"Turma possui {tem_aulas} aula(s) no calendário; remova-as antes.",
        )
    tem_chamadas = db.scalar(
        select(func.count()).select_from(Chamada).where(Chamada.cod_tur == cod_tur)
    ) or 0
    if tem_chamadas:
        raise HTTPException(
            400,
            f"Turma possui {tem_chamadas} chamada(s) com histórico de presença; não pode ser excluída.",
        )
    tem_materiais = db.scalar(
        select(func.count())
        .select_from(MaterialDidatico)
        .where(
            MaterialDidatico.docturma_id.in_(
                select(DocTurma.id).where(DocTurma.cod_tur == cod_tur)
            )
        )
    ) or 0
    if tem_materiais:
        raise HTTPException(
            400,
            f"Turma possui {tem_materiais} material(is) didático(s); remova-os antes.",
        )
    tem_comunicados = db.scalar(
        select(func.count())
        .select_from(ComunicadoTurma)
        .where(
            ComunicadoTurma.docturma_id.in_(
                select(DocTurma.id).where(DocTurma.cod_tur == cod_tur)
            )
        )
    ) or 0
    if tem_comunicados:
        raise HTTPException(
            400,
            f"Turma possui {tem_comunicados} comunicado(s); remova-os antes.",
        )
    ids_vinculos = select(DocTurma.id).where(DocTurma.cod_tur == cod_tur)
    ids_atividades = select(AtividadeAvaliativa.id).where(
        AtividadeAvaliativa.docturma_id.in_(ids_vinculos)
    )
    db.execute(
        NotaAtividade.__table__.delete().where(
            NotaAtividade.atividade_id.in_(ids_atividades)
        )
    )
    db.execute(
        AtividadeAvaliativa.__table__.delete().where(
            AtividadeAvaliativa.docturma_id.in_(ids_vinculos)
        )
    )
    db.execute(DocTurma.__table__.delete().where(DocTurma.cod_tur == cod_tur))
    db.delete(turma)
    db.commit()
    return {"ok": True}


# ---- alunos da turma -------------------------------------------------------

@router.get("/{cod_tur}/alunos")
def alunos_da_turma(cod_tur: int, db: Session = Depends(get_db)):
    q = (
        select(AluTurma, Aluno)
        .join(Aluno, Aluno.cod_alu == AluTurma.cod_alu)
        .where(AluTurma.cod_tur == cod_tur)
        .order_by(Aluno.nome)
    )
    return [
        {
            "id": at.id,
            "cod_alu": alu.cod_alu,
            "nome": alu.nome,
            "status": at.status,
            "celular": alu.celular,
            "e_mail": alu.e_mail,
        }
        for at, alu in db.execute(q)
    ]


@router.post("/{cod_tur}/alunos/{cod_alu}")
def matricular(cod_tur: int, cod_alu: int, db: Session = Depends(get_db)):
    if not db.get(Turma, cod_tur):
        raise HTTPException(404, "Turma não encontrada")
    aluno = db.get(Aluno, cod_alu)
    if not aluno:
        raise HTTPException(404, "Aluno não encontrado")
    ja = db.scalar(
        select(AluTurma).where(AluTurma.cod_tur == cod_tur, AluTurma.cod_alu == cod_alu)
    )
    if ja and aluno.cod_tur == cod_tur:
        outros_vinculos = db.scalar(
            select(func.count()).select_from(AluTurma).where(
                AluTurma.cod_alu == cod_alu,
                AluTurma.id != ja.id,
            )
        ) or 0
        if not outros_vinculos:
            raise HTTPException(400, "Aluno já está nesta turma")
    sincronizar_matricula(db, aluno, cod_tur)
    db.commit()
    return {"ok": True}


@router.delete("/{cod_tur}/alunos/{cod_alu}")
def desmatricular(cod_tur: int, cod_alu: int, db: Session = Depends(get_db)):
    vinculo = db.scalar(
        select(AluTurma).where(AluTurma.cod_tur == cod_tur, AluTurma.cod_alu == cod_alu)
    )
    if not vinculo:
        raise HTTPException(404, "Aluno não está nesta turma")
    aluno = db.get(Aluno, cod_alu)
    if aluno and aluno.cod_tur == cod_tur:
        sincronizar_matricula(db, aluno, None)
    else:
        db.delete(vinculo)
        db.flush()
        atualizar_contagem_turma(db, cod_tur)
    db.commit()
    return {"ok": True}


# ---- materias/professores da turma (docturma) ------------------------------

def _validar_referencias_materia(
    db: Session,
    dados: DocTurmaInput,
) -> None:
    if not db.get(Materia, dados.cod_mat):
        raise HTTPException(404, "Matéria não encontrada")
    if dados.cod_pro is not None and not db.get(Professor, dados.cod_pro):
        raise HTTPException(404, "Professor não encontrado")


def _vinculo_duplicado(
    db: Session,
    cod_tur: int,
    dados: DocTurmaInput,
    *,
    ignorar_id: int | None = None,
) -> DocTurma | None:
    consulta = select(DocTurma).where(
        DocTurma.cod_tur == cod_tur,
        DocTurma.cod_mat == dados.cod_mat,
        DocTurma.cod_pro == dados.cod_pro,
        DocTurma.Ano == dados.Ano,
        DocTurma.semestre == dados.semestre,
    )
    if ignorar_id is not None:
        consulta = consulta.where(DocTurma.id != ignorar_id)
    return db.scalar(consulta)


@router.get("/{cod_tur}/materias")
def materias_da_turma(cod_tur: int, db: Session = Depends(get_db)):
    q = (
        select(DocTurma, Materia.NOME, Professor.nome)
        .join(Materia, Materia.cod_mat == DocTurma.cod_mat, isouter=True)
        .join(Professor, Professor.cod_pro == DocTurma.cod_pro, isouter=True)
        .where(DocTurma.cod_tur == cod_tur)
        .order_by(Materia.NOME)
    )
    out = []
    for dt, materia_nome, professor_nome in db.execute(q):
        d = row_to_dict(dt)
        d["materia_nome"] = materia_nome
        d["professor_nome"] = professor_nome
        out.append(d)
    return out


@router.post("/{cod_tur}/materias")
def adicionar_materia(cod_tur: int, dados: DocTurmaInput, db: Session = Depends(get_db)):
    if not db.get(Turma, cod_tur):
        raise HTTPException(404, "Turma não encontrada")
    _validar_referencias_materia(db, dados)
    ja = _vinculo_duplicado(db, cod_tur, dados)
    if ja:
        raise HTTPException(400, "Matéria já vinculada à turma neste ano/semestre")
    dt = DocTurma(cod_tur=cod_tur, **dados.model_dump())
    db.add(dt)
    db.commit()
    db.refresh(dt)
    return row_to_dict(dt)


@router.put("/{cod_tur}/materias/{docturma_id}")
def atualizar_materia(
    cod_tur: int, docturma_id: int, dados: DocTurmaInput, db: Session = Depends(get_db)
):
    dt = db.get(DocTurma, docturma_id)
    if not dt or dt.cod_tur != cod_tur:
        raise HTTPException(404, "Vínculo não encontrado")
    _validar_referencias_materia(db, dados)
    if _vinculo_duplicado(db, cod_tur, dados, ignorar_id=docturma_id):
        raise HTTPException(400, "Matéria já vinculada à turma neste ano/semestre")
    alterou_identidade = (
        dt.cod_mat != dados.cod_mat
        or dt.Ano != dados.Ano
        or dt.semestre != dados.semestre
    )
    if alterou_identidade:
        tem_notas = db.scalar(
            select(func.count()).select_from(AluNota).where(
                AluNota.cod_tur == cod_tur,
                AluNota.cod_mat == dt.cod_mat,
            )
        ) or 0
        if tem_notas:
            raise HTTPException(
                400,
                "O vínculo possui notas lançadas; matéria e período não podem ser alterados.",
            )
    for k, v in dados.model_dump().items():
        setattr(dt, k, v)
    db.commit()
    return row_to_dict(dt)


@router.delete("/{cod_tur}/materias/{docturma_id}")
def remover_materia(cod_tur: int, docturma_id: int, db: Session = Depends(get_db)):
    dt = db.get(DocTurma, docturma_id)
    if not dt or dt.cod_tur != cod_tur:
        raise HTTPException(404, "Vínculo não encontrado")
    tem_aulas = db.scalar(
        select(func.count())
        .select_from(Aula)
        .where(Aula.docturma_id == docturma_id)
    ) or 0
    if tem_aulas:
        raise HTTPException(
            400,
            f"Este vínculo possui {tem_aulas} aula(s) no calendário; remova-as antes.",
        )
    tem_notas = db.scalar(
        select(func.count()).select_from(AluNota).where(
            AluNota.cod_tur == cod_tur,
            AluNota.cod_mat == dt.cod_mat,
        )
    ) or 0
    if tem_notas:
        raise HTTPException(
            400,
            f"Este vínculo possui {tem_notas} nota(s) lançada(s); não pode ser removido.",
        )
    tem_materiais = db.scalar(
        select(func.count())
        .select_from(MaterialDidatico)
        .where(MaterialDidatico.docturma_id == docturma_id)
    ) or 0
    if tem_materiais:
        raise HTTPException(
            400,
            f"Este vínculo possui {tem_materiais} material(is) didático(s); remova-os antes.",
        )
    tem_comunicados = db.scalar(
        select(func.count())
        .select_from(ComunicadoTurma)
        .where(ComunicadoTurma.docturma_id == docturma_id)
    ) or 0
    if tem_comunicados:
        raise HTTPException(
            400,
            f"Este vínculo possui {tem_comunicados} comunicado(s); remova-os antes.",
        )
    ids_atividades = select(AtividadeAvaliativa.id).where(
        AtividadeAvaliativa.docturma_id == docturma_id
    )
    db.execute(
        NotaAtividade.__table__.delete().where(
            NotaAtividade.atividade_id.in_(ids_atividades)
        )
    )
    db.execute(
        AtividadeAvaliativa.__table__.delete().where(
            AtividadeAvaliativa.docturma_id == docturma_id
        )
    )
    db.delete(dt)
    db.commit()
    return {"ok": True}
