"""Importa os CSVs exportados do stg.mdb para o MySQL/MariaDB.

Repetivel: derruba e recria as tabelas a cada execucao (rode de novo na
virada definitiva com um export fresco do .mdb).

Uso:
    python import_mysql.py [--csv-dir csv] [--host 127.0.0.1] [--port 3306]
                           [--user root] [--password ...] [--database stg]

Senhas da tabela `usuarios` sao importadas com hash bcrypt.
Tabelas de trabalho do VB6 (boletim, relimp, historico, ultimos) nao sao migradas.
"""

import argparse
import csv
import os
import sys
from datetime import datetime

import bcrypt
import pymysql

# ---------------------------------------------------------------------------
# Schema de destino. Mesmos nomes de tabelas/colunas do stg.mdb; tabelas de
# ligacao ganham `id` AUTO_INCREMENT porque nao tinham chave primaria.
# ---------------------------------------------------------------------------

DDL = {
    "cidade": """
        CREATE TABLE cidade (
            cod_cid INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100),
            uf CHAR(2),
            ddd VARCHAR(5),
            INDEX idx_cidade_nome (nome)
        )""",
    "areas": """
        CREATE TABLE areas (
            cod_are INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100)
        )""",
    "escolaridade": """
        CREATE TABLE escolaridade (
            cod_esc INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100)
        )""",
    "estciv": """
        CREATE TABLE estciv (
            cod_est INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100)
        )""",
    "horarios": """
        CREATE TABLE horarios (
            cod_hor INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100)
        )""",
    "curso": """
        CREATE TABLE curso (
            cod_cur INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100)
        )""",
    "titulos": """
        CREATE TABLE titulos (
            cod_tit INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100)
        )""",
    "congregacoes": """
        CREATE TABLE congregacoes (
            codigo INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100),
            endereco VARCHAR(100),
            bairro VARCHAR(60),
            cod_cid INT,
            cep VARCHAR(10),
            telefone VARCHAR(20),
            dirigente VARCHAR(100)
        )""",
    "registros": """
        CREATE TABLE registros (
            codigo INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100),
            endereco VARCHAR(100),
            bairro VARCHAR(60),
            cod_cid INT,
            cep VARCHAR(10),
            telefone VARCHAR(20),
            registro VARCHAR(50),
            responsavel VARCHAR(100)
        )""",
    "materias": """
        CREATE TABLE materias (
            cod_mat INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            NOME VARCHAR(100),
            area INT,
            APELIDO VARCHAR(20),
            observa VARCHAR(255),
            INDEX idx_materias_nome (NOME)
        )""",
    "grade": """
        CREATE TABLE grade (
            cod_gra INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100),
            dat_ini DATE,
            dat_fim DATE,
            observ VARCHAR(255),
            qitens INT
        )""",
    "itemgrade": """
        CREATE TABLE itemgrade (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            cod_gra INT NOT NULL,
            ite_gra INT,
            cod_mat INT,
            creditos INT,
            cargahor INT,
            INDEX idx_itemgrade_gra (cod_gra),
            INDEX idx_itemgrade_mat (cod_mat)
        )""",
    "turma": """
        CREATE TABLE turma (
            cod_tur INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100),
            cod_cur INT,
            dat_ini DATE,
            cod_gra INT,
            cod_hor INT,
            qtalu INT
        )""",
    "professor": """
        CREATE TABLE professor (
            cod_pro INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100),
            endereco VARCHAR(100),
            bairro VARCHAR(60),
            cod_cid INT,
            cep VARCHAR(10),
            fone1 VARCHAR(20),
            fone2 VARCHAR(20),
            celular VARCHAR(20),
            e_mail VARCHAR(100),
            sexo CHAR(1),
            dat_nas DATE,
            rg VARCHAR(20),
            cpf VARCHAR(20),
            bco VARCHAR(30),
            agencia VARCHAR(20),
            conta VARCHAR(20),
            cod_nat INT,
            dat_cad DATE,
            est_civ VARCHAR(30),
            complemento VARCHAR(60),
            status VARCHAR(10),
            nacionalidade VARCHAR(30),
            aniversario VARCHAR(10),
            qtmat INT,
            qttit INT,
            sigla VARCHAR(10),
            INDEX idx_professor_nome (nome)
        )""",
    "alunos": """
        CREATE TABLE alunos (
            cod_alu INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100),
            endereco VARCHAR(100),
            bairro VARCHAR(60),
            cod_cid INT,
            cod_nat INT,
            cep VARCHAR(10),
            fone1 VARCHAR(20),
            fone2 VARCHAR(20),
            celular VARCHAR(20),
            e_mail VARCHAR(100),
            sexo CHAR(1),
            cod_esc INT,
            dat_cad DATE,
            est_civ INT,
            dat_nas DATE,
            rg VARCHAR(20),
            profissao VARCHAR(60),
            cur_seculares VARCHAR(255),
            igreja VARCHAR(100),
            local_igreja VARCHAR(100),
            cod_ass_mad INT,
            rol_ass_mad INT,
            atividades VARCHAR(255),
            cur_teologicos VARCHAR(255),
            local_cur_teo VARCHAR(100),
            nome_pastor VARCHAR(100),
            status VARCHAR(10),
            membro_desde DATE,
            endereco_igr VARCHAR(100),
            bairro_igr VARCHAR(60),
            cidade_igr INT,
            fone_igr VARCHAR(20),
            cep_igr VARCHAR(10),
            site_igr VARCHAR(100),
            e_mail_igr VARCHAR(100),
            aniversario VARCHAR(10),
            complemento VARCHAR(60),
            nacionalidade VARCHAR(30),
            cpf VARCHAR(20),
            cd_cur INT,
            cod_tur INT,
            cod_gra INT,
            INDEX idx_alunos_nome (nome),
            INDEX idx_alunos_tur (cod_tur)
        )""",
    "aluturma": """
        CREATE TABLE aluturma (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            cod_tur INT NOT NULL,
            item INT,
            cod_alu INT NOT NULL,
            status VARCHAR(10),
            INDEX idx_aluturma_tur (cod_tur),
            INDEX idx_aluturma_alu (cod_alu)
        )""",
    "docturma": """
        CREATE TABLE docturma (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            cod_tur INT NOT NULL,
            cod_mat INT NOT NULL,
            cod_pro INT,
            dat_ini DATE,
            dat_fim DATE,
            Ano VARCHAR(10),
            semestre VARCHAR(5),
            INDEX idx_docturma_tur (cod_tur),
            INDEX idx_docturma_mat (cod_mat),
            INDEX idx_docturma_pro (cod_pro)
        )""",
    "matprof": """
        CREATE TABLE matprof (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            cod_mat INT NOT NULL,
            cod_pro INT NOT NULL,
            seq_mp INT,
            INDEX idx_matprof_pro (cod_pro)
        )""",
    "titprof": """
        CREATE TABLE titprof (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            cod_tit INT,
            cod_pro INT NOT NULL,
            seq_tp INT,
            nome VARCHAR(100),
            area VARCHAR(100),
            local VARCHAR(100),
            INDEX idx_titprof_pro (cod_pro)
        )""",
    "escprof": """
        CREATE TABLE escprof (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            cod_esc INT,
            cod_pro INT NOT NULL,
            seq_ep INT,
            area VARCHAR(100),
            INDEX idx_escprof_pro (cod_pro)
        )""",
    "alunota": """
        CREATE TABLE alunota (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            cod_alu INT NOT NULL,
            cod_mat INT NOT NULL,
            cod_tur INT,
            cod_pro INT,
            nota DECIMAL(5,2),
            falta INT,
            dispensa VARCHAR(5),
            status VARCHAR(10),
            ano VARCHAR(10),
            semestre VARCHAR(5),
            cursou VARCHAR(10),
            creditos INT,
            INDEX idx_alunota_alu (cod_alu),
            INDEX idx_alunota_turmat (cod_tur, cod_mat),
            INDEX idx_alunota_mat (cod_mat)
        )""",
    "notafalta": """
        CREATE TABLE notafalta (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            cod_tur INT NOT NULL,
            cod_alu INT NOT NULL,
            cod_mat INT NOT NULL,
            nota DECIMAL(5,2),
            falta INT,
            data DATE,
            outra_turma VARCHAR(10),
            dispensa VARCHAR(5),
            INDEX idx_notafalta_turmat (cod_tur, cod_mat),
            INDEX idx_notafalta_alu (cod_alu)
        )""",
    "tipolivro": """
        CREATE TABLE tipolivro (
            tip_liv INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100)
        )""",
    "editora": """
        CREATE TABLE editora (
            cod_editora INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100),
            contato VARCHAR(100),
            telefone VARCHAR(20),
            endereco VARCHAR(100),
            bairro VARCHAR(60),
            cod_cid INT,
            cep VARCHAR(10),
            e_mail VARCHAR(100),
            site VARCHAR(100)
        )""",
    "livro": """
        CREATE TABLE livro (
            cod_liv INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            tip_liv INT,
            titulo VARCHAR(150),
            traducao VARCHAR(150),
            titulo_ori VARCHAR(150),
            autor1 VARCHAR(100),
            autor2 VARCHAR(100),
            autor3 VARCHAR(100),
            tradutor1 VARCHAR(100),
            tradutor2 VARCHAR(100),
            tradutor3 VARCHAR(100),
            dat_cad DATE,
            isbn VARCHAR(30),
            cod_editora INT,
            INDEX idx_livro_titulo (titulo)
        )""",
    "emprestimo": """
        CREATE TABLE emprestimo (
            seq_emp INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            cod_liv INT,
            cod_alu INT,
            dat_ini DATE,
            dat_pre DATE,
            dat_dev DATE,
            status VARCHAR(10)
        )""",
    "usabli": """
        CREATE TABLE usabli (
            codigo INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100),
            endereco VARCHAR(100),
            bairro VARCHAR(60),
            cod_cid INT,
            fone1 VARCHAR(20),
            fone2 VARCHAR(20),
            celular VARCHAR(20),
            complemento VARCHAR(60),
            sexo CHAR(1),
            cpf VARCHAR(20),
            rg VARCHAR(20),
            e_mail VARCHAR(100),
            dat_nas DATE,
            curso_stg INT,
            cep VARCHAR(10),
            cod_stg INT
        )""",
    "usuarios": """
        CREATE TABLE usuarios (
            user VARCHAR(50) NOT NULL PRIMARY KEY,
            senha_hash VARCHAR(100) NOT NULL
        )""",
}

# Colunas DATE/DATETIME por tabela (para conversao do CSV)
DATE_COLS = {
    "alunos": {"dat_cad", "dat_nas", "membro_desde"},
    "professor": {"dat_nas", "dat_cad"},
    "grade": {"dat_ini", "dat_fim"},
    "turma": {"dat_ini"},
    "docturma": {"dat_ini", "dat_fim"},
    "notafalta": {"data"},
    "livro": {"dat_cad"},
    "emprestimo": {"dat_ini", "dat_pre", "dat_dev"},
    "usabli": {"dat_nas"},
}

# Tabelas de trabalho do VB6 que nao fazem sentido na versao web
SKIP = {"boletim", "relimp", "historico", "ultimos", "_schema"}


def parse_value(table: str, col: str, raw: str):
    """Converte o valor textual do CSV para o tipo Python adequado."""
    v = raw.strip()
    if v == "":
        return None
    if col in DATE_COLS.get(table, set()):
        return datetime.strptime(v, "%Y-%m-%d %H:%M:%S").date()
    return v


def import_table(cur, table: str, csv_path: str) -> int:
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = [
            [parse_value(table, col, val) for col, val in zip(header, row)]
            for row in reader
        ]

    if table == "usuarios":
        # senha em texto puro no legado -> bcrypt
        idx_user = header.index("user")
        idx_senha = header.index("senha")
        header = ["user", "senha_hash"]
        rows = [
            [
                r[idx_user],
                bcrypt.hashpw(r[idx_senha].encode(), bcrypt.gensalt()).decode(),
            ]
            for r in rows
            if r[idx_user]
        ]

    if not rows:
        return 0
    cols = ", ".join(f"`{c}`" for c in header)
    marks = ", ".join(["%s"] * len(header))
    sql = f"INSERT INTO `{table}` ({cols}) VALUES ({marks})"
    cur.executemany(sql, rows)
    return len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv-dir", default=os.path.join(os.path.dirname(__file__), "csv"))
    ap.add_argument("--host", default=os.environ.get("STG_DB_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("STG_DB_PORT", "3306")))
    ap.add_argument("--user", default=os.environ.get("STG_DB_USER", "root"))
    ap.add_argument("--password", default=os.environ.get("STG_DB_PASSWORD", ""))
    ap.add_argument("--database", default=os.environ.get("STG_DB_NAME", "stg"))
    args = ap.parse_args()

    conn = pymysql.connect(
        host=args.host, port=args.port, user=args.user,
        password=args.password, charset="utf8mb4", autocommit=False,
    )
    cur = conn.cursor()
    # Legado tem registros com codigo 0 (ex.: cidade "sem cidade"); sem este modo,
    # o MySQL trataria 0 como "gerar proximo AUTO_INCREMENT" e criaria duplicatas.
    cur.execute("SET SESSION sql_mode = CONCAT(@@sql_mode, ',NO_AUTO_VALUE_ON_ZERO')")
    cur.execute(
        f"CREATE DATABASE IF NOT EXISTS `{args.database}` "
        "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    )
    cur.execute(f"USE `{args.database}`")

    total = 0
    for table, ddl in DDL.items():
        cur.execute(f"DROP TABLE IF EXISTS `{table}`")
        cur.execute(ddl)
        csv_path = os.path.join(args.csv_dir, f"{table}.csv")
        if not os.path.exists(csv_path):
            print(f"{table}: CSV nao encontrado, tabela criada vazia")
            continue
        n = import_table(cur, table, csv_path)
        conn.commit()
        total += n
        print(f"{table}: {n} registros importados")

    # Verificacao: contagens no banco
    print("\n--- verificacao ---")
    ok = True
    for table in DDL:
        cur.execute(f"SELECT COUNT(*) FROM `{table}`")
        db_count = cur.fetchone()[0]
        csv_path = os.path.join(args.csv_dir, f"{table}.csv")
        if os.path.exists(csv_path):
            with open(csv_path, newline="", encoding="utf-8-sig") as f:
                csv_count = sum(1 for _ in f) - 1
        else:
            csv_count = 0
        status = "OK" if db_count == csv_count else "DIVERGENTE!"
        if db_count != csv_count:
            ok = False
        print(f"{table}: csv={csv_count} db={db_count} {status}")

    conn.close()
    print(f"\nTotal: {total} registros. {'Tudo certo.' if ok else 'HA DIVERGENCIAS!'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
