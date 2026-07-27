# Google Forms → pré-cadastro

O Apps Script desta pasta deve ser vinculado à **planilha de respostas** do
Google Forms. Cada nova resposta é enviada à API e vira um aluno com status
`P` (Pré-cadastro).

## Configuração na planilha

1. Na planilha de respostas, abra **Extensões → Apps Script**.
2. Substitua o conteúdo de `Code.gs` pelo arquivo [`Code.gs`](./Code.gs).
3. Abra **Configurações do projeto → Propriedades do script**.
4. Crie a propriedade `TOV_WEBHOOK_SECRET` com o mesmo segredo configurado no
   servidor em `TOV_GOOGLE_FORMS_WEBHOOK_SECRET`.
5. No editor, selecione a função `instalarGatilho` e clique em **Executar**.
6. Autorize o acesso solicitado pelo Google.
7. Envie uma resposta de teste pelo formulário e confira **Execuções** no
   Apps Script e o filtro **Pré-cadastros** no Centro TOV.

Não execute `enviarPreCadastro` manualmente: ela depende do evento gerado pelo
gatilho de envio da planilha.

Os títulos das perguntas são usados como chaves. Se um cabeçalho do Forms for
renomeado, atualize o título correspondente no `Code.gs`.
