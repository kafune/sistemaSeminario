# Auditoria exploratória — sistemaSeminario (TOV Acadêmico)

**Data:** 2026-09-14
**Commit auditado:** `4eac2ac` (branch `claude/epic-johnson-gmbz9t`)
**Escopo:** repositório inteiro — 158 arquivos, ~1,4 MB de código-fonte.
**Natureza:** auditoria exploratória sem foco prévio. Nenhum arquivo foi
tratado como fora de escopo.

## Como esta auditoria foi feita

Todo o backend (`backend/`, 71 arquivos Python) e todo o frontend
(`frontend/src`, 47 arquivos JS/JSX, 34 deles páginas) foram lidos integralmente, além de
`docker-compose.yml`, `redeploy.sh`, `deploy/nginx-tov.conf`, `start-dev.ps1`,
`integracoes/google-forms/Code.gs`, `README.md` e os quatro documentos em
`docs/`.

Onde foi possível, os achados **não foram inferidos por leitura**: as
dependências foram instaladas no ambiente de auditoria, a suíte de testes foi
executada e cada achado marcado `VERIFICADO` foi reproduzido com um script
próprio contra um banco SQLite em memória, usando as funções reais do
aplicativo. A saída de cada reprodução está citada no achado.

> **Suíte de testes:** `python -m unittest discover -s tests -t .` →
> **196 testes, todos passando** (13,6 s). Os 8 erros iniciais eram apenas a
> ausência de `pywebpush` no ambiente de auditoria (dependência nativa que não
> compila aqui); com um stub, a suíte fecha limpa. **Nenhum achado abaixo é
> uma falha de teste** — todos passam por baixo da cobertura atual, pelas
> razões explicadas na seção F.

A seção **J** lista hipóteses que investiguei e que **não** se confirmaram.
Elas estão no relatório de propósito: são caminhos que parecem defeitos numa
leitura rápida e não são, e vale registrar para ninguém "corrigir" o que já
está certo.

## Panorama

| Severidade | Qtd. | Onde dói |
| --- | --- | --- |
| Crítico | 5 | Privilégio, dinheiro, histórico acadêmico |
| Alto | 10 | Exposição de dados, perda silenciosa de registro |
| Médio | 28 | Robustez, corretude, operação |
| Baixo / qualidade | 33 | Código morto, UX, ferramental |
| **Total** | **76** | |

O sistema é, no geral, **bem escrito**: os comentários explicam *por que* e não
*o quê*, o modelo financeiro é conceitualmente sólido (situação derivada em vez
de gravada), há 196 testes e o design system é levado a sério. Os achados
críticos se concentram em três pontos: **a fronteira de perfis**, **a
conciliação bancária automática** e **exclusões que levam junto um histórico que
ninguém pediu para apagar**.

---

# A. Controle de acesso e privilégio

## A1 — CRÍTICO — `criar_usuario.py` cria sempre um ADMIN, e o README manda criar um "SECRETARIA" assim

`backend/criar_usuario.py:40` grava o usuário sem informar o perfil:

```python
db.add(Usuario(user=user, senha_hash=gerar_hash(senha)))
```

`Usuario.perfil` tem `default="ADMIN"` (`backend/app/models/auth.py:15`). O
argumento da linha de comando é o **nome do usuário**, não o perfil — mas o
`README.md:132` instrui exatamente:

```bash
docker compose --env-file .env run --rm backend python criar_usuario.py SECRETARIA
```

Quem seguir o README ao pé da letra cria uma conta **chamada** `SECRETARIA` com
**poderes totais de ADMIN**: `/usuarios`, criação e exclusão de contas, troca de
perfis, instância do WhatsApp. E ela *parece* restrita na tela, porque o nome
diz "secretaria".

**VERIFICADO** (ver apêndice, bloco A1 — replica a linha 40 e a guarda real):

```
>>> criado usuario 'SECRETARIA' com perfil 'ADMIN'
>>> passa na guarda de ADMIN? ADMIN
```

**Correção:** aceitar o perfil como segundo argumento (validado contra a mesma
lista `Literal` de `usuarios.py`), default `SECRETARIA`, e corrigir o exemplo do
README. Vale auditar as contas existentes em produção: qualquer conta criada por
esse script hoje é ADMIN.

## A2 — CRÍTICO — PROFESSOR tem acesso completo ao módulo WhatsApp

`backend/app/main.py:144-147` define `operacional` incluindo `PROFESSOR`, e
`main.py:163` monta o router do WhatsApp inteiro sob ele:

```python
operacional = [Depends(usuario_atual),
               Depends(exigir_perfis("ADMIN", "SECRETARIA", "MARKETING", "PROFESSOR"))]
app.include_router(whatsapp.router, dependencies=operacional)
```

A única checagem de público é `_validar_acesso_publico`
(`routers/whatsapp.py:414-425`), que restringe **apenas** MARKETING e
SECRETARIA. PROFESSOR cai fora de todos os `if` e passa.

O frontend esconde `/whatsapp` de PROFESSOR (`App.jsx:106`), o que torna o
problema invisível na tela — mas a rota da API não exige nada além do token.

**VERIFICADO** (`_validar_acesso_publico` chamada diretamente para cada perfil):

```
>>> PROFESSOR pode disparar para 'todos os alunos'?
    SIM — nenhuma restricao aplicada
    SECRETARIA -> publico 'leads': bloqueado
    MARKETING  -> publico 'todos': bloqueado
    PROFESSOR  -> publico 'leads': PERMITIDO
```

Na prática, qualquer professor com acesso ao portal pode, com o próprio token:
disparar mensagem em massa para **todos os alunos ativos** da escola, listar e
segmentar a **base de leads de marketing** (dado sensível de LGPD, que a própria
SECRETARIA está proibida de ver), e criar/editar/excluir templates
`UTILIDADE` (`_template_permitido`, `whatsapp.py:1089-1100`).

**Correção:** tirar `PROFESSOR` de `operacional` para o router do WhatsApp
(criar uma lista separada), ou adicionar a regra explícita em
`_validar_acesso_publico` e `_validar_acesso_disparo`. A primeira é mais segura:
a regra por omissão hoje é "permitir".

## A3 — ALTO — `_perfil_usuario` falha para o lado aberto (ADMIN)

`routers/whatsapp.py:409-411`:

```python
def _perfil_usuario(db: Session, usuario: str) -> str:
    registro = db.get(Usuario, usuario)
    return (registro.perfil if registro else "ADMIN") or "ADMIN"
```

Usuário não encontrado ⇒ **ADMIN**. Mesma forma em
`security.py:55` (`perfil_atual` retorna `"ADMIN"` quando `usuario.perfil` é
nulo) e em `notas.py:87`, `materiais.py:63` (`(usuario.perfil or "ADMIN")`).

Hoje isso **não é diretamente explorável**, porque o router do WhatsApp já passa
por `perfil_atual`, que devolve 401 quando a linha não existe. É uma falha de
defesa em profundidade: a política padrão de todo o sistema, quando a
informação falta, é conceder o máximo em vez do mínimo.

**Correção:** trocar o default por `"SECRETARIA"` (ou levantar 403). O único
motivo histórico para `or "ADMIN"` é a migração que adicionou a coluna
(`schema.py:363`, que já preenche `DEFAULT 'ADMIN'` no banco) — o default em
código é redundante com ela.

## A4 — MÉDIO — A garantia de "ao menos um administrador" só vale para auto-rebaixamento

`routers/usuarios.py:105-112` só consulta a contagem de admins quando
`user == atual`. Rebaixar ou **excluir outro** administrador não passa por
verificação nenhuma. Com dois admins A e B, duas requisições simultâneas
(A rebaixa B, B rebaixa A) podem ambas ler "2 admins" e ambas gravar — deixando
o sistema com **zero administradores** e `/usuarios` inalcançável para todos,
sem caminho de recuperação pela aplicação (só `criar_usuario.py` no servidor).

**Correção:** mover a checagem para depois da alteração, dentro da mesma
transação, e aplicá-la em `alterar_perfil` e `excluir` independentemente de quem
é o alvo.

## A5 — MÉDIO — Sessão JWT sem revogação e perfil preso ao login

- `criar_token` (`security.py:28-33`) emite um JWT de **12 horas** com apenas
  `sub` e `exp`. Não há `jti`, lista de revogação nem versão de senha no token.
  Excluir o usuário, trocar a senha dele ou rebaixar seu perfil **não invalida
  a sessão em curso** — o token continua aceito até expirar.
- `usuario_atual` faz `payload["sub"]` sem `.get` (`security.py:43`): um JWT
  válido assinado sem `sub` produz `KeyError` → **500**, não 401.
- O frontend guarda o perfil em `localStorage` no login (`api.js:16-21`) e
  **nunca revalida**. `GET /auth/me` existe e não é chamado por ninguém (ver G1).
  Uma mudança de perfil feita pelo admin só aparece no próximo login.

**Correção:** `payload.get("sub")` com 401; e chamar `/auth/me` no boot do
`Layout` para reconciliar o perfil (o backend já é a autoridade real, então isso
é correção de UX, não de segurança — a tela mostra menus que a API recusa).

## A6 — MÉDIO — Sem limite de tentativas em lugar nenhum

Não há `limit_req` no nginx (`deploy/nginx-tov.conf`, `frontend/nginx.conf`) nem
qualquer contador na aplicação. Ficam expostos a força bruta e a enumeração:

| Endpoint | Risco |
| --- | --- |
| `POST /auth/login` | Força bruta de senha (mínimo de 6 caracteres, sem complexidade) |
| `GET /financeiro-aluno/{token}` | Extrato financeiro completo |
| `GET /presenca-publica/{token}` | Lista nominal da turma |
| `GET /calendario-publico/{token}` | Agenda institucional |
| `POST /cadastro-professor/{token}` | Criação de cadastro de professor |
| `POST /integracoes/banco/recebimentos` | Injeção de recebimento (só o header secreto protege) |

Os tokens são `secrets.token_urlsafe(32)` (256 bits) — enumerá-los é inviável.
O problema real é o **login** e o custo de CPU do bcrypt sob requisições
repetidas.

**Correção:** `limit_req_zone` no nginx para `/api/auth/login` e para as rotas
públicas; atraso progressivo ou bloqueio temporário por usuário após N falhas.

## A7 — MÉDIO — Política de senha fraca e sem troca pelo próprio usuário

`SENHA_MINIMA = 6` (`usuarios.py:14`, `auth.py:59`), sem exigência de
complexidade, sem verificação de vazamento, sem expiração. Para um sistema que
guarda CPF, RG, endereço, telefone e situação financeira de menores e adultos,
6 caracteres é pouco.

Agravante: `POST /auth/trocar-senha` **existe e não tem tela** (ver G1). O
`README.md:163` anuncia a funcionalidade ("Troca de senha disponível na API"),
mas na prática **ninguém troca a própria senha** — só um ADMIN redefine a de
terceiros, e o faz sem saber a senha antiga e sem deixar registro.

## A8 — BAIXO — Segredo do webhook UazAPI viaja na URL

`routers/whatsapp.py:70-75` monta a URL do webhook com o segredo **no caminho**:

```python
f"{base}/whatsapp-publico/webhook/{_segredo_webhook()}"
```

Caminhos de URL são gravados integralmente no `access_log` do nginx, aparecem em
`Referer` e em qualquer proxy no meio. O segredo é derivado de
`TOV_SECRET_KEY` (`sha256(secret_key + ":uazapi-webhook")`), então vazá-lo não
entrega a chave — mas entrega a capacidade de forjar eventos de campanha,
resposta e opt-out.

**Correção:** mover para um header (como já é feito em
`_validar_segredo` e `_validar_segredo_banco`), ou pelo menos excluir esse
`location` do log no nginx.

## A9 — BAIXO — Webhook bancário sem assinatura de corpo

`_validar_segredo_banco` (`routers/financeiro.py:1401-1409`) compara um segredo
compartilhado fixo por `hmac.compare_digest`. Não há HMAC sobre o corpo nem
timestamp/nonce. Quem capturar o header uma vez pode injetar qualquer
recebimento. A idempotência por `identificador` limita a repetição do *mesmo*
aviso, não a criação de avisos novos. Combinado com **B1**, isso vira baixa
automática em cobranças de terceiros.

## A10 — BAIXO — UazAPI aceita `http://`

`services/uazapi.py:65` permite `http://` na base URL, e o `admintoken`
administrativo vai no header em texto claro. Deveria exigir `https://`.

---

# B. Dinheiro

## B1 — CRÍTICO — Conciliação por referência ignora o valor e não limita a baixa ao saldo

Duas falhas que se somam:

1. `encontrar_cobranca` (`services/financeiro.py:633-657`) — quando a descrição
   ou o campo `referencia` do aviso bancário contém o código `TOV000123`, a
   cobrança é escolhida **sem nenhuma comparação de valor**. O caminho por nome
   de pagador compara valores; o caminho por referência não.
2. `registrar_pagamento` (`services/financeiro.py:541-563`) e `conciliar`
   (`:682-697`) gravam um `Pagamento` com o **valor cheio da transação**, sem
   limitar ao saldo em aberto.

Resultado: um PIX de R$ 2.000 citando `TOV000001` quita uma cobrança de R$ 200 e
grava uma baixa de R$ 2.000. Os R$ 1.800 excedentes existem na tabela
`pagamentos`, não aparecem como crédito em lugar nenhum e somem do extrato,
porque `cobranca_dict` faz `max(valor - pago, ZERO)`.

**VERIFICADO** (ver apêndice, bloco B1):

```
cobranca: 1 valor 200.00 referencia TOV000001
>>> status da cobranca: PAGA | valor 200.00 | total pago: 2000.00
>>> transacao: CONCILIADA motivo: Código TOV000001 informado no pagamento
>>> SOBREPAGAMENTO de 1800.00 nao registrado em lugar nenhum
>>> cobranca_dict saldo: 0.0 | pago: 2000.0
```

Agravante — `referencia_de` é `f"TOV{cobranca_id:06d}"`
(`services/financeiro.py:70-72`): **sequencial e adivinhável**. E
`extrair_referencia` (`:75-81`) varre a **descrição livre** enviada pelo banco
com `re.search(r"TOV\s*-?\s*(\d{4,10})")`. Ou seja, o texto que o pagador digita
no PIX é aceito como identificação do título. Qualquer pessoa que faça um PIX
para a escola escrevendo "TOV000042" na descrição tem o pagamento lançado na
cobrança do aluno 42.

**Correção (três, todas necessárias):**
- limitar o valor da baixa ao saldo (`min(valor, saldo)`) e registrar o excedente
  explicitamente (crédito, ou transação parcialmente conciliada);
- exigir que o valor bata (dentro de uma tolerância) também no caminho por
  referência, ou mandar para a fila manual quando não bater;
- trocar `TOV{id:06d}` por um código com dígito verificador aleatório, para que
  citar a referência de outra pessoa não seja trivial.

## B2 — CRÍTICO — `numeroDoCampo` multiplica por 100 quando o usuário digita ponto decimal

`frontend/src/pages/FinanceiroComum.jsx:52-57`:

```js
const limpo = String(texto ?? '').replace(/\./g, '').replace(',', '.').trim()
```

O ponto é removido **incondicionalmente**, como se fosse sempre separador de
milhar. Quem digita `200.50` — o que o teclado numérico do iOS oferece por
padrão em vários locales — obtém **20050**.

**VERIFICADO:**

```
digitado "1.200,50"   -> R$ 1200.5     (ok)
digitado "200,00"     -> R$ 200        (ok)
digitado "200.50"     -> R$ 20050      (100x)
digitado "1200.5"     -> R$ 12005      (100x)
digitado "50.00"      -> R$ 5000       (100x)
```

Onde isso chega sem rede de proteção:

| Uso | Arquivo | Tem limite? |
| --- | --- | --- |
| **Mensalidade e matrícula do plano da turma** | `FinanceiroTurma.jsx:118-119` | **Não** |
| Mensalidade da condição do aluno | `FinanceiroTurma.jsx:182` | Não |
| Recebimento manual na conciliação | `FinanceiroConciliacao.jsx:112` | Não |
| Cobrança avulsa | `Financeiro.jsx:197` | Só o teto de 99.999,99 do Pydantic |
| Baixa de pagamento | `FinanceiroComum.jsx:89` | **Sim** — barrado por `excedeSaldo` |

O caso grave é o primeiro: `salvarPlano` grava a mensalidade errada e o botão
"Gerar cobranças" replica o erro para **todos os alunos da turma** de uma vez.

**Correção:** só tratar `.` como milhar quando houver também uma `,` na string;
caso contrário, interpretá-lo como decimal. Exibir o valor normalizado
(`formatarMoeda`) ao lado do campo antes de salvar.

## B3 — MÉDIO — `_aluno_do_pagador` carrega a tabela inteira de alunos por transação

`services/financeiro.py:587-598`:

```python
candidatos = [
    aluno for aluno in db.scalars(select(Aluno).where(Aluno.nome.is_not(None)))
    if normalizar_nome(aluno.nome) == nome
]
```

Todo aviso bancário que não traga CPF faz um `SELECT *` de `alunos` e normaliza
cada nome em Python. Com 1.000 alunos e um lote de 200 avisos, são 200.000
normalizações e 200 varreduras completas. O mesmo padrão está em
`professores.py:315-319` (verificação de CPF no autocadastro) e em
`importar_planilha_financeiro.py:189`.

**Correção:** coluna `nome_normalizado` indexada, mantida na escrita.

## B4 — MÉDIO — `garantir_plano` sobrescreve planos existentes sem avisar

`importar_planilha_financeiro.py:303-325` aplica os valores da linha de comando
a **toda turma que tenha alguém na planilha**, sobrescrevendo
`valor_matricula`, `valor_mensalidade`, `parcelas`, `dia_vencimento`,
`primeira_mensalidade` e `vencimento_matricula` de um plano já configurado na
tela. Combinado com os defaults do `argparse` (`--matricula` R$ 100,
`--mensalidade` R$ 200, `--parcelas` 24, `--primeira-mensalidade`
**`2026-08-10` fixo no código**, linhas 874-881), rodar o importador sem passar
as flags reconfigura silenciosamente o dinheiro de várias turmas.

## B5 — MÉDIO — `--sobrescrever` apaga baixas sem confirmação interativa

`importar_planilha_financeiro.py:1002-1010` **imprime** o aviso de quantas
cobranças e baixas serão destruídas e, na linha seguinte, executa
`sobrescrever()` sem pedir confirmação. Diferente de `--limpar-importacao`, que
respeita o modo simulação, `--sobrescrever --aplicar` é irreversível na hora.
A conferência final faz `db.rollback()` se os totais não baterem — o que
salva o caso comum, mas não é uma confirmação.

## B6 — BAIXO — `cobra_matricula` é ignorado em condição REGULAR

`plano_efetivo` (`services/financeiro.py:243-266`) só lê `cobra_matricula`
dentro do ramo `if condicao.tipo == "TRANSFERENCIA"`. Marcar "não cobrar
matrícula" num aluno REGULAR grava a coluna e não produz efeito nenhum.

## B7 — BAIXO — `LIMITE_LISTA` é constante morta

`routers/financeiro.py:44` define `LIMITE_LISTA = 500` e nada o usa. A
paginação real usa `por_pagina` limitado a 200 (`:407`).

## B8 — BAIXO — `gerar_acesso_do_aluno` invalida o link anterior em silêncio

`routers/financeiro.py:1130-1143` regera o token a cada chamada. Clicar duas
vezes em "gerar link" derruba o link já enviado ao aluno, sem aviso na tela.

---

# C. Integridade do registro acadêmico

## C1 — CRÍTICO — Excluir uma aula do calendário apaga silenciosamente as faltas registradas

`routers/calendario.py:192-208` (`excluir_aula`) limpa `MaterialDidatico.aula_id`
e remove o `PlanejamentoAula`, mas **não toca na `Chamada`**. A chamada fica com
`aula_id` apontando para uma linha que não existe mais.

`subconsulta_faltas` (`services/faltas.py:11-26`) faz `JOIN Chamada ON
Chamada.aula_id == Aula.id`. Sem a aula, a junção não casa: as presenças
continuam na tabela e **as faltas somem de todo cálculo** — boletim, histórico,
diário, grade de notas.

**VERIFICADO** (ver apêndice, bloco C1 — turma com Ana presente e Bruno ausente):

```
>>> faltas apos encerrar a chamada: {2: 1}      (Bruno com 1 falta)
>>> chamadas que sobraram: [(1, 1, 'ENCERRADA')]  (aula_id=1 já não existe)
>>> presencas que sobraram: 2
>>> faltas DEPOIS de apagar a aula: {}          <-- historico de falta sumiu
```

O contraste é gritante: `turmas.py:142-160` **impede** apagar uma turma que
tenha aulas ou chamadas, com mensagem explícita. `remover_materia`
(`turmas.py:376-385`) impede remover o vínculo que tenha aulas. Só
`excluir_aula` — a porta mais fácil, um botão no diálogo de edição da aula
(`Calendario.jsx:488`) — passa sem verificação alguma.

**Correção:** recusar a exclusão quando existir `Chamada` para a aula (mesma
linguagem das outras verificações), ou exigir confirmação que explicite quantas
presenças e faltas serão perdidas.

## C2 — ALTO — `AluNota.dispensa` é apagado a cada salvamento da grade

`routers/notas.py:542` grava `registro.dispensa = lanc.dispensa` para toda
linha alterada. A tela de notas **nunca tem controle de dispensa**: `Notas.jsx:313`
envia sempre `dispensa: l.dispensa || null`, e `l.dispensa` vem de
`a.dispensa ?? null` no carregamento — mas o professor não pode editá-lo, e
qualquer alteração de nota ou do switch "Cursou" reescreve a linha inteira.

**VERIFICADO** (ver apêndice, bloco C2):

```
>>> dispensa antes: S
>>> dispensa depois de salvar a grade: None <-- apagada em silencio
```

Somado a **G1**, o quadro completo é: `dispensa` **não tem nenhum caminho de
escrita alcançável** (o único endpoint que a define, `POST /notas/aluno/{id}`,
não tem tela) e **tem um caminho de apagamento acionado por acidente**. A coluna
aparece no boletim? Não — nem `pdf/boletim.py` nem `pdf/historico.py` a exibem.
É um campo que só pode ser perdido.

## C3 — ALTO — Matricular um aluno o remove silenciosamente da turma anterior

`services/matriculas.py:19-67` (`sincronizar_matricula`) trata o aluno como
tendo **uma única turma**: apaga todos os `AluTurma` que não sejam o destino.

A tela `TurmaDetalhe.jsx:83-97` chama isso por um botão chamado
**"Matricular aluno"**, com um `Autocomplete` e nada mais. Não há aviso de que o
aluno sairá da turma em que já está. Um aluno cursando duas turmas — cenário
normal numa escola modular — é impossível, e a operação que o cria é apresentada
como aditiva.

As cobranças da turma antiga **permanecem** (`financeiro.py` só ignora o aluno
na régua da turma, comentário em `:1200`), então o aluno fica devendo uma turma
onde não está mais matriculado.

**Correção:** se o modelo é mesmo de turma única, dizer isso no diálogo
("Ana está em *Teologia Noturno*. Matricular em *Teologia Sábado* vai
transferi-la."). Se não é, `sincronizar_matricula` precisa de um modo aditivo.

## C4 — MÉDIO — `_reparar_integridade_academica` roda DELETEs destrutivos a cada boot

`app/schema.py:48-186`, chamada por `atualizar_schema` no `lifespan`
(`main.py:87-88`) e também por `criar_usuario.py:32` e
`importar_planilha_financeiro.py:927`. A cada inicialização do processo ela:

- `DELETE FROM aluturma` onde o aluno ou a turma não existem (`:56-65`);
- `_remover_duplicatas_exatas` — apaga duplicatas de `aluturma` e `matprof`
  mantendo `MIN(id)` (`:21-45`, `:66-70`, `:182-186`);
- `DELETE FROM matprof` com ponta faltando (`:170-181`);
- `UPDATE alunos SET cod_tur = NULL` para turmas inexistentes (`:73-80`);
- **INSERE** linhas em `aluturma` inferidas de `alunos.cod_tur` (`:125-135`);
- reescreve `turma.qtalu` (`:138-145`).

Sem log, sem contagem, sem modo de simulação, sem transação de auditoria, e sem
lock — **duas réplicas subindo ao mesmo tempo executam tudo isso em paralelo**,
e o bloco de `CREATE INDEX`/`CREATE UNIQUE INDEX` (`:456-460`, `:551-578`) falha
com erro fatal na segunda, derrubando o boot.

Isso é uma migração de dados disfarçada de rotina de inicialização. O próprio
arquivo admite não usar Alembic (`schema.py:3`).

**Correção:** extrair para um comando de manutenção explícito
(`python -m app.reparar --dry-run`), com relatório, rodado deliberadamente; e
proteger o DDL de boot com um lock consultivo (`GET_LOCK` no MySQL).

## C5 — MÉDIO — Exclusão de turma/vínculo é bloqueada por notas de *outro* vínculo

`turmas.py:354-364` e `:386-396` verificam notas por `(cod_tur, cod_mat)`, não
por `docturma_id`. Quando a mesma matéria está vinculada duas vezes à turma (anos
ou semestres diferentes — cenário que `_vinculo_duplicado` permite de propósito),
notas lançadas em **um** vínculo impedem remover o **outro**, sem explicar o
motivo. `AluNota.docturma_id` é descrito nos próprios modelos como "fonte
canônica" (`models/academico.py:87-88`) e é ignorado aqui.

## C6 — MÉDIO — Corrida ao abrir chamada devolve 500

`presencas.py:344-369`: duas requisições simultâneas de `abrir_chamada` para a
mesma aula podem ambas não encontrar chamada e ambas inserir, violando
`uq_chamadas_aula_id`. O `IntegrityError` não é capturado — o usuário recebe 500.
Cenário plausível: secretaria e professor abrindo a chamada da mesma aula ao
mesmo tempo, ou um duplo toque no iPad.

## C7 — BAIXO — Grade de notas casa lançamentos legados por `(cod_tur, cod_mat)`

`notas.py:166-180` e `:435-450` incluem `AluNota.docturma_id.is_(None) &
(cod_tur == …) & (cod_mat == …)`. Com a mesma matéria em dois períodos, um
lançamento legado casa com os dois vínculos, e o `dict` por `cod_alu` fica com o
último lido — sem aviso de ambiguidade.

## C8 — BAIXO — `lancar` aceita nota final mesmo com atividades configuradas

`notas.py:511-512`: quando `notas_atividades` vem `None`, a nota enviada é
gravada direto, ignorando a composição por atividades do vínculo. A tela não faz
isso, mas a API permite contornar a composição.

---

# D. Exposição de dados

## D1 — ALTO — O link "da turma" do calendário público expõe a agenda da instituição inteira

`routers/calendario.py:256-290`. O filtro por turma é um **parâmetro de query
opcional**:

```python
def calendario_publico(token, inicio=None, fim=None, cod_tur=None, ...)
```

`Calendario.jsx:211` monta sempre `/agenda/{token}?turma=N` e a tela promete
"O link abrirá uma agenda limpa" (`Calendario.jsx:367`). Mas **apagar
`?turma=N` da URL** devolve todas as aulas de todas as turmas do período, com
`turma_nome`, `materia_nome`, `professor_nome`, `local` e `tema`. A janela
padrão é hoje−45 a hoje+370 dias (`:276-277`).

O backend remove apenas `observacao` e `docturma_id` (`:279-282`). O link é
enviado a grupos de WhatsApp de alunos; o recorte por turma é uma ilusão de
frontend.

**Correção:** se o link é por turma, a turma precisa fazer parte do token
(um `CalendarioPublico` por turma, ou `cod_tur` gravado na linha do token).

## D2 — ALTO — O totem de presença entrega a lista nominal e aceita marcação por qualquer um

`presencas.py:675-717`. `GET /presenca-publica/{token}` devolve, **sem
autenticação**, o nome completo e o `cod_alu` de todos os alunos da turma, mais
quem já chegou e a que horas. `POST /presenca-publica/{token}` marca presença
para **qualquer `cod_alu` da lista**, sem nenhuma prova de identidade.

Isso é inerente ao desenho de totem compartilhado num iPad, e o README assume
"confirmação pelo próprio aluno". O ponto de auditoria é que o token, uma vez na
mão de um aluno (a URL fica visível no iPad), permite marcar presença de
terceiros **de fora da sala**, pelo celular, enquanto a chamada estiver aberta.
Não há registro de IP nem de dispositivo, e `marcar_presenca` é idempotente e
irreversível pelo totem.

**Mitigações possíveis:** exigir que a requisição venha do mesmo IP que abriu a
chamada; token de uso curto rotacionado a cada N minutos exibido só na tela;
ou registrar o IP/UA em `Presenca` para permitir auditoria posterior.

## D3 — MÉDIO — Mídia do WhatsApp é servida publicamente, para sempre, com MIME do cliente

`routers/whatsapp.py:736-748` (`obter_midia_publica`):

- MIME vem de `arquivo.content_type` declarado pelo cliente no upload
  (`:1042-1044`) — sem verificação do conteúdo;
- serve `inline` para `image/*` e `audio/*`;
- **sem `X-Content-Type-Options: nosniff`** (a rota equivalente de materiais,
  `materiais.py:313`, tem);
- o token nunca expira e o arquivo nunca é removido — `whatsapp_arquivos` só
  cresce.

**Correção:** acrescentar `nosniff`, validar o tipo pelos magic bytes, e expirar
arquivos de campanhas concluídas.

## D4 — MÉDIO — Sem trilha de auditoria administrativa

Existe auditoria de consentimento de lead (`LeadConsentimentoEvento`, bem-feita)
e não existe nada equivalente para:

- criação, exclusão e mudança de perfil de usuários;
- redefinição de senha por administrador;
- exclusão de cobrança, estorno de pagamento, alteração de plano;
- exclusão de aula, aluno, professor, matéria, turma.

Alguns registros guardam `criado_por`/`atualizado_por`, mas só o **estado atual**
— não há histórico de quem mudou o quê e quando.

## D5 — BAIXO — Fotos com nomes reais de professores versionadas no repositório

`IMG-20260727-WA0010.jpg` e `IMG-20260727-WA0012.jpg` na raiz, 148 KB somados,
**não referenciadas por nenhum arquivo**. A segunda é a captura de uma tabela de
planejamento com nomes de pessoas reais ("Vitor Gadelha", "Erisvaldo
Veríssimo"). Entraram no commit `19d6570`.

**Correção:** remover do working tree e, se o repositório for público ou vier a
ser, reescrever o histórico.

## D6 — BAIXO — CPF exibido sem máscara

`AlunoDetalhe.jsx:202` e `pdf/listas.py:71` mostram o CPF completo. Para uma
tela consultada em balcão, mascarar (`***.456.789-**`) com revelação sob clique
reduz exposição por ombro.

---

# E. Robustez e disponibilidade

## E1 — ALTO — `repetir_ate` sem limite: uma requisição cria milhares de aulas

`routers/calendario.py:140-167`. O laço `while dia <= limite` avança de 7 em 7
dias sem teto, e o campo do formulário (`Calendario.jsx:474`) é um `type="date"`
sem `max`.

**VERIFICADO** (ver apêndice, bloco E1, com `repetir_ate=2126-01-01`):

```
>>> resultado: {'ok': True, 'criadas': 5218, 'ignoradas': 0} em 6.9s
>>> linhas na tabela aulas: 5218
```

São 5.218 `INSERT`s, mais 5.218 `SELECT`s de verificação de duplicata (um por
iteração, `:150-156`), mais 5.218 `db.refresh()` depois do commit (`:165-166`).
Em MySQL com latência de rede isso são dezenas de milhares de round-trips numa
requisição só. Um erro de digitação no ano (2126 em vez de 2026) basta.

**Correção:** limitar `repetir_ate` a, digamos, 24 meses no validador Pydantic e
`max` no campo; substituir o `SELECT` por iteração por uma consulta única das
datas já ocupadas; remover o `refresh` em laço.

## E2 — MÉDIO — Leitura de arquivo sem limite em `/relatorios/lote`

`routers/relatorios.py:128`:

```python
valores = _primeira_coluna(arquivo.filename, arquivo.file.read())
```

`read()` sem argumento, sem verificação prévia de tamanho. Os outros uploads do
sistema são disciplinados — `importacoes.py:314` lê `LIMITE_ARQUIVO + 1`,
`materiais.py:260` e `whatsapp.py:1048` leem `limite + 1`. Só este não. O
`client_max_body_size 30m` do nginx é o único freio, e ele não existe no
`uvicorn` direto (caminho do systemd no README).

Além disso, `_ler_matriz`/`_primeira_coluna` passam o conteúdo bruto para
`openpyxl.load_workbook` e `xlrd.open_workbook` — um XLSX é um ZIP, e um zip
bomb de 30 MB expande para muito mais em memória.

## E3 — MÉDIO — `entregar_push` faz I/O de rede síncrono dentro do request e commita a transação do chamador

`services/notificacoes.py:134-177`. A função:

1. chama `webpush(...)` — **HTTP síncrono** — uma vez por inscrição ativa;
2. faz `db.commit()` no final (`:294`).

É chamada de `autocadastrar_professor` (`professores.py:348`) e de
`processar_pre_cadastro` (`integracoes.py:159`) — ou seja, **dentro de
requisições**. Um usuário que cadastra um professor espera o tempo de N
chamadas HTTP a serviços de push antes de receber a resposta, e um `commit`
que ele não pediu é executado no meio da sua transação.

`gerar_lembretes_aulas` (`:198-247`) roda um `SELECT COUNT` por usuário — N+1
sobre a tabela inteira de usuários, todo dia às 18h.

**Correção:** entregar push em `BackgroundTasks` (o padrão já usado em
`whatsapp.py:1008`) ou numa fila; nunca commitar a sessão de outro.

## E4 — MÉDIO — `_achar_aluno` derruba a geração em lote com 500

`routers/relatorios.py:106-117`:

```python
if v.replace(".0", "").isdigit():
    return db.get(Aluno, int(float(v)))
```

Para `"1.0.0"`, `replace` deixa `"1"` (`isdigit()` → True) e `float("1.0.0")`
levanta `ValueError` **não tratado**.

**VERIFICADO** (`_achar_aluno` chamada diretamente):

```
valor '1.0.0'    -> EXCECAO ValueError: could not convert string to float: '1.0.0'
valor '12.0'     -> None
valor '500.25'   -> None
```

Uma única célula malformada na planilha e o ZIP inteiro falha com erro genérico.
Repare também que `'500.25'` vira `'50025'` e é tratado como matrícula — mesma
raiz do **B2**, só que no backend.

## E5 — MÉDIO — Motor de banco criado no import: o app não importa sem `pymysql`

`app/database.py:8` executa `create_engine(settings.database_url)` em tempo de
importação. Qualquer `import app.routers.x` — inclusive nos testes, que usam
SQLite — exige `pymysql` instalado e uma URL de MySQL resolvível.

Constatado empiricamente nesta auditoria: a suíte inteira falhou com
`ModuleNotFoundError: No module named 'pymysql'` antes de eu instalar um driver
que os testes não usam.

**Correção:** criar o engine preguiçosamente (`@lru_cache def get_engine()`).

## E6 — BAIXO — `listar_mensagens` pagina em laço sem teto

`services/uazapi.py:149-163`: `while True` guiado pela resposta da UazAPI. Sai
se a página vier vazia ou se o total for atingido, mas um `totalRecords`
inconsistente mantém o laço buscando 1.000 mensagens por vez indefinidamente,
dentro de um request.

## E7 — BAIXO — `reenviar_falhos` ignora o limite de destinatários em massa

`whatsapp.py:2127-2264` não aplica `whatsapp_mass_max_recipients`, que
`criar_disparo` respeita (`:1461-1467`).

## E8 — BAIXO — Wildcards de `LIKE` não são escapados nas buscas

`alunos.py:68`, `materias.py:23`, `professores.py:124`, `leads.py:196-203`,
`whatsapp.py:527` interpolam o termo direto em `f"%{busca}%"`. Não é injeção de
SQL (os parâmetros são vinculados), mas `%` e `_` digitados pelo usuário viram
curingas: buscar `_` casa com tudo. Em tabelas grandes, `%` no início já impede
uso de índice.

## E9 — BAIXO — `docker image prune -f` é global no host

`redeploy.sh:158` remove imagens órfãs de **todo o Docker daemon**, não só do
projeto. Num host compartilhado, apaga camadas de outras aplicações.

## E10 — BAIXO — MySQL com senha de root igual à da aplicação

`docker-compose.yml:8-11` usa `${TOV_DB_PASSWORD}` tanto em
`MYSQL_ROOT_PASSWORD` quanto em `MYSQL_PASSWORD`. Quem obtiver a credencial da
aplicação tem root no banco.

---

# F. Testes, CI e ferramental

## F1 — ALTO — Nenhum teste passa pela camada HTTP; a matriz de perfis não é testada

Os 15 arquivos de teste chamam as funções de router **diretamente**:

```python
return presencas.abrir_chamada(self.turma.cod_tur, db=self.db)
```

Consequências:

- **`Depends(exigir_perfis(...))` nunca é exercitado.** Toda a matriz de
  autorização do `main.py:126-164` — o coração do controle de acesso, e a origem
  dos achados **A2** e **A4** — tem **zero cobertura**.
- A validação do Pydantic é contornada em boa parte das chamadas (instâncias são
  montadas à mão).
- Serialização de resposta, tratamento de erro e middlewares (CORS) não são
  verificados.
- Pior: a produção foi **moldada para acomodar isso**. `notas.py:80-82`,
  `presencas.py:53-54`, `materiais.py:53-54` e `whatsapp.py:1837-1839` têm
  guardas do tipo `if isinstance(user, str)` com o comentário *"Chamadas diretas
  nos testes não passam pela resolução de dependências"*. Ou seja, **a lógica de
  autorização tem um desvio embutido cuja única razão de existir é o formato dos
  testes** — e esse desvio silenciosamente não aplica restrição nenhuma.

**Correção:** usar `fastapi.testclient.TestClient` com
`app.dependency_overrides` para o banco, e testar cada perfil contra cada rota.
Depois, remover os `isinstance`.

## F2 — MÉDIO — Testes em SQLite, produção em MySQL

Todo `setUp` cria `create_engine("sqlite://")`. Ficam fora de teste:
`with_for_update` e `skip_locked` (`integracoes.py:203`, `whatsapp.py:1723`),
`LONGBLOB` de 4 GB (`models/materiais.py:26`), `func.replace` aninhado
(`services/financeiro.py:590-592`), a sensibilidade a maiúsculas do `LIKE` (que difere
entre SQLite e `utf8mb4_unicode_ci`), e todo o caminho MySQL-only de
`schema.py:507-530` — que o próprio arquivo admite não conseguir testar.

## F3 — MÉDIO — Não existe CI

Não há `.github/`, `.gitlab-ci.yml`, `Jenkinsfile` nem hook algum. Nada roda os
196 testes automaticamente. `pytest` **não está em `requirements.txt`** — não há
`pyproject.toml`, `setup.cfg` nem `pytest.ini`. A suíte só roda se alguém souber
invocar `python -m unittest discover -s tests -t .` a partir de `backend/`, o
que não está documentado em lugar nenhum.

## F4 — MÉDIO — Sem linter e sem formatador

Nenhum ESLint, Prettier, Ruff, Black, Flake8 ou mypy configurado. Os dois
comentários `// eslint-disable-line react-hooks/exhaustive-deps`
(`Materias.jsx:60`, `Professores.jsx:62`, `Usuarios.jsx:47`) suprimem um
linter que **não existe no projeto** — o que sugere que já existiu, ou que foram
copiados de outro lugar. O `check-design-system.mjs` é um linter próprio
excelente, mas cobre só tokens visuais.

## F5 — BAIXO — `check:bundle` existe e nunca roda

`package.json:8` define `"build": "npm run check:design && vite build"`.
`check:bundle` (`:10`), que impõe o orçamento de 350 KB do bundle inicial, **não
faz parte do build** nem de CI. Ele também só funciona depois do build (lê
`dist/assets/`), então a ordem correta seria `build && check:bundle`.
`check-bundle.mjs:2` ainda importa `join` sem usar.

## F6 — BAIXO — Dependências do service worker não declaradas

`frontend/src/sw.js` importa `workbox-precaching`, `workbox-expiration`,
`workbox-routing` e `workbox-strategies`. **Nenhum dos quatro está no
`package.json`** — resolvem hoje como dependência transitiva de
`vite-plugin-pwa`. Um bump do plugin que troque a versão do Workbox quebra o
build sem aviso.

## F7 — BAIXO — Zero teste de frontend

47 arquivos JS/JSX, incluindo lógica não trivial (`numeroDoCampo`,
`_mesclar_progresso`, `reconciliarChamada`, `totalLinha`), sem nenhum teste.
O achado **B2** teria sido pego por um único teste unitário de três linhas.

---

# G. Código morto e funcionalidades inalcançáveis

## G1 — ALTO — 16 endpoints autenticados não têm nenhuma tela

Comparação automatizada entre as 176 rotas do backend e todas as chamadas do
frontend (considerando método HTTP e paths dinâmicos):

| Método | Rota | O que está inalcançável |
| --- | --- | --- |
| GET | `/auth/me` | Revalidar sessão/perfil (ver **A5**) |
| POST | `/auth/trocar-senha` | **Usuário trocar a própria senha** (anunciado no README) |
| PUT | `/turmas/{cod_tur}` | **Editar nome, curso, horário e data da turma** |
| DELETE | `/turmas/{cod_tur}` | Excluir turma |
| PUT | `/turmas/{cod_tur}/materias/{docturma_id}` | Editar vínculo matéria×professor×período |
| PUT | `/financeiro/cobrancas/{id}` | **Corrigir valor, vencimento ou descrição de uma cobrança** |
| DELETE | `/financeiro/cobrancas/{id}` | Excluir cobrança |
| PUT | `/financeiro/cobrancas/{id}/status` | **Cancelar, isentar ou reabrir um título** |
| GET | `/financeiro/cobrancas/{id}/pagamentos` | Histórico de baixas do título |
| POST | `/notas/aluno/{cod_alu}` | Lançar nota avulsa (única via para `dispensa`) |
| PUT | `/notas/{alunota_id}` | Editar um lançamento individual |
| DELETE | `/notas/{alunota_id}` | Excluir um lançamento |
| GET | `/notas/turma/{t}/materia/{m}` | Rota de compatibilidade legada |
| GET | `/professores/{cod_pro}` | Ficha do professor (matérias + títulos) |
| PUT | `/professores/{cod_pro}/materias` | **Definir as matérias que o professor leciona** |
| GET | `/leads/{lead_id}` | **Trilha de auditoria de consentimento (LGPD)** |

Os de maior impacto operacional: **não é possível editar uma turma depois de
criada** (errou o nome, errou o horário — só no banco); **não é possível
cancelar nem isentar uma cobrança pela tela**, embora a regra exista e esteja
testada; e **a auditoria de consentimento de lead**, construída com todo cuidado
em `LeadConsentimentoEvento` e devolvida por `GET /leads/{id}`, **nunca é
exibida** — exatamente o artefato que se quer ter à mão numa questão de LGPD.

## G2 — MÉDIO — `titprof` é uma tabela em que nada pode escrever

`TitProf` (`models/pessoas.py:98-105`) aparece em exatamente dois lugares:
um `SELECT` em `professores.py:200-203` (dentro de `GET /professores/{cod_pro}`,
que **não tem tela**, ver G1) e um `DELETE` em cascata quando o professor é
excluído (`:258`). **Não existe endpoint que crie ou edite um título.** É uma
tabela criada em todo banco, indexada, e que nunca receberá uma linha.

## G3 — MÉDIO — `matprof` foi substituído por texto livre, mas continua de pé

`MatProf` só é escrito por `PUT /professores/{cod_pro}/materias`, que não tem
tela. O formulário usa `materias_atuacao` (texto livre), com o helper explícito:
*"Texto informativo; os vínculos oficiais continuam sendo feitos nas turmas"*
(`Professores.jsx:314`). A tabela, o endpoint, a `UniqueConstraint`, o índice e
o bloco de reparo em `schema.py:169-186` são todos manutenção de algo aposentado.

## G4 — MÉDIO — Comunicados de turma não chegam a ninguém — e travam a exclusão da turma

`ComunicadoTurma` tem CRUD completo em `portal_professor.py:477-529` e status
`RASCUNHO`/`PUBLICADO`. O único leitor é
`GET /portal-professor/turmas/{docturma_id}` — **a própria tela do professor que
escreveu**. Não há portal do aluno, não há visão da secretaria, não há entrega
por WhatsApp. Um comunicado "PUBLICADO" é lido por uma pessoa: o autor.

Pior: `turmas.py:175-188` e `:407-416` **impedem excluir a turma ou o vínculo**
enquanto houver comunicados — e a secretaria, que faz a exclusão, **não tem
tela onde vê-los ou removê-los**. Só o professor pode apagá-los, na tela dele.
Isso é um beco sem saída operacional: "Turma possui 3 comunicado(s); remova-os
antes" sem nenhum lugar onde removê-los.

## G5 — BAIXO — Dois listeners de `push` registrados no service worker

`frontend/src/sw.js:47` e `:74` registram `self.addEventListener('push', ...)`
separadamente. Os dois disparam a cada push. O primeiro exibe a notificação; o
segundo só reposta mensagem para as janelas. Funciona, mas é claramente um
merge malfeito — o segundo bloco deveria estar dentro do primeiro.

## G6 — BAIXO — `TOV.fontMono` aponta para uma fonte que nunca é carregada

`theme.js:89` define `fontMono: "'JetBrains Mono', ui-monospace, …"`.
JetBrains Mono **não está no `package.json` nem em `fonts.css`**. Os três usos
(`FinanceiroAlunoPainel.jsx:298`, `FinanceiroConciliacao.jsx:260`,
`MinhasFinancas.jsx:128` — todos exibindo chave PIX) caem no fallback do
sistema. Ou se carrega a fonte, ou se remove o nome do token.

## G7 — BAIXO — Campos enviados e ignorados em `/notas/lancar`

`Notas.jsx:303-307` envia `cod_tur`, `cod_mat`, `cod_pro`, `ano` e `semestre`.
Quando `docturma_id` está presente — sempre, no fluxo da tela — o backend
ignora os cinco e usa os do vínculo (`notas.py:539-546`).

---

# H. Tempo, fuso e formatação

## H1 — ALTO — Três convenções de data/hora coexistem no mesmo banco

| Convenção | Função | Onde |
| --- | --- | --- |
| **Hora local do servidor** (ingênua) | `datetime.now()` | **31 chamadas** em `services/financeiro.py`, `routers/financeiro.py`, `materiais.py`, `calendario.py`, `importacoes.py`, `professores.py`, `integracoes.py` |
| **UTC** (ingênua) | `agora_utc()`, `_agora_utc()`, `_agora()` | `notificacoes.py`, `presencas.py`, `leads.py`, `portal_professor.py`, `whatsapp.py` |
| **America/Sao_Paulo** (ingênua) | `agora_local()`, `_hoje_local()` | `notificacoes.py`, `presencas.py` |

Nenhuma delas grava offset. O `docker-compose.yml` **não define `TZ`**, então a
hora local do contêiner é UTC — o que faz a primeira convenção coincidir com a
segunda *por acaso*, e **apenas no Docker**. No caminho do systemd descrito no
`README.md:99-102`, a hora local do servidor será provavelmente
America/Sao_Paulo, e as duas divergem em 3 horas.

O frontend trata as duas de forma diferente: `NotificationCenter.jsx:23`
acrescenta `"Z"` explicitamente; `Materiais.jsx:29` e `TurmaProfessor.jsx:31`
não.

**VERIFICADO** — mesmo instante, duas leituras na tela:

```
notificacao  -> 14/09/2026, 17:30:00   (correto: soma o Z)
material     -> 14/09/2026, 20:30:00   (interpretado como hora local do navegador)
```

Hoje, no Docker, **todo carimbo de material didático, cobrança, pagamento,
convite de professor e importação aparece 3 horas adiantado** para o usuário
brasileiro.

**Correção:** uma única função `agora()` devolvendo UTC ingênuo, usada em todo
lugar; e um único helper no frontend que sempre acrescenta o `Z`. Como
`datetime.now()` no Docker já é UTC, a migração dos dados existentes é
provavelmente um no-op — mas isso precisa ser confirmado por deployment antes de
mexer.

## H2 — MÉDIO — Fuso horário fixo no código do frontend

`TOV_TIMEZONE` é configurável no backend (`config.py:30`), mas o frontend crava
`timeZone: 'America/Sao_Paulo'` em `PresencaTotem.jsx:29`,
`PresencasTurma.jsx:40,47` e `DiarioClasse.jsx:37`. Trocar a configuração do
servidor deixa as duas pontas em fusos diferentes.

## H3 — BAIXO — Datas em ISO na ficha do aluno

`AlunoDetalhe.jsx:201` e `:331` exibem `aluno.dat_nas` e `form.membro_desde`
crus (`1990-05-12`), enquanto `formatarDataBr` existe em `formatters.js:36` e é
usada no financeiro. Inconsistência visível entre telas.

---

# I. Frontend — corretude e UX

## I1 — ALTO — Campo de matéria aplica `.trim()` no `value`: impossível digitar duas palavras

`frontend/src/pages/Materias.jsx:200` e `:204`:

```jsx
<TextField ... value={form.NOME?.trim() ?? ''} onChange={(e) => setForm({ ...form, NOME: e.target.value })} />
```

O `value` de um input controlado é recalculado a cada tecla. Digitar
`"Novo "` grava `"Novo "` no estado, mas renderiza `"Novo"` — **o espaço
desaparece na hora**. A próxima letra chega como `"NovoT"`.

Efeito prático: o nome da matéria sai **`NovoTestamento`** em vez de
`Novo Testamento`. O mesmo vale para o campo Apelido. Só se contorna colando o
texto ou digitando o espaço no meio da palavra e voltando o cursor.

**Correção:** `value={form.NOME ?? ''}` e aplicar o `trim()` no envio
(`salvar`), não na renderização.

## I2 — MÉDIO — Diálogo de exclusão de aluno promete o que a API recusa

`AlunoDetalhe.jsx:306`: *"Excluir o aluno X? **Todas as notas e matrículas dele
serão perdidas.** Esta ação não pode ser desfeita."*

`alunos.py:152-160` faz exatamente o contrário: **recusa** a exclusão se houver
qualquer `AluNota`, com a mensagem *"Aluno possui N lançamentos de notas. Altere
o status para inativo em vez de excluir."*

O usuário é levado a acreditar que está prestes a destruir o histórico, hesita,
confirma — e recebe um erro. A mensagem certa é a do backend.

## I3 — MÉDIO — Consentimento editado manualmente grava a origem errada na auditoria

`leads.py:109-123` (chamada em `:422`):

```python
_registrar_consentimento(db, lead, novo_consentimento,
    origem=_texto(dados.consentimento_origem) or "EDICAO_MANUAL", ...)
```

`Leads.jsx:174-178` monta o formulário com `{...FORM_INICIAL, ...lead}`, então
`consentimento_origem` volta preenchido com a origem **antiga** (ex.
`"PLANILHA:base-julho.xlsx"`). O fallback `"EDICAO_MANUAL"` nunca é alcançado
para leads importados, e o evento de auditoria registra que o consentimento veio
da planilha quando, de fato, alguém o alterou à mão na tela. Isso corrompe
justamente o registro cuja razão de existir é provar a origem do opt-in.

## I4 — MÉDIO — Diário em PDF usa `cod_mat` e pode trazer o professor errado

`TurmaDetalhe.jsx:283` e `:324` chamam
`/relatorios/diario/{codTur}?cod_mat={m.cod_mat}`. `pdf/diario.py:31-38` então
faz `db.scalar(select(DocTurma).where(cod_tur, cod_mat))` — com a mesma matéria
vinculada em dois períodos, pega **um qualquer**, e imprime o professor e o
período desse. O parâmetro `docturma_id` existe na API e é usado corretamente em
`Notas.jsx:424`.

## I5 — BAIXO — Autocompletes não são limpos ao reabrir o diálogo de matéria

`TurmaDetalhe.jsx:118-125`: `abrirDlgMateria` reseta `formMateria`, mas os dois
`Autocomplete` (`:365-378`) são **não controlados** (sem prop `value`). Ao
reabrir, o rótulo da matéria escolhida antes continua na tela enquanto
`formMateria.cod_mat` está vazio — o botão fica desabilitado sem motivo
aparente.

## I6 — BAIXO — Busca numérica nunca casa nome

`alunos.py:65-68`: se `busca.isdigit()`, a consulta vira `cod_alu == int(busca)`
e **abandona** a busca por nome. O placeholder diz "Buscar por nome ou
matrícula" (`Alunos.jsx:194`). Buscar um trecho de telefone ou um nome que
comece com número não retorna nada.

## I7 — BAIXO — Status "Trancado" existe no sistema e não está nos formulários

`MAPA_STATUS` (`ui.jsx:386-392`) e `AlunoDetalhe.jsx:109` reconhecem `T` =
Trancado. O `<Select>` de status em `AlunoForm.jsx:188-196` oferece só P/A/I/F, e
os recortes de `Alunos.jsx:29-36` também. Editar um aluno trancado abre um
select com valor fora das opções (MUI renderiza vazio e emite aviso no console).

## I8 — BAIXO — Sem saída do modo totem

`PresencaTotem.jsx` não tem nenhum `navigate`, botão "voltar" ou saída. Depois
de `PresencasTurma.jsx:160` levar o operador para `/presenca/{token}`, o único
caminho de volta é o botão do navegador ou editar a URL — numa tela desenhada
como quiosque em tela cheia, com `wakeLock` e `overscrollBehavior: none`.

## I9 — BAIXO — Grade do calendário só aceita mouse

`CalendarioGrade.jsx:157`: criar aula por duplo clique num `Box` sem `role`,
`tabIndex` nem handler de teclado. A dica na tela (`Calendario.jsx:317`) ensina
só esse caminho. Teclado e leitor de tela não têm equivalente no desktop (o
celular tem o botão "+ Aula").

## I10 — BAIXO — `revokeObjectURL` imediato pode cancelar o download

`api.js:130` e `:188` revogam o blob URL na linha seguinte ao `a.click()`.
`abrirArquivo` (`:162`) faz certo, com `setTimeout` de 60 s. A revogação síncrona
é uma corrida conhecida em alguns navegadores; a inconsistência entre as três
funções sugere que já houve problema em uma delas.

## I11 — BAIXO — `BottomNavigation` com valor fora das opções

`Layout.jsx:339-357` calcula `valorNavegacao` para rotas (`/notas`,
`/materiais`, `/leads`) que não estão entre os `BottomNavigationAction` do
perfil correspondente. MUI então não marca nada como selecionado e emite aviso.

---

# J. Hipóteses investigadas que NÃO se confirmaram

Registradas para que ninguém "corrija" código correto:

1. **Vínculo duplicado com professor nulo.** `_vinculo_duplicado`
   (`turmas.py:293-299`) compara `DocTurma.cod_pro == dados.cod_pro`. Parecia
   permitir duplicatas quando `cod_pro` é `None` (`NULL = NULL` nunca é
   verdadeiro em SQL). **Não é o caso:** o SQLAlchemy converte `== None` em
   `IS NULL` na construção da consulta. Reproduzido: a segunda inserção é
   corretamente barrada com 400.

2. **`criar_notificacao` deixando a sessão quebrada.** O `try/except` que
   engole a falha do `flush` dentro de `with db.begin_nested()`
   (`services/notificacoes.py:61-99`) parecia fazer o savepoint ser commitado em estado
   de erro. **Não é o caso:** o gerenciador de contexto do SQLAlchemy faz
   rollback do savepoint corretamente. Reproduzido: a sessão continua utilizável.

3. **Nome de arquivo dos materiais no download.** O regex
   `/filename="?([^"]+)"?/i` (`api.js:182`) não casa o
   `filename*=UTF-8''…` que `materiais.py:312` envia. **Não causa problema:**
   `Materiais.jsx:154` passa `material.nome_arquivo` como `nomePadrao`, e o
   fallback entrega o nome correto.

4. **Fuso do agendamento de WhatsApp.** É o único lugar que trata fuso
   corretamente: `datetime-local` → `toISOString()` → `astimezone(utc)` no
   backend → UTC ingênuo, e `valorDataLocal` (`WhatsApp.jsx:81-83`) faz a volta
   certa. Serve de modelo para corrigir o **H1**.

5. **`formatarCpfInput`.** A cadeia de três `replace` parecia frágil; testada
   com 11 dígitos, produz `123.456.789-01` corretamente.

6. **Segredos versionados.** Varredura no working tree e nos 65 commits: nenhuma
   chave, token ou senha hardcoded. `backend/.env.example` é template e
   `frontend/.env.production` só contém URLs públicas.

---

# K. Configuração e documentação

## K1 — MÉDIO — `.env.example` está defasado em relação a `config.py`

Comparação automática entre `config.py`, `.env.example` e `docker-compose.yml`:

| Setting | `.env.example` | `docker-compose.yml` |
| --- | --- | --- |
| `TOV_VAPID_PUBLIC_KEY` | **falta** | sim |
| `TOV_VAPID_PRIVATE_KEY` | **falta** | sim |
| `TOV_VAPID_SUBJECT` | **falta** | sim |
| `TOV_TIMEZONE` | **falta** | sim |
| `TOV_MATERIAIS_UPLOAD_MAX_MB` | **falta** | sim |
| `TOV_TOKEN_EXPIRE_MINUTES` | **falta** | **falta** |
| `TOV_DB_PORT` | sim | **falta** |

Quem seguir o caminho não-Docker do README (venv + systemd, `README.md:97-102`)
copia o `.env.example` e fica **sem Web Push e sem fuso configurado**, embora o
README documente as duas coisas em detalhe (`README.md:195-210`).

## K2 — MÉDIO — `TOV_SECRET_KEY` acopla JWT e criptografia do token da UazAPI

`services/uazapi.py:27-29` deriva a chave Fernet de
`sha256(settings.secret_key)`. O README avisa (`:186-188`), e
`descriptografar_token` dá uma mensagem de erro boa. Ainda assim, uma rotação de
chave JWT — operação de segurança rotineira, esperada depois de um incidente —
**inutiliza a integração do WhatsApp**, exigindo reconfigurar a instância. As
duas chaves deveriam ser independentes (`TOV_ENCRYPTION_KEY`).

## K3 — BAIXO — nginx sem cabeçalhos de segurança

`deploy/nginx-tov.conf` e `frontend/nginx.conf` não definem
`Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy` nem `Content-Security-Policy`. Para uma SPA que guarda o JWT
em `localStorage` (`api.js:13`), uma CSP é a principal defesa contra
exfiltração de sessão por XSS.

## K4 — BAIXO — Location de regex do nginx pode sombrear `/api/`

`frontend/nginx.conf:36`:

```nginx
location ~* \.(?:js|css|woff2|svg|png|ico)$ { try_files $uri =404; }
```

No nginx, um `location` de regex que casa **vence** o prefixo `location /api/`
(a menos que este use `^~`). Hoje nenhuma rota da API termina nessas extensões,
então não há quebra — mas qualquer endpoint futuro terminado em `.js`, `.png` ou
`.svg` passará a devolver 404 em vez de chegar ao backend. Uma armadilha
esperando.

## K5 — BAIXO — `Code.gs` com URL de produção fixa e acoplamento frágil ao Forms

`integracoes/google-forms/Code.gs`:

- linha 1: `https://centro-tov.kafune.xyz/api/...` **fixo no código** — não há
  como apontar para homologação sem editar o arquivo;
- `montarPayload` (`:162-189`) casa os cabeçalhos por **string exata**, com
  pontuação (`'Telefone:'`, `'Igreja da qual é membro?'`, e uma pergunta de 118
  caracteres). Renomear qualquer pergunta no Forms faz o campo virar string
  vazia **em silêncio** — não há validação de que algum cabeçalho casou;
- `identidadeLinha` (`:191-204`) inclui o **número da linha** no hash de
  identidade. Inserir ou excluir uma linha na planilha de respostas muda o
  `inscricao_id` de **todas as linhas abaixo**, e a reimportação cria
  pré-cadastros duplicados (a deduplicação passa a depender só de CPF/e-mail);
- `instalarGatilho` (`:38-42`) agenda o gatilho a cada **1 minuto** — um poll
  permanente contra a API de produção, indefinidamente.

## K6 — BAIXO — Planos e specs de `docs/superpowers/` são artefatos de processo

`docs/superpowers/plans/` e `specs/` contêm quatro documentos datados de
julho/agosto de 2026 descrevendo trabalho já entregue. Não são documentação de
referência (essa é `docs/financeiro.md` e `docs/leads-marketing.md`, ambas boas).
Convém mover para fora do repositório ou marcar como histórico, para não serem
lidos como especificação corrente.

---

# L. O que está bem-feito

Registrar isto importa tanto quanto os defeitos — são as decisões que devem ser
preservadas em qualquer refatoração:

- **Modelo financeiro.** "Vencida" e "parcial" são derivadas de data e soma de
  pagamentos, nunca gravadas (`services/financeiro.py:12-13`, `:130-142`).
  Nenhuma linha envelhece sozinha e não existe rotina noturna para virar
  cobrança em atraso. É a decisão de modelagem mais acertada do projeto.
- **Geração idempotente** de cobranças pela chave lógica
  `(aluno, turma, tipo, parcela)`, com `UniqueConstraint` correspondente
  (`models/financeiro.py:96-102`).
- **Comentários que explicam a intenção**, não o código. Exemplos:
  `models/financeiro.py:44-52` (por que a condição do aluno existe),
  `presencas.py:609-611` (por que a chamada retroativa nasce encerrada),
  `whatsapp.py:1612-1614` (por que as métricas não podem regredir).
- **`_mesclar_progresso`** (`whatsapp.py:1598-1683`) — consolidação monotônica
  de métricas vindas de uma API externa que responde fora de ordem. Cuidadoso e
  correto.
- **Auditoria de consentimento de leads** (`LeadConsentimentoEvento`) — modelo
  de como fazer trilha de auditoria. Só falta exibi-la (**G1**).
- **`check-design-system.mjs`** — linter próprio que impõe grid de 4px, tokens de
  cor, escala tipográfica e proíbe `window.confirm`. Roda no build. Raro e
  valioso.
- **PWA disciplinado.** `sw.js:26-30` marca `/api/` como `NetworkOnly`
  explicitamente: nenhuma resposta autenticada é cacheada. O README afirma isso
  e o código cumpre.
- **`redeploy.sh`** — `set -Eeuo pipefail`, `trap ERR`, validação de cada
  variável, recusa a rodar com working tree sujo, health check com retentativa,
  rollback informativo. Script de deploy de qualidade acima da média.
- **Acessibilidade** levada a sério: skip link (`Layout.jsx:452`), `aria-label`
  em ações de ícone, `aria-current="page"`, foco gerenciado na troca de rota
  (`Layout.jsx:359-367`), `prefers-reduced-motion` (`theme.js:243-251`).
- **Proteção contra perda de trabalho** — `UnsavedChanges` + `useBlocker` do
  router + `beforeunload`, aplicada de forma consistente em todos os formulários.

---

# M. Prioridade sugerida

**Agora (privilégio e dinheiro):**

1. **A1** — corrigir `criar_usuario.py` e o README; **auditar os perfis das
   contas existentes em produção**.
2. **A2** — tirar PROFESSOR do módulo WhatsApp.
3. **B1** — limitar a baixa ao saldo e exigir conferência de valor na
   conciliação por referência.
4. **B2** — corrigir `numeroDoCampo`.
5. **C1** — impedir (ou explicitar) a exclusão de aula com chamada.

**Em seguida (perda silenciosa de registro):**

6. **C2** — parar de apagar `dispensa`; decidir se o campo fica ou sai.
7. **C3** — explicitar que matricular transfere.
8. **C4** — tirar o reparo destrutivo do boot.
9. **H1** — unificar em uma única convenção de data/hora.
10. **D1** — amarrar a turma ao token do calendário público.

**Depois (estrutural):**

11. **F1** — migrar os testes para `TestClient` e cobrir a matriz de perfis;
    remover os desvios `isinstance(user, str)` da produção.
12. **F3/F4** — CI rodando os 196 testes, `pytest` no `requirements.txt`, linter.
13. **G1** — decidir, endpoint a endpoint: ganha tela ou é removido.
14. **A6/A7** — rate limiting no login e troca de senha pelo próprio usuário.

---

## Apêndice — inventário

| | |
| --- | --- |
| Arquivos versionados | 158 |
| Rotas da API | 176 (165 autenticadas, 11 públicas/webhook) |
| Modelos SQLAlchemy | 43 tabelas |
| Routers | 19 arquivos |
| Páginas React | 34 |
| Testes | 196, todos passando |
| Maior arquivo backend | `routers/whatsapp.py` (2.243 linhas) |
| Maior arquivo frontend | `pages/WhatsApp.jsx` (1.764 linhas) |
| Migrações | nenhuma (sem Alembic; `create_all` + `schema.py`) |
| CI | nenhuma |
| Linters | 1 (próprio, só design system) |

### Como reproduzir os achados verificados

A partir de `backend/`, com as dependências instaladas
(`pip install -r requirements.txt`), o script abaixo reproduz os quatro achados
mais graves contra um SQLite em memória, usando as funções reais da aplicação.

```python
# salve como backend/verificar_auditoria.py e rode: python verificar_auditoria.py
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import *
from app.services import financeiro as S
from app.services.faltas import faltas_do_vinculo
from app.routers import presencas as P, calendario as C, notas as N
from app.security import gerar_hash

def nova_sessao():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False},
                        poolclass=StaticPool)
    Base.metadata.create_all(eng)
    return sessionmaker(bind=eng, expire_on_commit=False)()

# ---- A1: criar_usuario.py concede ADMIN ------------------------------------
db = nova_sessao()
db.add(Usuario(user="SECRETARIA", senha_hash=gerar_hash("senha123")))  # linha 40 do script
db.commit()
print("A1  perfil de 'SECRETARIA':", db.get(Usuario, "SECRETARIA").perfil)   # -> ADMIN

# ---- B1: conciliação sobrepaga e ignora o valor ----------------------------
db = nova_sessao()
al = Aluno(nome="Ana Souza"); db.add(al); db.commit()
c = S.criar_cobranca(db, cod_alu=al.cod_alu, cod_tur=None, plano_id=None,
                     tipo="MENSALIDADE", descricao="Mensalidade 1/12",
                     valor=Decimal("200.00"), vencimento=date(2026, 9, 10),
                     parcela=1, total_parcelas=12)
db.commit(); S.configuracao(db); db.commit()
tx = TransacaoBancaria(identificador="E2E-1", meio="PIX", valor=Decimal("2000.00"),
                       data=date(2026, 9, 10), referencia=c.referencia, status="PENDENTE")
db.add(tx); db.flush(); S.processar_recebimento(db, tx); db.commit()
print("B1  cobranca de R$200 ->", c.status, "| pago:", S.total_pago(db, c.id))  # PAGA | 2000.00

# ---- C1: excluir aula apaga as faltas --------------------------------------
db = nova_sessao()
t = Turma(nome="T"); m = Materia(NOME="Homiletica")
a1 = Aluno(nome="Ana"); a2 = Aluno(nome="Bruno")
db.add_all([t, m, a1, a2]); db.flush()
db.add_all([AluTurma(cod_tur=t.cod_tur, cod_alu=a1.cod_alu, status="A"),
            AluTurma(cod_tur=t.cod_tur, cod_alu=a2.cod_alu, status="A")])
dt = DocTurma(cod_tur=t.cod_tur, cod_mat=m.cod_mat); db.add(dt); db.flush()
hoje = date(2026, 9, 14)
aula = Aula(docturma_id=dt.id, data=hoje, status="AGENDADA"); db.add(aula); db.commit()
with patch.object(P, "_hoje_local", return_value=hoje), \
     patch.object(P, "_agora_utc", return_value=datetime(2026, 9, 14, 22, 0)):
    ch = P.abrir_chamada(t.cod_tur, P.AbrirChamadaInput(aula_id=aula.id), db=db)
    P.marcar_presenca(ch["token"], P.MarcarPresencaInput(cod_alu=a1.cod_alu), db=db)
    P.encerrar_chamada(t.cod_tur, ch["id"], db=db)
print("C1  faltas antes:", faltas_do_vinculo(db, dt.id))          # {2: 1}
C.excluir_aula(aula.id, db=db)
print("C1  faltas depois:", faltas_do_vinculo(db, dt.id),
      "| presencas orfas:", db.scalar(select(func.count()).select_from(Presenca)))  # {} | 2

# ---- C2: dispensa apagada ao salvar a grade --------------------------------
db.add(AluNota(cod_alu=a1.cod_alu, cod_mat=m.cod_mat, cod_tur=t.cod_tur,
               docturma_id=dt.id, dispensa="S", status="L")); db.commit()
print("C2  dispensa antes:", db.scalar(select(AluNota.dispensa)))
N.lancar(N.LancamentoInput(docturma_id=dt.id, alunos=[
    N.LancamentoAluno(cod_alu=a1.cod_alu, nota=8.0, cursou="S")]), db=db, user=None)
print("C2  dispensa depois:", db.scalar(select(AluNota.dispensa)))   # None

# ---- E1: repetição de aula sem limite --------------------------------------
db = nova_sessao()
t = Turma(nome="T"); m = Materia(NOME="M"); db.add_all([t, m]); db.flush()
dt = DocTurma(cod_tur=t.cod_tur, cod_mat=m.cod_mat); db.add(dt); db.commit()
r = C.criar_aulas(C.AulaInput(docturma_id=dt.id, data=date(2026, 1, 1),
                              repetir_ate=date(2126, 1, 1)), db=db)
print("E1  aulas criadas numa requisicao:", r["criadas"])            # 5218
```

E o **B2**, em Node:

```js
// numeroDoCampo, copiado de frontend/src/pages/FinanceiroComum.jsx:52
const numeroDoCampo = (texto) => {
  const limpo = String(texto ?? '').replace(/\./g, '').replace(',', '.').trim()
  if (!limpo) return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}
for (const v of ['1.200,50', '200,00', '200.50', '50.00'])
  console.log(v, '->', numeroDoCampo(v))
// 1.200,50 -> 1200.5   200,00 -> 200   200.50 -> 20050   50.00 -> 5000
```
