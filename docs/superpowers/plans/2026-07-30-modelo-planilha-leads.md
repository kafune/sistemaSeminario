# Modelo de planilha de leads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um download autenticado de uma planilha XLSX de exemplo no fluxo de importação de leads.

**Architecture:** O router de leads gera o workbook em memória com `openpyxl` e o devolve como `StreamingResponse`, sem consultar o banco. O modal de importação chama o helper autenticado `baixarArquivo` por um botão secundário ao lado da seleção de arquivo.

**Tech Stack:** FastAPI, `openpyxl`, `io.BytesIO`, React, MUI, helper `baixarArquivo`.

## Global Constraints

- O endpoint será `GET /leads/importacoes/modelo` e seguirá a autorização `ADMIN`/`MARKETING` do router de leads.
- O arquivo deve se chamar `modelo-importacao-leads.xlsx` no download.
- A aba deve se chamar `Leads`, congelar a primeira linha e conter `Nome`, `Telefone`, `E-mail`, `Origem`, `Campanha`, `Data de captação`, `Tags`, `Status do funil` e `Opt-in`.
- A linha de exemplo deve ser fictícia e conter valores válidos para o parser existente.
- Não alterar regras do parser, adicionar dependências ou persistir o arquivo.

## Mapa de arquivos

- Modify: `backend/app/routers/leads.py` — endpoint que cria e entrega o XLSX.
- Modify: `backend/tests/test_leads.py` — teste do contrato binário do endpoint.
- Modify: `frontend/src/pages/ImportarLeadsDialog.jsx` — botão e estado de erro do download.
- Existing: `frontend/src/api.js` — reutilizar `baixarArquivo`; não mudar o helper.

### Task 1: Definir o contrato do endpoint com teste red

**Files:**
- Test: `backend/tests/test_leads.py`

**Interfaces:**
- Consumes: `previsualizar_importacao` e imports existentes do módulo de leads.
- Produces: teste `test_modelo_planilha_de_leads_tem_cabecalhos_e_nome_de_download` que fixa o contrato usado pela implementação.

- [ ] **Step 1: Adicionar os imports do teste**

Em `backend/tests/test_leads.py`, acrescente `asyncio` e importe `modelo_importacao_leads` do router, mantendo os imports existentes:

```python
import asyncio
import zipfile

from app.routers.leads import (
    _consentimento,
    _payloads,
    confirmar_importacao,
    modelo_importacao_leads,
    previsualizar_importacao,
)
```

- [ ] **Step 2: Escrever o teste que deve falhar**

Dentro de `ImportacaoLeadsTest`, adicione:

```python
def test_modelo_planilha_de_leads_tem_cabecalhos_e_nome_de_download(self):
    resposta = modelo_importacao_leads()

    self.assertEqual(resposta.media_type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    self.assertIn('filename="modelo-importacao-leads.xlsx"', resposta.headers["content-disposition"])
    async def ler_corpo():
        partes = []
        async for parte in resposta.body_iterator:
            partes.append(parte)
        return b"".join(partes)

    conteudo = asyncio.run(ler_corpo())
    with zipfile.ZipFile(BytesIO(conteudo)) as arquivo:
        workbook_xml = arquivo.read("xl/worksheets/sheet1.xml").decode("utf-8")
        self.assertIn("Nome", workbook_xml)
        self.assertIn("Telefone", workbook_xml)
        self.assertIn("Data de captação", workbook_xml)
        self.assertIn("Status do funil", workbook_xml)
        self.assertIn("Opt-in", workbook_xml)
```

Use o `BytesIO` já importado no arquivo; não faça asserções sobre detalhes internos de estilo.

- [ ] **Step 3: Executar o teste e confirmar a falha esperada**

Run: `cd backend && python3 -m unittest tests.test_leads.ImportacaoLeadsTest.test_modelo_planilha_de_leads_tem_cabecalhos_e_nome_de_download -v`

Expected: FAIL porque `modelo_importacao_leads` ainda não existe no router.

### Task 2: Implementar o endpoint XLSX

**Files:**
- Modify: `backend/app/routers/leads.py`
- Test: `backend/tests/test_leads.py`

**Interfaces:**
- Consumes: autorização e prefixo `/leads` definidos no `router` existente.
- Produces: `modelo_importacao_leads() -> StreamingResponse`, exposto como `GET /leads/importacoes/modelo`.

- [ ] **Step 1: Adicionar os imports mínimos**

Em `backend/app/routers/leads.py`, importe `BytesIO`, `StreamingResponse` e `Workbook`:

```python
from io import BytesIO

from fastapi.responses import StreamingResponse
from openpyxl import Workbook
```

- [ ] **Step 2: Implementar a geração em memória**

Antes de `@router.get("/importacoes")`, adicione o endpoint:

```python
@router.get("/importacoes/modelo")
def modelo_importacao_leads():
    workbook = Workbook()
    planilha = workbook.active
    planilha.title = "Leads"
    cabecalhos = [
        "Nome", "Telefone", "E-mail", "Origem", "Campanha",
        "Data de captação", "Tags", "Status do funil", "Opt-in",
    ]
    planilha.append(cabecalhos)
    planilha.append([
        "Maria Exemplo", "(11) 99999-8888", "maria.exemplo@example.com",
        "Landing page", "Curso 2026", "28/07/2026", "interessado, curso",
        "NUTRICAO", "Sim",
    ])
    planilha.freeze_panes = "A2"
    planilha.auto_filter.ref = planilha.dimensions
    planilha.column_dimensions["A"].width = 24
    planilha.column_dimensions["B"].width = 20
    planilha.column_dimensions["C"].width = 32
    planilha.column_dimensions["F"].width = 20
    planilha.column_dimensions["H"].width = 18

    conteudo = BytesIO()
    workbook.save(conteudo)
    conteudo.seek(0)
    return StreamingResponse(
        conteudo,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="modelo-importacao-leads.xlsx"'},
    )
```

Não consultar `db` nesse endpoint: o arquivo é completamente estático e gerado por requisição.

- [ ] **Step 3: Executar o teste e confirmar o verde**

Run: `cd backend && python3 -m unittest tests.test_leads.ImportacaoLeadsTest.test_modelo_planilha_de_leads_tem_cabecalhos_e_nome_de_download -v`

Expected: PASS. O teste lê o iterator assíncrono da `StreamingResponse` e valida o XML da planilha sem depender de um servidor HTTP.

- [ ] **Step 4: Executar toda a suíte backend**

Run: `cd backend && python3 -m unittest discover -s tests -v`

Expected: PASS sem falhas ou erros.

- [ ] **Step 5: Commitar o endpoint e seu teste**

```bash
git add backend/app/routers/leads.py backend/tests/test_leads.py
git commit -m "feat: adiciona modelo xlsx para importacao de leads"
```

### Task 3: Conectar o download ao modal de leads

**Files:**
- Modify: `frontend/src/pages/ImportarLeadsDialog.jsx`

**Interfaces:**
- Consumes: `baixarArquivo(path, nomePadrao)` de `frontend/src/api.js`.
- Produces: botão acessível “Baixar planilha de exemplo” que inicia `GET /leads/importacoes/modelo`.

- [ ] **Step 1: Trocar o import do helper**

Atualize o import existente:

```javascript
import { api, baixarArquivo, enviarArquivoJson } from '../api'
```

- [ ] **Step 2: Criar o handler de download com o alerta existente**

Dentro do componente, adicione:

```javascript
  async function baixarModelo() {
    setErro('')
    try {
      await baixarArquivo('/leads/importacoes/modelo', 'modelo-importacao-leads.xlsx')
    } catch (e) {
      setErro(e.message)
    }
  }
```

- [ ] **Step 3: Renderizar o botão no cartão do arquivo**

Na mesma `Box` que contém “Selecionar arquivo”, antes do texto do arquivo, adicione:

```jsx
<Button variant="text" onClick={baixarModelo} disabled={processando}>
  Baixar planilha de exemplo
</Button>
```

Mantenha o botão fora do `<input hidden>` e não o desabilite quando houver uma prévia: baixar o modelo continua sendo útil antes ou depois da seleção, enquanto a confirmação estiver em andamento.

- [ ] **Step 4: Validar o build do frontend**

Run: `cd frontend && npm run build`

Expected: Vite termina com exit code 0 e gera `frontend/dist` sem erros de importação.

- [ ] **Step 5: Commitar a integração visual**

```bash
git add frontend/src/pages/ImportarLeadsDialog.jsx
git commit -m "feat: adiciona download de modelo na importacao de leads"
```

### Task 4: Verificação final do contrato e da interface

**Files:**
- No new files.

- [ ] **Step 1: Reexecutar o teste específico do endpoint**

Run: `cd backend && python3 -m unittest tests.test_leads.ImportacaoLeadsTest.test_modelo_planilha_de_leads_tem_cabecalhos_e_nome_de_download -v`

Expected: PASS com o tipo MIME XLSX e o nome de arquivo esperado.

- [ ] **Step 2: Reexecutar a suíte backend e o build frontend**

Run: `cd backend && python3 -m unittest discover -s tests -v`

Then run: `cd frontend && npm run build`

Expected: ambos terminam com exit code 0.

- [ ] **Step 3: Conferir o diff final**

Run: `git diff HEAD~2 -- backend/app/routers/leads.py backend/tests/test_leads.py frontend/src/pages/ImportarLeadsDialog.jsx`

Confirmar que só há o endpoint, o teste e o botão previstos, sem dependência nova ou mudança no parser.
