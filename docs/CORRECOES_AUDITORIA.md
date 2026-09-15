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

### Não feitos (ficam para a próxima rodada)

- **B3** coluna `nome_normalizado` indexada; **D4** trilha de auditoria administrativa; **D6** máscara de CPF; **E5** engine preguiçoso; **E6/E7** limites da UazAPI; **F2** testes em MySQL; **F4** linter/formatador; **F7** testes de frontend; **G2/G3/G4** tabelas e comunicados aposentados; **G7**; **H3**; **I3** (origem do consentimento — o backend continua confiando no campo enviado), **I5–I9**, **I11**; **K5** (`Code.gs`), **K6** (`docs/superpowers`). **C4** ficou com flag, não com Alembic.

## AUDITORIA_VISUAL.md

### Críticos — corrigidos

A1 (`bgcolor: undefined` não é mais espalhado sobre a variante), A2 (ações do `BottomNavigation` como filhos diretos: rótulos e item ativo).

### Altos — corrigidos

A3 (Snackbar em bottom/center com alerta opaco, via tema), A7 (passo de corpo em `lg` no `CardMetrica`), B1 (sidebar completa só em `lg`; trilha de 72px até 1200px), B2/B10 (`overflowWrap: anywhere` nas células; sombras de rolagem no `TableContainer`), B3/B12 (lista da navegação rola separada do rodapé fixo; "Mais" preso na base da trilha), C2 (`TOV.caption` em separadores e traços), C3/E6 (desabilitado com contraste ≥ 3:1 e um único tratamento), D1 (`EstadoErro` nas 17 páginas + Calendário), E1 (rótulo sempre no entalhe, via `defaultProps` do tema; "Todos" visível nos filtros), F1 (`typography.button` em px), H13 (sem `stickyHeader`; regra 6 do design system ajustada).

### Médios/baixos corrigidos

A4, A5, A6, A8, B4, B5, B11, B13, C8, D2, D3, D4, D5, D6, D9, E3, E4 (parcial), E8, E13, E16, F5 (folha de impressão), G1 (`GrupoSegmentado` 46px), G6, I1, I2, I3, I4, I5, I7, J2 (parcial: fonte mono).

### Não feitos

B6/H3 (paginação e recorte por semana), B7, B8, B9, C4/C5/C6/C7 (decisões de produto sobre foco/erro e escala em px), D7, D8, E2, E5, E7, E9–E12, E14, E15, F3, F4, G2, G4, H1, H2, H4–H12, H14, I6, I9, J1 (pré-carregar fontes exige plugin no Vite), J3 (CORS em 409 — comportamento do backend; não reproduzido).
