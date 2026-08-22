"""Importa a planilha de controle de matrículas e mensalidades.

A planilha que a secretaria mantém à mão tem duas listas — alunos regulares e
transferidos — e marca com ``C`` o casal, cujas células de valor ficam mescladas
entre as duas linhas porque **o casal paga junto**. Este script traduz isso para
o modelo do sistema:

* cada pessoa vira um aluno matriculado na turma;
* o cônjuge (a segunda linha do par) recebe o desconto percentual, que abate
  matrícula e mensalidade;
* o transferido recebe a condição de transferência, dispensado da matrícula;
* o que já foi pago entra como baixa, quitando as cobranças em ordem de
  vencimento — no casal, primeiro as do titular e depois as do cônjuge.

Ao final confere o resultado contra os dois totais que a própria planilha
declara. Se o que ficou no banco não bater com eles, o script avisa.

Uso, a partir da pasta backend/ com o .env configurado:

    python importar_planilha_financeiro.py --arquivo ../PLANILHA.xlsx --turma 1 --parcelas 12
    python importar_planilha_financeiro.py --arquivo ../PLANILHA.xlsx --turma 1 --parcelas 12 --aplicar

Sem ``--aplicar`` nada é gravado: o script mostra o que faria e sai.
"""

import argparse
import re
import sys
import unicodedata
from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import (
    Aluno,
    AluTurma,
    Cobranca,
    CondicaoFinanceiraAluno,
    Pagamento,
    PlanoFinanceiro,
    Turma,
)
from app.schema import atualizar_schema
from app.services import financeiro as servico
from app.services.matriculas import sincronizar_matricula

ORIGEM = "PLANILHA"


# ---- leitura da planilha ---------------------------------------------------

def normalizar(nome: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", nome or "")
    sem_acento = "".join(c for c in sem_acento if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", sem_acento).strip().upper()


def _decimal(valor) -> Decimal:
    """Converte a célula em dinheiro; ``PG`` e vazio viram zero."""
    if valor is None:
        return servico.ZERO
    texto = str(valor).strip().replace("R$", "").replace(".", "").replace(",", ".")
    if not texto or not re.fullmatch(r"-?\d+(\.\d+)?", texto):
        return servico.ZERO
    return servico.dinheiro(Decimal(texto))


def ler_planilha(caminho: str) -> tuple[list[dict], dict]:
    """Devolve as pessoas na ordem da planilha e os totais que ela declara."""
    try:
        import openpyxl
    except ImportError:  # pragma: no cover - dependência declarada
        sys.exit("openpyxl não instalado: pip install -r requirements.txt")

    livro = openpyxl.load_workbook(caminho, data_only=True)
    aba = livro[livro.sheetnames[0]]

    # A célula da coluna C mesclada em duas linhas é a marca do casal: uma
    # linha de valores para duas pessoas.
    titulares_de_casal = {
        intervalo.min_row
        for intervalo in aba.merged_cells.ranges
        if intervalo.min_col == 3 and intervalo.max_row == intervalo.min_row + 1
    }

    pessoas: list[dict] = []
    totais = {"pago": None, "a_pagar": None}
    bloco = "REGULAR"
    for indice, linha in enumerate(aba.iter_rows(values_only=True)):
        excel = indice + 1
        primeira = str(linha[0] or "").strip()
        nome = str(linha[1] or "").strip()
        if "TRANSFER" in normalizar(primeira) or "TRANSFER" in normalizar(nome):
            bloco = "TRANSFERENCIA"
            continue
        rotulo = normalizar(nome)
        if rotulo.startswith("VALOR TOTAL PAGO"):
            totais["pago"] = _decimal(linha[3])
            continue
        if rotulo.startswith("VALOR TOTAL A PAGAR"):
            totais["a_pagar"] = _decimal(linha[6])
            continue
        if not nome or not primeira.isdigit():
            continue
        pessoas.append(
            {
                "linha": excel,
                "nome": re.sub(r"\s+", " ", nome),
                "bloco": bloco,
                "titular_casal": excel in titulares_de_casal,
                "conjuge": (excel - 1) in titulares_de_casal,
                "pago": _decimal(linha[3]),
                "a_pagar": _decimal(linha[6]),
                "conta": str(linha[7] or "").strip() or None,
                "recibo": str(linha[8] or "").strip() or None,
            }
        )
    return pessoas, totais


# ---- gravação --------------------------------------------------------------

def obter_aluno(db, nome: str, cadastrados: dict[str, Aluno]) -> tuple[Aluno, bool]:
    """Reaproveita o aluno já cadastrado com o mesmo nome; senão, cria."""
    chave = normalizar(nome)
    existente = cadastrados.get(chave)
    if existente is not None:
        return existente, False
    aluno = Aluno(nome=nome, status="A", dat_cad=date.today(), origem_cadastro=ORIGEM)
    db.add(aluno)
    db.flush()
    cadastrados[chave] = aluno
    return aluno, True


def definir_condicao(
    db,
    pessoa: dict,
    aluno: Aluno,
    cod_tur: int,
    *,
    desconto_conjuge: Decimal,
) -> CondicaoFinanceiraAluno | None:
    """Traduz as marcas da planilha (C e o bloco) na condição do aluno."""
    transferencia = pessoa["bloco"] == "TRANSFERENCIA"
    conjuge = pessoa["conjuge"]
    if not transferencia and not conjuge:
        return None

    condicao = db.scalar(
        select(CondicaoFinanceiraAluno).where(
            CondicaoFinanceiraAluno.cod_tur == cod_tur,
            CondicaoFinanceiraAluno.cod_alu == aluno.cod_alu,
        )
    )
    if condicao is None:
        condicao = CondicaoFinanceiraAluno(cod_alu=aluno.cod_alu, cod_tur=cod_tur)
        db.add(condicao)
    if transferencia:
        condicao.tipo = "TRANSFERENCIA"
        condicao.cobra_matricula = "N"
        condicao.observacao = (
            "Transferido de outro seminário; dispensado da matrícula (planilha)."
        )
    else:
        condicao.tipo = "REGULAR"
    if conjuge:
        condicao.desconto_percentual = desconto_conjuge
        condicao.desconto_motivo = "Casal — cônjuge com desconto"
        condicao.desconto_na_matricula = "S"
    condicao.atualizado_por = ORIGEM
    db.flush()
    return condicao


def quitar(
    db,
    pessoa: dict,
    alunos_do_pagamento: list[Aluno],
    *,
    data_pagamento: date,
    relatar=print,
) -> Decimal:
    """Aplica o valor pago às cobranças, na ordem em que vencem.

    No casal o dinheiro entrou junto: começa pelo titular e transborda para o
    cônjuge, que é como a planilha registra — um depósito, duas pessoas.
    """
    restante = pessoa["pago"]
    if restante <= servico.ZERO:
        return servico.ZERO
    observacao = " · ".join(
        parte for parte in ("Importado da planilha", pessoa["conta"], pessoa["recibo"]) if parte
    )
    aplicado = servico.ZERO
    for aluno in alunos_do_pagamento:
        cobrancas = db.scalars(
            select(Cobranca)
            .where(Cobranca.cod_alu == aluno.cod_alu, Cobranca.status == "ABERTA")
            .order_by(Cobranca.vencimento, Cobranca.tipo.desc(), Cobranca.parcela)
        )
        for cobranca in cobrancas:
            if restante <= servico.ZERO:
                break
            saldo = servico.dinheiro(cobranca.valor) - servico.total_pago(db, cobranca.id)
            if saldo <= servico.ZERO:
                continue
            valor = min(saldo, restante)
            servico.registrar_pagamento(
                db,
                cobranca,
                valor=valor,
                data_pagamento=data_pagamento,
                forma="TRANSFERENCIA",
                observacao=observacao,
                registrado_por=ORIGEM,
            )
            restante -= valor
            aplicado += valor
    if restante > servico.ZERO:
        relatar(f"  ! {pessoa['nome']}: sobraram R$ {restante} sem cobrança para quitar")
    return aplicado


# ---- conferência -----------------------------------------------------------

def conferir(
    db,
    pessoas: list[dict],
    mapa: dict[int, Aluno],
    totais: dict,
    *,
    relatar=print,
) -> bool:
    """Compara o que ficou no banco com os totais declarados pela planilha."""
    hoje = date.today()
    pago_banco = servico.ZERO
    aberto_banco = servico.ZERO
    divergencias = []

    for pessoa in pessoas:
        aluno = mapa[pessoa["linha"]]
        # A planilha é uma foto de matrícula + a primeira mensalidade.
        cobrancas = list(
            db.scalars(
                select(Cobranca).where(
                    Cobranca.cod_alu == aluno.cod_alu,
                    Cobranca.tipo.in_(("MATRICULA", "MENSALIDADE")),
                    Cobranca.parcela == 1,
                )
            )
        )
        pagos = servico.pagos_por_cobranca(db, [c.id for c in cobrancas])
        pago = sum((pagos.get(c.id, servico.ZERO) for c in cobrancas), servico.ZERO)
        aberto = sum(
            (
                max(servico.dinheiro(c.valor) - pagos.get(c.id, servico.ZERO), servico.ZERO)
                for c in cobrancas
            ),
            servico.ZERO,
        )
        pago_banco += pago
        aberto_banco += aberto

        # No casal a planilha lança pagamento e saldo numa linha só.
        if pessoa["conjuge"]:
            continue
        esperado_aberto = pessoa["a_pagar"]
        esperado_pago = pessoa["pago"]
        if pessoa["titular_casal"]:
            conjuge = next(p for p in pessoas if p["linha"] == pessoa["linha"] + 1)
            aluno_conjuge = mapa[conjuge["linha"]]
            outras = list(
                db.scalars(
                    select(Cobranca).where(
                        Cobranca.cod_alu == aluno_conjuge.cod_alu,
                        Cobranca.tipo.in_(("MATRICULA", "MENSALIDADE")),
                        Cobranca.parcela == 1,
                    )
                )
            )
            pagos_outras = servico.pagos_por_cobranca(db, [c.id for c in outras])
            pago += sum((pagos_outras.get(c.id, servico.ZERO) for c in outras), servico.ZERO)
            aberto += sum(
                (
                    max(
                        servico.dinheiro(c.valor) - pagos_outras.get(c.id, servico.ZERO),
                        servico.ZERO,
                    )
                    for c in outras
                ),
                servico.ZERO,
            )
        if pago != esperado_pago or aberto != esperado_aberto:
            divergencias.append(
                f"  ! {pessoa['nome']}: pago {pago} (planilha {esperado_pago}), "
                f"em aberto {aberto} (planilha {esperado_aberto})"
            )

    relatar("")
    relatar("Conferência contra a planilha")
    relatar(f"  pago      no banco {pago_banco:>9}   planilha {totais['pago']!s:>9}")
    relatar(f"  a pagar   no banco {aberto_banco:>9}   planilha {totais['a_pagar']!s:>9}")
    for linha in divergencias:
        relatar(linha)
    bate = (
        not divergencias
        and (totais["pago"] is None or pago_banco == totais["pago"])
        and (totais["a_pagar"] is None or aberto_banco == totais["a_pagar"])
    )
    relatar("  => " + ("confere" if bate else "NÃO confere"))
    return bate


# ---- orquestração ----------------------------------------------------------

def importar(
    db,
    pessoas: list[dict],
    totais: dict,
    *,
    turma: Turma,
    parcelas: int,
    matricula: Decimal,
    mensalidade: Decimal,
    desconto_conjuge: Decimal,
    primeira_mensalidade: date,
    dia_vencimento: int = 10,
    relatar=print,
) -> dict:
    """Grava a planilha no banco e devolve o que foi feito.

    Não faz commit: quem chama decide, depois de olhar a conferência.
    """
    plano = db.scalar(select(PlanoFinanceiro).where(PlanoFinanceiro.cod_tur == turma.cod_tur))
    if plano is None:
        plano = PlanoFinanceiro(cod_tur=turma.cod_tur)
        db.add(plano)
    plano.valor_matricula = servico.dinheiro(matricula)
    plano.valor_mensalidade = servico.dinheiro(mensalidade)
    plano.parcelas = parcelas
    plano.dia_vencimento = dia_vencimento
    plano.primeira_mensalidade = primeira_mensalidade
    plano.vencimento_matricula = primeira_mensalidade
    plano.observacao = "Importado da planilha de controle de matrículas."
    plano.atualizado_por = ORIGEM
    db.flush()

    cadastrados = {
        normalizar(nome): aluno
        for aluno, nome in db.execute(select(Aluno, Aluno.nome))
        if nome
    }
    mapa: dict[int, Aluno] = {}
    criados = reaproveitados = 0
    for pessoa in pessoas:
        aluno, novo = obter_aluno(db, pessoa["nome"], cadastrados)
        criados += novo
        reaproveitados += not novo
        mapa[pessoa["linha"]] = aluno
        if aluno.cod_tur != turma.cod_tur:
            sincronizar_matricula(db, aluno, turma.cod_tur)
        definir_condicao(
            db,
            pessoa,
            aluno,
            turma.cod_tur,
            desconto_conjuge=servico.dinheiro(desconto_conjuge),
        )
    db.flush()
    relatar(f"\nAlunos: {criados} criado(s), {reaproveitados} já cadastrado(s).")

    geracao = servico.gerar_cobrancas_do_plano(db, plano, criado_por=ORIGEM)
    relatar(
        f"Cobranças: {geracao['criadas']} criada(s) para {geracao['alunos']} aluno(s), "
        f"{geracao['transferencias']} com condição de transferência."
    )

    baixado = servico.ZERO
    for pessoa in pessoas:
        if pessoa["conjuge"] or pessoa["pago"] <= servico.ZERO:
            continue
        alunos_do_pagamento = [mapa[pessoa["linha"]]]
        if pessoa["titular_casal"]:
            alunos_do_pagamento.append(mapa[pessoa["linha"] + 1])
        baixado += quitar(
            db,
            pessoa,
            alunos_do_pagamento,
            data_pagamento=primeira_mensalidade,
            relatar=relatar,
        )
    relatar(f"Baixas: R$ {baixado} lançado(s).")
    db.flush()

    bate = conferir(db, pessoas, mapa, totais, relatar=relatar)
    return {
        "alunos_criados": criados,
        "alunos_reaproveitados": reaproveitados,
        "cobrancas_criadas": geracao["criadas"],
        "transferencias": geracao["transferencias"],
        "baixado": baixado,
        "confere": bate,
        "mapa": mapa,
    }


def main() -> None:
    analisador = argparse.ArgumentParser(description=__doc__)
    analisador.add_argument("--arquivo", required=True, help="Caminho do .xlsx")
    analisador.add_argument("--turma", type=int, help="Código da turma de destino")
    analisador.add_argument(
        "--parcelas",
        type=int,
        help="Quantas mensalidades o curso terá ao todo (a planilha só mostra a primeira)",
    )
    analisador.add_argument("--matricula", type=Decimal, default=Decimal("100"))
    analisador.add_argument("--mensalidade", type=Decimal, default=Decimal("200"))
    analisador.add_argument("--desconto-conjuge", type=Decimal, default=Decimal("50"))
    analisador.add_argument("--primeira-mensalidade", default="2026-08-10")
    analisador.add_argument("--dia-vencimento", type=int, default=10)
    analisador.add_argument(
        "--aplicar",
        action="store_true",
        help="Grava de verdade; sem esta opção o script só mostra o que faria",
    )
    args = analisador.parse_args()

    Base.metadata.create_all(engine)
    atualizar_schema(engine)
    db = SessionLocal()
    try:
        if not args.turma or not args.parcelas:
            print("Informe --turma e --parcelas. Turmas cadastradas:")
            for turma in db.scalars(select(Turma).order_by(Turma.nome)):
                print(f"  {turma.cod_tur:>3}  {turma.nome}")
            print("\n--parcelas é o total de mensalidades do curso; a planilha")
            print("mostra só a primeira, então o sistema não tem como deduzir.")
            return

        turma = db.get(Turma, args.turma)
        if turma is None:
            sys.exit(f"Turma {args.turma} não encontrada.")

        pessoas, totais = ler_planilha(args.arquivo)
        vencimento = date.fromisoformat(args.primeira_mensalidade)
        regulares = sum(1 for p in pessoas if p["bloco"] == "REGULAR")
        transferidos = sum(1 for p in pessoas if p["bloco"] == "TRANSFERENCIA")
        conjuges = sum(1 for p in pessoas if p["conjuge"])

        print(f"Planilha: {args.arquivo}")
        print(f"  {len(pessoas)} pessoa(s): {regulares} regular(es), {transferidos} transferido(s)")
        print(f"  {conjuges} cônjuge(s) com {args.desconto_conjuge}% de desconto")
        print(f"  totais declarados: pago {totais['pago']}, a pagar {totais['a_pagar']}")
        print(f"Turma de destino: {turma.cod_tur} — {turma.nome}")
        print(
            f"Plano: matrícula R$ {args.matricula}, mensalidade R$ {args.mensalidade}, "
            f"{args.parcelas} parcela(s), 1ª em {vencimento:%d/%m/%Y}, dia {args.dia_vencimento}"
        )
        if not args.aplicar:
            print("\nSimulação (use --aplicar para gravar). Seria feito:")
            for pessoa in pessoas:
                marcas = []
                if pessoa["conjuge"]:
                    marcas.append(f"cônjuge {args.desconto_conjuge}%")
                elif pessoa["titular_casal"]:
                    marcas.append("titular do casal")
                if pessoa["bloco"] == "TRANSFERENCIA":
                    marcas.append("transferência, sem matrícula")
                if pessoa["pago"] > servico.ZERO:
                    marcas.append(f"baixa de R$ {pessoa['pago']}")
                sufixo = f"  [{', '.join(marcas)}]" if marcas else ""
                print(f"  {pessoa['linha']:>3}  {pessoa['nome']}{sufixo}")
            return

        resultado = importar(
            db,
            pessoas,
            totais,
            turma=turma,
            parcelas=args.parcelas,
            matricula=args.matricula,
            mensalidade=args.mensalidade,
            desconto_conjuge=args.desconto_conjuge,
            primeira_mensalidade=vencimento,
            dia_vencimento=args.dia_vencimento,
        )
        if not resultado["confere"]:
            db.rollback()
            sys.exit(
                "\nNada foi gravado: o resultado não bate com a planilha. "
                "Confira os valores de --matricula, --mensalidade e --desconto-conjuge."
            )
        db.commit()
        print("\nImportação concluída.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
