# Leads e nutrição via WhatsApp

## Escopo implementado

O módulo mantém `alunos` e `leads` em bases independentes. Leads podem ser
criados manualmente ou importados de CSV/XLS/XLSX, segmentados no wizard do
WhatsApp e acompanhados no mesmo histórico de campanhas já usado pelo sistema.

O fluxo entregue é:

1. importar arquivo e gerar uma prévia persistida;
2. validar telefone, consentimento e duplicidade por telefone;
3. confirmar a importação e gerar o relatório;
4. segmentar a base por seleção, campanha, origem, tag ou estágio do funil;
5. revisar o público e a composição;
6. enviar ou agendar pela infraestrutura UazAPI existente;
7. acompanhar envio, entrega, leitura, reprodução, respostas e opt-outs;
8. processar `SAIR` e expressões equivalentes no webhook, inativando o lead.

## Modelo de dados

### `leads`

Cadastro principal. O telefone normalizado (`55` + DDD + número) é único.
Registra nome, telefone, e-mail, origem, campanha, data de captação, tags,
status cadastral, status do funil, consentimento e timestamps de opt-out.

Estados de consentimento:

- `PENDENTE`: não há prova de opt-in; o lead não recebe marketing;
- `CONFIRMADO`: apto a campanhas enquanto estiver ativo;
- `RECUSADO`: a origem informou ausência de consentimento;
- `REVOGADO`: houve opt-out; importações posteriores não reativam o lead.

### `lead_consentimento_eventos`

Trilha imutável de auditoria com estado anterior/novo, origem, operador,
detalhes e data. É preenchida em cadastro, edição, importação e opt-out.

### `lead_importacoes` e `lead_importacao_itens`

Guardam a prévia e o relatório de cada arquivo. Cada linha recebe uma ação:
`CRIAR`, `ATUALIZAR`, `IGNORAR` ou `ERRO`.

### `lead_interacoes`

Guarda respostas recebidas pelo webhook. O ID externo é único e torna o
processamento idempotente. A interação referencia o lead e, quando encontrada,
a última campanha de marketing enviada a ele.

### Extensões do WhatsApp

- `whatsapp_destinatarios.lead_id` relaciona o destinatário à base de leads;
- `whatsapp_disparos` ganhou categoria da API, finalidade, respostas e opt-outs;
- `whatsapp_templates` ganhou categoria da API e finalidade.

## Importação

Cabeçalhos obrigatórios:

- `Nome`;
- `Telefone`, `Celular` ou `WhatsApp`.

Cabeçalhos opcionais reconhecidos:

- `E-mail`;
- `Origem` ou `Fonte`;
- `Campanha`;
- `Data de captação`;
- `Tags` ou `Segmento`;
- `Status do funil`;
- `Opt-in`, `Consentimento` ou `Status de consentimento`.

Sem consentimento, a regra é `PENDENTE`. Valores afirmativos explícitos
produzem `CONFIRMADO`; negativos produzem `RECUSADO`. Duplicatas dentro do
arquivo são ignoradas. Um telefone já existente é apresentado como atualização.

A integração atual do Google Forms permanece exclusiva do formulário acadêmico
de alunos. O modal explica essa indisponibilidade para evitar mistura de bases.
Um funil de captação próprio pode usar o mesmo desenho de polling do Apps Script,
mas deve ter mapeamento e credencial próprios antes de ser habilitado.

## API

### Leads

- `GET /leads`: lista com busca e filtros;
- `GET /leads/opcoes`: origens, campanhas, tags e estágios disponíveis;
- `GET /leads/{id}`: cadastro e auditoria de consentimento;
- `POST /leads`: cria;
- `PUT /leads/{id}`: atualiza;
- `POST /leads/importacoes/previa`: recebe planilha multipart;
- `POST /leads/importacoes/{id}/confirmar`: aplica uma prévia;
- `GET /leads/importacoes`: últimos relatórios.

### WhatsApp

O contrato de `publico` aceita `tipo: "leads"` com:

- `segmento_leads`: `todos`, `selecionados`, `campanha`, `origem`, `tag` ou
  `status_funil`;
- `lead_ids`, `campanha`, `origem`, `tag` ou `status_funil`, conforme o segmento.

`categoria_api` aceita `MARKETING`, `UTILIDADE` ou `AUTENTICACAO`.
`finalidade` aceita `NUTRICAO`, `COMERCIAL` ou `OPERACIONAL`.

Para leads, o backend exige categoria `MARKETING`, finalidade de nutrição ou
comercial e acrescenta ao último item da composição:

> Para não receber mais mensagens, responda SAIR.

Essa garantia também é reaplicada quando um agendamento é editado.

## Permissões

Perfis disponíveis:

- `ADMIN`: acesso acadêmico, marketing e administração;
- `SECRETARIA`: módulos acadêmicos e públicos acadêmicos do WhatsApp;
- `MARKETING`: Leads e públicos de leads do WhatsApp.

Os filtros de interface são apenas conveniência; as mesmas regras são
verificadas pelo backend.

## Webhook e métricas

O webhook UazAPI passa a assinar `messages` e exclui mensagens da própria API,
mensagens `fromMe` e grupos. Uma resposta de lead incrementa
`total_respostas`. Uma resposta de opt-out também:

- muda o consentimento para `REVOGADO`;
- inativa o lead;
- registra auditoria e interação;
- incrementa `total_optouts` na campanha relacionada.

Eventos repetidos não alteram as métricas novamente.

## Limite de massa

`TOV_WHATSAPP_MASS_MAX_RECIPIENTS` define o máximo de destinatários válidos por
campanha (padrão: `1000`). O limite é aplicado antes de criar a fila. Os atrasos
mínimo/máximo já existentes continuam controlando a cadência da UazAPI.

O valor deve ser ajustado ao plano, à qualidade e às regras vigentes da conta
usada no WhatsApp; o sistema não tenta inferir esse tier.

## Limitação da integração atual

A categoria e a finalidade ficam validadas e auditadas no TOV, mas o transporte
atual usa o endpoint de campanhas da UazAPI. Ele não cadastra nem submete
templates para aprovação na API oficial do WhatsApp Business Cloud.

Portanto, a implementação impede classificações internas incorretas, mas a
aprovação oficial de templates e os tiers oficiais de mensageria só podem ser
garantidos ao trocar/adicionar um adaptador da Cloud API da Meta (ou um BSP
oficial que exponha esses contratos). A interface deixa esse limite explícito.
