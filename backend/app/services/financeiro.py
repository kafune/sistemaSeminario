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
from typing import NamedTuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (
    Aluno,
    AluTurma,
    Cobranca,
    CondicaoFinanceiraAluno,
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


def aplicar_desconto(valor: Decimal, percentual: Decimal) -> Decimal:
    """Valor com o percentual abatido, arredondado ao centavo."""
    if percentual <= ZERO:
        return dinheiro(valor)
    return dinheiro(dinheiro(valor) * (Decimal("100") - dinheiro(percentual)) / Decimal("100"))


def formatar_percentual(percentual: Decimal) -> str:
    """10 vira "10%"; 12.50 vira "12,5%"."""
    texto = f"{dinheiro(percentual).normalize():f}"
    return f"{texto.replace('.', ',')}%"


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
        # A coluna tem 120: nome de turma comprido não pode derrubar a geração.
        descricao=descricao[:120],
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


class PlanoEfetivo(NamedTuple):
    """Plano da turma já com a condição do aluno aplicada."""

    valor_matricula: Decimal
    vencimento_matricula: date
    valor_mensalidade: Decimal
    parcelas: int
    primeira_mensalidade: date
    dia_vencimento: int
    transferencia: bool
    desconto_percentual: Decimal = ZERO
    desconto_motivo: str | None = None
    desconto_na_matricula: bool = False
    mensalidade_cheia: Decimal = ZERO
    matricula_cheia: Decimal = ZERO


def plano_efetivo(
    plano: PlanoFinanceiro,
    condicao: CondicaoFinanceiraAluno | None,
    *,
    hoje: date | None = None,
) -> PlanoEfetivo:
    """Resolve o que este aluno paga de fato.

    Cada campo nulo na condição significa "segue a turma", então o aluno de
    transferência mexe só no que é diferente — quase sempre a quantidade de
    meses e o mês de entrada.
    """
    hoje = hoje or date.today()
    base = plano.primeira_mensalidade or date(hoje.year, hoje.month, 1)
    dia = max(1, min(int(plano.dia_vencimento or base.day), 28))
    efetivo = PlanoEfetivo(
        valor_matricula=dinheiro(plano.valor_matricula),
        vencimento_matricula=plano.vencimento_matricula or hoje,
        valor_mensalidade=dinheiro(plano.valor_mensalidade),
        parcelas=max(int(plano.parcelas or 0), 0),
        primeira_mensalidade=base,
        dia_vencimento=dia,
        transferencia=False,
    )
    if condicao is None:
        return efetivo

    if condicao.tipo == "TRANSFERENCIA":
        efetivo = efetivo._replace(
            valor_matricula=(
                ZERO
                if condicao.cobra_matricula != "S"
                else dinheiro(condicao.valor_matricula)
                if condicao.valor_matricula is not None
                else efetivo.valor_matricula
            ),
            valor_mensalidade=(
                dinheiro(condicao.valor_mensalidade)
                if condicao.valor_mensalidade is not None
                else efetivo.valor_mensalidade
            ),
            parcelas=(
                max(int(condicao.parcelas), 0)
                if condicao.parcelas is not None
                else efetivo.parcelas
            ),
            primeira_mensalidade=condicao.primeira_mensalidade or efetivo.primeira_mensalidade,
            transferencia=True,
        )

    # O desconto vale para quem segue o plano da turma e para quem veio de
    # transferência: ele incide sobre a mensalidade já resolvida.
    percentual = dinheiro(condicao.desconto_percentual)
    if percentual <= ZERO:
        return efetivo
    na_matricula = condicao.desconto_na_matricula == "S"
    return efetivo._replace(
        mensalidade_cheia=efetivo.valor_mensalidade,
        valor_mensalidade=aplicar_desconto(efetivo.valor_mensalidade, percentual),
        matricula_cheia=efetivo.valor_matricula,
        valor_matricula=(
            aplicar_desconto(efetivo.valor_matricula, percentual)
            if na_matricula
            else efetivo.valor_matricula
        ),
        desconto_percentual=percentual,
        desconto_motivo=condicao.desconto_motivo,
        desconto_na_matricula=na_matricula,
    )


def condicoes_da_turma(
    db: Session,
    cod_tur: int,
    alunos: list[int] | None = None,
) -> dict[int, CondicaoFinanceiraAluno]:
    consulta = select(CondicaoFinanceiraAluno).where(
        CondicaoFinanceiraAluno.cod_tur == cod_tur
    )
    if alunos is not None:
        consulta = consulta.where(CondicaoFinanceiraAluno.cod_alu.in_(alunos))
    return {condicao.cod_alu: condicao for condicao in db.scalars(consulta)}


def _vencimento_da_parcela(efetivo: PlanoEfetivo, numero: int) -> date:
    # A parcela 1 vence na data escolhida, tal como digitada; o dia do plano
    # governa apenas as seguintes.
    if numero == 1:
        return efetivo.primeira_mensalidade
    return somar_meses(efetivo.primeira_mensalidade, numero - 1, efetivo.dia_vencimento)


def _descricao_matricula(efetivo: PlanoEfetivo, nome_turma: str) -> str:
    partes = ["Matrícula", nome_turma]
    if efetivo.desconto_na_matricula and efetivo.desconto_percentual > ZERO:
        partes.append(f"desconto {formatar_percentual(efetivo.desconto_percentual)}")
    return " · ".join(partes)


def _descricao_mensalidade(numero: int, efetivo: PlanoEfetivo, nome_turma: str) -> str:
    partes = [f"Mensalidade {numero}/{efetivo.parcelas}", nome_turma]
    if efetivo.transferencia:
        partes.append("transferência")
    if efetivo.desconto_percentual > ZERO:
        partes.append(f"desconto {formatar_percentual(efetivo.desconto_percentual)}")
    return " · ".join(partes)


def aplicar_plano_ao_aluno(
    db: Session,
    plano: PlanoFinanceiro,
    cod_alu: int,
    *,
    efetivo: PlanoEfetivo,
    nome_turma: str,
    criado_por: str | None = None,
    ajustar_existentes: bool = False,
) -> dict:
    """Faz as cobranças do aluno corresponderem ao plano dele.

    Sem ``ajustar_existentes`` apenas cria o que falta — é a geração do dia a
    dia, idempotente. Com ele, também corrige valor e vencimento das parcelas
    ainda em aberto e remove as que sobraram quando o aluno passou a pagar
    menos meses. Parcela com pagamento lançado nunca é apagada nem reescrita:
    o dinheiro que entrou manda mais que o plano.
    """
    existentes = {
        cobranca.parcela: cobranca
        for cobranca in db.scalars(
            select(Cobranca).where(
                Cobranca.cod_tur == plano.cod_tur,
                Cobranca.cod_alu == cod_alu,
                Cobranca.tipo == "MENSALIDADE",
            )
        )
    }
    matricula = db.scalar(
        select(Cobranca).where(
            Cobranca.cod_tur == plano.cod_tur,
            Cobranca.cod_alu == cod_alu,
            Cobranca.tipo == "MATRICULA",
        )
    )
    ids = [c.id for c in existentes.values()]
    if matricula is not None:
        ids.append(matricula.id)
    pagos = pagos_por_cobranca(db, ids)

    def intocavel(cobranca: Cobranca) -> bool:
        return pagos.get(cobranca.id, ZERO) > ZERO or cobranca.status in ("PAGA", "ISENTA")

    resultado = {"criadas": 0, "atualizadas": 0, "removidas": 0, "preservadas": 0}

    # Matrícula: existe quando o plano efetivo cobra por ela.
    if efetivo.valor_matricula > ZERO and matricula is None:
        criar_cobranca(
            db,
            cod_alu=cod_alu,
            cod_tur=plano.cod_tur,
            plano_id=plano.id,
            tipo="MATRICULA",
            descricao=_descricao_matricula(efetivo, nome_turma),
            valor=efetivo.valor_matricula,
            vencimento=efetivo.vencimento_matricula,
            parcela=1,
            total_parcelas=1,
            criado_por=criado_por,
        )
        resultado["criadas"] += 1
    elif matricula is not None and ajustar_existentes:
        if efetivo.valor_matricula <= ZERO:
            if intocavel(matricula):
                resultado["preservadas"] += 1
            else:
                db.delete(matricula)
                resultado["removidas"] += 1
        elif not intocavel(matricula) and (
            dinheiro(matricula.valor) != efetivo.valor_matricula
            or matricula.vencimento != efetivo.vencimento_matricula
        ):
            matricula.valor = efetivo.valor_matricula
            matricula.vencimento = efetivo.vencimento_matricula
            matricula.competencia = competencia_de(efetivo.vencimento_matricula)
            matricula.descricao = _descricao_matricula(efetivo, nome_turma)[:120]
            resultado["atualizadas"] += 1

    if efetivo.valor_mensalidade <= ZERO:
        return resultado

    for numero in range(1, efetivo.parcelas + 1):
        cobranca = existentes.pop(numero, None)
        vencimento = _vencimento_da_parcela(efetivo, numero)
        descricao = _descricao_mensalidade(numero, efetivo, nome_turma)
        if cobranca is None:
            criar_cobranca(
                db,
                cod_alu=cod_alu,
                cod_tur=plano.cod_tur,
                plano_id=plano.id,
                tipo="MENSALIDADE",
                descricao=descricao,
                valor=efetivo.valor_mensalidade,
                vencimento=vencimento,
                parcela=numero,
                total_parcelas=efetivo.parcelas,
                criado_por=criado_por,
            )
            resultado["criadas"] += 1
            continue
        if not ajustar_existentes:
            continue
        if intocavel(cobranca):
            resultado["preservadas"] += 1
            continue
        mudou = (
            dinheiro(cobranca.valor) != efetivo.valor_mensalidade
            or cobranca.vencimento != vencimento
            or cobranca.total_parcelas != efetivo.parcelas
        )
        cobranca.valor = efetivo.valor_mensalidade
        cobranca.vencimento = vencimento
        cobranca.competencia = competencia_de(vencimento)
        cobranca.total_parcelas = efetivo.parcelas
        cobranca.descricao = descricao
        if mudou:
            resultado["atualizadas"] += 1

    # O que sobrou passou do fim do plano: é o excedente de quem vai cursar
    # menos meses que a turma.
    if ajustar_existentes:
        for cobranca in existentes.values():
            if intocavel(cobranca):
                resultado["preservadas"] += 1
            else:
                db.delete(cobranca)
                resultado["removidas"] += 1

    return resultado


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
    quem foi contemplado antes. Quem tem condição própria — o aluno de
    transferência — recebe as parcelas dele, não as da turma.
    """
    hoje = hoje or date.today()
    consulta = select(AluTurma.cod_alu).where(AluTurma.cod_tur == plano.cod_tur)
    if apenas_aluno is not None:
        consulta = consulta.where(AluTurma.cod_alu == apenas_aluno)
    alunos = sorted(set(db.scalars(consulta)))
    if not alunos:
        return {"alunos": 0, "criadas": 0, "transferencias": 0}

    turma = db.get(Turma, plano.cod_tur)
    nome_turma = (turma.nome if turma else None) or f"Turma {plano.cod_tur}"
    condicoes = condicoes_da_turma(db, plano.cod_tur, alunos)

    criadas = 0
    transferencias = 0
    for cod_alu in alunos:
        efetivo = plano_efetivo(plano, condicoes.get(cod_alu), hoje=hoje)
        if efetivo.transferencia:
            transferencias += 1
        resultado = aplicar_plano_ao_aluno(
            db,
            plano,
            cod_alu,
            efetivo=efetivo,
            nome_turma=nome_turma,
            criado_por=criado_por,
        )
        criadas += resultado["criadas"]

    return {
        "alunos": len(alunos),
        "criadas": criadas,
        "transferencias": transferencias,
    }


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
    condicao = (
        db.scalar(
            select(CondicaoFinanceiraAluno).where(
                CondicaoFinanceiraAluno.cod_alu == cod_alu,
                CondicaoFinanceiraAluno.cod_tur == aluno.cod_tur,
            )
        )
        if aluno.cod_tur is not None
        else None
    )
    plano = (
        db.scalar(select(PlanoFinanceiro).where(PlanoFinanceiro.cod_tur == aluno.cod_tur))
        if aluno.cod_tur is not None
        else None
    )
    efetivo = plano_efetivo(plano, condicao, hoje=hoje) if plano else None
    return {
        "aluno": {
            "cod_alu": aluno.cod_alu,
            "nome": aluno.nome,
            "status": aluno.status,
            "cod_tur": aluno.cod_tur,
            "turma_nome": nomes_turma.get(aluno.cod_tur),
        },
        "condicao": {
            "cod_tur": aluno.cod_tur,
            "tem_plano": plano is not None,
            "tipo": condicao.tipo if condicao else "REGULAR",
            "transferencia": bool(efetivo and efetivo.transferencia),
            "mensalidades_previstas": efetivo.parcelas if efetivo else None,
            "desconto_percentual": float(dinheiro(condicao.desconto_percentual))
            if condicao and condicao.desconto_percentual
            else 0.0,
            "desconto_motivo": condicao.desconto_motivo if condicao else None,
            "mensalidade_cheia": float(efetivo.mensalidade_cheia)
            if efetivo and efetivo.mensalidade_cheia > ZERO
            else float(efetivo.valor_mensalidade)
            if efetivo
            else None,
            "mensalidade_com_desconto": float(efetivo.valor_mensalidade) if efetivo else None,
            "desconto_na_matricula": bool(condicao and condicao.desconto_na_matricula == "S"),
            "matricula_cheia": float(efetivo.matricula_cheia)
            if efetivo and efetivo.matricula_cheia > ZERO
            else float(efetivo.valor_matricula)
            if efetivo
            else None,
            "matricula_com_desconto": float(efetivo.valor_matricula) if efetivo else None,
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
