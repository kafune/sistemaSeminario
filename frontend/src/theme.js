import { alpha, createTheme } from '@mui/material'
import { ptBR } from '@mui/material/locale'

/**
 * Design tokens do TOV.
 *
 * A paleta mantém o coral histórico, mas o utiliza como assinatura e ação.
 * A hierarquia do produto é construída principalmente com tinta, grafite,
 * superfícies quentes e filetes finos.
 */
export const TOV = {
  canvas: '#F5F2EE',
  surface: '#FFFEFC',
  surfaceMuted: '#EEE9E4',
  ink: '#191B1D',
  graphite: '#343B3F',
  coral: '#C92F2F',
  coralHover: '#AE2828',
  coralBright: '#F14949',
  caption: '#68737A',
  border: '#DED7D0',
  divider: '#E8E2DC',

  // Aliases mantidos para as telas existentes durante a consolidação.
  offwhite: '#F5F2EE',
  white: '#FFFEFC',
  slate: '#343B3F',
  desk: '#E8E2DC',

  coralTint: 'rgba(201,47,47,.09)',
  coralTintStrong: 'rgba(201,47,47,.15)',
  slateTint: 'rgba(52,59,63,.09)',
  captionTint: 'rgba(104,115,122,.12)',
  success: '#277451',
  successTint: 'rgba(39,116,81,.11)',
  warning: '#9A5B12',
  warningTint: 'rgba(154,91,18,.12)',
  info: '#356A82',
  infoTint: 'rgba(53,106,130,.11)',
  danger: '#B4232A',
  dangerTint: 'rgba(180,35,42,.10)',

  fontHead: "'Bricolage Grotesque', sans-serif",
  fontBody: "'Open Sans', sans-serif",
  sidebarW: 272,

  radiusSm: 10,
  radiusMd: 14,
  radiusLg: 18,
  radiusPill: 999,
  shadowCard: 'none',
  shadowRaised: '0 16px 40px -28px rgba(25,27,29,.42), 0 2px 8px rgba(25,27,29,.05)',
  shadowFloating: '0 22px 50px -24px rgba(25,27,29,.35)',
  shadowBtn: 'none',
  durationFast: '160ms',
  durationBase: '220ms',
  ease: 'cubic-bezier(.2,.75,.25,1)',
}

const focusRing = {
  outline: `3px solid ${alpha(TOV.coral, 0.28)}`,
  outlineOffset: 2,
}

export const tovTheme = createTheme(
  {
    palette: {
      mode: 'light',
      primary: { main: TOV.coral, dark: TOV.coralHover, light: TOV.coralBright, contrastText: '#fff' },
      secondary: { main: TOV.graphite, dark: TOV.ink, contrastText: '#fff' },
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
      body1: { fontSize: 15, lineHeight: 1.6 },
      body2: { fontSize: 14, lineHeight: 1.55 },
      button: { textTransform: 'none', fontWeight: 700, letterSpacing: 0 },
      overline: {
        fontFamily: TOV.fontHead,
        fontWeight: 700,
        fontSize: 11,
        lineHeight: 1.45,
        letterSpacing: '.16em',
      },
      caption: { fontSize: 12, lineHeight: 1.5 },
    },
    shape: { borderRadius: TOV.radiusMd },
    components: {
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
            paddingInline: 18,
            minHeight: 46,
            boxShadow: 'none',
            '&:focus-visible': focusRing,
            '&:active:not(.Mui-disabled)': { transform: 'translateY(1px)' },
          },
          sizeSmall: { minHeight: 44, paddingInline: 14 },
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
            minWidth: 44,
            minHeight: 44,
            borderRadius: TOV.radiusSm,
            '&:focus-visible': focusRing,
          },
          sizeSmall: { minWidth: 44, minHeight: 44 },
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
            '&:hover': { backgroundColor: TOV.slateTint },
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
            borderRadius: TOV.radiusSm,
            backgroundColor: TOV.surface,
            transition: `box-shadow ${TOV.durationFast} ${TOV.ease}, background-color ${TOV.durationFast} ${TOV.ease}`,
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: TOV.caption },
            '&.Mui-focused': {
              boxShadow: `0 0 0 3px ${alpha(TOV.coral, 0.1)}`,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: TOV.coral, borderWidth: 1.5 },
            },
            '&.Mui-error': {
              backgroundColor: alpha(TOV.danger, 0.025),
              '& .MuiOutlinedInput-notchedOutline': { borderColor: TOV.danger },
            },
            '&.Mui-disabled': { backgroundColor: alpha(TOV.caption, 0.07) },
          },
          input: { paddingTop: 13, paddingBottom: 13 },
          inputSizeSmall: { paddingTop: 11.5, paddingBottom: 11.5 },
          notchedOutline: { borderColor: TOV.border, borderWidth: 1 },
        },
      },
      MuiFormHelperText: {
        styleOverrides: { root: { marginLeft: 2, marginRight: 2 } },
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
        styleOverrides: { root: { borderCollapse: 'separate', borderSpacing: 0 } },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            height: 54,
            padding: '10px 16px',
            borderBottom: `1px solid ${TOV.divider}`,
            fontSize: 14,
          },
          head: {
            height: 44,
            paddingTop: 8,
            paddingBottom: 8,
            backgroundColor: '#F0ECE7',
            fontFamily: TOV.fontHead,
            fontWeight: 700,
            letterSpacing: '.11em',
            textTransform: 'uppercase',
            color: TOV.caption,
            fontSize: 10.5,
            borderBottom: `1px solid ${TOV.border}`,
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
          root: { minHeight: 48, borderBottom: `1px solid ${TOV.divider}` },
          indicator: { height: 3, borderRadius: '3px 3px 0 0' },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 48,
            minWidth: 44,
            padding: '8px 16px',
            textTransform: 'none',
            fontWeight: 700,
            fontSize: 14,
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
            borderRadius: 8,
            padding: '7px 10px',
            fontSize: 12,
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
          standardError: { backgroundColor: TOV.dangerTint, color: '#7D1B22' },
          standardWarning: { backgroundColor: TOV.warningTint, color: '#70420D' },
          standardInfo: { backgroundColor: TOV.infoTint, color: '#244D61' },
          standardSuccess: { backgroundColor: TOV.successTint, color: '#1D5A3E' },
          filledWarning: { backgroundColor: '#6F4718', color: '#fff' },
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
          root: { height: 7, borderRadius: 99, backgroundColor: TOV.surfaceMuted },
          bar: { borderRadius: 99 },
        },
      },
      MuiPaginationItem: {
        styleOverrides: {
          root: {
            minWidth: 44,
            height: 44,
            borderRadius: TOV.radiusSm,
            fontWeight: 700,
            '&.Mui-selected': { backgroundColor: TOV.coral, color: '#fff' },
            '&:focus-visible': focusRing,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: { border: `1px solid ${TOV.border}`, boxShadow: TOV.shadowFloating },
          list: { padding: 6 },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            minHeight: 44,
            borderRadius: 8,
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
          label: { fontSize: 11, fontWeight: 700, '&.Mui-selected': { fontSize: 11 } },
        },
      },
    },
  },
  ptBR,
)
