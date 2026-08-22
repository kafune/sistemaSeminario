"""Regras de dinheiro do Centro TOV.

O módulo concentra três coisas que os routers apenas expõem:

* a **geração** das cobranças de uma turma a partir do seu plano (matrícula
  inicial + mensalidades), de forma idempotente;
* a **baixa** de um título, que é o único ponto que muda o status de uma
  cobrança para paga;
* a **conciliação** de um recebimento informado pelo banco (PIX ou boleto)
  com o título correspondente.

Vencido e parcial não são gravados: são derivados da data e do quanto já foi
pago. Assim o banco nunca guarda um status que envelhece sozinho.
"""

import re
import unicodedata
from calendar import monthrange
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (
    Aluno,
    AluTurma,
    Cobranca,
    ConfiguracaoFinanceira,
    Pagamento,
    PlanoFinanceiro,
    TransacaoBancaria,
    Turma,
)

ZERO = Decimal("0.00")
TIPOS = ("MATRICULA", "MENSALIDADE", "AVULSA")
FORMAS = ("PIX", "BOLETO", "DINHEIRO", "CARTAO", "TRANSFERENCIA")
# Status administrativos, os únicos gravados na coluna `status`.
STATUS_GRAVADOS = ("ABERTA", "PAGA", "CANCELADA", "ISENTA")
# Situações apresentadas, já considerando data e valor pago.
SITUACOES = ("ABERTA", "PARCIAL", "VENCIDA", "PAGA", "CANCELADA", "ISENTA")
ROTULO_TIPO = {
    "MATRICULA": "Matrícula",
    "MENSALIDADE": "Mensalidade",
    "AVULSA": "Avulsa",
}


def dinheiro(valor) -> Decimal:
    """Normaliza qualquer entrada numérica para duas casas decimais."""
    return Decimal(str(valor or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def referencia_de(cobranca_id: int) -> str:
    """Código curto que o aluno informa no PIX e que o banco devolve."""
    return f"TOV{cobranca_id:06d}"


def extrair_referencia(texto: str | None) -> str | None:
    """Encontra o código TOV dentro da descrição livre enviada pelo banco."""
    achado = re.search(r"TOV\s*-?\s*(\d{4,10})", texto or "", re.IGNORECASE)
    if not achado:
        return None
    return referencia_de(int(achado.group(1)))


def somente_digitos(valor: str | None) -> str:
    return re.sub(r"\D", "", valor or "")


def normalizar_nome(valor: str | None) -> str:
    sem_acento = unicodedata.normalize("NFKD", valor or "")
    sem_acento = "".join(c for c in sem_acento if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", sem_acento).strip().upper()


# ---- datas -----------------------------------------------------------------

def somar_meses(base: date, meses: int, dia: int | None = None) -> date:
    """Avança meses preservando o dia de vencimento possível naquele mês."""
    total = base.month - 1 + meses
    ano = base.year + total // 12
    mes = total % 12 + 1
    ultimo_dia = monthrange(ano, mes)[1]
    return date(ano, mes, min(dia or base.day, ultimo_dia))


def competencia_de(vencimento: date) -> str:
    return f"{vencimento.year:04d}-{vencimento.month:02d}"


# ---- leitura ---------------------------------------------------------------

def pagos_por_cobranca(db: Session, ids: list[int]) -> dict[int, Decimal]:
    """Soma das baixas de cada cobrança, em uma consulta só."""
    if not ids:
        return {}
    linhas = db.execute(
        select(Pagamento.cobranca_id, func.sum(Pagamento.valor))
        .where(Pagamento.cobranca_id.in_(ids))
        .group_by(Pagamento.cobranca_id)
    )
    return {cobranca_id: dinheiro(total) for cobranca_id, total in linhas}


def total_pago(db: Session, cobranca_id: int) -> Decimal:
    return dinheiro(
        db.scalar(
            select(func.sum(Pagamento.valor)).where(
                Pagamento.cobranca_id == cobranca_id
            )
        )
    )


def situacao_de(cobranca: Cobranca, pago: Decimal, hoje: date) -> str:
    """Situação apresentada: cancelada e isenta mandam, o resto vem da data."""
    if cobranca.status in ("CANCELADA", "ISENTA"):
        return cobranca.status
    saldo = dinheiro(cobranca.valor) - dinheiro(pago)
    if saldo <= ZERO:
        return "PAGA"
    if cobranca.vencimento and cobranca.vencimento < hoje:
        return "VENCIDA"
    return "PARCIAL" if pago > ZERO else "ABERTA"


def cobranca_dict(cobranca: Cobranca, pago: Decimal, hoje: date, **extra) -> dict:
    valor = dinheiro(cobranca.valor)
    pago = dinheiro(pago)
    conta_no_saldo = cobranca.status not in ("CANCELADA", "ISENTA")
    return {
        "id": cobranca.id,
        "cod_alu": cobranca.cod_alu,
        "cod_tur": cobranca.cod_tur,
        "tipo": cobranca.tipo,
        "tipo_rotulo": ROTULO_TIPO.get(cobranca.tipo, cobranca.tipo),
        "descricao": cobranca.descricao,
        "parcela": cobranca.parcela,
        "total_parcelas": cobranca.total_parcelas,
        "competencia": cobranca.competencia,
        "valor": float(valor),
        "pago": float(pago),
        "saldo": float(max(valor - pago, ZERO)) if conta_no_saldo else 0.0,
        "vencimento": cobranca.vencimento.isoformat() if cobranca.vencimento else None,
        "status": cobranca.status,
        "situacao": situacao_de(cobranca, pago, hoje),
        "referencia": cobranca.referencia,
        "observacao": cobranca.observacao,
        **extra,
    }


def configuracao(db: Session) -> ConfiguracaoFinanceira:
    """Linha única de configuração; criada na primeira leitura."""
    config = db.scalar(
        select(ConfiguracaoFinanceira).order_by(ConfiguracaoFinanceira.id)
    )
    if config is None:
        config = ConfiguracaoFinanceira(conciliacao_automatica="S", tolerancia_dias=5)
        db.add(config)
        db.flush()
    return config


# ---- geração ---------------------------------------------------------------

def criar_cobranca(
    db: Session,
    *,
    cod_alu: int,
    cod_tur: int | None,
    plano_id: int | None,
    tipo: str,
    descricao: str,
    valor: Decimal,
    vencimento: date,
    parcela: int | None = None,
    total_parcelas: int | None = None,
    observacao: str | None = None,
    criado_por: str | None = None,
) -> Cobranca:
    cobranca = Cobranca(
        cod_alu=cod_alu,
        cod_tur=cod_tur,
        plano_id=plano_id,
        tipo=tipo,
        descricao=descricao,
        parcela=parcela,
        total_parcelas=total_parcelas,
        competencia=competencia_de(vencimento),
        valor=dinheiro(valor),
        vencimento=vencimento,
        status="ABERTA",
        observacao=observacao,
        criado_em=datetime.now(),
        criado_por=criado_por,
    )
    db.add(cobranca)
    db.flush()
    # A referência precisa do id: é o código que o aluno informa no PIX.
    cobranca.referencia = referencia_de(cobranca.id)
    return cobranca


def gerar_cobrancas_do_plano(
    db: Session,
    plano: PlanoFinanceiro,
    *,
    criado_por: str | None = None,
    hoje: date | None = None,
    apenas_aluno: int | None = None,
) -> dict:
    """Aplica o plano da turma aos alunos matriculados.

    É idempotente: rodar de novo depois de matricular mais gente cria só o que
    falta, porque a chave lógica (aluno, turma, tipo, parcela) já existe para
    quem foi contemplado antes.
    """
    hoje = hoje or date.today()
    consulta = select(AluTurma.cod_alu).where(AluTurma.cod_tur == plano.cod_tur)
    if apenas_aluno is not None:
        consulta = consulta.where(AluTurma.cod_alu == apenas_aluno)
    alunos = sorted(set(db.scalars(consulta)))
    if not alunos:
        return {"alunos": 0, "criadas": 0, "existentes": 0}

    existentes = {
        (cod_alu, tipo, parcela)
        for cod_alu, tipo, parcela in db.execute(
            select(Cobranca.cod_alu, Cobranca.tipo, Cobranca.parcela).where(
                Cobranca.cod_tur == plano.cod_tur,
                Cobranca.cod_alu.in_(alunos),
                Cobranca.tipo.in_(("MATRICULA", "MENSALIDADE")),
            )
        )
    }

    turma = db.get(Turma, plano.cod_tur)
    nome_turma = (turma.nome if turma else None) or f"Turma {plano.cod_tur}"
    base = plano.primeira_mensalidade or date(hoje.year, hoje.month, 1)
    dia = max(1, min(int(plano.dia_vencimento or base.day), 28))
    venc_matricula = plano.vencimento_matricula or hoje
    valor_matricula = dinheiro(plano.valor_matricula)
    valor_mensalidade = dinheiro(plano.valor_mensalidade)
    parcelas = max(int(plano.parcelas or 0), 0)

    criadas = 0
    reaproveitadas = 0
    for cod_alu in alunos:
        if valor_matricula > ZERO:
            if (cod_alu, "MATRICULA", 1) in existentes:
                reaproveitadas += 1
            else:
                criar_cobranca(
                    db,
                    cod_alu=cod_alu,
                    cod_tur=plano.cod_tur,
                    plano_id=plano.id,
                    tipo="MATRICULA",
                    descricao=f"Matrícula · {nome_turma}",
                    valor=valor_matricula,
                    vencimento=venc_matricula,
                    parcela=1,
                    total_parcelas=1,
                    criado_por=criado_por,
                )
                criadas += 1
        if valor_mensalidade <= ZERO:
            continue
        for numero in range(1, parcelas + 1):
            if (cod_alu, "MENSALIDADE", numero) in existentes:
                reaproveitadas += 1
                continue
            criar_cobranca(
                db,
                cod_alu=cod_alu,
                cod_tur=plano.cod_tur,
                plano_id=plano.id,
                tipo="MENSALIDADE",
                descricao=f"Mensalidade {numero}/{parcelas} · {nome_turma}",
                valor=valor_mensalidade,
                # A parcela 1 vence na data escolhida, tal como digitada; o dia
                # do plano governa apenas as seguintes.
                vencimento=base if numero == 1 else somar_meses(base, numero - 1, dia),
                parcela=numero,
                total_parcelas=parcelas,
                criado_por=criado_por,
            )
            criadas += 1

    return {"alunos": len(alunos), "criadas": criadas, "existentes": reaproveitadas}


# ---- baixa -----------------------------------------------------------------

def sincronizar_status(db: Session, cobranca: Cobranca) -> Decimal:
    """Único ponto que promove/rebaixa uma cobrança entre aberta e paga."""
    pago = total_pago(db, cobranca.id)
    if cobranca.status in ("CANCELADA", "ISENTA"):
        return pago
    cobranca.status = "PAGA" if pago >= dinheiro(cobranca.valor) else "ABERTA"
    return pago


def registrar_pagamento(
    db: Session,
    cobranca: Cobranca,
    *,
    valor: Decimal | None = None,
    data_pagamento: date | None = None,
    forma: str = "PIX",
    observacao: str | None = None,
    transacao_id: int | None = None,
    registrado_por: str | None = None,
) -> Pagamento:
    """Lança a baixa e devolve o pagamento criado (sem commit).

    Sem valor informado, quita o saldo — é o caminho do "marcar como pago".
    """
    pago = total_pago(db, cobranca.id)
    saldo = max(dinheiro(cobranca.valor) - pago, ZERO)
    valor = dinheiro(valor) if valor is not None else saldo
    pagamento = Pagamento(
        cobranca_id=cobranca.id,
        valor=valor,
        data_pagamento=data_pagamento or date.today(),
        forma=forma,
        observacao=observacao,
        transacao_id=transacao_id,
        registrado_por=registrado_por,
        registrado_em=datetime.now(),
    )
    db.add(pagamento)
    db.flush()
    sincronizar_status(db, cobranca)
    return pagamento


# ---- conciliação bancária --------------------------------------------------

def _abertas_do_aluno(db: Session, cod_alu: int) -> list[Cobranca]:
    return list(
        db.scalars(
            select(Cobranca)
            .where(Cobranca.cod_alu == cod_alu, Cobranca.status == "ABERTA")
            .order_by(Cobranca.vencimento, Cobranca.id)
        )
    )


def _aluno_do_pagador(db: Session, transacao: TransacaoBancaria) -> Aluno | None:
    documento = somente_digitos(transacao.pagador_documento)
    if documento:
        cpf_limpo = func.replace(
            func.replace(func.replace(Aluno.cpf, ".", ""), "-", ""), " ", ""
        )
        aluno = db.scalar(select(Aluno).where(cpf_limpo == documento).limit(1))
        if aluno:
            return aluno
    nome = normalizar_nome(transacao.pagador_nome)
    if not nome:
        return None
    candidatos = [
        aluno
        for aluno in db.scalars(select(Aluno).where(Aluno.nome.is_not(None)))
        if normalizar_nome(aluno.nome) == nome
    ]
    # Homônimo não é identificação: com dois candidatos, quem decide é gente.
    return candidatos[0] if len(candidatos) == 1 else None


def candidatas_para(db: Session, transacao: TransacaoBancaria) -> list[Cobranca]:
    """Cobranças que a tela de conciliação sugere para um recebimento."""
    referencia = transacao.referencia or extrair_referencia(transacao.descricao)
    if referencia:
        cobranca = db.scalar(
            select(Cobranca).where(
                Cobranca.referencia == referencia,
                Cobranca.status.not_in(("CANCELADA", "ISENTA")),
            )
        )
        if cobranca:
            return [cobranca]
    aluno = _aluno_do_pagador(db, transacao)
    if aluno:
        return _abertas_do_aluno(db, aluno.cod_alu)
    return list(
        db.scalars(
            select(Cobranca)
            .where(Cobranca.status == "ABERTA", Cobranca.valor == dinheiro(transacao.valor))
            .order_by(Cobranca.vencimento, Cobranca.id)
            .limit(20)
        )
    )


def encontrar_cobranca(
    db: Session,
    transacao: TransacaoBancaria,
    *,
    tolerancia_dias: int = 5,
) -> tuple[Cobranca | None, str]:
    """Identifica automaticamente o título de um PIX/boleto recebido.

    Devolve a cobrança e o motivo — o motivo é gravado para que a secretaria
    saiba **por que** o sistema fechou (ou não fechou) aquele título sozinho.
    """
    referencia = transacao.referencia or extrair_referencia(transacao.descricao)
    if referencia:
        cobranca = db.scalar(
            select(Cobranca).where(
                Cobranca.referencia == referencia,
                Cobranca.status.not_in(("CANCELADA", "ISENTA")),
            )
        )
        if cobranca:
            return cobranca, f"Código {referencia} informado no pagamento"

    aluno = _aluno_do_pagador(db, transacao)
    if aluno is None:
        return None, "Pagador não identificado entre os alunos"

    valor = dinheiro(transacao.valor)
    abertas = _abertas_do_aluno(db, aluno.cod_alu)
    if not abertas:
        return None, f"{aluno.nome} não possui cobrança em aberto"

    exatas = [c for c in abertas if dinheiro(c.valor) == valor]
    if len(exatas) == 1:
        return exatas[0], f"Valor exato de {aluno.nome}"
    if exatas:
        # Vários títulos com o mesmo valor: o vencimento próximo do crédito só
        # decide quando sobra um único candidato dentro da tolerância.
        proximas = [
            c
            for c in exatas
            if c.vencimento
            and abs((c.vencimento - transacao.data).days) <= tolerancia_dias
        ]
        if len(proximas) == 1:
            return proximas[0], f"Valor e vencimento de {aluno.nome}"
        return None, f"{aluno.nome} tem mais de uma cobrança com este valor"
    return None, f"Nenhuma cobrança de {aluno.nome} no valor recebido"


def conciliar(
    db: Session,
    transacao: TransacaoBancaria,
    *,
    cobranca: Cobranca,
    motivo: str,
    usuario: str | None = None,
) -> Pagamento:
    """Amarra o recebimento ao título e lança a baixa correspondente."""
    pagamento = registrar_pagamento(
        db,
        cobranca,
        valor=dinheiro(transacao.valor),
        data_pagamento=transacao.data,
        forma=transacao.meio if transacao.meio in FORMAS else "PIX",
        observacao=f"Conciliado com {transacao.meio} {transacao.identificador}",
        transacao_id=transacao.id,
        registrado_por=usuario,
    )
    transacao.status = "CONCILIADA"
    transacao.cobranca_id = cobranca.id
    transacao.motivo = motivo[:120]
    transacao.conciliada_em = datetime.now()
    transacao.conciliada_por = usuario
    return pagamento


def processar_recebimento(
    db: Session,
    transacao: TransacaoBancaria,
) -> TransacaoBancaria:
    """Fecha o título sozinho quando dá; o resto vira fila de conciliação."""
    config = configuracao(db)
    if config.conciliacao_automatica != "S":
        transacao.motivo = "Conciliação automática desligada"
        return transacao
    cobranca, motivo = encontrar_cobranca(
        db,
        transacao,
        tolerancia_dias=int(config.tolerancia_dias or 5),
    )
    if cobranca is None:
        transacao.motivo = motivo[:120]
        return transacao
    conciliar(db, transacao, cobranca=cobranca, motivo=motivo, usuario="BANCO")
    return transacao


# ---- extrato do aluno ------------------------------------------------------

def extrato_aluno(db: Session, cod_alu: int, *, hoje: date | None = None) -> dict:
    """Situação financeira completa de um aluno.

    É a mesma resposta usada pela secretaria, pelo financeiro e pela consulta
    do próprio aluno — muda apenas quem prova a identidade de quem pede.
    """
    hoje = hoje or date.today()
    aluno = db.get(Aluno, cod_alu)
    if aluno is None:
        return {}
    cobrancas = list(
        db.scalars(
            select(Cobranca)
            .where(Cobranca.cod_alu == cod_alu)
            .order_by(Cobranca.vencimento, Cobranca.id)
        )
    )
    ids = [c.id for c in cobrancas]
    pagos = pagos_por_cobranca(db, ids)
    nomes_turma = {
        cod_tur: nome for cod_tur, nome in db.execute(select(Turma.cod_tur, Turma.nome))
    }
    pagamentos: dict[int, list[dict]] = {}
    if ids:
        for pagamento in db.scalars(
            select(Pagamento)
            .where(Pagamento.cobranca_id.in_(ids))
            .order_by(Pagamento.data_pagamento, Pagamento.id)
        ):
            pagamentos.setdefault(pagamento.cobranca_id, []).append(
                {
                    "id": pagamento.id,
                    "valor": float(dinheiro(pagamento.valor)),
                    "data_pagamento": pagamento.data_pagamento.isoformat()
                    if pagamento.data_pagamento
                    else None,
                    "forma": pagamento.forma,
                    "observacao": pagamento.observacao,
                }
            )

    itens = []
    total = pago_total = vencido = a_vencer = ZERO
    proximo = None
    for cobranca in cobrancas:
        pago = pagos.get(cobranca.id, ZERO)
        item = cobranca_dict(
            cobranca,
            pago,
            hoje,
            turma_nome=nomes_turma.get(cobranca.cod_tur),
            pagamentos=pagamentos.get(cobranca.id, []),
        )
        itens.append(item)
        if cobranca.status in ("CANCELADA", "ISENTA"):
            continue
        valor = dinheiro(cobranca.valor)
        total += valor
        pago_total += min(pago, valor)
        saldo = max(valor - pago, ZERO)
        if saldo <= ZERO:
            continue
        if item["situacao"] == "VENCIDA":
            vencido += saldo
        else:
            a_vencer += saldo
            if proximo is None or (
                cobranca.vencimento and cobranca.vencimento < proximo["vencimento"]
            ):
                proximo = {"vencimento": cobranca.vencimento, "item": item}

    config = configuracao(db)
    return {
        "aluno": {
            "cod_alu": aluno.cod_alu,
            "nome": aluno.nome,
            "status": aluno.status,
            "turma_nome": nomes_turma.get(aluno.cod_tur),
        },
        "resumo": {
            "total": float(total),
            "pago": float(pago_total),
            "em_aberto": float(max(total - pago_total, ZERO)),
            "vencido": float(vencido),
            "a_vencer": float(a_vencer),
            "em_dia": vencido <= ZERO,
            "proximo_vencimento": proximo["item"] if proximo else None,
        },
        "cobrancas": itens,
        "pagamento": {
            "beneficiario": config.beneficiario,
            "chave_pix": config.chave_pix,
            "instrucoes": config.instrucoes,
        },
        "atualizado_em": datetime.now().isoformat(timespec="seconds"),
    }
