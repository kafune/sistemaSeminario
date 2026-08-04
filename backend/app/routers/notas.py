"""Lançamento de notas e faltas (tabela alunota, o histórico oficial)."""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db, row_to_dict
from ..models import (
    Aluno,
    AluNota,
    AluTurma,
    AtividadeAvaliativa,
    DocTurma,
    Materia,
    NotaAtividade,
    Professor,
    Turma,
    Usuario,
)
from ..security import usuario_atual
from ..services.faltas import faltas_do_vinculo, subconsulta_faltas

router = APIRouter(prefix="/notas", tags=["notas"])

TIPOS_ATIVIDADE = {"LEITURA", "TRABALHO", "PROVA"}


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
    notas_atividades: list["NotaAtividadeInput"] | None = None


class NotaAtividadeInput(BaseModel):
    atividade_id: int
    nota: Decimal | None = None


class AtividadeInput(BaseModel):
    id: int | None = None
    tipo: str
    nome: str
    valor_maximo: Decimal


class ConfiguracaoAtividadesInput(BaseModel):
    atividades: list[AtividadeInput]


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


def _atividades_do_vinculo(
    db: Session,
    docturma_id: int,
) -> list[AtividadeAvaliativa]:
    return list(
        db.scalars(
            select(AtividadeAvaliativa)
            .where(AtividadeAvaliativa.docturma_id == docturma_id)
            .order_by(AtividadeAvaliativa.ordem, AtividadeAvaliativa.id)
        )
    )


def _validar_decimal(
    valor: Decimal,
    *,
    minimo: Decimal,
    maximo: Decimal,
    mensagem: str,
) -> None:
    if not valor.is_finite() or valor < minimo or valor > maximo:
        raise HTTPException(400, mensagem)


def _recalcular_notas_finais(db: Session, docturma_id: int) -> None:
    """Sincroniza o histórico oficial depois da remoção de uma atividade."""
    ids_atividades = select(AtividadeAvaliativa.id).where(
        AtividadeAvaliativa.docturma_id == docturma_id
    )
    totais = {
        cod_alu: total
        for cod_alu, total in db.execute(
            select(NotaAtividade.cod_alu, func.sum(NotaAtividade.nota))
            .where(NotaAtividade.atividade_id.in_(ids_atividades))
            .group_by(NotaAtividade.cod_alu)
        )
    }
    for registro in db.scalars(
        select(AluNota).where(AluNota.docturma_id == docturma_id)
    ):
        registro.nota = totais.get(registro.cod_alu)


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
    atividades = _atividades_do_vinculo(db, vinculo.id)
    ids_atividades = [atividade.id for atividade in atividades]
    notas_atividades: dict[int, list[dict]] = {}
    if ids_atividades:
        for nota_atividade in db.scalars(
            select(NotaAtividade).where(
                NotaAtividade.atividade_id.in_(ids_atividades)
            )
        ):
            notas_atividades.setdefault(nota_atividade.cod_alu, []).append(
                {
                    "atividade_id": nota_atividade.atividade_id,
                    "nota": float(nota_atividade.nota),
                }
            )
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
                "notas_atividades": notas_atividades.get(cod_alu, []),
            }
        )
    return {
        "docturma": row_to_dict(vinculo),
        "atividades": [row_to_dict(atividade) for atividade in atividades],
        "alunos": linhas,
    }


def _validar_referencias_nota(db: Session, dados: NotaInput) -> None:
    if dados.nota is not None:
        _validar_decimal(
            Decimal(str(dados.nota)),
            minimo=Decimal("0"),
            maximo=Decimal("10"),
            mensagem="A nota deve ficar entre 0 e 10",
        )
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


@router.put("/vinculo/{docturma_id}/atividades")
def configurar_atividades(
    docturma_id: int,
    dados: ConfiguracaoAtividadesInput,
    db: Session = Depends(get_db),
    user: str = Depends(usuario_atual),
):
    """Substitui a composição da nota, limitada a dez pontos no total."""
    vinculo = db.get(DocTurma, docturma_id)
    if not vinculo:
        raise HTTPException(404, "Matéria da turma não encontrada")
    _validar_acesso_vinculo(db, user, vinculo)

    ids_informados = [item.id for item in dados.atividades if item.id is not None]
    if len(ids_informados) != len(set(ids_informados)):
        raise HTTPException(400, "A lista contém atividades repetidas")

    total = Decimal("0")
    for item in dados.atividades:
        item.tipo = item.tipo.strip().upper()
        item.nome = item.nome.strip()
        if item.tipo not in TIPOS_ATIVIDADE:
            raise HTTPException(
                400,
                "O tipo da atividade deve ser leitura, trabalho ou prova",
            )
        if not item.nome:
            raise HTTPException(400, "Informe o nome de todas as atividades")
        if len(item.nome) > 100:
            raise HTTPException(400, "O nome da atividade deve ter até 100 caracteres")
        _validar_decimal(
            item.valor_maximo,
            minimo=Decimal("0.01"),
            maximo=Decimal("10"),
            mensagem="O valor de cada atividade deve ficar entre 0,01 e 10",
        )
        total += item.valor_maximo
    if total > Decimal("10"):
        raise HTTPException(
            400,
            "A soma dos valores das atividades não pode ultrapassar 10 pontos",
        )

    existentes = {
        atividade.id: atividade
        for atividade in _atividades_do_vinculo(db, docturma_id)
    }
    ids_invalidos = sorted(set(ids_informados) - set(existentes))
    if ids_invalidos:
        raise HTTPException(
            400,
            "Uma ou mais atividades não pertencem a esta turma e matéria",
        )
    maiores_notas = {
        atividade_id: maior_nota
        for atividade_id, maior_nota in db.execute(
            select(
                NotaAtividade.atividade_id,
                func.max(NotaAtividade.nota),
            )
            .where(NotaAtividade.atividade_id.in_(ids_informados))
            .group_by(NotaAtividade.atividade_id)
        )
    } if ids_informados else {}
    for item in dados.atividades:
        maior_nota = maiores_notas.get(item.id)
        if maior_nota is not None and maior_nota > item.valor_maximo:
            raise HTTPException(
                400,
                f'A atividade "{item.nome}" possui nota lançada acima do novo valor máximo',
            )

    preservados: set[int] = set()
    for ordem, item in enumerate(dados.atividades):
        atividade = existentes.get(item.id) if item.id is not None else None
        if atividade is None:
            atividade = AtividadeAvaliativa(docturma_id=docturma_id)
            db.add(atividade)
        else:
            preservados.add(atividade.id)
        atividade.tipo = item.tipo
        atividade.nome = item.nome
        atividade.valor_maximo = item.valor_maximo
        atividade.ordem = ordem

    removidos = set(existentes) - preservados
    if removidos:
        db.execute(
            NotaAtividade.__table__.delete().where(
                NotaAtividade.atividade_id.in_(removidos)
            )
        )
        db.execute(
            AtividadeAvaliativa.__table__.delete().where(
                AtividadeAvaliativa.id.in_(removidos)
            )
        )
        _recalcular_notas_finais(db, docturma_id)
    db.commit()
    return {
        "ok": True,
        "total": float(total),
        "atividades": [
            row_to_dict(atividade)
            for atividade in _atividades_do_vinculo(db, docturma_id)
        ],
    }


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
    tem_notas_parciais = any(
        lanc.notas_atividades is not None for lanc in dados.alunos
    )
    atividades = (
        _atividades_do_vinculo(db, vinculo.id) if tem_notas_parciais else []
    )
    atividades_por_id = {atividade.id: atividade for atividade in atividades}
    ids_atividades = list(atividades_por_id)
    notas_parciais = {
        (registro.atividade_id, registro.cod_alu): registro
        for registro in db.scalars(
            select(NotaAtividade).where(
                NotaAtividade.atividade_id.in_(ids_atividades),
                NotaAtividade.cod_alu.in_(codigos_alunos),
            )
        )
    } if ids_atividades and codigos_alunos else {}

    for lanc in dados.alunos:
        if lanc.nota is not None:
            _validar_decimal(
                Decimal(str(lanc.nota)),
                minimo=Decimal("0"),
                maximo=Decimal("10"),
                mensagem="A nota final deve ficar entre 0 e 10",
            )
        if lanc.notas_atividades is None:
            continue
        ids_lancados = [item.atividade_id for item in lanc.notas_atividades]
        if len(ids_lancados) != len(set(ids_lancados)):
            raise HTTPException(400, "O aluno possui uma atividade repetida")
        if set(ids_lancados) - set(atividades_por_id):
            raise HTTPException(
                400,
                "Uma ou mais atividades não pertencem a esta turma e matéria",
            )
        for nota_atividade in lanc.notas_atividades:
            if nota_atividade.nota is None:
                continue
            atividade = atividades_por_id[nota_atividade.atividade_id]
            _validar_decimal(
                nota_atividade.nota,
                minimo=Decimal("0"),
                maximo=atividade.valor_maximo,
                mensagem=(
                    f'A nota de "{atividade.nome}" deve ficar entre 0 e '
                    f"{atividade.valor_maximo}"
                ),
            )

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
        if lanc.notas_atividades is None:
            registro.nota = lanc.nota
        else:
            for item in lanc.notas_atividades:
                chave = (item.atividade_id, lanc.cod_alu)
                nota_parcial = notas_parciais.get(chave)
                if item.nota is None:
                    if nota_parcial is not None:
                        db.delete(nota_parcial)
                        notas_parciais.pop(chave)
                    continue
                if nota_parcial is None:
                    nota_parcial = NotaAtividade(
                        atividade_id=item.atividade_id,
                        cod_alu=lanc.cod_alu,
                        nota=item.nota,
                    )
                    db.add(nota_parcial)
                    notas_parciais[chave] = nota_parcial
                else:
                    nota_parcial.nota = item.nota
            valores = [
                nota_parcial.nota
                for (atividade_id, cod_alu), nota_parcial in notas_parciais.items()
                if cod_alu == lanc.cod_alu and atividade_id in atividades_por_id
            ]
            registro.nota = sum(valores, Decimal("0")) if valores else None
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
    if registro.docturma_id is not None:
        ids_atividades = select(AtividadeAvaliativa.id).where(
            AtividadeAvaliativa.docturma_id == registro.docturma_id
        )
        db.execute(
            NotaAtividade.__table__.delete().where(
                NotaAtividade.atividade_id.in_(ids_atividades),
                NotaAtividade.cod_alu == registro.cod_alu,
            )
        )
    db.delete(registro)
    db.commit()
    return {"ok": True}
