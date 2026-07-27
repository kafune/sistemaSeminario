# Google Forms → pré-cadastro

O Apps Script desta pasta deve ser vinculado à **planilha de respostas** do
Google Forms. Cada nova resposta é enviada à API e vira um aluno com status
`P` (Pré-cadastro). O botão **Importar** da tela de Alunos também pode solicitar
a sincronização segura de todas as respostas antigas.

## Configuração na planilha

1. Na planilha de respostas, abra **Extensões → Apps Script**.
2. Substitua o conteúdo de `Code.gs` pelo arquivo [`Code.gs`](./Code.gs).
3. Abra **Configurações do projeto → Propriedades do script**.
4. Crie a propriedade `TOV_WEBHOOK_SECRET` com o mesmo segredo configurado no
   servidor em `TOV_GOOGLE_FORMS_WEBHOOK_SECRET`.
5. Volte à planilha e deixe selecionada a aba que recebe as respostas.
6. No editor, selecione a função `instalarGatilho` e clique em **Executar**.
7. Autorize o acesso solicitado pelo Google.
8. Envie uma resposta de teste pelo formulário e confira **Execuções** no
   Apps Script e o filtro **Pré-cadastros** no Centro TOV.

A instalação cria dois gatilhos: um envia novas respostas imediatamente e o
outro verifica, a cada minuto, se alguém clicou em **Importar do Google Forms**
na plataforma. Esse segundo gatilho também atende ao botão **Escolher pessoas**:
ele envia uma prévia segura para a plataforma, onde a secretaria pode pesquisar
por nome, marcar somente as inscrições desejadas e importá-las. A planilha
continua privada.

Não execute `enviarPreCadastro` ou `processarImportacoesPendentes` manualmente:
elas dependem dos gatilhos.

Os títulos das perguntas são usados como chaves. Se um cabeçalho do Forms for
renomeado, atualize o título correspondente no `Code.gs`.
