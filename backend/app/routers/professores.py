import re
import secrets
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db, row_to_dict
from ..models import (
    AluNota,
    ConviteAcessoProfessor,
    ConviteProfessor,
    DocTurma,
    Materia,
    MatProf,
    Professor,
    TitProf,
    Usuario,
)
from ..security import gerar_hash
from ..services.notificacoes import criar_para_todos, entregar_lista

router = APIRouter(prefix="/professores", tags=["professores"])
public_router = APIRouter(
    prefix="/cadastro-professor",
    tags=["autocadastro de professores"],
)
access_public_router = APIRouter(
    prefix="/acesso-professor",
    tags=["acesso de professores"],
)


class ProfessorInput(BaseModel):
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
    dat_nas: date | None = None
    rg: str | None = None
    cpf: str | None = None
    dat_cad: date | None = None
    est_civ: str | None = None
    status: str | None = None
    nacionalidade: str | None = None
    sigla: str | None = None
    materias_atuacao: str | None = None


class AutocadastroProfessorInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    nome: str = Field(min_length=3, max_length=100)
    e_mail: str = Field(min_length=5, max_length=100)
    celular: str = Field(min_length=8, max_length=20)
    fone1: str | None = Field(default=None, max_length=20)
    dat_nas: date | None = None
    sexo: str | None = Field(default=None, max_length=1)
    rg: str | None = Field(default=None, max_length=20)
    cpf: str | None = Field(default=None, max_length=20)
    est_civ: str | None = Field(default=None, max_length=30)
    nacionalidade: str | None = Field(default=None, max_length=30)
    endereco: str | None = Field(default=None, max_length=100)
    complemento: str | None = Field(default=None, max_length=60)
    bairro: str | None = Field(default=None, max_length=60)
    cidade: str | None = Field(default=None, max_length=60)
    uf: str | None = Field(default=None, max_length=2)
    cep: str | None = Field(default=None, max_length=10)
    materias_atuacao: str = Field(min_length=3, max_length=1000)


class CriarAcessoProfessorInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    user: str = Field(min_length=3, max_length=50)
    senha: str = Field(min_length=6, max_length=100)


def _convite_valido(
    db: Session,
    token: str,
    *,
    bloquear: bool = False,
) -> ConviteProfessor:
    consulta = select(ConviteProfessor).where(
        ConviteProfessor.token == token,
        ConviteProfessor.ativo == "S",
        ConviteProfessor.usado_em.is_(None),
    )
    if bloquear:
        consulta = consulta.with_for_update()
    convite = db.scalar(consulta)
    if not convite:
        raise HTTPException(404, "Convite inválido ou já utilizado")
    if convite.expira_em < datetime.now():
        convite.ativo = "N"
        db.commit()
        raise HTTPException(410, "Este convite expirou")
    return convite


def _somente_digitos(valor: str | None) -> str:
    return re.sub(r"\D", "", valor or "")


@router.get("")
def listar(busca: str = "", db: Session = Depends(get_db)):
    q = select(Professor, Usuario.user).join(
        Usuario,
        Usuario.cod_pro == Professor.cod_pro,
        isouter=True,
    )
    if busca:
        q = q.where(Professor.nome.like(f"%{busca}%"))
    resposta = []
    for professor, usuario in db.execute(q.order_by(Professor.nome)):
        item = row_to_dict(professor)
        item["usuario_acesso"] = usuario
        resposta.append(item)
    return resposta


@router.post("/convites")
def criar_convite(db: Session = Depends(get_db)):
    agora = datetime.now()
    convite = ConviteProfessor(
        token=secrets.token_urlsafe(32),
        criado_em=agora,
        expira_em=agora + timedelta(days=30),
        ativo="S",
    )
    db.add(convite)
    db.commit()
    db.refresh(convite)
    return {
        "token": convite.token,
        "expira_em": convite.expira_em.isoformat(),
    }


@router.post("/{cod_pro}/convite-acesso")
def criar_convite_acesso(cod_pro: int, db: Session = Depends(get_db)):
    professor = db.get(Professor, cod_pro)
    if not professor:
        raise HTTPException(404, "Professor não encontrado")
    acesso = db.scalar(select(Usuario).where(Usuario.cod_pro == cod_pro))
    if acesso:
        raise HTTPException(409, f"Professor já possui o usuário {acesso.user}")

    agora = datetime.now()
    for anterior in db.scalars(
        select(ConviteAcessoProfessor).where(
            ConviteAcessoProfessor.cod_pro == cod_pro,
            ConviteAcessoProfessor.ativo == "S",
        )
    ):
        anterior.ativo = "N"
    convite = ConviteAcessoProfessor(
        token=secrets.token_urlsafe(32),
        cod_pro=cod_pro,
        criado_em=agora,
        expira_em=agora + timedelta(days=7),
        usado_em=None,
        ativo="S",
    )
    db.add(convite)
    db.commit()
    db.refresh(convite)
    return {
        "token": convite.token,
        "expira_em": convite.expira_em.isoformat(),
        "professor_nome": professor.nome,
    }


@router.get("/{cod_pro}")
def obter(cod_pro: int, db: Session = Depends(get_db)):
    prof = db.get(Professor, cod_pro)
    if not prof:
        raise HTTPException(404, "Professor não encontrado")
    dados = row_to_dict(prof)
    dados["materias"] = [
        {"cod_mat": m.cod_mat, "nome": m.NOME}
        for m in db.scalars(
            select(Materia)
            .join(MatProf, MatProf.cod_mat == Materia.cod_mat)
            .where(MatProf.cod_pro == cod_pro)
        )
    ]
    dados["titulos"] = [
        row_to_dict(t)
        for t in db.scalars(select(TitProf).where(TitProf.cod_pro == cod_pro))
    ]
    return dados


@router.post("")
def criar(dados: ProfessorInput, db: Session = Depends(get_db)):
    prof = Professor(**dados.model_dump())
    if not prof.dat_cad:
        prof.dat_cad = date.today()
    db.add(prof)
    db.commit()
    db.refresh(prof)
    return row_to_dict(prof)


@router.put("/{cod_pro}")
def atualizar(cod_pro: int, dados: ProfessorInput, db: Session = Depends(get_db)):
    prof = db.get(Professor, cod_pro)
    if not prof:
        raise HTTPException(404, "Professor não encontrado")
    for k, v in dados.model_dump().items():
        setattr(prof, k, v)
    db.commit()
    return row_to_dict(prof)


@router.delete("/{cod_pro}")
def excluir(cod_pro: int, db: Session = Depends(get_db)):
    prof = db.get(Professor, cod_pro)
    if not prof:
        raise HTTPException(404, "Professor não encontrado")
    turmas = db.scalar(
        select(func.count()).select_from(DocTurma).where(DocTurma.cod_pro == cod_pro)
    ) or 0
    notas = db.scalar(
        select(func.count()).select_from(AluNota).where(AluNota.cod_pro == cod_pro)
    ) or 0
    acesso = db.scalar(
        select(func.count()).select_from(Usuario).where(Usuario.cod_pro == cod_pro)
    ) or 0
    if turmas or notas or acesso:
        detalhes = []
        if turmas:
            detalhes.append(f"{turmas} vínculo(s) com turma")
        if notas:
            detalhes.append(f"{notas} nota(s) lançada(s)")
        if acesso:
            detalhes.append("um acesso ao portal")
        raise HTTPException(
            400,
            "Professor possui "
            + " e ".join(detalhes)
            + "; altere o status para inativo em vez de excluir.",
        )
    db.execute(MatProf.__table__.delete().where(MatProf.cod_pro == cod_pro))
    db.execute(TitProf.__table__.delete().where(TitProf.cod_pro == cod_pro))
    db.delete(prof)
    db.commit()
    return {"ok": True}


@router.put("/{cod_pro}/materias")
def definir_materias(cod_pro: int, cod_mats: list[int], db: Session = Depends(get_db)):
    """Substitui o conjunto de matérias que o professor leciona."""
    if not db.get(Professor, cod_pro):
        raise HTTPException(404, "Professor não encontrado")
    codigos = list(dict.fromkeys(cod_mats))
    existentes = set(
        db.scalars(select(Materia.cod_mat).where(Materia.cod_mat.in_(codigos)))
    ) if codigos else set()
    ausentes = sorted(set(codigos) - existentes)
    if ausentes:
        raise HTTPException(
            404,
            f"Matéria(s) não encontrada(s): {', '.join(map(str, ausentes))}",
        )
    db.execute(MatProf.__table__.delete().where(MatProf.cod_pro == cod_pro))
    for i, cod_mat in enumerate(codigos, start=1):
        db.add(MatProf(cod_mat=cod_mat, cod_pro=cod_pro, seq_mp=i))
    db.commit()
    return {"ok": True, "quantidade": len(codigos)}


@public_router.get("/{token}")
def validar_convite(token: str, db: Session = Depends(get_db)):
    convite = _convite_valido(db, token)
    return {
        "valido": True,
        "expira_em": convite.expira_em.isoformat(),
    }


@public_router.post("/{token}")
def autocadastrar_professor(
    token: str,
    dados: AutocadastroProfessorInput,
    db: Session = Depends(get_db),
):
    convite = _convite_valido(db, token, bloquear=True)
    if "@" not in dados.e_mail or "." not in dados.e_mail.rsplit("@", 1)[-1]:
        raise HTTPException(400, "Informe um e-mail válido")

    email_existente = db.scalar(
        select(Professor).where(
            func.lower(Professor.e_mail) == dados.e_mail.lower()
        )
    )
    if email_existente:
        raise HTTPException(409, "Já existe um professor com este e-mail")

    cpf = _somente_digitos(dados.cpf)
    if cpf:
        for professor in db.scalars(
            select(Professor).where(Professor.cpf.is_not(None))
        ):
            if _somente_digitos(professor.cpf) == cpf:
                raise HTTPException(409, "Já existe um professor com este CPF")

    valores = {
        chave: (valor if valor != "" else None)
        for chave, valor in dados.model_dump().items()
    }
    agora = datetime.now()
    professor = Professor(
        **valores,
        dat_cad=date.today(),
        status="A",
        origem_cadastro="AUTOCADASTRO",
        cadastro_recebido_em=agora,
    )
    db.add(professor)
    db.flush()
    convite.usado_em = agora
    convite.ativo = "N"
    convite.professor_id = professor.cod_pro
    db.commit()
    notificacoes = criar_para_todos(
        db,
        categoria="CADASTROS",
        titulo="Novo cadastro de professor",
        corpo="Um professor concluiu o autocadastro.",
        rota="/professores",
        chave_evento=f"autocadastro-professor:{professor.cod_pro}",
    )
    db.commit()
    entregar_lista(db, notificacoes)
    return {
        "ok": True,
        "mensagem": "Cadastro enviado com sucesso",
    }


def _convite_acesso_valido(
    db: Session,
    token: str,
    *,
    bloquear: bool = False,
) -> tuple[ConviteAcessoProfessor, Professor]:
    consulta = select(ConviteAcessoProfessor).where(
        ConviteAcessoProfessor.token == token,
        ConviteAcessoProfessor.ativo == "S",
        ConviteAcessoProfessor.usado_em.is_(None),
    )
    if bloquear:
        consulta = consulta.with_for_update()
    convite = db.scalar(consulta)
    if not convite:
        raise HTTPException(404, "Convite de acesso inválido ou já utilizado")
    if convite.expira_em < datetime.now():
        convite.ativo = "N"
        db.commit()
        raise HTTPException(410, "Este convite de acesso expirou")
    professor = db.get(Professor, convite.cod_pro)
    if not professor:
        raise HTTPException(404, "Professor não encontrado")
    if db.scalar(select(Usuario).where(Usuario.cod_pro == professor.cod_pro)):
        raise HTTPException(409, "Este professor já possui acesso")
    return convite, professor


@access_public_router.get("/{token}")
def validar_convite_acesso(token: str, db: Session = Depends(get_db)):
    convite, professor = _convite_acesso_valido(db, token)
    sugestao = (professor.e_mail or "").split("@", 1)[0].upper()
    sugestao = re.sub(r"[^A-Z0-9._-]", "", sugestao)
    return {
        "valido": True,
        "professor_nome": professor.nome,
        "usuario_sugerido": sugestao,
        "expira_em": convite.expira_em.isoformat(),
    }


@access_public_router.post("/{token}")
def concluir_acesso_professor(
    token: str,
    dados: CriarAcessoProfessorInput,
    db: Session = Depends(get_db),
):
    convite, professor = _convite_acesso_valido(db, token, bloquear=True)
    user = dados.user.strip().upper()
    if not re.fullmatch(r"[A-Z0-9._-]+", user):
        raise HTTPException(
            400,
            "O usuário pode conter somente letras, números, ponto, hífen e sublinhado",
        )
    if db.get(Usuario, user):
        raise HTTPException(409, "Este nome de usuário já está em uso")
    agora = datetime.now()
    usuario = Usuario(
        user=user,
        senha_hash=gerar_hash(dados.senha),
        perfil="PROFESSOR",
        cod_pro=professor.cod_pro,
    )
    db.add(usuario)
    convite.usado_em = agora
    convite.ativo = "N"
    db.commit()
    return {"ok": True, "user": usuario.user}
