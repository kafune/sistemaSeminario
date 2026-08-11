# Product Requirements Document (PRD): Auditoria e Refinamento de Estilos — sistemaSeminario

**Autor:** Manus AI
**Data:** 11 de Agosto de 2026
**Repositório Alvo:** [kafune/sistemaSeminario](https://github.com/kafune/sistemaSeminario) [1]
**Status:** Pronto para Execução

---

## 1. Visão Geral e Contexto

O **sistemaSeminario** (`TOV Acadêmico`) é a aplicação web moderna desenvolvida para substituir sistemas legados e gerenciar os fluxos acadêmicos, secretaria, portal do professor, chamadas digitais e notificações do Centro TOV de Formação Teológica [2]. Embora o projeto possua uma base técnica robusta baseada em React, Vite, Material-UI (MUI) e Progressive Web App (PWA), a interface visual e o sistema de design necessitam de uma auditoria rigorosa e sistemática [2].

O objetivo deste **Product Requirements Document (PRD)** é estabelecer os requisitos, critérios de aceite e diretrizes para uma auditoria completa de estilos (UI/UX audit), elevando a qualidade visual da aplicação aos padrões de excelência de design premium corporativo e de consumo, inspirando-se nas **Apple Human Interface Guidelines (HIG)** [3], bem como nos sistemas de design de referência de mercado como **Linear**, **Vercel (Geist)** e **Stripe** [4] [5].

A aplicação de regras de design premium visa transformar a interface de um software acadêmico funcional em uma experiência elegante, fluida, de alta legibilidade e profunda clareza visual, reforçando a confiança e o profissionalismo da instituição.

---

## 2. Objetivos e Métricas de Sucesso

A auditoria de estilos e o plano de refatoração visual devem atingir as seguintes metas quantitativas e qualitativas:

* **Consistência de Tokens (100% de Adesão):** Eliminar o uso de cores, espaçamentos e raios de borda hardcoded em componentes individuais, centralizando todas as propriedades no arquivo de design tokens (`theme.js`) [2].
* **Hierarquia Tipográfica Clara:** Reduzir a poluição visual aplicando rigorosamente a escala tipográfica baseada nas diretrizes da Apple (SF Pro / Bricolage Grotesque) [6], garantindo que a distinção entre títulos, subtítulos e textos secundários seja imediata.
* **Acessibilidade e Contraste (WCAG 2.1 AA):** Garantir que todas as combinações de texto e fundo (especialmente sobre as superfícies quentes como `#F5F2EE` e `#FFFEFC`) atinjam taxa de contraste mínima de 4.5:1 para texto normal e 3:1 para texto grande.
* **Micro-interações e Feedback:** Padronizar todas as transições de estado (`hover`, `focus`, `active`, `loading`) utilizando curvas de aceleração consistentes (`cubic-bezier(.2,.75,.25,1)`) [2].

### 2.1. Decisões Normativas para Contradições

Quando duas seções deste documento divergirem, prevalecem o requisito específico e a métrica de sucesso, nesta ordem:

1. `radiusMd` é **14px**, conforme `REQ-CMP-01`; o valor de 12px da especificação inicial foi descartado.
2. A curva canônica é **`cubic-bezier(.2,.75,.25,1)`**, conforme a métrica de micro-interações; a curva alternativa da especificação inicial foi descartada.
3. As durações canônicas são **150ms** para feedback imediato e **250ms** para mudanças de estado compostas.
4. A escala de espaçamento usa a base MUI de 8px e admite apenas passos inteiros ou meios passos; portanto, todo resultado visual é múltiplo de **4px**.
5. Coral é uma cor funcional: seu uso é permitido somente em ação, seleção/estado ativo e alerta crítico. Elementos meramente decorativos usam grafite ou tons neutros.

---

## 3. Princípios de Design Adotados

O projeto de auditoria visual adota os pilares fundamentais das **Apple Human Interface Guidelines (HIG)** [3] e os princípios de densidade e precisão de ferramentas modernas de desenvolvimento [4] [5]:

| Princípio Apple HIG | Aplicação no sistemaSeminario |
| :--- | :--- |
| **Clareza (Clarity)** | O texto deve ser perfeitamente legível em qualquer tamanho; os ícones e controles devem comunicar sua função sem ambiguidade, evitando elementos decorativos excessivos. |
| **Deferência (Deference)** | A interface deve suportar e valorizar o conteúdo acadêmico (grades, notas, frequências, mensagens), mantendo os elementos de navegação sutis e discretos. |
| **Profundidade (Depth)** | A hierarquia visual deve ser construída através de camadas sutis de superfícies, sombras difusas de baixa opacidade e filetes de borda (`hairline borders`), evitando sombras pesadas ou artificiais [4] [5]. |
| **Consistência (Consistency)** | Padrões de botões, formulários, tabelas e modais devem se comportar de maneira idêntica em todas as páginas e portais (secretaria e professor). |
| **Craft (Zêlo pelo Detalhe)** | Cuidado meticuloso com espaçamentos baseados em grid de 4px/8px, alinhamentos perfeitos e transições suaves em todas as interações. |

---

## 4. Inventário e Auditoria do Estado Atual

A análise da arquitetura de frontend existente (`frontend/src/theme.js` e `DESIGN_SYSTEM.md`) revela a seguinte fundação visual atual, que servirá de ponto de partida para a auditoria [2]:

| Categoria | Token Atual (`theme.js`) | Valor Atual | Diagnóstico da Auditoria |
|---|---|---|---|
| **Canvas** | `TOV.canvas` | `#F5F2EE` | Excelente tom quente editorial; manter, mas auditar consistência de fundo em modais e drawers. |
| **Superfície** | `TOV.surface` | `#FFFEFC` | Branco quente de alta qualidade; verificar contraste com cartões flutuantes. |
| **Tinta (Texto Principal)** | `TOV.ink` | `#191B1D` | Excelente contraste; garantir uso em todos os títulos principais. |
| **Grafite (Estrutura)** | `TOV.graphite` | `#343B3F` | Adequado para elementos estruturais secundários e ícones. |
| **Coral (Assinatura)** | `TOV.coral` | `#C92F2F` | Cor de destaque histórico; deve ser restrita estritamente a ações primárias e alertas. |
| **Caption (Secundário)** | `TOV.caption` | `#5E696F` | **Ponto de Atenção:** Em fundos quentes, verificar se atinge contraste mínimo AA. |
| **Bordas** | `TOV.border` | `#DED7D0` | Bom equilíbrio para filetes finos estilo Linear/Apple. |

---

## 5. Matriz de Gaps e Requisitos de Melhoria

A auditoria identifica lacunas específicas organizadas por domínio de interface, especificando o problema atual e o requisito de correção baseado em design premium.

### 5.1. Tipografia e Escala

* **Gap Identificado:** Mistura inconsistente de tamanhos de fonte em cartões de métricas e tabelas de notas, gerando ruído visual.
* **Requisito de Melhoria (REQ-TYP-01):** Implementar uma escala tipográfica estrita baseada em proporções harmônicas. Títulos principais devem utilizar `fontHead` (`Bricolage Grotesque`) com pesos médios a negritos (`500` a `700`), enquanto o corpo de texto deve utilizar rigorosamente `fontBody` (`Open Sans`) com line-height ajustado (mínimo `1.5`) para assegurar legibilidade em densidade acadêmica.

### 5.2. Sistema de Cores e Contraste

* **Gap Identificado:** Alguns elementos com texto secundário (`TOV.caption`) apresentam legibilidade marginal em telas menores sob luz solar ou ambientes externos (cenário de uso em iPads nas salas de aula).
* **Requisito de Melhoria (REQ-COL-01):** Revisar todos os tokens de texto secundário, escurecendo sutilmente o tom de caption para `#525D63` quando aplicado sobre superfícies quentes, garantindo conformidade absoluta com WCAG AA. Restringir o uso do coral (`#C92F2F`) exclusivamente a botões de ação primária, estados ativos de navegação e indicadores de alerta crítico.

### 5.3. Espaçamento, Grid e Elevação (Depth)

* **Gap Identificado:** Uso esporádico de sombras pesadas (`box-shadow`) em componentes legados que conflitam com o estilo plano e limpo das novas telas do portal do professor.
* **Requisito de Melhoria (REQ-SPC-01):** Padronizar o sistema de espaçamentos em múltiplos de 4px/8px. Eliminar sombras de forte elevação, substituindo-as por bordas de cabelo (`hairline borders` de `1px solid TOV.border`) e sombras difusas hiper-suaves (`TOV.shadowRaised`), inspiradas no padrão de profundidade sutil da Linear [4] [5].

### 5.4. Componentes de Interface (Botões, Inputs, Tabelas)

* **Gap Identificado:** Estados de foco (`focus-visible`) inconsistentes em inputs de formulários da secretaria e de lançamento de notas.
* **Requisito de Melhoria (REQ-CMP-01):** Padronizar todos os campos de formulário com bordas arredondadas consistentes (`radiusMd` = 14px), estados de hover fluidos e anel de foco (`focus ring`) em tom coral translúcido (`rgba(201,47,47,.25)`) com largura de 3px, garantindo acessibilidade para navegação via teclado.
* **Requisito de Melhoria (REQ-CMP-02):** Refinar as tabelas de dados (listas de alunos, boletins e chamadas) aplicando linhas divisorias sutis (`TOV.divider`), efeito zebra opcional de altíssima subtileza (`TOV.surfaceMuted`) e cabeçalhos fixos com tipografia em caixa alta de menor corpo e tracking expandido.

---

## 6. Especificação Técnica dos Design Tokens Propostos

Para consolidar a auditoria, o arquivo de tokens (`frontend/src/theme.js`) deve ser atualizado com o seguinte conjunto refinado de variáveis semânticas:

```javascript
export const TOV_PREMIUM_TOKENS = {
  canvas: '#F5F2EE',
  surface: '#FFFEFC',
  surfaceMuted: '#F0ECE6',
  surfaceElevated: '#FFFFFF',
  ink: '#141618',
  graphite: '#2C3236',
  caption: '#525D63',
  border: '#D8CEC4',
  divider: '#E4DDD5',

  // Ações e Feedback
  primary: '#C92F2F',
  primaryHover: '#B52525',
  primaryActive: '#9E1D1D',
  success: '#1E6B43',
  warning: '#8C5210',
  danger: '#A81C24',

  // Tipografia
  fontHead: "'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, sans-serif",
  fontBody: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  fontMono: "'JetBrains Mono', monospace",

  // Raio de Borda (Alinhado com Apple iOS / macOS corner smoothing)
  radiusSm: 8,
  radiusMd: 14,
  radiusLg: 16,
  radiusFull: 9999,

  // Profundidade e Elevação (Estilo Linear / Apple Glass sutil)
  shadowHairline: 'inset 0 0 0 1px rgba(216, 206, 196, 0.6)',
  shadowCard: '0 1px 3px rgba(25, 27, 29, 0.04), 0 1px 2px rgba(25, 27, 29, 0.06)',
  shadowRaised: '0 12px 32px -16px rgba(25, 27, 29, 0.12), 0 2px 6px rgba(25, 27, 29, 0.04)',

  // Transições
  transitionFast: '150ms cubic-bezier(.2, .75, .25, 1)',
  transitionBase: '250ms cubic-bezier(.2, .75, .25, 1)'
};
```

---

## 7. Roadmap de Implementação da Auditoria

A execução das melhorias identificadas na auditoria será dividida em 3 fases práticas no repositório:

1. **Fase 1: Quick Wins & Tokenização (Sprint 1)**
   - Atualização do arquivo `theme.js` com os tokens refinados.
   - Substituição de cores hardcoded e classes legadas remanescentes nos componentes globais (`Layout.jsx`, `CabecalhoPagina`).
2. **Fase 2: Refatoração de Componentes Core (Sprint 2)**
   - Padronização de botões, inputs, modais e tooltips utilizando os novos raios de borda e estados de foco.
   - Ajuste de contraste e tipografia em tabelas e cards de métricas.
3. **Fase 3: Validação Multi-dispositivo & Acessibilidade (Sprint 3)**
   - Testes de usabilidade em modo tablet (iPad na chamada digital / totem).
   - Verificação de contraste WCAG AA em todas as páginas e validação de PWA offline.

---

## 8. Referências

1. Repositório oficial do projeto: [GitHub - kafune/sistemaSeminario](https://github.com/kafune/sistemaSeminario)
2. Documentação interna do sistema visual: `frontend/src/DESIGN_SYSTEM.md` e `frontend/src/theme.js`
3. Apple Human Interface Guidelines: [Apple Developer - Design Principles & HIG](https://developer.apple.com/design/human-interface-guidelines/)
4. Linear Design System & Depth Conventions: [DesignMD - Linear App Tokens](https://designmd.co/d/linear.app)
5. Vercel Geist Design System: [Vercel - Typography and Color Tokens](https://vercel.com/geist/introduction)
