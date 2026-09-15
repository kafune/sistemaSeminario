import secrets
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..tempo import agora_utc, hoje_local
from ..database import get_db
from ..models import (
    Aula,
    CalendarioPublico,
    Chamada,
    DocTurma,
    Materia,
    MaterialDidatico,
    PlanejamentoAula,
    Professor,
    Turma,
)
from ..xlsx.diario import gerar_diario_xlsx

router = APIRouter(prefix="/calendario", tags=["calendário"])
public_router = APIRouter(prefix="/calendario-publico", tags=["calendário público"])

# Uma repetição semanal cobre, no máximo, dois anos letivos. Sem teto, um
# erro de digitação no ano (2126 em vez de 2026) gerava milhares de aulas em
# uma requisição só.
REPETICAO_MAXIMA_DIAS = 366 * 2


class AulaInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    docturma_id: int
    data: date
    hora_inicio: time | None = None
    hora_fim: time | None = None
    local: str | None = Field(default=None, max_length=100)
    tema: str | None = Field(default=None, max_length=150)
    observacao: str | None = None
    status: str = Field(default="AGENDADA", pattern="^(AGENDADA|REALIZADA|CANCELADA)$")
    repetir_ate: date | None = None

    @model_validator(mode="after")
    def validar_periodo(self):
        if self.hora_inicio and self.hora_fim and self.hora_fim <= self.hora_inicio:
            raise ValueError("O horário final deve ser posterior ao inicial")
        if self.repetir_ate and self.repetir_ate < self.data:
            raise ValueError("A repetição não pode terminar antes da primeira aula")
        if self.repetir_ate and (self.repetir_ate - self.data).days > REPETICAO_MAXIMA_DIAS:
            raise ValueError(
                "A repetição semanal pode cobrir no máximo dois anos a partir da primeira aula"
            )
        return self


def _consulta_aulas():
    return (
        select(Aula, DocTurma, Turma, Materia, Professor)
        .join(DocTurma, DocTurma.id == Aula.docturma_id)
        .join(Turma, Turma.cod_tur == DocTurma.cod_tur)
        .join(Materia, Materia.cod_mat == DocTurma.cod_mat)
        .join(Professor, Professor.cod_pro == DocTurma.cod_pro, isouter=True)
    )


def _aula_dict(linha) -> dict:
    aula, vinculo, turma, materia, professor = linha
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
        "cod_tur": vinculo.cod_tur,
        "turma_nome": turma.nome,
        "cod_mat": vinculo.cod_mat,
        "materia_nome": (materia.NOME or "").strip(),
        "cod_pro": vinculo.cod_pro,
        "professor_nome": professor.nome if professor else None,
    }


def _listar(
    db: Session,
    inicio: date,
    fim: date,
    cod_tur: int | None = None,
    cod_mat: int | None = None,
    cod_pro: int | None = None,
) -> list[dict]:
    consulta = _consulta_aulas().where(Aula.data.between(inicio, fim))
    if cod_tur:
        consulta = consulta.where(DocTurma.cod_tur == cod_tur)
    if cod_mat:
        consulta = consulta.where(DocTurma.cod_mat == cod_mat)
    if cod_pro:
        consulta = consulta.where(DocTurma.cod_pro == cod_pro)
    consulta = consulta.order_by(Aula.data, Aula.hora_inicio, Turma.nome)
    return [_aula_dict(linha) for linha in db.execute(consulta)]


@router.get("")
def listar_aulas(
    inicio: date,
    fim: date,
    cod_tur: int | None = None,
    cod_mat: int | None = None,
    cod_pro: int | None = None,
    db: Session = Depends(get_db),
):
    if fim < inicio:
        raise HTTPException(400, "Período inválido")
    return _listar(db, inicio, fim, cod_tur, cod_mat, cod_pro)


@router.get("/opcoes")
def opcoes_calendario(db: Session = Depends(get_db)):
    consulta = (
        select(DocTurma, Turma, Materia, Professor)
        .join(Turma, Turma.cod_tur == DocTurma.cod_tur)
        .join(Materia, Materia.cod_mat == DocTurma.cod_mat)
        .join(Professor, Professor.cod_pro == DocTurma.cod_pro, isouter=True)
        .order_by(Turma.nome, Materia.NOME)
    )
    vinculos = [
        {
            "docturma_id": vinculo.id,
            "cod_tur": vinculo.cod_tur,
            "turma_nome": turma.nome,
            "cod_mat": vinculo.cod_mat,
            "materia_nome": (materia.NOME or "").strip(),
            "cod_pro": vinculo.cod_pro,
            "professor_nome": professor.nome if professor else None,
            "ano": vinculo.Ano,
            "semestre": vinculo.semestre,
        }
        for vinculo, turma, materia, professor in db.execute(consulta)
    ]
    return {"vinculos": vinculos}


@router.post("")
def criar_aulas(dados: AulaInput, db: Session = Depends(get_db)):
    if not db.get(DocTurma, dados.docturma_id):
        raise HTTPException(404, "Matéria da turma não encontrada")

    limite = dados.repetir_ate or dados.data
    dia = dados.data
    criadas = 0
    ignoradas = 0
    valores = dados.model_dump(exclude={"repetir_ate", "data"})
    # Uma consulta só para as datas já ocupadas, em vez de um SELECT por semana.
    ocupadas = set(
        db.scalars(
            select(Aula.data).where(
                Aula.docturma_id == dados.docturma_id,
                Aula.data.between(dia, limite),
                Aula.hora_inicio == dados.hora_inicio,
            )
        )
    )
    while dia <= limite:
        if dia in ocupadas:
            ignoradas += 1
        else:
            db.add(Aula(data=dia, **valores))
            criadas += 1
        dia += timedelta(days=7)
    db.commit()
    return {"ok": True, "criadas": criadas, "ignoradas": ignoradas}


@router.put("/aulas/{aula_id}")
def atualizar_aula(
    aula_id: int, dados: AulaInput, db: Session = Depends(get_db)
):
    aula = db.get(Aula, aula_id)
    if not aula:
        raise HTTPException(404, "Aula não encontrada")
    if not db.get(DocTurma, dados.docturma_id):
        raise HTTPException(404, "Matéria da turma não encontrada")
    if aula.docturma_id != dados.docturma_id:
        db.execute(
            MaterialDidatico.__table__.update()
            .where(MaterialDidatico.aula_id == aula_id)
            .values(docturma_id=dados.docturma_id)
        )
    for campo, valor in dados.model_dump(exclude={"repetir_ate"}).items():
        setattr(aula, campo, valor)
    db.commit()
    return {"ok": True}


@router.delete("/aulas/{aula_id}")
def excluir_aula(aula_id: int, db: Session = Depends(get_db)):
    aula = db.get(Aula, aula_id)
    if not aula:
        raise HTTPException(404, "Aula não encontrada")
    # A chamada aponta para a aula; sem ela, as faltas registradas sumiriam de
    # todo cálculo (boletim, histórico, diário) sem ninguém ter pedido. Mesma
    # regra que já protege a turma e o vínculo: cancele a aula em vez disso.
    chamadas = db.scalar(
        select(func.count()).select_from(Chamada).where(Chamada.aula_id == aula_id)
    ) or 0
    if chamadas:
        raise HTTPException(
            400,
            "Esta aula já tem chamada registrada e não pode ser excluída. "
            "Marque a aula como cancelada para preservar o histórico de presenças.",
        )
    db.execute(
        MaterialDidatico.__table__.update()
        .where(MaterialDidatico.aula_id == aula_id)
        .values(aula_id=None)
    )
    db.execute(
        PlanejamentoAula.__table__.delete().where(
            PlanejamentoAula.aula_id == aula_id
        )
    )
    db.delete(aula)
    db.commit()
    return {"ok": True}


def _link_ativo(db: Session, cod_tur: int) -> CalendarioPublico | None:
    return db.scalar(
        select(CalendarioPublico)
        .where(CalendarioPublico.ativo == "S", CalendarioPublico.cod_tur == cod_tur)
        .order_by(CalendarioPublico.id.desc())
        .limit(1)
    )


def _criar_link(db: Session, cod_tur: int) -> CalendarioPublico:
    link = CalendarioPublico(
        token=secrets.token_urlsafe(32),
        cod_tur=cod_tur,
        ativo="S",
        criado_em=agora_utc(),
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def _turma_ou_404(db: Session, cod_tur: int) -> Turma:
    turma = db.get(Turma, cod_tur)
    if not turma:
        raise HTTPException(404, "Turma não encontrada")
    return turma


class CompartilhamentoInput(BaseModel):
    cod_tur: int


@router.get("/compartilhamento")
def obter_compartilhamento(cod_tur: int, db: Session = Depends(get_db)):
    _turma_ou_404(db, cod_tur)
    link = _link_ativo(db, cod_tur)
    return {"token": link.token if link else None, "cod_tur": cod_tur}


@router.post("/compartilhamento")
def criar_compartilhamento(dados: CompartilhamentoInput, db: Session = Depends(get_db)):
    _turma_ou_404(db, dados.cod_tur)
    link = _link_ativo(db, dados.cod_tur) or _criar_link(db, dados.cod_tur)
    return {"token": link.token, "cod_tur": dados.cod_tur}


@router.post("/compartilhamento/renovar")
def renovar_compartilhamento(dados: CompartilhamentoInput, db: Session = Depends(get_db)):
    """Invalida os links já enviados da turma e cria um novo."""
    _turma_ou_404(db, dados.cod_tur)
    for link in db.scalars(
        select(CalendarioPublico).where(
            CalendarioPublico.ativo == "S",
            CalendarioPublico.cod_tur == dados.cod_tur,
        )
    ):
        link.ativo = "N"
    db.commit()
    link = _criar_link(db, dados.cod_tur)
    return {"token": link.token, "cod_tur": dados.cod_tur}


@public_router.get("/{token}")
def calendario_publico(
    token: str,
    inicio: date | None = None,
    fim: date | None = None,
    db: Session = Depends(get_db),
):
    link = db.scalar(
        select(CalendarioPublico).where(
            CalendarioPublico.token == token,
            CalendarioPublico.ativo == "S",
        )
    )
    if not link or link.cod_tur is None:
        # Links antigos, sem turma, entregavam a agenda da instituição inteira
        # a quem apagasse o filtro da URL. Eles não valem mais.
        raise HTTPException(404, "Calendário não encontrado ou link expirado")
    turma = db.get(Turma, link.cod_tur)
    if not turma:
        raise HTTPException(404, "Turma não encontrada")
    inicio = inicio or (hoje_local() - timedelta(days=45))
    fim = fim or (hoje_local() + timedelta(days=370))
    if fim < inicio or (fim - inicio).days > 732:
        raise HTTPException(400, "Período inválido")
    aulas = _listar(db, inicio, fim, cod_tur=link.cod_tur)
    for aula in aulas:
        # Observações são de uso interno da secretaria.
        aula.pop("observacao", None)
        aula.pop("docturma_id", None)
    return {
        "aulas": aulas,
        "turma": {"cod_tur": turma.cod_tur, "nome": turma.nome},
    }


@router.get("/diario.xlsx")
def diario_xlsx(docturma_id: int, db: Session = Depends(get_db)):
    try:
        conteudo, nome = gerar_diario_xlsx(db, docturma_id)
    except ValueError as erro:
        raise HTTPException(400, str(erro))
    return Response(
        content=conteudo,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )
