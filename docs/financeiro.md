# Financeiro — cobranças, baixas e conciliação bancária

Área de tesouraria do TOV Acadêmico. Cobre a matrícula inicial e as
mensalidades de cada turma, a baixa dos pagamentos, a consulta do próprio
aluno e a identificação automática de PIX e boletos informados pelo banco.

## O modelo em uma frase

**Turma tem plano. Plano gera cobranças por aluno. Cobrança recebe
pagamentos. Recebimento do banco vira pagamento quando o sistema descobre a
qual cobrança pertence.**

| Tabela | Papel |
| --- | --- |
| `planos_financeiros` | Regra da turma: matrícula, mensalidade, nº de parcelas, dia de vencimento |
| `cobrancas` | Título de um aluno (`MATRICULA`, `MENSALIDADE` ou `AVULSA`) |
| `pagamentos` | Baixa total ou parcial de uma cobrança |
| `transacoes_bancarias` | Aviso de crédito PIX/boleto, antes de virar baixa |
| `acessos_financeiro_aluno` | Link pessoal de consulta do aluno |
| `configuracao_financeira` | Chave PIX exibida ao aluno e regras da conciliação |

### Status gravado × situação exibida

A coluna `status` guarda só o que é decisão administrativa: `ABERTA`, `PAGA`,
`CANCELADA`, `ISENTA`. **Vencida** e **parcial** nunca são gravadas — saem da
data de hoje e da soma dos pagamentos. Assim nenhuma linha do banco envelhece
sozinha e não existe rotina noturna para "virar" cobrança em atraso.

## Fluxo da secretaria

1. **Financeiro › turma › plano.** Informe matrícula, mensalidade, quantidade
   de parcelas e o dia do vencimento. Salvar não cobra ninguém.
2. **Gerar cobranças.** Cada aluno matriculado na turma recebe a matrícula e
   as mensalidades que ainda não tem. A operação é idempotente: matriculou
   mais gente depois, gere de novo — quem já foi cobrado não duplica, porque a
   chave lógica é `(aluno, turma, tipo, parcela)`.
3. **Lançar pagamento.** Pela lista de cobranças ou pelo extrato do aluno. O
   valor padrão é o saldo inteiro; quem recebeu parcial ajusta.
4. **Marcar em lote.** Selecione várias cobranças na lista e use *Marcar como
   pagas* — é o "OK" para fechar a turma inteira de uma vez.
5. **Estornar.** Remove a baixa e a cobrança volta a ficar em aberto. Se o
   valor tinha vindo do banco, o recebimento retorna para a fila de
   conciliação em vez de sumir.

Matrícula e mensalidade só nascem do plano. A cobrança **avulsa** existe para
o que é pontual (segunda via, material) e é a única que se cria à mão.

## O aluno

Cada aluno pode ter um **link pessoal** (`/minhas-financas/<token>`) gerado no
extrato dele. A página mostra o que vai vencer, o que está atrasado, o
histórico de pagamentos e como pagar — sem senha e sem expor observações
internas.

O link é a ponte enquanto não existe login de aluno. Quando existir, a mesma
tela passa a abrir pelo login: o extrato vem de
`services.financeiro.extrato_aluno`, que já é o mesmo para a secretaria, para
o financeiro e para a consulta pública. Muda só quem prova a identidade de
quem pede.

Para desligar o acesso de alguém, use *Desativar* — o token é invalidado e um
novo pode ser gerado depois.

## Perfil FINANCEIRO

Perfil de usuário para quem cuida do dinheiro e de mais nada. Enxerga
`/financeiro` e o que pende dele (turmas, extratos, conciliação) e **não**
alcança alunos, turmas, notas, calendário, relatórios, leads nem WhatsApp — o
backend recusa, não é só o menu que esconde.

Crie em **Usuários › Novo usuário › Perfil: Financeiro**. Admin e secretaria
continuam com acesso à área.

## Integração bancária (PIX e boleto)

### Como funciona

O banco/PSP chama um webhook a cada crédito:

```
POST /integracoes/banco/recebimentos
X-Webhook-Secret: <TOV_BANCO_WEBHOOK_SECRET>
Content-Type: application/json

{
  "identificador": "E1234567820260310120000000000001",
  "meio": "PIX",
  "valor": 200.00,
  "data": "2026-03-10",
  "pagador_nome": "Ana Souza",
  "pagador_documento": "12345678900",
  "referencia": "TOV000123",
  "descricao": "Mensalidade TOV000123"
}
```

`identificador` é o E2E do PIX ou o nosso número do boleto e é **único**: o
reenvio do mesmo aviso (o banco repete quando não recebe 200) devolve a
transação já registrada em vez de lançar o pagamento duas vezes.

Sem `TOV_BANCO_WEBHOOK_SECRET` configurado, a rota responde 503 — a
integração fica desligada e a conciliação segue por lançamento manual.

### Como o pagamento é identificado

Na ordem, parando no primeiro que resolver:

1. **Código da cobrança.** `referencia` no payload, ou um `TOV000123` escrito
   em qualquer lugar da descrição. É o caminho preferido: peça ao aluno que
   informe o código na mensagem do PIX.
2. **CPF do pagador** igual ao CPF do aluno, com **valor exato** de uma
   cobrança em aberto dele.
3. **Nome do pagador** idêntico ao do aluno (sem acento e sem caixa), com
   valor exato. Homônimo não decide: com dois candidatos, vai para a fila.
4. Vários títulos do mesmo valor: desempata pelo vencimento mais próximo da
   data do crédito, dentro da tolerância configurada. Se ainda houver empate,
   **não escolhe** — fechar o título errado custa mais caro que esperar.

O que não fecha sozinho aparece em **Financeiro › Conciliação** com o motivo
("Pagador não identificado", "Ana Souza tem mais de uma cobrança com este
valor") e uma lista de cobranças sugeridas. Um clique em *Dar baixa* amarra o
recebimento ao título.

A baixa automática pode ser desligada na própria tela: com
*conciliação automática* off, todo crédito espera decisão humana.

### Conectando um PSP de verdade

O contrato acima é propositalmente genérico. Para ligar um banco:

1. Gere um segredo forte e coloque em `TOV_BANCO_WEBHOOK_SECRET`.
2. Publique `/integracoes/banco/recebimentos` no domínio da API.
3. No painel do PSP, aponte o webhook de PIX recebido e de boleto liquidado
   para essa URL, enviando o segredo no header `X-Webhook-Secret`.
4. Se o PSP tiver formato próprio de payload (a maioria tem), escreva um
   adaptador que traduza o corpo dele para os campos acima. O ponto de entrada
   é `routers/financeiro._registrar_transacao`, que já grava o payload
   original em `payload_json` para auditoria.
5. Para cobrança com QR Code dinâmico ou boleto registrado, use
   `cobrancas.referencia` como identificador do seu lado (`txid`/seu número):
   assim o retorno já chega com o código e a identificação é exata.

Enquanto o PSP não estiver conectado, **Lançar recebimento** traz um crédito
visto no extrato pela mesma porta e com a mesma identificação automática.

## Testes

`backend/tests/test_financeiro.py` cobre geração idempotente, vencimentos em
mês curto, pagamento parcial e em lote, estorno, extrato, link do aluno e os
caminhos da conciliação (código, CPF, nome, ambiguidade, reenvio e baixa
automática desligada).

```bash
cd backend && python -m pytest tests/test_financeiro.py -q
```
