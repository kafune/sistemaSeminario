import { alpha, createTheme } from '@mui/material'
import { ptBR } from '@mui/material/locale'

/**
 * Design tokens do TOV.
 *
 * A paleta mantém o coral histórico, mas o reserva a ação, seleção e alerta.
 * A hierarquia do produto é construída principalmente com tinta, grafite,
 * superfícies quentes e filetes finos.
 */
export const TOV = {
  canvas: '#F5F2EE',
  surface: '#FFFEFC',
  surfaceMuted: '#F0ECE6',
  surfaceElevated: '#FFFFFF',
  surfaceHover: '#FBF9F6',
  surfacePressed: '#F7F3EF',
  ink: '#141618',
  graphite: '#2C3236',
  coral: '#C92F2F',
  primary: '#C92F2F',
  coralHover: '#B52525',
  primaryHover: '#B52525',
  coralActive: '#9E1D1D',
  primaryActive: '#9E1D1D',
  coralOnDark: '#FF9A9A',
  caption: '#525D63',
  border: '#D8CEC4',
  borderHover: '#BFB5AD',
  divider: '#E4DDD5',

  coralTint: 'rgba(201,47,47,.09)',
  coralTintStrong: 'rgba(201,47,47,.15)',
  coralBorder: 'rgba(201,47,47,.18)',
  graphiteTint: 'rgba(44,50,54,.09)',
  graphiteBorder: 'rgba(44,50,54,.13)',
  captionTint: 'rgba(82,93,99,.12)',
  captionBorder: 'rgba(82,93,99,.15)',
  success: '#1E6B43',
  successBright: '#62C596',
  successSurface: 'rgba(30,107,67,.075)',
  successTint: 'rgba(30,107,67,.11)',
  successBorder: 'rgba(30,107,67,.18)',
  warning: '#8C5210',
  warningTint: 'rgba(140,82,16,.12)',
  warningBorder: 'rgba(140,82,16,.18)',
  info: '#356A82',
  infoTint: 'rgba(53,106,130,.11)',
  infoBorder: 'rgba(53,106,130,.17)',
  danger: '#A81C24',
  dangerTint: 'rgba(168,28,36,.10)',
  dangerBorder: 'rgba(168,28,36,.17)',

  onDark: '#FFFFFF',
  onDarkStrong: 'rgba(255,255,255,.85)',
  onDarkBody: 'rgba(255,255,255,.78)',
  onDarkMuted: 'rgba(255,255,255,.68)',
  onDarkSurface: 'rgba(255,255,255,.08)',
  onDarkSurfaceHover: 'rgba(255,255,255,.12)',
  onDarkDecoration: 'rgba(255,255,255,.045)',
  onDarkBorder: 'rgba(255,255,255,.16)',
  onDarkBorderHover: 'rgba(255,255,255,.28)',
  onDarkBorderStrong: 'rgba(255,255,255,.45)',
  focusOnDark: 'rgba(255,154,154,.42)',
  darkHairline: 'rgba(20,22,24,.14)',
  darkGradient: 'linear-gradient(115deg, rgba(20,22,24,.26), rgba(44,50,54,0) 58%)',
  glassSurface: 'rgba(255,255,255,.94)',
  glassSurfaceSoft: 'rgba(255,255,255,.55)',
  glassSurfaceFaint: 'rgba(255,255,255,.42)',
  glassOverlay: 'rgba(255,255,255,.72)',
  loginGrid: 'linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)',
  feedbackGradient: 'radial-gradient(circle at 50% 34%, rgba(30,107,67,.34), transparent 38%), linear-gradient(145deg, #252A2D, #141618)',

  whatsappGreen: '#176B61',
  whatsappSuccess: '#247A49',
  whatsappSuccessTint: '#E8F7EE',
  whatsappBubble: '#D8F7C8',
  whatsappCanvas: '#E8DDD4',
  whatsappBorder: '#D8CEC6',
  whatsappMeta: '#60806A',
  whatsappMuted: '#6A5C52',
  whatsappPattern: 'rgba(95,74,61,.08)',
  whatsappPanel: 'rgba(255,255,255,.62)',
  darkDivider: 'rgba(20,22,24,.08)',
  darkDividerStrong: 'rgba(20,22,24,.12)',

  fontHead: "'Bricolage Grotesque', -apple-system, BlinkMacSystemFont, sans-serif",
  fontBody: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  type: {
    micro: 10,
    overline: 11,
    caption: 12,
    bodySm: 13,
    body: 14,
    bodyLg: 16,
    section: 18,
    titleSm: 20,
    title: 24,
    titleLg: 28,
    displaySm: 32,
    display: 40,
    hero: 48,
    heroLg: 56,
  },
  sidebarW: 272,
  railW: 72,

  // Duas alturas de controle no sistema inteiro: 48 para acao primaria,
  // formulario e dialogo; 44 para barra densa (filtros, regua da tabela).
  // 44 tambem e o piso de alvo de toque, entao nada desce abaixo disso.
  controlH: 48,
  controlHSm: 44,

  // Os raios carregam a unidade. O `sx` do MUI multiplica raio numerico por
  // `shape.borderRadius`, entao `borderRadius: 8` viraria 112px e arredondaria
  // a caixa inteira. Com string em px o valor vale igual no `sx`, nos
  // `styleOverrides` e dentro de template literal.
  radiusXs: '4px',
  radiusNone: '0px',
  radiusSm: '8px',
  radiusMd: '14px',
  radiusLg: '16px',
  radiusXl: '20px',
  radius2xl: '24px',
  radiusDisplay: '32px',
  radiusFull: '9999px',
  radiusPill: '9999px',
  radiusMessage: '12px 2px 12px 12px',
  shadowHairline: 'inset 0 0 0 1px rgba(216,206,196,.6)',
  shadowRaised: '0 12px 32px -16px rgba(20,22,24,.12), 0 2px 6px rgba(20,22,24,.04)',
  shadowFloating: '0 20px 48px -20px rgba(20,22,24,.22), 0 4px 12px rgba(20,22,24,.06)',
  shadowTop: '0 -8px 24px rgba(20,22,24,.04)',
  shadowInteractive: '0 8px 24px -20px rgba(20,22,24,.22)',
  shadowHeader: '0 12px 30px -28px rgba(20,22,24,.32)',
  shadowSuccess: '0 24px 60px -28px rgba(98,197,150,.48)',
  shadowMessage: '0 2px 5px rgba(20,22,24,.12)',
  durationFast: '150ms',
  durationBase: '250ms',
  ease: 'cubic-bezier(.2,.75,.25,1)',
  transitionFast: '150ms cubic-bezier(.2,.75,.25,1)',
  transitionBase: '250ms cubic-bezier(.2,.75,.25,1)',
  transitionFeedback: '1700ms linear',
}

export const focusRing = {
  outline: `3px solid ${alpha(TOV.coral, 0.25)}`,
  outlineOffset: 2,
}

export const focusRingOnDark = {
  outline: `3px solid ${TOV.focusOnDark}`,
  outlineOffset: 2,
}

export const tovTheme = createTheme(
  {
    palette: {
      mode: 'light',
      primary: { main: TOV.primary, dark: TOV.primaryHover, light: TOV.coralOnDark, contrastText: TOV.onDark },
      secondary: { main: TOV.graphite, dark: TOV.ink, contrastText: TOV.onDark },
      error: { main: TOV.danger },
      warning: { main: TOV.warning },
      info: { main: TOV.info },
      success: { main: TOV.success },
      background: { default: TOV.canvas, paper: TOV.surface },
      text: { primary: TOV.ink, secondary: TOV.caption },
      divider: TOV.divider,
      action: {
        active: TOV.graphite,
        hover: alpha(TOV.graphite, 0.045),
        selected: TOV.coralTint,
        disabled: alpha(TOV.caption, 0.6),
        disabledBackground: alpha(TOV.caption, 0.1),
        focus: alpha(TOV.coral, 0.12),
      },
    },
    typography: {
      fontFamily: TOV.fontBody,
      h1: {
        fontFamily: TOV.fontHead,
        fontWeight: 700,
        fontSize: 'clamp(2rem, 3.2vw, 2.75rem)',
        lineHeight: 1.05,
        letterSpacing: '-.035em',
      },
      h2: {
        fontFamily: TOV.fontHead,
        fontWeight: 700,
        fontSize: 'clamp(1.65rem, 2.4vw, 2.125rem)',
        lineHeight: 1.08,
        letterSpacing: '-.025em',
      },
      h3: { fontFamily: TOV.fontHead, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-.015em' },
      h4: { fontFamily: TOV.fontHead, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-.01em' },
      h5: { fontFamily: TOV.fontHead, fontWeight: 700, lineHeight: 1.25 },
      h6: { fontFamily: TOV.fontHead, fontWeight: 700, lineHeight: 1.3 },
      subtitle1: { fontWeight: 600, lineHeight: 1.45 },
      body1: { fontSize: TOV.type.body, lineHeight: 1.6 },
      body2: { fontSize: TOV.type.bodySm, lineHeight: 1.55 },
      button: { textTransform: 'none', fontWeight: 700, letterSpacing: 0 },
      overline: {
        fontFamily: TOV.fontHead,
        fontWeight: 700,
        fontSize: TOV.type.overline,
        lineHeight: 1.45,
        letterSpacing: '.16em',
      },
      caption: { fontSize: TOV.type.caption, lineHeight: 1.5 },
    },
    // O MUI exige numero sem unidade aqui; e o mesmo valor de `radiusMd`.
    shape: { borderRadius: parseFloat(TOV.radiusMd) },
    breakpoints: {
      // `tablet` (768px) é a faixa do iPad retrato: já recebe tabela e trilha
      // de navegação, em vez da interface de celular que ia até 900px.
      values: { xs: 0, sm: 600, tablet: 768, md: 900, lg: 1200, xl: 1536 },
    },
    components: {
      MuiTypography: {
        defaultProps: {
          // Preserva a aparência dos variants e evita saltos h1 -> h3 nas páginas.
          variantMapping: { h1: 'h1', h2: 'h2', h3: 'h2', h4: 'h3', h5: 'h4', h6: 'h5' },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          ':root': { colorScheme: 'light' },
          html: { minWidth: 320, backgroundColor: TOV.canvas },
          body: {
            minWidth: 320,
            backgroundColor: TOV.canvas,
            color: TOV.ink,
            textRendering: 'optimizeLegibility',
            WebkitFontSmoothing: 'antialiased',
          },
          '#root': { minHeight: '100vh' },
          '::selection': { backgroundColor: TOV.coralTintStrong, color: TOV.ink },
          'a, button, input, textarea, select': {
            WebkitTapHighlightColor: 'transparent',
          },
          'a:focus-visible, button:focus-visible': focusRing,
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              scrollBehavior: 'auto !important',
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
          rounded: { borderRadius: TOV.radiusLg },
          elevation1: { boxShadow: TOV.shadowRaised },
          elevation8: { boxShadow: TOV.shadowFloating },
        },
      },
      MuiButtonBase: {
        defaultProps: { disableRipple: true },
        styleOverrides: {
          root: {
            transition: `background-color ${TOV.durationFast} ${TOV.ease}, color ${TOV.durationFast} ${TOV.ease}, border-color ${TOV.durationFast} ${TOV.ease}, transform ${TOV.durationFast} ${TOV.ease}`,
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: TOV.radiusSm,
            paddingInline: 16,
            minHeight: TOV.controlH,
            boxShadow: 'none',
            '&:focus-visible': focusRing,
            '&:active:not(.Mui-disabled)': { transform: 'translateY(1px)' },
          },
          sizeSmall: { minHeight: TOV.controlHSm, paddingInline: 16 },
          containedPrimary: {
            boxShadow: 'none',
            '&:hover': { boxShadow: 'none', backgroundColor: TOV.coralHover },
          },
          containedSecondary: {
            backgroundColor: TOV.graphite,
            '&:hover': { backgroundColor: TOV.ink },
          },
          outlined: {
            borderColor: TOV.border,
            color: TOV.graphite,
            borderWidth: 1,
            backgroundColor: TOV.surface,
            '&:hover': {
              borderWidth: 1,
              borderColor: TOV.graphite,
              backgroundColor: TOV.surface,
            },
          },
          text: {
            '&:hover': { backgroundColor: TOV.coralTint },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            minWidth: TOV.controlHSm,
            minHeight: TOV.controlHSm,
            borderRadius: TOV.radiusSm,
            '&:focus-visible': focusRing,
          },
          sizeSmall: { minWidth: TOV.controlHSm, minHeight: TOV.controlHSm },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            minHeight: 30,
            borderRadius: TOV.radiusPill,
            fontWeight: 700,
            borderColor: TOV.border,
          },
          clickable: {
            '&:hover': { backgroundColor: TOV.graphiteTint },
            '&:focus-visible': focusRing,
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: { color: TOV.caption, '&.Mui-focused': { color: TOV.coral } },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            minHeight: TOV.controlH,
            borderRadius: TOV.radiusMd,
            backgroundColor: TOV.surface,
            transition: `box-shadow ${TOV.durationFast} ${TOV.ease}, background-color ${TOV.durationFast} ${TOV.ease}`,
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: TOV.caption },
            '&.Mui-focused': {
              boxShadow: `0 0 0 3px ${alpha(TOV.coral, 0.25)}`,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: TOV.coral, borderWidth: 1.5 },
            },
            '&.Mui-error': {
              backgroundColor: alpha(TOV.danger, 0.025),
              '& .MuiOutlinedInput-notchedOutline': { borderColor: TOV.danger },
            },
            '&.Mui-disabled': { backgroundColor: alpha(TOV.caption, 0.07) },
          },
          sizeSmall: { minHeight: TOV.controlHSm },
          input: { paddingTop: 12, paddingBottom: 12 },
          inputSizeSmall: { paddingTop: 12, paddingBottom: 12 },
          notchedOutline: { borderColor: TOV.border, borderWidth: 1 },
        },
      },
      MuiFormHelperText: {
        styleOverrides: { root: { marginLeft: 4, marginRight: 4 } },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            borderRadius: TOV.radiusMd,
            border: `1px solid ${TOV.border}`,
            backgroundColor: TOV.surface,
            boxShadow: 'none',
          },
        },
      },
      MuiTable: {
        defaultProps: { stickyHeader: true },
        styleOverrides: { root: { borderCollapse: 'separate', borderSpacing: 0 } },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            height: 44,
            padding: '8px 16px',
            borderBottom: `1px solid ${TOV.divider}`,
            fontSize: TOV.type.body,
            fontVariantNumeric: 'tabular-nums',
            // Densidade compacta: aplicada pelo container da tabela.
            '[data-densidade="compacta"] &': { height: 40, paddingTop: 4, paddingBottom: 4 },
          },
          head: {
            height: 40,
            paddingTop: 8,
            paddingBottom: 8,
            backgroundColor: TOV.surfaceMuted,
            fontFamily: TOV.fontHead,
            fontWeight: 600,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            color: TOV.caption,
            fontSize: TOV.type.caption,
            borderBottom: `1px solid ${TOV.border}`,
            '[data-densidade="compacta"] &': { height: 40, paddingTop: 8, paddingBottom: 8 },
          },
          stickyHeader: {
            top: 0,
            zIndex: 2,
            backgroundColor: TOV.surfaceMuted,
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            transition: `background-color ${TOV.durationFast} ${TOV.ease}`,
            '&.MuiTableRow-hover:hover': { backgroundColor: alpha(TOV.graphite, 0.035) },
            '&:last-child td': { borderBottom: 0 },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: TOV.radiusLg,
            border: `1px solid ${TOV.border}`,
            boxShadow: TOV.shadowFloating,
            backgroundColor: TOV.surface,
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            padding: '24px 24px 12px',
            fontFamily: TOV.fontHead,
            fontWeight: 700,
            letterSpacing: '-.015em',
          },
        },
      },
      MuiDialogContent: { styleOverrides: { root: { padding: '12px 24px 20px' } } },
      MuiDialogActions: { styleOverrides: { root: { padding: '12px 24px 24px', gap: 8 } } },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: TOV.controlH, borderBottom: `1px solid ${TOV.divider}` },
          indicator: { height: 4, borderRadius: `${TOV.radiusXs} ${TOV.radiusXs} 0 0` },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: TOV.controlH,
            minWidth: TOV.controlHSm,
            padding: '8px 16px',
            textTransform: 'none',
            fontWeight: 700,
            fontSize: TOV.type.body,
            color: TOV.caption,
            '&.Mui-selected': { color: TOV.ink },
            '&:focus-visible': { ...focusRing, outlineOffset: -3 },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: TOV.ink,
            borderRadius: TOV.radiusSm,
            padding: '8px 12px',
            fontSize: TOV.type.caption,
          },
          arrow: { color: TOV.ink },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundImage: 'none' },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: TOV.radiusSm, alignItems: 'center' },
          standardError: { backgroundColor: TOV.dangerTint, color: TOV.danger },
          standardWarning: { backgroundColor: TOV.warningTint, color: TOV.warning },
          standardInfo: { backgroundColor: TOV.infoTint, color: TOV.info },
          standardSuccess: { backgroundColor: TOV.successTint, color: TOV.success },
          filledWarning: { backgroundColor: TOV.warning, color: TOV.onDark },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: { borderRadius: TOV.radiusSm, backgroundColor: TOV.ink, boxShadow: TOV.shadowFloating },
        },
      },
      MuiSkeleton: {
        defaultProps: { animation: 'wave' },
        styleOverrides: { root: { backgroundColor: TOV.surfaceMuted } },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { height: 8, borderRadius: TOV.radiusFull, backgroundColor: TOV.surfaceMuted },
          bar: { borderRadius: TOV.radiusFull },
        },
      },
      MuiPaginationItem: {
        styleOverrides: {
          root: {
            minWidth: TOV.controlHSm,
            height: TOV.controlHSm,
            borderRadius: TOV.radiusSm,
            fontWeight: 700,
            '&.Mui-selected': { backgroundColor: TOV.coral, color: TOV.onDark },
            '&:focus-visible': focusRing,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: { border: `1px solid ${TOV.border}`, boxShadow: TOV.shadowFloating },
          list: { padding: 8 },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            minHeight: TOV.controlHSm,
            borderRadius: TOV.radiusSm,
            '&.Mui-selected': { backgroundColor: TOV.coralTint },
            '&.Mui-selected:hover': { backgroundColor: TOV.coralTintStrong },
          },
        },
      },
      MuiBottomNavigation: {
        styleOverrides: { root: { backgroundColor: TOV.surface } },
      },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: { minHeight: 60, color: TOV.caption, '&.Mui-selected': { color: TOV.coral } },
          label: { fontSize: TOV.type.overline, fontWeight: 700, '&.Mui-selected': { fontSize: TOV.type.overline } },
        },
      },
    },
  },
  ptBR,
)
