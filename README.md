# Centro TOV de Formação Teológica — Sistema Acadêmico

Versão enxuta do sistema acadêmico (derivada do STG Web) para a escola bíblica
do Centro TOV. Banco de dados novo e vazio — sem migração de dados legados.

## O que tem

- **Página inicial (dashboard)**: totais de alunos/turmas/professores/matérias,
  alunos por turma, aniversariantes do mês e últimos cadastros
- **Secretaria acadêmica**: alunos, professores, matérias, turmas,
  matrícula em turma, vínculo professor×matéria×turma, filtro de
  ativos/inativos e exportação da lista de alunos em CSV (Excel)
- **Notas e faltas**: lançamento em grade por turma + matéria (grava em `alunota`)
- **Relatórios em PDF**: boletim, histórico escolar, diário de classe,
  lista de alunos da turma, ficha do aluno, boletins da turma inteira em ZIP
  e geração em lote a partir de planilha (CSV/XLSX/XLS)
- **Login** com senhas bcrypt e token JWT

O que foi **cortado** em relação ao sistema do seminário: biblioteca,
grade curricular (`grade`/`itemgrade`), tabelas de apoio (cidade, curso,
horário, área etc. agora são campos de texto livre), dados bancários de
professor e campos obsoletos do legado.

Stack: **FastAPI + SQLAlchemy + MySQL** no backend, **React + MUI (Vite)** no
frontend, PDFs com **fpdf2**.

## Primeira execução (banco novo)

1. Crie o schema no MySQL/MariaDB:

   ```sql
   CREATE DATABASE tov CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. Configure `backend/.env` (copie de `backend/.env.example`).

3. Suba o backend — as tabelas são criadas automaticamente na inicialização:

   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn app.main:app --port 8000 --reload
   ```

4. Crie o primeiro usuário de acesso:

   ```bash
   cd backend
   python criar_usuario.py ADMIN
   ```

5. Suba o frontend:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Abre em http://localhost:5173 — API em http://localhost:8000 (docs em `/docs`).

No Windows com as ferramentas portáteis em `tools/`, use
`powershell -File start-dev.ps1`.

## Deploy na VPS

1. **Banco**: crie o schema `tov` (o backend cria as tabelas ao subir).
2. **Backend**: copie `backend/` para a VPS, crie um venv, `pip install -r
   requirements.txt`, configure o `.env` (senha do banco, `TOV_SECRET_KEY`
   aleatória, `TOV_CORS_ORIGINS` com o domínio real) e crie um serviço
   systemd rodando `uvicorn app.main:app --host 127.0.0.1 --port 8000`.
3. **Frontend**: `npm run build` (gere com `VITE_API_URL=https://seu-dominio/api`
   no ambiente) e sirva a pasta `dist/` pelo nginx.
4. **nginx**: sirva `dist/` na raiz e faça proxy de `/api/` para
   `http://127.0.0.1:8000/` (com `rewrite ^/api/(.*) /$1 break;`).

Alternativa com Docker: `docker compose up -d` (veja `docker-compose.yml`).

## Estrutura

```
backend/     FastAPI: app/models (tabelas), app/routers (API), app/pdf (relatórios)
             criar_usuario.py (cria/redefine usuário de acesso)
frontend/    React + MUI: src/pages (telas), src/api.js (cliente HTTP)
```

Credenciais ficam **só** no `backend/.env` (que está no .gitignore).
Troca de senha disponível na API via `POST /auth/trocar-senha`.
