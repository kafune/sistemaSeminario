"""Ajustes aditivos de schema para instalações já existentes.

O projeto não usa Alembic. O ``create_all`` cria bancos novos, enquanto esta
rotina acrescenta as colunas introduzidas depois do primeiro deploy.
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _tem_unicidade(inspector, tabela: str, colunas: list[str]) -> bool:
    return any(
        indice.get("unique") and indice.get("column_names") == colunas
        for indice in inspector.get_indexes(tabela)
    ) or any(
        restricao.get("column_names") == colunas
        for restricao in inspector.get_unique_constraints(tabela)
    )


def _remover_duplicatas_exatas(
    conexao,
    tabela: str,
    colunas: tuple[str, ...],
) -> None:
    agrupamento = ", ".join(f"`{coluna}`" for coluna in colunas)
    duplicatas = conexao.execute(
        text(
            f"SELECT {agrupamento}, MIN(id) AS id_preservado "
            f"FROM `{tabela}` GROUP BY {agrupamento} HAVING COUNT(*) > 1"
        )
    ).mappings()
    for duplicata in duplicatas:
        filtros = " AND ".join(
            f"`{coluna}` = :{coluna}" for coluna in colunas
        )
        parametros = {coluna: duplicata[coluna] for coluna in colunas}
        parametros["id_preservado"] = duplicata["id_preservado"]
        conexao.execute(
            text(
                f"DELETE FROM `{tabela}` "
                f"WHERE {filtros} AND id <> :id_preservado"
            ),
            parametros,
        )


def _reparar_integridade_academica(engine: Engine) -> None:
    """Reconcilia inconsistências legadas sem remover histórico acadêmico."""
    tabelas = set(inspect(engine).get_table_names())
    if not {"alunos", "aluturma", "turma"}.issubset(tabelas):
        return

    with engine.begin() as conexao:
        # Vínculos sem uma das pontas não podem ser exibidos nem recuperados.
        conexao.execute(
            text(
                "DELETE FROM aluturma "
                "WHERE NOT EXISTS ("
                "SELECT 1 FROM alunos WHERE alunos.cod_alu = aluturma.cod_alu"
                ") OR NOT EXISTS ("
                "SELECT 1 FROM turma WHERE turma.cod_tur = aluturma.cod_tur"
                ")"
            )
        )
        _remover_duplicatas_exatas(
            conexao,
            "aluturma",
            ("cod_tur", "cod_alu"),
        )

        # Um código de turma inválido não deve continuar parecendo uma matrícula.
        conexao.execute(
            text(
                "UPDATE alunos SET cod_tur = NULL "
                "WHERE cod_tur IS NOT NULL AND NOT EXISTS ("
                "SELECT 1 FROM turma WHERE turma.cod_tur = alunos.cod_tur"
                ")"
            )
        )

        # Preserva vínculos legados válidos quando o campo resumido ficou vazio.
        unicos = conexao.execute(
            text(
                "SELECT at.cod_alu, MIN(at.cod_tur) AS cod_tur "
                "FROM aluturma at JOIN alunos a ON a.cod_alu = at.cod_alu "
                "WHERE a.cod_tur IS NULL "
                "GROUP BY at.cod_alu HAVING COUNT(DISTINCT at.cod_tur) = 1"
            )
        ).mappings()
        for vinculo in unicos:
            conexao.execute(
                text(
                    "UPDATE alunos SET cod_tur = :cod_tur "
                    "WHERE cod_alu = :cod_alu AND cod_tur IS NULL"
                ),
                dict(vinculo),
            )

        # Completa o caso que originou o bug: cod_tur salvo sem linha em aluturma.
        faltantes = conexao.execute(
            text(
                "SELECT a.cod_alu, a.cod_tur "
                "FROM alunos a JOIN turma t ON t.cod_tur = a.cod_tur "
                "LEFT JOIN aluturma at "
                "ON at.cod_alu = a.cod_alu AND at.cod_tur = a.cod_tur "
                "WHERE a.cod_tur IS NOT NULL AND at.id IS NULL "
                "ORDER BY a.cod_tur, a.cod_alu"
            )
        ).mappings()
        proximos_itens: dict[int, int] = {}
        for faltante in faltantes:
            cod_tur = faltante["cod_tur"]
            if cod_tur not in proximos_itens:
                proximos_itens[cod_tur] = (
                    conexao.execute(
                        text(
                            "SELECT COALESCE(MAX(item), 0) "
                            "FROM aluturma WHERE cod_tur = :cod_tur"
                        ),
                        {"cod_tur": cod_tur},
                    ).scalar_one()
                    + 1
                )
            conexao.execute(
                text(
                    "INSERT INTO aluturma (cod_tur, item, cod_alu, status) "
                    "VALUES (:cod_tur, :item, :cod_alu, 'A')"
                ),
                {
                    "cod_tur": cod_tur,
                    "item": proximos_itens[cod_tur],
                    "cod_alu": faltante["cod_alu"],
                },
            )
            proximos_itens[cod_tur] += 1

        conexao.execute(
            text(
                "UPDATE turma SET qtalu = ("
                "SELECT COUNT(*) FROM aluturma "
                "WHERE aluturma.cod_tur = turma.cod_tur"
                ")"
            )
        )

        if "professor" in tabelas:
            if "docturma" in tabelas:
                conexao.execute(
                    text(
                        "UPDATE docturma SET cod_pro = NULL "
                        "WHERE cod_pro IS NOT NULL AND NOT EXISTS ("
                        "SELECT 1 FROM professor "
                        "WHERE professor.cod_pro = docturma.cod_pro"
                        ")"
                    )
                )
            if "alunota" in tabelas:
                conexao.execute(
                    text(
                        "UPDATE alunota SET cod_pro = NULL "
                        "WHERE cod_pro IS NOT NULL AND NOT EXISTS ("
                        "SELECT 1 FROM professor "
                        "WHERE professor.cod_pro = alunota.cod_pro"
                        ")"
                    )
                )

        if "matprof" in tabelas:
            conexao.execute(
                text(
                    "DELETE FROM matprof WHERE "
                    "NOT EXISTS ("
                    "SELECT 1 FROM professor "
                    "WHERE professor.cod_pro = matprof.cod_pro"
                    ") OR NOT EXISTS ("
                    "SELECT 1 FROM materias "
                    "WHERE materias.cod_mat = matprof.cod_mat"
                    ")"
                )
            )
            _remover_duplicatas_exatas(
                conexao,
                "matprof",
                ("cod_mat", "cod_pro"),
            )


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
            ("total_respostas", "INT NOT NULL DEFAULT 0"),
            ("total_optouts", "INT NOT NULL DEFAULT 0"),
            ("categoria_api", "VARCHAR(20) NOT NULL DEFAULT 'UTILIDADE'"),
            ("finalidade", "VARCHAR(20) NOT NULL DEFAULT 'OPERACIONAL'"),
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
        if "categoria_api" not in colunas_template:
            comandos.append(
                "ALTER TABLE whatsapp_templates ADD COLUMN categoria_api "
                "VARCHAR(20) NOT NULL DEFAULT 'UTILIDADE'"
            )
        if "finalidade" not in colunas_template:
            comandos.append(
                "ALTER TABLE whatsapp_templates ADD COLUMN finalidade "
                "VARCHAR(20) NOT NULL DEFAULT 'OPERACIONAL'"
            )

    if "whatsapp_destinatarios" in tabelas:
        colunas_destinatario = {
            coluna["name"]
            for coluna in inspector.get_columns("whatsapp_destinatarios")
        }
        if "lead_id" not in colunas_destinatario:
            comandos.append(
                "ALTER TABLE whatsapp_destinatarios ADD COLUMN lead_id INT NULL"
            )
        cod_alu = next(
            (
                coluna
                for coluna in inspector.get_columns("whatsapp_destinatarios")
                if coluna["name"] == "cod_alu"
            ),
            None,
        )
        if cod_alu and not cod_alu.get("nullable", True):
            comandos.append(
                "ALTER TABLE whatsapp_destinatarios MODIFY COLUMN cod_alu INT NULL"
            )

    if "usuarios" in tabelas:
        colunas_usuario = {
            coluna["name"] for coluna in inspector.get_columns("usuarios")
        }
        if "perfil" not in colunas_usuario:
            # ADMIN preserva o acesso integral dos usuários já existentes.
            comandos.append(
                "ALTER TABLE usuarios ADD COLUMN perfil VARCHAR(20) "
                "NOT NULL DEFAULT 'ADMIN'"
            )
        if "cod_pro" not in colunas_usuario:
            comandos.append(
                "ALTER TABLE usuarios ADD COLUMN cod_pro INT NULL"
            )

    if "alunota" in tabelas:
        colunas_alunota = {
            coluna["name"] for coluna in inspector.get_columns("alunota")
        }
        if "docturma_id" not in colunas_alunota:
            comandos.append(
                "ALTER TABLE alunota ADD COLUMN docturma_id INT NULL"
            )

    if "chamadas" in tabelas:
        colunas_chamada = {
            coluna["name"] for coluna in inspector.get_columns("chamadas")
        }
        if "aula_id" not in colunas_chamada:
            comandos.append(
                "ALTER TABLE chamadas ADD COLUMN aula_id INT NULL"
            )

    # Índices usados pelos filtros, ordenações e relacionamentos mais frequentes.
    # ``create_all`` os cria em bancos novos; esta lista mantém bancos existentes
    # alinhados sem depender de uma recriação destrutiva das tabelas.
    indices_desempenho = {
        "alunos": [
            ("ix_alunos_status_nome", ("status", "nome")),
            ("ix_alunos_cod_tur_nome", ("cod_tur", "nome")),
            ("ix_alunos_dat_cad_cod_alu", ("dat_cad", "cod_alu")),
        ],
        "professor": [
            ("ix_professor_nome", ("nome",)),
            ("ix_professor_status_nome", ("status", "nome")),
        ],
        "materias": [("ix_materias_nome", ("NOME",))],
        "turma": [("ix_turma_nome", ("nome",))],
        "aluturma": [
            ("ix_aluturma_cod_tur_cod_alu", ("cod_tur", "cod_alu")),
            ("ix_aluturma_cod_alu", ("cod_alu",)),
        ],
        "docturma": [
            ("ix_docturma_cod_tur_cod_mat", ("cod_tur", "cod_mat")),
            ("ix_docturma_cod_pro", ("cod_pro",)),
        ],
        "alunota": [
            (
                "ix_alunota_turma_materia_aluno",
                ("cod_tur", "cod_mat", "cod_alu"),
            ),
            ("ix_alunota_cod_alu", ("cod_alu",)),
            ("ix_alunota_docturma_aluno", ("docturma_id", "cod_alu")),
        ],
        "aulas": [("ix_aulas_data_status", ("data", "status"))],
        "chamadas": [
            ("ix_chamadas_turma_data", ("cod_tur", "data")),
            ("ix_chamadas_aula_id", ("aula_id",)),
        ],
        "usuarios": [("ix_usuarios_cod_pro", ("cod_pro",))],
        "notificacoes": [
            ("ix_notificacoes_usuario_lido_em", ("usuario", "lido_em")),
            (
                "ix_notificacoes_usuario_criado_em_id",
                ("usuario", "criado_em", "id"),
            ),
        ],
        "whatsapp_disparos": [
            (
                "ix_whatsapp_disparos_status_pasta",
                ("status", "pasta_uazapi_id"),
            ),
        ],
        "whatsapp_destinatarios": [
            (
                "ix_whatsapp_destinatarios_disparo_valido",
                ("disparo_id", "valido"),
            ),
        ],
        "leads": [
            (
                "ix_leads_status_consentimento_nome",
                ("status", "consentimento_status", "nome"),
            ),
        ],
    }
    for tabela, definicoes in indices_desempenho.items():
        if tabela not in tabelas:
            continue
        existentes = {
            indice["name"] for indice in inspector.get_indexes(tabela)
        }
        for nome, colunas_indice in definicoes:
            if nome not in existentes:
                colunas_sql = ", ".join(f"`{coluna}`" for coluna in colunas_indice)
                comandos.append(
                    f"CREATE INDEX `{nome}` ON `{tabela}` ({colunas_sql})"
                )

    if comandos:
        with engine.begin() as conexao:
            for comando in comandos:
                conexao.execute(text(comando))

    # Associa registros legados somente quando existe uma correspondência
    # acadêmica inequívoca. Casos ambíguos permanecem nulos para revisão.
    tabelas_atualizadas = set(inspect(engine).get_table_names())
    with engine.begin() as conexao:
        if {"alunota", "docturma"}.issubset(tabelas_atualizadas):
            conexao.execute(
                text(
                    "UPDATE alunota SET docturma_id = ("
                    "SELECT MIN(dt.id) FROM docturma dt "
                    "WHERE dt.cod_tur = alunota.cod_tur "
                    "AND dt.cod_mat = alunota.cod_mat"
                    ") WHERE docturma_id IS NULL AND 1 = ("
                    "SELECT COUNT(*) FROM docturma dt "
                    "WHERE dt.cod_tur = alunota.cod_tur "
                    "AND dt.cod_mat = alunota.cod_mat"
                    ")"
                )
            )
        if {"chamadas", "aulas", "docturma"}.issubset(tabelas_atualizadas):
            conexao.execute(
                text(
                    "UPDATE chamadas SET aula_id = ("
                    "SELECT MIN(a.id) FROM aulas a "
                    "JOIN docturma dt ON dt.id = a.docturma_id "
                    "WHERE dt.cod_tur = chamadas.cod_tur "
                    "AND a.data = chamadas.data"
                    ") WHERE aula_id IS NULL AND 1 = ("
                    "SELECT COUNT(*) FROM aulas a "
                    "JOIN docturma dt ON dt.id = a.docturma_id "
                    "WHERE dt.cod_tur = chamadas.cod_tur "
                    "AND a.data = chamadas.data"
                    ")"
                )
            )

    # A regra antiga impedia duas matérias da mesma turma no mesmo dia.
    # SQLite não permite remover a restrição sem recriar a tabela; bancos de
    # teste já nascem com o modelo novo, e instalações reais usam MySQL/MariaDB.
    if engine.dialect.name in {"mysql", "mariadb"} and "chamadas" in tabelas_atualizadas:
        inspector_chamadas = inspect(engine)
        nomes_unicos = {
            item.get("name")
            for item in inspector_chamadas.get_unique_constraints("chamadas")
        } | {
            item.get("name")
            for item in inspector_chamadas.get_indexes("chamadas")
            if item.get("unique")
        }
        if "uq_chamadas_turma_data" in nomes_unicos:
            with engine.begin() as conexao:
                conexao.execute(
                    text("ALTER TABLE chamadas DROP INDEX uq_chamadas_turma_data")
                )

    _reparar_integridade_academica(engine)

    # As restrições abaixo também são declaradas nos modelos para bancos novos.
    # Bancos existentes recebem os índices após a reconciliação dos dados.
    inspector = inspect(engine)
    unicidades = {
        "aluturma": (
            "uq_aluturma_cod_tur_cod_alu",
            ["cod_tur", "cod_alu"],
        ),
        "matprof": (
            "uq_matprof_cod_mat_cod_pro",
            ["cod_mat", "cod_pro"],
        ),
        "usuarios": ("uq_usuarios_cod_pro", ["cod_pro"]),
        "alunota": (
            "uq_alunota_docturma_aluno",
            ["docturma_id", "cod_alu"],
        ),
        "chamadas": ("uq_chamadas_aula_id", ["aula_id"]),
    }
    with engine.begin() as conexao:
        for tabela, (nome, colunas_unicas) in unicidades.items():
            if tabela not in tabelas or _tem_unicidade(
                inspector,
                tabela,
                colunas_unicas,
            ):
                continue
            filtros_nao_nulos = " AND ".join(
                f"`{coluna}` IS NOT NULL" for coluna in colunas_unicas
            )
            agrupamento = ", ".join(f"`{coluna}`" for coluna in colunas_unicas)
            tem_duplicata = conexao.execute(
                text(
                    f"SELECT 1 FROM `{tabela}` WHERE {filtros_nao_nulos} "
                    f"GROUP BY {agrupamento} HAVING COUNT(*) > 1 LIMIT 1"
                )
            ).first()
            if tem_duplicata:
                # Preserva histórico potencialmente divergente. Novas escritas
                # da aplicação ainda fazem upsert pela mesma chave lógica.
                continue
            colunas_sql = ", ".join(
                f"`{coluna}`" for coluna in colunas_unicas
            )
            conexao.execute(
                text(
                    f"CREATE UNIQUE INDEX `{nome}` "
                    f"ON `{tabela}` ({colunas_sql})"
                )
            )
