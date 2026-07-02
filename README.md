# STG Web — Sistema Acadêmico do Seminário Teológico de Guarulhos

Versão web do sistema acadêmico do STG, substituindo o programa desktop em VB6
(`stg.exe`, ~2003) e migrando os dados do Access (`stg.mdb`) para MySQL/MariaDB.

## O que tem

- **Secretaria acadêmica**: alunos, professores, matérias, cursos, turmas,
  grades curriculares, matrícula em turma, vínculo professor×matéria×turma
- **Notas e faltas**: lançamento em grade por turma + matéria (grava em `alunota`)
- **Relatórios em PDF**: boletim (mesmo modelo do gerador do projetoGi),
  histórico escolar, diário de classe, lista de alunos da turma, ficha do aluno,
  boletins da turma inteira em ZIP
- **Login** com senhas bcrypt (as senhas em texto puro do sistema antigo foram
  convertidas na migração — os usuários entram com a mesma senha de antes)

Stack: **FastAPI + SQLAlchemy + MySQL** no backend, **React + MUI (Vite)** no
frontend, PDFs com **fpdf2**.

## Rodar em desenvolvimento (Windows)

Tudo já está preparado nesta pasta (Node e MariaDB portáteis em `tools/`):

```powershell
powershell -File start-dev.ps1
```

Abre em http://localhost:5173 — API em http://localhost:8000 (docs em `/docs`).

Manualmente, são 3 processos:

| Serviço  | Comando |
|---|---|
| MariaDB  | `tools\mariadb-11.4.5-winx64\bin\mysqld.exe --datadir=tools\data --port=3306 --console` |
| Backend  | (na pasta `backend`) `..\.venv\Scripts\uvicorn.exe app.main:app --port 8000 --reload` |
| Frontend | (na pasta `frontend`) `..\tools\node-v22.14.0-win-x64\npm.cmd run dev` |

Config do backend: `backend/.env` (veja `backend/.env.example`).

## Migração dos dados do stg.mdb

O sistema antigo continua em uso; **na virada definitiva, rode a migração de
novo** com o `stg.mdb` atualizado:

```powershell
# 1. Exporta o mdb para CSV (precisa rodar num Windows com o driver Jet — este PC serve)
powershell -File migration\export-mdb.ps1

# 2. Importa os CSVs no MySQL (derruba e recria as tabelas!)
..\.venv\Scripts\python.exe migration\import_mysql.py --password SENHA_DO_MYSQL
```

O import é **repetível** (DROP + CREATE + carga) e confere as contagens no
final. Para importar direto na VPS: copie a pasta `migration/csv` para lá e
rode `import_mysql.py --host 127.0.0.1 --password ... --database stg`.

Notas da migração:
- Tabelas e colunas mantêm os nomes do Access (`alunos`, `alunota`, `materias`…)
- Tabelas de ligação sem chave ganharam `id AUTO_INCREMENT`
- `usuarios.senha` (texto puro) virou `senha_hash` (bcrypt) — mesma senha de antes
- Tabelas de trabalho do VB6 (`boletim`, `relimp`, `historico`, `ultimos`) não
  são migradas; a numeração da `ultimos` foi substituída por AUTO_INCREMENT
- Biblioteca (`livro`, `editora`, etc.) é migrada, mas ainda não tem telas

## Deploy na VPS

A VPS já tem MySQL e roda serviços FastAPI, então o caminho natural é:

1. **Banco**: crie o schema e importe (`import_mysql.py --host ... --database stg`).
2. **Backend**: copie `backend/` para a VPS, crie um venv, `pip install -r
   requirements.txt`, configure o `.env` (senha do banco, `STG_SECRET_KEY`
   aleatória, `STG_CORS_ORIGINS` com o domínio real) e crie um serviço
   systemd rodando `uvicorn app.main:app --host 127.0.0.1 --port 8000`.
3. **Frontend**: `npm run build` (gere com `VITE_API_URL=https://seu-dominio/api`
   no ambiente) e sirva a pasta `dist/` pelo nginx.
4. **nginx**: sirva `dist/` na raiz e faça proxy de `/api/` para
   `http://127.0.0.1:8000/` (com `rewrite ^/api/(.*) /$1 break;`).

Alternativa com Docker: `docker compose up -d` (veja `docker-compose.yml`).

## ⚠️ Segurança — ação necessária na VPS

O repositório público `projetoGi` tem **a senha de root do MySQL da VPS
commitada** em `backendPythonPdf/main.py`, e o MySQL aceita conexão da
internet. Antes de colocar este sistema em produção:

1. Troque a senha do root do MySQL da VPS;
2. Faça o MySQL escutar só em `127.0.0.1` (`bind-address` no my.cnf);
3. Remova/reescreva o histórico do repo ou torne-o privado;
4. No novo sistema, credenciais ficam **só** no `.env` (que está no .gitignore).

## Estrutura

```
migration/   export-mdb.ps1 (mdb→csv) e import_mysql.py (csv→mysql)
backend/     FastAPI: app/models (tabelas), app/routers (API), app/pdf (relatórios)
frontend/    React + MUI: src/pages (telas), src/api.js (cliente HTTP)
tools/       Node e MariaDB portáteis + dados do banco local (fora do git)
```

Usuários atuais (migrados do sistema antigo): ADARLEI, ANDERSON, GISELE —
mesmas senhas; troca de senha disponível via `POST /auth/trocar-senha`.
