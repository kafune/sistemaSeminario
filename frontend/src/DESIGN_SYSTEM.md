# Sistema visual TOV

O frontend usa uma linguagem editorial-institucional: superfícies quentes,
tipografia expressiva nos títulos e grafite para estrutura. Coral é funcional,
não decorativo.

## Decisões canônicas

As contradições do PRD foram resolvidas da seguinte forma:

- `radiusMd` = **14px**. O requisito específico de componentes prevalece sobre
  o exemplo de tokens que indicava 12px.
- Movimento = **150ms/250ms** com `cubic-bezier(.2,.75,.25,1)`. A métrica de
  sucesso global prevalece sobre a curva alternativa do exemplo.
- Grid = **4px**. Valores numéricos de espaçamento do MUI usam base 8px e
  aceitam somente passos de 0,5 (4px).
- Coral = somente ação, seleção/estado ativo e alerta crítico. Decoração,
  categorias de dados e estrutura usam grafite ou cores semânticas.

## Tokens

Os tokens vivem em `theme.js`, no objeto `TOV`.

- Canvas: `TOV.canvas` (`#F5F2EE`)
- Superfície: `TOV.surface` (`#FFFEFC`)
- Superfície suave: `TOV.surfaceMuted` (`#F0ECE6`)
- Tinta: `TOV.ink` (`#141618`)
- Grafite: `TOV.graphite` (`#2C3236`)
- Caption: `TOV.caption` (`#525D63`)
- Coral funcional: `TOV.primary` / `TOV.coral` (`#C92F2F`)
- Bordas: `TOV.border` (`#D8CEC4`) e `TOV.divider` (`#E4DDD5`)
- Raios principais: `radiusSm` (8), `radiusMd` (14) e `radiusLg` (16)
- Movimento: `durationFast` (150ms), `durationBase` (250ms) e `TOV.ease`
- Foco: `focusRing`, com 3px de coral a 25% de opacidade

Os aliases `offwhite`, `white` e `slate` existem somente para compatibilidade
enquanto os nomes semânticos são consolidados.

## Componentes compartilhados

Todos são exportados por `ui.jsx`.

- `CabecalhoPagina`: cria o único `h1` da página e organiza descrição,
  metadados e ações.
- `Superficie`: agrupa conteúdo com as variantes `base`, `raised` e `inverse`.
- `BarraFiltros`: reúne busca, seletores e filtros em uma superfície única.
- `CardMetrica`: apresenta um dado operacional e sua nota de contexto.
- `StatusBadge`: representa estados com texto e cor semântica.
- `EstadoVazio`: comunica ausência de conteúdo e aceita ação de recuperação.
- `SkeletonCards` e `SkeletonTabela`: carregamento sem salto de layout.
- `CartaoLista`: equivalente móvel de uma linha de tabela.

## Regras de implementação

1. Não declarar cores, tamanhos tipográficos, raios, sombras ou transições nos
   componentes; usar `TOV`, `focusRing` e os componentes compartilhados.
2. Usar coral somente em ação, seleção/estado ativo ou alerta crítico.
3. Preferir borda fina e contraste de superfície a elevação; usar apenas as
   sombras `TOV.shadow*` quando uma camada realmente flutuar.
4. Garantir texto para todo estado; cor nunca é o único indicador.
5. Preservar alvos interativos de pelo menos 44px.
6. Tabelas usam cabeçalho fixo, divisores sutis e zebra de baixa opacidade.
7. Respeitar `prefers-reduced-motion`, já tratado globalmente pelo tema.

## Validação

`npm run check:design` impede a introdução de cores, tipografia, raios,
sombras, movimento e espaçamentos fora do sistema. O comando também faz parte
de `npm run build`.
