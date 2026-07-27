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
