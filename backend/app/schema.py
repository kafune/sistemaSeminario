"""Ajustes aditivos de schema para instalações já existentes.

O projeto não usa Alembic. O ``create_all`` cria bancos novos, enquanto esta
rotina acrescenta as colunas introduzidas depois do primeiro deploy.
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def atualizar_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    tabelas = inspector.get_table_names()
    # Tabelas novas são criadas por metadata.create_all; os ajustes abaixo
    # mantêm instalações anteriores compatíveis.
    if "alunos" not in tabelas:
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

    if "professor" in tabelas:
        colunas_professor = {
            coluna["name"] for coluna in inspector.get_columns("professor")
        }
        if "materias_atuacao" not in colunas_professor:
            comandos.append(
                "ALTER TABLE professor ADD COLUMN materias_atuacao TEXT NULL"
            )
        if "origem_cadastro" not in colunas_professor:
            comandos.append(
                "ALTER TABLE professor ADD COLUMN origem_cadastro VARCHAR(30) NULL"
            )
        if "cadastro_recebido_em" not in colunas_professor:
            comandos.append(
                "ALTER TABLE professor ADD COLUMN cadastro_recebido_em DATETIME NULL"
            )

    if "importacoes_google_forms" in tabelas:
        colunas_importacao = {
            coluna["name"]
            for coluna in inspector.get_columns("importacoes_google_forms")
        }
        if "tipo" not in colunas_importacao:
            comandos.append(
                "ALTER TABLE importacoes_google_forms "
                "ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'IMPORTACAO'"
            )

    if "whatsapp_disparos" in tabelas:
        colunas_disparo = {
            coluna["name"]
            for coluna in inspector.get_columns("whatsapp_disparos")
        }
        if "tipo_mensagem" not in colunas_disparo:
            comandos.append(
                "ALTER TABLE whatsapp_disparos "
                "ADD COLUMN tipo_mensagem VARCHAR(20) NOT NULL DEFAULT 'text'"
            )
        if "conteudo_json" not in colunas_disparo:
            comandos.append(
                "ALTER TABLE whatsapp_disparos ADD COLUMN conteudo_json LONGTEXT NULL"
            )
        if "agendado_para" not in colunas_disparo:
            comandos.append(
                "ALTER TABLE whatsapp_disparos ADD COLUMN agendado_para DATETIME NULL"
            )
        if "disparo_origem_id" not in colunas_disparo:
            comandos.append(
                "ALTER TABLE whatsapp_disparos ADD COLUMN disparo_origem_id INT NULL"
            )
        for coluna, sql in [
            ("total_mensagens", "INT NOT NULL DEFAULT 0"),
            ("total_entregues", "INT NOT NULL DEFAULT 0"),
            ("total_lidos", "INT NOT NULL DEFAULT 0"),
            ("total_reproduzidos", "INT NOT NULL DEFAULT 0"),
        ]:
            if coluna not in colunas_disparo:
                comandos.append(
                    f"ALTER TABLE whatsapp_disparos ADD COLUMN {coluna} {sql}"
                )

    if "whatsapp_templates" in tabelas:
        colunas_template = {
            coluna["name"]
            for coluna in inspector.get_columns("whatsapp_templates")
        }
        if "categoria" not in colunas_template:
            comandos.append(
                "ALTER TABLE whatsapp_templates "
                "ADD COLUMN categoria VARCHAR(60) NOT NULL DEFAULT 'Geral'"
            )
        if "favorito" not in colunas_template:
            comandos.append(
                "ALTER TABLE whatsapp_templates "
                "ADD COLUMN favorito VARCHAR(1) NOT NULL DEFAULT 'N'"
            )
        if "versao" not in colunas_template:
            comandos.append(
                "ALTER TABLE whatsapp_templates ADD COLUMN versao INT NOT NULL DEFAULT 1"
            )

    if comandos:
        with engine.begin() as conexao:
            for comando in comandos:
                conexao.execute(text(comando))
