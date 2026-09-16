# Correções das auditorias — estado

Referência cruzada de `AUDITORIA.md` (funcional/segurança) e
`AUDITORIA_VISUAL.md` (frontend) com o que foi corrigido nesta rodada,
ordenado por criticidade. Os números são os das auditorias.

## AUDITORIA.md

### Críticos — todos corrigidos

| # | O que mudou |
| --- | --- |
| A1 | `criar_usuario.py NOME [PERFIL]`: perfil validado, padrão `SECRETARIA`; README corrigido. **Audite as contas criadas antes: todas nasceram ADMIN.** |
| A2 | Router do WhatsApp só para `ADMIN`, `SECRETARIA`, `MARKETING`; regra explícita de negação em `_validar_acesso_publico`; base de leads só para `ADMIN` e `MARKETING`. Coberto por `tests/test_perfis_http.py`. |
| B1 | Baixa nunca ultrapassa o saldo (`registrar_pagamento` recusa; `conciliar` limita e registra o excedente no motivo); conciliação por código exige valor **igual ao saldo**; referência nova `TOV000123-K7` com sufixo aleatório. |
| B2 | `numeroDoCampo` trata o ponto como decimal quando não há vírgula (`200.50` → 200,50). |
| C1 | `DELETE /calendario/aulas/{id}` recusa aula com chamada registrada (cancele a aula). |

### Altos — todos corrigidos

| # | O que mudou |
| --- | --- |
| A3 | `perfil_de()` em `security.py`: sem perfil → `SECRETARIA`; usuário inexistente no WhatsApp → 401. |
| C2 | A grade só grava `dispensa` quando o lançamento traz o campo. |
| C3 | Diálogo "Matricular aluno" avisa que é transferência quando o aluno já tem turma (a lista de alunos devolve `turma_nome`). |
| D1 | `CalendarioPublico.cod_tur`: um token por turma; links antigos sem turma devolvem 404. Frontend gera/renova o link por turma. |
| D2 | `Presenca.origem_ip` / `origem_agente` gravados pelo totem (auditoria posterior). |
| E1 | `repetir_ate` limitado a dois anos; datas ocupadas em uma consulta; sem `refresh` em laço. |
| F1 | Parcial: `tests/test_perfis_http.py` exercita a matriz de perfis pela camada HTTP (TestClient). Os desvios `isinstance(user, str)` continuam nos routers. |
| G1 | Parcial: `/auth/me` reconcilia o perfil no boot; `POST /auth/trocar-senha` ganhou tela (clique no próprio nome, no rodapé do menu). Demais endpoints sem tela continuam sem tela. |
| H1 | `app/tempo.py`: `agora_utc()` para carimbos, `hoje_local()` para dia; todos os `datetime.now()`/`date.today()` substituídos; frontend com `dataDaApi()`/`formatarDataHora()` que acrescentam o `Z`. Carimbos antigos do portal do professor (gravados em hora local) aparecem 3h adiantados. |
| I1 | Campos de matéria sem `trim()` no `value`; trim no envio. |

### Médios corrigidos

A4 (ao menos um admin, para qualquer alvo, após a alteração), A5 (`payload.get("sub")` → 401; `/auth/me` no Layout), A6 (`limit_req` no nginx para login, rotas públicas e API), A7 (mínimo de 8 caracteres; troca pelo próprio usuário), B4 (`garantir_plano` não sobrescreve plano existente sem `--reconfigurar-plano`), B5 (`--sobrescrever` pede confirmação interativa, `--sim` pula), C4 (reparo fora do boot por padrão, `python -m app.reparar`, lock `GET_LOCK` no DDL), C5 (notas por `docturma_id`), C6 (`IntegrityError` ao abrir chamada reaproveita a existente), D3 (`nosniff` na mídia pública), E2 (limite de 5 MB e erro amigável em `/relatorios/lote`), E3 (Web Push em `BackgroundTasks`), E4 (`_achar_aluno` robusto), F3 (`.github/workflows/ci.yml`), I2 (texto do diálogo de exclusão), I4 (diário em PDF por `docturma_id`), K1 (`.env.example` completo), K2 (`TOV_ENCRYPTION_KEY`), H2 (`VITE_TIMEZONE`).

### Baixos corrigidos

A8 (webhook fora do `access_log`), A10 (UazAPI exige `https://`), B6 (`cobra_matricula` no REGULAR), B7 (`LIMITE_LISTA` removido), D5 (fotos removidas do working tree — reescrever o histórico se o repositório for público), E8 (curingas de `LIKE` escapados via `app/consultas.py`), E9 (prune só do projeto), E10 (`TOV_DB_ROOT_PASSWORD`), F5 (`check:bundle` no build), F6 (workbox no `package.json`), G5 (um listener de `push`), G6 (`fontMono` sem fonte fantasma), I10 (`revokeObjectURL` adiado), K3 (cabeçalhos de segurança + CSP), K4 (`location ^~ /api/`).

### Segunda rodada (também corrigidos)

**A9** assinatura HMAC opcional do corpo no webhook bancário; **B3** coluna
`Aluno.nome_normalizado` indexada, mantida por evento do ORM e preenchida
uma vez no boot; **B8** aviso ao regerar o link do aluno; **C8** nota final
recusada quando a matéria tem atividades; **D4** tabela `auditoria`
(`GET /usuarios/auditoria` e tela em Usuários); **D6** CPF mascarado na
ficha; **E5** engine criado na primeira necessidade; **E6** teto de páginas
na UazAPI; **E7** reenvio respeita o limite de massa; **F4** `ruff`
(backend) e ESLint (frontend) no CI; **F7** vitest com os testes de
`numeroDoCampo` e dos formatadores; **G4** comunicados deixam de travar a
exclusão de turma/vínculo (são apagados junto); **G7**; **H3**; **I3**
origem `EDICAO_MANUAL` quando o formulário só ecoa a origem antiga; **I5**,
**I6** (número procura também no nome), **I7**, **I8**, **I9**, **I11**;
**K5** `Code.gs` com URL configurável, cabeçalhos tolerantes e identidade
sem número da linha, poll a cada 5 min; **K6** aviso em `docs/superpowers`.

### Terceira rodada (também corrigidos)

**F1** os desvios `isinstance(user, str)` saíram de `notas`, `presencas`,
`materiais` e `portal_professor`; os testes que chamam os routers direto
passam `user` explícito (`tests.SEM_LOGIN`, um login que nunca existe).

**F2** `tests.criar_engine_de_teste()` respeita `TOV_TEST_DATABASE_URL`, e o
CI ganhou o job `backend-mysql`, que roda a mesma suíte contra um MySQL 8.0 de
serviço. Localmente, sem a variável, continua em SQLite em memória.

**G1** ganharam tela: `PUT`/`DELETE /turmas/{id}` e
`PUT /turmas/{id}/materias/{docturma_id}` (botão "Editar turma" e ícone de
edição na aba de matérias, em `TurmaDetalhe`); `PUT`, `DELETE`,
`PUT /status` e `GET /pagamentos` de cobrança (novo `DialogoCobranca`,
acionado por "Gerenciar" em `/financeiro`); `POST /notas/aluno/{id}`,
`PUT /notas/{id}` e `DELETE /notas/{id}` (lançamento avulso, com dispensa, na
ficha do aluno); `GET /leads/{id}` (trilha de consentimento no diálogo do
lead); `GET /professores/{id}` (ficha do professor). Segue sem tela apenas
`GET /notas/turma/{t}/materia/{m}`, rota de compatibilidade legada.

**G2/G3** `matprof` e `titprof` saíram dos modelos, dos reparos de schema e da
API; `PUT /professores/{id}/materias` foi removido. `GET /professores/{id}`
passou a responder a partir dos vínculos reais de `docturma`.

**C7** `_lancamentos_do_vinculo()` dá preferência explícita ao lançamento do
próprio vínculo sobre o legado e devolve `lancamentos_ambiguos`; a grade de
notas exibe um aviso com as matrículas afetadas.

### Não feitos

- **C4** ficou com flag e lock, não com Alembic — o schema continua sendo
  reconciliado em código, não por migração versionada.
- As tabelas `matprof` e `titprof` deixaram de ser criadas, mas **não são
  derrubadas** num banco existente: o DROP é destrutivo e fica a cargo de
  quem opera (ver README).
- O job `backend-mysql` do CI ainda não rodou de verdade: não havia MySQL
  disponível nesta máquina. A primeira execução no GitHub é o teste dele.

## AUDITORIA_VISUAL.md

### Críticos — corrigidos

A1 (`bgcolor: undefined` não é mais espalhado sobre a variante), A2 (ações do `BottomNavigation` como filhos diretos: rótulos e item ativo).

### Altos — corrigidos

A3 (Snackbar em bottom/center com alerta opaco, via tema), A7 (passo de corpo em `lg` no `CardMetrica`), B1 (sidebar completa só em `lg`; trilha de 72px até 1200px), B2/B10 (`overflowWrap: anywhere` nas células; sombras de rolagem no `TableContainer`), B3/B12 (lista da navegação rola separada do rodapé fixo; "Mais" preso na base da trilha), C2 (`TOV.caption` em separadores e traços), C3/E6 (desabilitado com contraste ≥ 3:1 e um único tratamento), D1 (`EstadoErro` nas 17 páginas + Calendário), E1 (rótulo sempre no entalhe, via `defaultProps` do tema; "Todos" visível nos filtros), F1 (`typography.button` em px), H13 (sem `stickyHeader`; regra 6 do design system ajustada).

### Médios/baixos corrigidos

A4, A5, A6, A8, B4, B5, B11, B13, C8, D2, D3, D4, D5, D6, D9, E3, E4 (parcial), E8, E13, E16, F5 (folha de impressão), G1 (`GrupoSegmentado` 46px), G6, I1, I2, I3, I4, I5, I7, J2 (parcial: fonte mono).

### Segunda rodada (também corrigidos)

B7 ("Sair" na trilha do tablet), B8 (sombra de rolagem no `GrupoSegmentado`),
B9 (tabela e trilha entram juntas em 600px), C4 (erro com borda de 2px e
anel de foco grafite quando o campo já está em erro), C5 (12px na grade do
calendário), C6 (filete coral na opção ativa), C7 (status por texto/traço
na grade), D8, E5 (descrição colada ao título no celular), E7 (ações de
tabela com sublinhado e 44px), E11 (`LinkVoltar` compartilhado), E15, F3
(`EstadoVazio`/`EstadoErro` com `h2`), F4 (matéria em destaque na agenda),
G2 (nome do aluno é botão focável), G4, H2 (colunas de perfil e professor em
Usuários), H9 (hover de 7%), H14 (barra fixa mede a própria altura), I9.

### Terceira rodada (também corrigidos)

**B6** a agenda do celular abre na semana, com "Mês inteiro" a um toque, e a
conciliação mostra 20 recebimentos por vez (`useListaEmLotes`). **D7** os 25
diálogos do produto ganharam ✕ no canto (`TituloDialogo`). **E2** a gaveta de
notificações e os sete tipos de mensagem do `/whatsapp` passaram ao
`GrupoSegmentado`. **E9** o tracejado ficou reservado a zona de soltar
arquivo. **E10** um ícone do WhatsApp por tela, na ação que abre o WhatsApp.
**E12** a busca de `/materias` desceu para uma `BarraFiltros`. **E14** em
`/financeiro/turmas/:id`, "Salvar plano" só é coral enquanto não há plano.
**H1** `alignItems: start` nos cartões do dashboard. **H3** a célula da grade
do calendário reserva 76px. **H4** `/professores` distribui a largura por
nome, e-mail e áreas. **H5** régua fora da linha, avatar e nome no mesmo
eixo, ações em largura inteira no celular. **H6** descrição e metadados em
linhas próprias, sem separador órfão. **H7** os cinco recortes de `/leads`
ficam recolhidos no celular. **H8** as ações de `/whatsapp` ocupam a linha
inteira no celular. **H10** o nome da atividade sai da caixa alta e para em
duas linhas; "Aluno" ganha piso de 200px. **H11** a faixa do título do
autocadastro usa a calha do miolo, a linha de contato fecha e o texto de
ajuda deixa de começar 4px à direita do campo. **H12** a faixa escura do
login acompanha a largura. **I6** `/turmas`, `/materias` e `/professores`
deixaram de mostrar o id do banco. **J1** preload de Bricolage 700 e Open
Sans 400/600, injetado do bundle por um plugin do Vite. **J2** o peso 400 do
Bricolage saiu do CSS e do precache.

### Não feitos

**J3** (CORS em 409) continua não reproduzido: com `Origin` no header e a
origem na allowlist, o `CORSMiddleware` devolve os cabeçalhos em todas as
respostas testadas. A metade visível foi corrigida — a falha ao listar
templates aparece no campo em vez de deixar o select vazio sem explicação.
