# Centro TOV de Formação Teológica — Sistema Acadêmico

Versão enxuta do sistema acadêmico (derivada do STG Web) para a escola bíblica
do Centro TOV. Banco de dados novo e vazio — sem migração de dados legados.

## O que tem

- **Secretaria acadêmica**: alunos, professores, matérias, turmas,
  matrícula em turma, vínculo professor×matéria×turma
- **Notas e faltas**: lançamento em grade pelo vínculo turma × matéria ×
  professor; as faltas são calculadas automaticamente das chamadas encerradas
- **Chamada digital**: modo totem para iPad, confirmação pelo próprio aluno,
  horário de chegada e histórico por aula/matéria, inclusive com mais de uma
  chamada da mesma turma no mesmo dia
- **Portal do professor**: convite individual para criação de senha e acesso
  restrito às grades das turmas e matérias atribuídas ao docente
- **Relatórios em PDF**: boletim, histórico escolar, diário de classe,
  lista de alunos da turma, ficha do aluno, boletins da turma inteira em ZIP
  e geração em lote a partir de planilha (CSV/XLSX/XLS)
- **Financeiro**: plano de cobrança por turma (matrícula inicial +
  mensalidades), condição própria para o aluno de transferência (paga menos
  meses, a partir do mês em que entrou), desconto percentual por aluno com
  motivo registrado (casal, irmãos), importação da planilha de controle da
  secretaria casando os nomes com o cadastro e conferida contra os próprios
  totais dela, geração idempotente das cobranças
  por aluno, baixa individual ou em lote, estorno, cobrança avulsa, lista
  paginada com filtro por mês, extrato do aluno com link pessoal de consulta
  e conciliação de PIX/boleto informados pelo banco — com perfil de acesso
  `FINANCEIRO`, restrito à tesouraria ([docs/financeiro.md](docs/financeiro.md))
- **Login** com senhas bcrypt e token JWT
- **Seletor de sistemas**: alternância do TOV Acadêmico para o sistema legado
  do STG, mantendo aplicações, sessões e bancos de dados isolados
- **PWA instalável**: shell offline, atualização explícita, atalhos e fontes
  locais; as respostas autenticadas da API nunca são armazenadas no cache
- **Central de notificações e Web Push**: histórico de 90 dias, preferências
  por categoria e alertas de campanhas, cadastros externos e aulas
- **WhatsApp via UazAPI**: criação e conexão da instância por QR Code,
  mensagens personalizadas por aluno/turma, texto, imagens, documentos,
  áudios, botões, enquetes, carrosséis, sequências, teste para a secretaria,
  templates categorizados e versionados, agendamento editável, pausa,
  retomada, cancelamento, reenvio de falhas e histórico com métricas de
  envio, entrega, leitura e reprodução

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
   python criar_usuario.py ADMIN ADMIN
   ```

   O primeiro argumento é o nome de login e o segundo o perfil (`ADMIN`,
   `SECRETARIA`, `MARKETING` ou `FINANCEIRO`). Sem o segundo argumento o
   usuário nasce como `SECRETARIA`; só o primeiro administrador precisa do
   `ADMIN` explícito.

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
O endereço do sistema legado usado pelo seletor pode ser alterado no build com
`VITE_STG_URL` (o padrão é `https://stg.kafune.xyz`).

### Sistema legado STG

O seletor abre a aplicação mantida na branch `sistema-STG`. Ela deve ser
publicada separadamente e usar o schema MySQL `stg`; as sessões e credenciais
não são compartilhadas com o TOV Acadêmico.

O arquivo `stg.mdb` é a fonte da migração e não é lido diretamente pelo
frontend. Na branch do STG, use `migration/export-mdb.ps1` para exportá-lo e
`migration/import_mysql.py` para recriar e carregar o schema `stg`. Arquivos
`.mdb` ficam ignorados pelo Git para evitar versionar dados pessoais do legado.

### Redeploy automatizado na VPS

Com o primeiro deploy e os serviços já configurados, execute na raiz do
checkout:

```bash
./redeploy.sh
```

### Scripts de manutenção no servidor

`criar_usuario.py` e `importar_planilha_financeiro.py` vão dentro da imagem do
backend e rodam pela rede do compose, porque o MySQL não publica porta no host:

```bash
docker compose --env-file .env run --rm backend python criar_usuario.py MARIA SECRETARIA
```

O primeiro argumento é o **nome de login**, o segundo o **perfil** (opcional,
padrão `SECRETARIA`). Um administrador é criado com `... criar_usuario.py NOME ADMIN`.

Para o importador da planilha, monte o arquivo no container — veja
[docs/financeiro.md](docs/financeiro.md).

O script atualiza `origin/main`, prepara o virtualenv do backend, instala as
dependências, gera o frontend, reinicia o serviço systemd `tov`, valida
`http://127.0.0.1:8000/health`, publica o build em `/var/www/tov` e recarrega o
nginx. Caminhos e nomes podem ser ajustados sem editar o arquivo:

```bash
TOV_BACKEND_SERVICE=tov-api \
TOV_FRONTEND_DIR=/var/www/sistema-tov \
TOV_VITE_API_URL=/api \
./redeploy.sh
```

Veja todas as opções com `./redeploy.sh --help`. O checkout deve estar sem
alterações locais para evitar que um redeploy sobrescreva trabalho feito na
VPS.

## Estrutura

```
backend/     FastAPI: app/models (tabelas), app/routers (API), app/pdf (relatórios)
             criar_usuario.py NOME [PERFIL] (cria/redefine usuário de acesso)
frontend/    React + MUI: src/pages (telas), src/api.js (cliente HTTP)
```

Credenciais ficam **só** no `backend/.env` (que está no .gitignore). O
`backend/.env.example` lista todas as variáveis, inclusive Web Push, fuso e
chaves separadas para JWT e criptografia.

### Segurança e operação

- **Perfis.** `ADMIN` administra; `SECRETARIA` opera o acadêmico; `MARKETING`
  cuida de leads e WhatsApp; `FINANCEIRO` só vê a tesouraria; `PROFESSOR` só
  vê as próprias turmas. O módulo WhatsApp é de `ADMIN`, `SECRETARIA` e
  `MARKETING`; a base de leads, de `ADMIN` e `MARKETING`. Sem perfil na
  linha do usuário, o sistema assume `SECRETARIA`, nunca `ADMIN`.
- **Senhas** têm ao menos 8 caracteres. Cada usuário troca a própria senha
  clicando no próprio nome, no rodapé do menu. O `nginx` do frontend limita
  tentativas de login por IP (`limit_req`).
- **Sessão.** O perfil é reconciliado com `GET /auth/me` a cada abertura do
  app; mudanças feitas pelo administrador valem sem novo login.
- **Links públicos da agenda** são por turma: o token já carrega a turma e
  não aceita filtro por URL. Links antigos (sem turma) deixaram de valer —
  gere um novo em Calendário › Compartilhar.
- **Conciliação bancária.** O código `TOVnnnnnn-XX` das cobranças novas tem
  um sufixo aleatório; um PIX só fecha o título sozinho quando o código
  completo **e** o valor exato do saldo batem. Qualquer outra combinação vai
  para a fila manual, e uma baixa nunca ultrapassa o saldo do título (o
  excedente fica registrado no motivo da transação).
- **Reparo de integridade** (vínculos órfãos, duplicatas) não roda mais a cada
  boot. Rode deliberadamente:

  ```bash
  cd backend
  python -m app.reparar            # só relata
  python -m app.reparar --aplicar  # executa
  ```

  `TOV_REPARO_INTEGRIDADE_NO_BOOT=1` restaura o comportamento antigo.
- **Exclusão de aula** é recusada quando já existe chamada registrada:
  marque a aula como cancelada, e as faltas continuam no histórico.
- **Trilha de auditoria.** Criação, exclusão, perfil e senha de usuários,
  exclusão de cadastros e de aulas, estorno, cancelamento/isenção e plano
  financeiro ficam em `auditoria` (`GET /usuarios/auditoria`, só ADMIN) e na
  tela de Usuários.
- **Webhook do banco.** Além do header `X-Webhook-Secret`, o PSP pode assinar
  o corpo: `X-Webhook-Signature: sha256=<HMAC-SHA256("<timestamp>.<corpo>")>`
  com `X-Webhook-Timestamp` (epoch, janela de 5 minutos). Ver
  [docs/financeiro.md](docs/financeiro.md).
- **Testes, lint e CI.** Backend: `cd backend && ruff check . && python -m
  unittest discover -s tests -t .` (inclui a matriz de perfis pela camada
  HTTP). A suíte usa SQLite em memória; com
  `TOV_TEST_DATABASE_URL=mysql+pymysql://tov:tov@127.0.0.1:3306/tov_test`
  ela roda contra um MySQL/MariaDB descartável (o CI faz isso num MySQL
  8.4). Frontend: `npm run lint`, `npm test` (vitest) e `npm run build`
  (com `check:design` e o orçamento do bundle). `.github/workflows/ci.yml`
  roda tudo isso a cada push.
Cada usuário troca a própria senha pelo menu do avatar (`POST /auth/trocar-senha`).

### WhatsApp / UazAPI

Configure no ambiente do backend:

```dotenv
TOV_UAZAPI_BASE_URL=https://seu-subdominio.uazapi.com
TOV_UAZAPI_ADMIN_TOKEN=seu-admintoken
TOV_WHATSAPP_DELAY_MIN=5
TOV_WHATSAPP_DELAY_MAX=15
TOV_WHATSAPP_UPLOAD_MAX_MB=20
TOV_PUBLIC_API_URL=https://seu-dominio.com/api
```

O token administrativo é usado apenas pelo backend para criar uma única
instância. O token dessa instância é criptografado no banco com uma chave
derivada de `TOV_ENCRYPTION_KEY` (ou de `TOV_SECRET_KEY`, quando a primeira
está vazia). Defina `TOV_ENCRYPTION_KEY` para poder rotacionar o segredo do
JWT sem reconfigurar a integração; não altere a chave usada sem antes
reconfigurar a instância. A URL da UazAPI precisa ser `https://`.

Os arquivos usados nas mensagens ficam armazenados no banco e são entregues à
UazAPI por uma URL pública com token imprevisível. `TOV_PUBLIC_API_URL` deve
apontar para a URL externa do backend, incluindo `/api` quando esse for o
prefixo configurado no nginx.

Quando a instância está conectada, o app configura automaticamente um webhook
assinado por URL para receber eventos de campanha, atualização de mensagens e
conexão. A consulta rápida periódica continua ativa como contingência caso a
UazAPI atrase ou não entregue algum evento.

### PWA e notificações Web Push

O frontend é instalado como “TOV Acadêmico”. Ele disponibiliza o shell quando
não há rede, mas não mantém cópias de alunos, notas, contatos ou qualquer outra
resposta de `/api`: quando a conexão volta, a sessão e a rota atual continuam
intactas.

Para ativar Web Push, gere um par VAPID e configure no backend (ou no `.env`
do Docker):

```dotenv
TOV_VAPID_PUBLIC_KEY=chave-publica-base64url
TOV_VAPID_PRIVATE_KEY=chave-privada-base64url
TOV_VAPID_SUBJECT=mailto:secretaria@seu-dominio.com
TOV_TIMEZONE=America/Sao_Paulo
```

`TOV_TIMEZONE` decide o "hoje" de vencimentos e chamadas; todo carimbo de
data/hora é gravado em UTC e convertido na tela. O frontend usa o mesmo fuso
via `VITE_TIMEZONE` no build (padrão `America/Sao_Paulo`).

Sem essas chaves, a central interna continua disponível e o aplicativo informa
que o push está indisponível. A permissão é sempre iniciada pelo botão “Ativar
push neste dispositivo”. Em iPhone/iPad, instale antes o app pela opção
“Adicionar à Tela de Início” do Safari.

O backend executa o resumo das aulas agendadas do dia seguinte depois das 18h
em `America/Sao_Paulo` e limpa diariamente o histórico com mais de 90 dias.
As chaves de idempotência impedem reenvios quando a aplicação reinicia.
