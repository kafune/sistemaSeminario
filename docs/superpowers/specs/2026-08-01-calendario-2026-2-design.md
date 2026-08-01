# Atualização do calendário acadêmico de 2026.2

## Objetivo

Reconciliar o calendário e as matérias do sistema com o PDF
`Alunos_TOV - Calendario_Instituto_Tov_2-2026.pdf`, preservando os registros
que já conferem e representando corretamente os professores que se alternam
nas aulas da turma de sábado.

## Abordagem escolhida

O sistema continuará usando `docturma` como vínculo entre turma, matéria e
professor. A validação de duplicidade passará a considerar também o professor,
permitindo que uma mesma matéria tenha docentes diferentes na mesma turma,
ano e semestre. Cada aula apontará para o vínculo correspondente ao professor
indicado no PDF.

Essa é a menor alteração compatível com o modelo atual. Não será criada uma
sobreposição de professor na tabela `aulas`, e o nome do docente não será
armazenado como texto livre em tema ou observação.

## Regra de vínculo acadêmico

- Continuar proibindo dois vínculos idênticos para a mesma turma, matéria,
  professor, ano e semestre.
- Permitir vínculos da mesma matéria, turma, ano e semestre quando o professor
  for diferente.
- Manter as proteções existentes para referências inválidas, notas e aulas.
- Cobrir a nova regra com teste automatizado, incluindo o caso permitido e a
  duplicidade que deve continuar rejeitada.

## Reconciliação da turma Noturno

- Manter as datas de `Hermenêutica e Métodos de Estudo Bíblico`, que já
  correspondem ao PDF, incluindo 12/10 como aula cancelada por feriado.
- Manter `Comunicação e Ensino Bíblico` de 05/08 a 21/10 e alterar a data final
  de seu vínculo para 21/10/2026.
- Reatribuir a aula de 28/10/2026 a
  `Aconselhamento Bíblico e Vida Familiar`, preservando 19:15 como horário
  inicial.
- Alterar a data inicial do vínculo de
  `Aconselhamento Bíblico e Vida Familiar` para 28/10/2026 e manter suas demais
  datas até 09/12/2026, incluindo 02/11 como aula cancelada por feriado.

Ao final, a turma Noturno continuará com 37 aulas: 12 de Hermenêutica e
Métodos de Estudo Bíblico, 12 de Comunicação e Ensino Bíblico e 13 de
Aconselhamento Bíblico e Vida Familiar.

## Reconciliação da turma Sabado

Criar, se ainda não existirem, as matérias:

- `Teologia Sistemática II`, com área `Teologia Sistemática`, apelido `TS II`
  e observação `Cristologia, Antropologia e Hamartiologia`.
- `Teologia Sistemática III`, com área `Teologia Sistemática`, apelido `TS III`
  e observação `Angelologia, Eclesiologia e Escatologia`.

Reutilizar a matéria existente `Comunicação e Ensino Bíblico` para o bloco que
o PDF identifica como Homilética e Comunicação e Ensino Bíblico. Registrar os
vínculos de atuação dos professores nas respectivas matérias sem remover
atuações já cadastradas.

Os vínculos de atuação a garantir são: Adarlei Martins, Eduardo Franco
Bernardes e Erisvaldo Verissimo da Silva em Teologia Sistemática II; André
Oliveira e Erisvaldo Verissimo da Silva em Comunicação e Ensino Bíblico; e
Jeferson Alcântara e Erisvaldo Verissimo da Silva em Teologia Sistemática III.

Cadastrar as nove aulas abaixo, todas das 09:00 às 17:00 e com status
`AGENDADA`:

| Data | Matéria | Professor |
| --- | --- | --- |
| 08/08/2026 | Teologia Sistemática II | Adarlei Martins |
| 15/08/2026 | Teologia Sistemática II | Eduardo Franco Bernardes |
| 29/08/2026 | Teologia Sistemática II | Erisvaldo Verissimo da Silva |
| 19/09/2026 | Comunicação e Ensino Bíblico | André Oliveira |
| 26/09/2026 | Comunicação e Ensino Bíblico | Erisvaldo Verissimo da Silva |
| 24/10/2026 | Comunicação e Ensino Bíblico | André Oliveira |
| 14/11/2026 | Teologia Sistemática III | Jeferson Alcântara |
| 28/11/2026 | Teologia Sistemática III | Erisvaldo Verissimo da Silva |
| 12/12/2026 | Teologia Sistemática III | Jeferson Alcântara |

O nome `Val Veríssimo` usado no PDF corresponde, por confirmação do usuário,
ao cadastro `Erisvaldo Verissimo da Silva`.

## Segurança da atualização

- Gerar um backup do banco antes de qualquer gravação.
- Confirmar previamente os identificadores das duas turmas, dos seis
  professores e das três matérias já existentes.
- Aplicar as alterações de dados em uma única transação.
- Fazer inserções de forma idempotente, consultando matéria, vínculo e aula
  pela identidade acadêmica antes de criar registros.
- Interromper e reverter a transação se os registros de referência não forem
  encontrados de forma inequívoca.
- Não alterar alunos, notas, usuários nem calendários de outros períodos.

## Testes e validação

- Executar primeiro o teste automatizado da regra de múltiplos professores e
  confirmar que ele falha antes da alteração e passa depois dela.
- Executar a suíte completa do backend.
- Consultar o banco após a transação e confirmar 37 aulas no Noturno e 9 aulas
  no Sabado entre agosto e dezembro de 2026.
- Comparar datas, matérias, professores, horários e status das 46 aulas com a
  especificação.
- Confirmar que 12/10 e 02/11 permanecem canceladas e que as demais 44 aulas
  estão agendadas.
- Confirmar que não existem duplicidades de aula por vínculo, data e horário.
- Executar o build do frontend como verificação de regressão do projeto.

## Fora de escopo

- Criar um importador genérico de PDF.
- Alterar telas ou o formato visual do calendário.
- Criar ou renomear professores.
- Renomear as três matérias já cadastradas da turma Noturno.
- Preencher local, tema ou observação quando o PDF não fornece esses dados.
