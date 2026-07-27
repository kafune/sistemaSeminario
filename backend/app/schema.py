"""Ajustes aditivos de schema para instalações já existentes.

O projeto não usa Alembic. O ``create_all`` cria bancos novos, enquanto esta
rotina acrescenta as colunas introduzidas depois do primeiro deploy.
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def atualizar_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    if "alunos" not in inspector.get_table_names():
        return

    colunas = {coluna["name"]: coluna for coluna in inspector.get_columns("alunos")}
    comandos: list[str] = []

    if "turma_interesse" not in colunas:
        comandos.append(
            "ALTER TABLE alunos ADD COLUMN turma_interesse VARCHAR(100) NULL"
        )
    if "nome_conjuge" not in colunas:
        comandos.append(
            "ALTER TABLE alunos ADD COLUMN nome_conjuge VARCHAR(100) NULL"
        )
    if "origem_cadastro" not in colunas:
        comandos.append(
            "ALTER TABLE alunos ADD COLUMN origem_cadastro VARCHAR(30) NULL"
        )
    if "inscricao_externa_id" not in colunas:
        comandos.append(
            "ALTER TABLE alunos ADD COLUMN inscricao_externa_id VARCHAR(64) NULL"
        )
    if "inscricao_recebida_em" not in colunas:
        comandos.append(
            "ALTER TABLE alunos ADD COLUMN inscricao_recebida_em DATETIME NULL"
        )

    indices = inspector.get_indexes("alunos")
    restricoes = inspector.get_unique_constraints("alunos")
    inscricao_id_unico = any(
        indice.get("unique")
        and indice.get("column_names") == ["inscricao_externa_id"]
        for indice in indices
    ) or any(
        restricao.get("column_names") == ["inscricao_externa_id"]
        for restricao in restricoes
    )
    if not inscricao_id_unico:
        comandos.append(
            "CREATE UNIQUE INDEX uq_alunos_inscricao_externa_id "
            "ON alunos (inscricao_externa_id)"
        )

    local_igreja = colunas.get("local_igreja")
    tamanho_local = getattr(local_igreja["type"], "length", None) if local_igreja else None
    if local_igreja and tamanho_local and tamanho_local < 255:
        comandos.append(
            "ALTER TABLE alunos MODIFY COLUMN local_igreja VARCHAR(255) NULL"
        )

    if comandos:
        with engine.begin() as conexao:
            for comando in comandos:
                conexao.execute(text(comando))
