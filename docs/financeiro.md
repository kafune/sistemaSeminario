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
| `condicoes_financeiras_aluno` | Exceção ao plano para um aluno: transferência e desconto |
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
   as mensalidades que ainda não tem — quem tem condição própria recebe as
   dele, e não as da turma. A operação é idempotente: matriculou
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

## Aluno de transferência

O plano é da turma; a **condição** é o desvio nomeado de um aluno dentro dela.
Existe para quem entra com o curso andando e vai cursar só alguns módulos: paga
menos meses que a turma, a partir do mês em que entrou, às vezes sem a matrícula
inicial e às vezes com mensalidade própria.

Em **Financeiro › turma › lista de alunos › Condição**:

| Campo | Em branco significa |
| --- | --- |
| Mensalidades a pagar | segue a quantidade da turma |
| Primeira mensalidade | segue o mês da turma |
| Mensalidade própria | segue o valor da turma |
| Cobrar matrícula inicial | ligado por padrão; desligue para quem já pagou na escola de origem |

O desconto percentual é editado à parte, na ficha do aluno — veja abaixo.

Ao salvar, as cobranças já geradas são **ajustadas na hora**, não só as
próximas: as parcelas que sobraram do novo plano são removidas, as demais
ganham valor e vencimento certos, e a numeração vira `1/3`, `2/3`… O retorno da
tela diz exatamente o que mudou (`3 removida(s), 1 preservada(s)`).

**Parcela com pagamento lançado nunca é apagada nem reescrita** — o dinheiro que
entrou manda mais que o plano. Ela aparece como preservada, e a secretaria
decide se estorna ou deixa.

Voltar o aluno para *Plano da turma* recria as parcelas que tinham sido
cortadas. A geração da turma inteira respeita a condição de cada um: rodar
"Gerar cobranças" não devolve ao aluno de transferência os meses que ele não vai
cursar.

## Desconto

Percentual abatido do que vem do plano da turma, sempre com o **motivo** junto —
é o desconto de casal, de irmãos ou de obreiro. Fica na **aba Financeiro da
ficha do aluno**, ao lado da situação dele.

A regra do Centro TOV, tirada da planilha que a secretaria mantém à mão:
matrícula de R$ 100 e mensalidade de R$ 200 por pessoa, e **o cônjuge paga 50%
das duas** — o casal fecha em R$ 150 de matrículas e R$ 300 por mês. Por isso o
desconto abate matrícula e mensalidade por padrão; o interruptor *Abater também
a matrícula* existe para quem precisar do contrário.

* O motivo é **obrigatório** quando há desconto. Quem confere a carteira seis
  meses depois precisa saber por que aquele aluno paga menos, e "porque sim" não
  sobrevive a uma auditoria nem a uma troca de secretária.
* Salvar **recalcula as cobranças em aberto** na hora. Cobrança com pagamento
  lançado não muda de valor — aparece como preservada.
* O percentual entra na descrição da cobrança (`Mensalidade 3/12 · Turma da
  manhã · desconto 50%`), então o aluno vê o abatimento no próprio extrato sem
  precisar perguntar.
* Desconto e transferência convivem: o percentual incide sobre os valores já
  resolvidos pela condição. Voltar o aluno para "plano da turma" **não** apaga o
  desconto — são duas perguntas diferentes (quantos meses × quanto cada um).

Na régua da turma cada aluno com desconto ganha um selo verde, e o motivo
aparece ao passar o mouse.

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

## Importar a planilha da secretaria

`backend/importar_planilha_financeiro.py` carrega no sistema a planilha de
controle que a secretaria mantinha à mão. Ela traz duas listas — regulares e
transferidos — e marca o casal com `C`, mesclando as células de valor entre as
duas linhas porque **o casal paga junto**. O script traduz isso:

| Na planilha | No sistema |
| --- | --- |
| Linha com nome | Aluno matriculado na turma |
| `C` com células mescladas | O **segundo** do par vira cônjuge, com o desconto |
| Bloco `TRANSFERÊNCIA` | Condição de transferência, sem matrícula |
| `VALOR PAGO` | Baixas, quitando em ordem de vencimento |
| `CONTA` e `NOME NO RECIBO` | Observação do pagamento |

O nome no extrato é o dado que mais some com o tempo — na planilha um depósito
aparece como "Central Mailing List" — então ele vai para a observação da baixa,
onde a conciliação bancária consegue reencontrá-lo.

```bash
cd backend
# lista as turmas e explica o que falta
python importar_planilha_financeiro.py --arquivo ../PLANILHA.xlsx
# simulação: mostra pessoa por pessoa o que faria
python importar_planilha_financeiro.py --arquivo ../PLANILHA.xlsx --turma 1 --parcelas 12
# grava
python importar_planilha_financeiro.py --arquivo ../PLANILHA.xlsx --turma 1 --parcelas 12 --aplicar
```

**Sem `--aplicar` nada é gravado.** Os valores padrão são os da planilha atual
(`--matricula 100`, `--mensalidade 200`, `--desconto-conjuge 50`,
`--primeira-mensalidade 2026-08-10`).

`--parcelas` é o **total de mensalidades do curso**, e não tem como ser deduzido:
a planilha é a foto de agosto, com a matrícula e a primeira mensalidade.

Duas garantias fecham o script:

* **Ele confere o resultado contra os totais que a própria planilha declara**
  (`Valor total pago até agora` e `Valor total a pagar em 10/ago`) e, aluno por
  aluno, contra a coluna `VALOR A PAGAR`. Se algo não bater, **desfaz tudo** e
  explica — a conta errada nunca chega ao banco.
* **É idempotente**: aluno é reaproveitado pelo nome normalizado (sem acento,
  sem caixa, sem espaço dobrado) e cobrança já existente não é duplicada, então
  rodar duas vezes não estraga nada.

No casal, o dinheiro entrou num depósito só: as baixas começam pelo titular e
transbordam para o cônjuge. O total do casal fica idêntico ao da planilha; a
divisão entre os dois é a escolha do script.

## Desempenho da lista

Busca, recorte, situação e mês são resolvidos em SQL, e a tela pede **uma
página por vez** (50 cobranças). Cada consulta da lista custa duas idas ao banco
— uma para os totais do recorte, outra para a página — independentemente do
tamanho da carteira.

Três coisas sustentam isso e vale não desfazer sem medir:

* **Vencida e parcial viram condição SQL**, não filtro em Python: `VENCIDA` é
  `status = 'ABERTA' AND vencimento < hoje`, `PARCIAL` é `status = 'ABERTA' AND
  pago > 0`. É o que permite paginar de verdade.
* **O painel não recarrega quando alguém digita.** Ele tem carga própria e só
  volta ao banco depois de uma baixa, de uma geração ou de um F5.
* **A requisição anterior é cancelada** a cada tecla (`AbortController`), então
  a resposta que chega é sempre a da busca atual.

A lista de alunos do formulário de cobrança avulsa também só desce quando o
formulário abre — a tela de trabalho não carrega o cadastro inteiro para
mostrar uma tabela.

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
mês curto, pagamento parcial e em lote, estorno, extrato, link do aluno, a
condição de transferência (encolher, preservar parcela paga, voltar ao plano
cheio), o desconto percentual (abatimento de matrícula e mensalidade, arredondamento,
motivo obrigatório, convivência com transferência), os filtros da lista (mês,
busca, paginação, saldo do recorte) e os
caminhos da conciliação (código, CPF, nome, ambiguidade, reenvio e baixa
automática desligada).

`backend/tests/test_importacao_planilha.py` monta uma planilha com a mesma
forma da real — casais mesclados, dois blocos, linhas de total — e confere a
importação inteira, incluindo a recusa quando os valores não fecham.

```bash
cd backend && python -m pytest tests/test_financeiro.py tests/test_importacao_planilha.py -q
```
