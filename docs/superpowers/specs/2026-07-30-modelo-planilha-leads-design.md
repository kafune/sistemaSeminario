# Modelo de planilha para importação de leads

## Objetivo

Adicionar à área de leads uma opção para baixar uma planilha XLSX de exemplo,
com o mesmo formato aceito pelo fluxo de importação. O arquivo deve ajudar o
usuário a preparar dados sem depender de documentação externa.

## Abordagem escolhida

O backend gerará o XLSX sob demanda com `openpyxl`, dependência já usada para
ler planilhas importadas. Isso mantém o modelo próximo do contrato real de
importação e evita adicionar uma biblioteca de planilhas ao bundle do frontend
ou manter um arquivo binário estático potencialmente desatualizado.

## Backend

- Criar `GET /leads/importacoes/modelo` no router de leads, sujeito aos mesmos
  perfis `ADMIN` e `MARKETING`.
- Gerar o workbook em memória, sem consultar nem gravar dados no banco.
- Criar a aba `Leads`, congelar a primeira linha e escrever os cabeçalhos:
  `Nome`, `Telefone`, `E-mail`, `Origem`, `Campanha`, `Data de captação`,
  `Tags`, `Status do funil` e `Opt-in`.
- Incluir uma única linha fictícia para demonstrar valores válidos. Não usar
  dados pessoais reais.
- Responder como XLSX com `Content-Disposition` sugerindo
  `modelo-importacao-leads.xlsx`.

## Frontend

- No cartão “Arquivo do computador” do `ImportarLeadsDialog`, adicionar o botão
  secundário “Baixar planilha de exemplo”, próximo da seleção do arquivo.
- Reutilizar `baixarArquivo` para preservar autenticação e iniciar o download.
- Exibir falhas no mesmo alerta de erro do modal; o botão não interfere no
  estado da prévia ou da confirmação da importação.

## Testes e validação

- Testar o endpoint verificando resposta XLSX, nome sugerido no download e
  cabeçalhos esperados ao reabrir o workbook.
- Testar o acionamento do download no frontend conforme o padrão de testes
  disponível no projeto.
- Executar a suíte backend relevante e o build do frontend.

## Fora de escopo

- Alterar o parser de importação ou suas regras de validação.
- Criar modelos diferentes para CSV/XLS.
- Persistir o arquivo ou armazenar dados de exemplo no banco.
