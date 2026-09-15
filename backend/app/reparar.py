"""Reparo deliberado da integridade acadêmica.

    python -m app.reparar            # relatório do que seria alterado
    python -m app.reparar --aplicar  # executa

Apaga vínculos aluno×turma e matéria×professor sem uma das pontas, remove
duplicatas exatas, recria matrículas inferidas de ``alunos.cod_tur`` e
reescreve o contador ``turma.qtalu``. Antes isso rodava a cada boot do
servidor, sem log e sem confirmação.
"""

import argparse

from sqlalchemy import text

from .database import engine
from .schema import _contagens, _reparar_integridade_academica_com_relatorio


def _previa() -> dict[str, int]:
    with engine.connect() as conexao:
        orfaos_aluturma = conexao.execute(
            text(
                "SELECT COUNT(*) FROM aluturma WHERE NOT EXISTS ("
                "SELECT 1 FROM alunos WHERE alunos.cod_alu = aluturma.cod_alu) "
                "OR NOT EXISTS (SELECT 1 FROM turma WHERE turma.cod_tur = aluturma.cod_tur)"
            )
        ).scalar()
        duplicatas = conexao.execute(
            text(
                "SELECT COUNT(*) FROM (SELECT cod_tur, cod_alu, COUNT(*) AS n "
                "FROM aluturma GROUP BY cod_tur, cod_alu HAVING n > 1) t"
            )
        ).scalar()
    return {"aluturma_orfaos": int(orfaos_aluturma or 0), "aluturma_duplicatas": int(duplicatas or 0)}


def main() -> None:
    analisador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analisador.add_argument("--aplicar", action="store_true", help="Executa o reparo (sem isso, só relata)")
    args = analisador.parse_args()

    print("Contagens atuais:", _contagens(engine))
    print("Prévia:", _previa())
    if not args.aplicar:
        print("Simulação: nada foi alterado. Repita com --aplicar para executar.")
        return
    delta = _reparar_integridade_academica_com_relatorio(engine)
    print("Variação de linhas por tabela:", delta)
    print("Reparo concluído.")


if __name__ == "__main__":
    main()
