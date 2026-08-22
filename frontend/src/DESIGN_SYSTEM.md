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
- Raios principais: `radiusSm` (`8px`), `radiusMd` (`14px`) e `radiusLg` (`16px`)
- Alturas de controle: `controlH` (48) e `controlHSm` (44)
- Movimento: `durationFast` (150ms), `durationBase` (250ms) e `TOV.ease`
- Foco: `focusRing`, com 3px de coral a 25% de opacidade

**Os raios carregam a unidade.** O `sx` do MUI trata `borderRadius` numérico
como múltiplo de `shape.borderRadius`, então `borderRadius: 8` renderiza 112px
e arredonda a caixa inteira. Com o token em px o valor vale igual no `sx`, nos
`styleOverrides` e dentro de template literal — nunca escreva
`` `${TOV.radiusSm}px` ``. O `check:design` reprova as duas formas.

**Altura de controle vem da barra, não da página.** `BarraFiltros` aplica
`controlHSm` e as ações do cabeçalho aplicam `controlH` a todo campo, select e
botão que estiver dentro. Página não declara `height` de controle.

## Componentes compartilhados

Todos são exportados por `ui.jsx`.

- `CabecalhoPagina`: cria o único `h1` da página e organiza descrição,
  metadados e ações. A variante `editorial` (padrão) é capa — régua, título
  grande e descrição — e vale para painel, detalhe e portal; a variante
  `operacional` põe título e contagem na mesma linha das ações, sem régua, e é
  a das telas de trabalho e de lista.
- `Superficie`: agrupa conteúdo com as variantes `base`, `raised` e `inverse`.
- `BarraFiltros`: reúne busca, seletores e filtros em uma superfície única.
- `CardMetrica`: apresenta um dado operacional e sua nota de contexto. Com
  `onClick` vira botão e abre a lista de onde o número saiu — é a forma
  correta de usá-lo no painel.
- `GrupoSegmentado`: escolha única entre poucas opções, num controle só.
  Substitui a mistura de pílula própria com select do MUI numa mesma barra.
  `SeletorDensidade` é ele com as opções de densidade.
- `StatusBadge`: representa estados com texto e cor semântica.
- `EstadoVazio`: comunica ausência de conteúdo e aceita ação de recuperação.
- `SkeletonCards`, `SkeletonTabela` e `LinhasSkeleton`: carregamento sem salto
  de layout. Dentro de um `TableBody`, use `LinhasSkeleton` — ele repete as
  colunas reais em vez de centralizar um "Carregando…".
- `CartaoLista`: equivalente móvel de uma linha de tabela.
- `Metadado`: dado que o sistema calcula e o usuário não digita. Não vista de
  campo (borda, fundo, altura de input) algo que não aceita clique.

## Regras de implementação

1. Não declarar cores, tamanhos tipográficos, raios, sombras ou transições nos
   componentes; usar `TOV`, `focusRing` e os componentes compartilhados.
2. Usar coral somente em ação, seleção/estado ativo ou alerta crítico.
3. Preferir borda fina e contraste de superfície a elevação; usar apenas as
   sombras `TOV.shadow*` quando uma camada realmente flutuar.
4. Garantir texto para todo estado; cor nunca é o único indicador.
5. Preservar alvos interativos de pelo menos 44px.
6. Tabelas usam cabeçalho fixo e divisores sutis. Tabela é conteúdo, não camada
   flutuante: filete e superfície vêm do tema, sombra nunca.
7. Uma marcação por estado. "Linha alterada" é o filete âmbar à esquerda — não
   também fundo tingido, borda de campo e selo por linha.
8. Número no painel só entra se abrir a lista correspondente. O painel mostra
   o que está parado esperando alguém agir; o censo é metadado do cabeçalho.
9. Um grupo de controles vive num lugar só e num vocabulário só. Busca,
   recorte, ordenação e densidade ficam na mesma barra; o cabeçalho fica com
   criação e importação.
10. Respeitar `prefers-reduced-motion`, já tratado globalmente pelo tema.

## Validação

`npm run check:design` impede a introdução de cores, tipografia, raios,
sombras, movimento e espaçamentos fora do sistema. O comando também faz parte
de `npm run build`.
