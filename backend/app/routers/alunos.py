from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..security import usuario_atual
from ..services import auditoria
from ..consultas import termo_like
from ..tempo import hoje_local
from ..database import get_db, row_to_dict
from ..models import Aluno, AluNota, AluTurma, Turma
from ..services.matriculas import sincronizar_matricula

router = APIRouter(prefix="/alunos", tags=["alunos"])


class AlunoInput(BaseModel):
    nome: str
    endereco: str | None = None
    complemento: str | None = None
    bairro: str | None = None
    cidade: str | None = None
    uf: str | None = None
    cep: str | None = None
    fone1: str | None = None
    fone2: str | None = None
    celular: str | None = None
    e_mail: str | None = None
    sexo: str | None = None
    dat_cad: date | None = None
    dat_nas: date | None = None
    est_civ: str | None = None
    escolaridade: str | None = None
    rg: str | None = None
    cpf: str | None = None
    profissao: str | None = None
    nacionalidade: str | None = None
    cur_seculares: str | None = None
    cur_teologicos: str | None = None
    igreja: str | None = None
    local_igreja: str | None = None
    nome_pastor: str | None = None
    turma_interesse: str | None = None
    nome_conjuge: str | None = None
    membro_desde: date | None = None
    atividades: str | None = None
    status: str | None = None
    cod_tur: int | None = None


@router.get("")
def listar(
    busca: str = "",
    cod_tur: int | None = None,
    status: str | None = None,
    sem_turma: bool = False,
    ordenacao: Literal["nome_asc", "nome_desc", "recentes", "antigos"] = "nome_asc",
    pagina: int = 1,
    por_pagina: int = 50,
    db: Session = Depends(get_db),
):
    pagina = max(1, pagina)
    por_pagina = min(100, max(1, por_pagina))
    q = select(Aluno)
    if busca:
        # Número procura pela matrícula **e** pelo nome: um nome que começa
        # com dígito ou um trecho de telefone não deve devolver nada.
        por_nome = Aluno.nome.like(termo_like(busca), escape="\\")
        q = q.where(or_(Aluno.cod_alu == int(busca), por_nome) if busca.isdigit() else por_nome)
    if cod_tur:
        q = q.where(Aluno.cod_tur == cod_tur)
    if status:
        q = q.where(Aluno.status == status)
    if sem_turma:
        # Fila de trabalho do painel: ativo no cadastro, sem matrícula em turma.
        q = q.where(
            ~select(AluTurma.id).where(AluTurma.cod_alu == Aluno.cod_alu).exists()
        )
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    criterios_ordenacao = {
        "nome_asc": (Aluno.nome.asc(), Aluno.cod_alu.asc()),
        "nome_desc": (Aluno.nome.desc(), Aluno.cod_alu.desc()),
        "recentes": (
            Aluno.dat_cad.is_(None),
            Aluno.dat_cad.desc(),
            Aluno.cod_alu.desc(),
        ),
        "antigos": (
            Aluno.dat_cad.is_(None),
            Aluno.dat_cad.asc(),
            Aluno.cod_alu.asc(),
        ),
    }
    q = (
        q.order_by(*criterios_ordenacao[ordenacao])
        .offset((pagina - 1) * por_pagina)
        .limit(por_pagina)
    )
    itens = [row_to_dict(a) for a in db.scalars(q)]
    # O nome da turma atual acompanha cada aluno: quem matricula precisa ver
    # de onde o aluno está saindo antes de confirmar uma transferência.
    codigos = {item["cod_tur"] for item in itens if item.get("cod_tur")}
    nomes = (
        {
            cod_tur: nome
            for cod_tur, nome in db.execute(
                select(Turma.cod_tur, Turma.nome).where(Turma.cod_tur.in_(codigos))
            )
        }
        if codigos
        else {}
    )
    for item in itens:
        item["turma_nome"] = nomes.get(item.get("cod_tur"))
    return {
        "total": total,
        "pagina": pagina,
        "itens": itens,
    }


@router.get("/{cod_alu}")
def obter(cod_alu: int, db: Session = Depends(get_db)):
    aluno = db.get(Aluno, cod_alu)
    if not aluno:
        raise HTTPException(404, "Aluno não encontrado")
    dados = row_to_dict(aluno)
    if aluno.cod_tur:
        tur = db.get(Turma, aluno.cod_tur)
        dados["turma_nome"] = tur.nome if tur else None
    return dados


@router.post("")
def criar(dados: AlunoInput, db: Session = Depends(get_db)):
    valores = dados.model_dump()
    cod_tur = valores.pop("cod_tur")
    aluno = Aluno(**valores)
    if not aluno.dat_cad:
        aluno.dat_cad = hoje_local()
    aluno.origem_cadastro = "MANUAL"
    db.add(aluno)
    db.flush()
    sincronizar_matricula(db, aluno, cod_tur)
    db.commit()
    db.refresh(aluno)
    return row_to_dict(aluno)


@router.put("/{cod_alu}")
def atualizar(cod_alu: int, dados: AlunoInput, db: Session = Depends(get_db)):
    aluno = db.get(Aluno, cod_alu)
    if not aluno:
        raise HTTPException(404, "Aluno não encontrado")
    valores = dados.model_dump()
    cod_tur = valores.pop("cod_tur")
    for k, v in valores.items():
        setattr(aluno, k, v)
    sincronizar_matricula(db, aluno, cod_tur)
    db.commit()
    return row_to_dict(aluno)


@router.delete("/{cod_alu}")
def excluir(cod_alu: int, db: Session = Depends(get_db),
    usuario: str = Depends(usuario_atual),
):
    aluno = db.get(Aluno, cod_alu)
    if not aluno:
        raise HTTPException(404, "Aluno não encontrado")
    tem_notas = db.scalar(
        select(func.count()).select_from(AluNota).where(AluNota.cod_alu == cod_alu)
    )
    if tem_notas:
        raise HTTPException(
            400,
            f"Aluno possui {tem_notas} lançamentos de notas. "
            "Altere o status para inativo em vez de excluir.",
        )
    sincronizar_matricula(db, aluno, None)
    db.delete(aluno)
    auditoria.registrar(db, usuario=usuario, acao="EXCLUIR", entidade="aluno", entidade_id=cod_alu, detalhes=str(aluno.nome or ""))
    db.commit()
    return {"ok": True}
