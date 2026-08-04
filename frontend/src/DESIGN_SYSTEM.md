# Sistema visual TOV

O frontend usa uma linguagem editorial-institucional: superfícies quentes,
tipografia expressiva nos títulos, grafite para estrutura e coral apenas como
assinatura, ação ou feedback.

## Tokens

Os tokens vivem em `theme.js`, no objeto `TOV`.

- Canvas: `TOV.canvas` (`#F5F2EE`)
- Superfície: `TOV.surface` (`#FFFEFC`)
- Tinta: `TOV.ink` (`#191B1D`)
- Grafite: `TOV.graphite` (`#343B3F`)
- Coral funcional: `TOV.coral` (`#C92F2F`)
- Coral decorativo: `TOV.coralBright` (`#F14949`)
- Texto secundário: `TOV.caption` (`#5E696F`)
- Coral para superfícies escuras: `TOV.coralOnDark` (`#FF9A9A`)
- Borda: `TOV.border` (`#DED7D0`)
- Raios: `radiusSm` (10), `radiusMd` (14) e `radiusLg` (18)
- Movimento: `durationFast` (160ms) e `durationBase` (220ms)

Os aliases `offwhite`, `white` e `slate` existem apenas para compatibilidade
com telas em migração.

## Componentes compartilhados

Todos são exportados por `ui.jsx`.

- `CabecalhoPagina`: cria o único `h1` da página e organiza descrição,
  metadados e ações.
- `Superficie`: agrupa conteúdo com as variantes `base`, `raised` e `inverse`.
  Use `raised` apenas quando o elemento realmente precisar flutuar.
- `BarraFiltros`: reúne busca, seletores e filtros em uma superfície única.
- `CardMetrica`: apresenta um dado operacional e sua nota de contexto.
- `StatusBadge`: estado textual com os tons `neutral`, `muted`, `coral`,
  `success`, `warning`, `error` e `info`.
- `EstadoVazio`: comunica ausência de conteúdo e aceita uma ação de recuperação.
- `SkeletonCards` e `SkeletonTabela`: carregamento sem salto brusco de layout.
- `CartaoLista`: equivalente mobile de uma linha de tabela.

## Regras de uso

1. Use coral em ações principais, foco, seleção e no filete dos títulos.
2. Não use grandes superfícies coral.
3. Prefira borda fina e contraste de superfície a sombras.
4. Garanta texto para todo estado; cor nunca deve ser o único indicador.
5. Preserve alvos interativos de pelo menos 44px.
6. Use somente transições de navegação, seleção, botão ou expansão. O tema
   desativa movimento quando `prefers-reduced-motion` estiver ativo.

## Exemplos

```jsx
<CabecalhoPagina
  titulo="Alunos"
  descricao="Gestão acadêmica e dados de contato."
  metadados="128 registros"
  acoes={<Button variant="contained">Novo aluno</Button>}
/>

<BarraFiltros>
  <TextField label="Buscar" />
  <TextField select label="Status">...</TextField>
</BarraFiltros>

<Superficie sx={{ p: 3 }}>
  <StatusBadge tom="success" dot>Ativo</StatusBadge>
</Superficie>
```
