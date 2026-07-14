import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db, row_to_dict
from ..models import Aluno, AluNota, AluTurma, Turma

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
    membro_desde: date | None = None
    atividades: str | None = None
    status: str | None = None
    cod_tur: int | None = None


def _aplicar_filtros(q, busca: str, cod_tur: int | None, status: str | None):
    if busca:
        if busca.isdigit():
            q = q.where(Aluno.cod_alu == int(busca))
        else:
            q = q.where(Aluno.nome.like(f"%{busca}%"))
    if cod_tur:
        q = q.where(Aluno.cod_tur == cod_tur)
    if status:
        q = q.where(Aluno.status == status)
    return q


@router.get("")
def listar(
    busca: str = "",
    cod_tur: int | None = None,
    status: str | None = None,
    pagina: int = 1,
    por_pagina: int = 50,
    db: Session = Depends(get_db),
):
    q = _aplicar_filtros(select(Aluno), busca, cod_tur, status)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    q = q.order_by(Aluno.nome).offset((pagina - 1) * por_pagina).limit(por_pagina)
    return {
        "total": total,
        "pagina": pagina,
        "itens": [row_to_dict(a) for a in db.scalars(q)],
    }


# Colunas exportadas no CSV, na ordem: (cabeçalho, nome do campo)
COLUNAS_CSV = [
    ("Matrícula", "cod_alu"),
    ("Nome", "nome"),
    ("Status", "status"),
    ("Celular", "celular"),
    ("Telefone", "fone1"),
    ("E-mail", "e_mail"),
    ("Nascimento", "dat_nas"),
    ("Endereço", "endereco"),
    ("Complemento", "complemento"),
    ("Bairro", "bairro"),
    ("Cidade", "cidade"),
    ("UF", "uf"),
    ("CEP", "cep"),
    ("CPF", "cpf"),
    ("RG", "rg"),
    ("Igreja", "igreja"),
    ("Cadastro", "dat_cad"),
]


@router.get("/exportar.csv")
def exportar_csv(
    busca: str = "",
    cod_tur: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    """Lista de alunos (com os mesmos filtros da tela) em CSV para o Excel."""
    q = _aplicar_filtros(select(Aluno), busca, cod_tur, status).order_by(Aluno.nome)
    buf = io.StringIO()
    # ; como separador e \r\n: formato que o Excel brasileiro abre direto
    escritor = csv.writer(buf, delimiter=";", lineterminator="\r\n")
    escritor.writerow([rotulo for rotulo, _ in COLUNAS_CSV])
    for aluno in db.scalars(q):
        linha = []
        for _, campo in COLUNAS_CSV:
            v = getattr(aluno, campo)
            if isinstance(v, date):
                v = v.strftime("%d/%m/%Y")
            linha.append("" if v is None else v)
        escritor.writerow(linha)
    return Response(
        content="\ufeff" + buf.getvalue(),  # BOM para o Excel reconhecer UTF-8
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="alunos.csv"'},
    )


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
    aluno = Aluno(**dados.model_dump())
    if not aluno.dat_cad:
        aluno.dat_cad = date.today()
    db.add(aluno)
    db.commit()
    db.refresh(aluno)
    return row_to_dict(aluno)


@router.put("/{cod_alu}")
def atualizar(cod_alu: int, dados: AlunoInput, db: Session = Depends(get_db)):
    aluno = db.get(Aluno, cod_alu)
    if not aluno:
        raise HTTPException(404, "Aluno não encontrado")
    for k, v in dados.model_dump().items():
        setattr(aluno, k, v)
    db.commit()
    return row_to_dict(aluno)


@router.delete("/{cod_alu}")
def excluir(cod_alu: int, db: Session = Depends(get_db)):
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
    db.execute(AluTurma.__table__.delete().where(AluTurma.cod_alu == cod_alu))
    db.delete(aluno)
    db.commit()
    return {"ok": True}
