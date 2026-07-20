// Design system TOV (coral/slate) — tema MUI global.
// Baseado no theme.tov.js do handoff, com alguns overrides a mais para tabelas,
// diálogos e inputs, de modo que as telas fiquem coerentes sem repetir sx.
import { createTheme } from '@mui/material'
import { ptBR } from '@mui/material/locale'

// Tokens crus — reexportados para uso em sx pontual nas telas.
export const TOV = {
  coral: '#F14949',
  coralHover: '#D93B3B',
  slate: '#4A575E',
  offwhite: '#F7F4F1',
  white: '#FFFFFF',
  ink: '#16181A',
  caption: '#8A949A',
  border: '#E2DBD5',
  desk: '#E8E3DE',
  divider: '#EDE6E0',
  coralTint: 'rgba(241,73,73,.10)',
  slateTint: 'rgba(74,87,94,.12)',
  captionTint: 'rgba(138,148,154,.16)',
  fontHead: "'Bricolage Grotesque', sans-serif",
  fontBody: "'Open Sans', sans-serif",
  sidebarW: 262,
  shadowCard: '0 1px 2px rgba(22,24,26,.04)',
  shadowBtn: '0 12px 24px -10px rgba(241,73,73,.7)',
}

export const tovTheme = createTheme(
  {
    palette: {
      primary: { main: TOV.coral, dark: TOV.coralHover, contrastText: '#fff' },
      secondary: { main: TOV.slate },
      background: { default: TOV.offwhite, paper: TOV.white },
      text: { primary: TOV.ink, secondary: TOV.caption },
      divider: TOV.divider,
      action: { hover: TOV.offwhite },
    },
    typography: {
      fontFamily: TOV.fontBody,
      h1: { fontFamily: TOV.fontHead, fontWeight: 700, lineHeight: 1.02, letterSpacing: '-.01em' },
      h2: { fontFamily: TOV.fontHead, fontWeight: 700, lineHeight: 1.02, letterSpacing: '-.01em' },
      h3: { fontFamily: TOV.fontHead, fontWeight: 700, lineHeight: 1.05 },
      h4: { fontFamily: TOV.fontHead, fontWeight: 700 },
      h5: { fontFamily: TOV.fontHead, fontWeight: 700 },
      h6: { fontFamily: TOV.fontHead, fontWeight: 700 },
      button: { textTransform: 'none', fontWeight: 700 },
      overline: { fontFamily: TOV.fontHead, fontWeight: 600, letterSpacing: '.2em' },
    },
    shape: { borderRadius: 12 },
    components: {
      MuiPaper: {
        styleOverrides: {
          rounded: { borderRadius: 16 },
          root: { backgroundImage: 'none' },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 11, paddingInline: 18, minHeight: 46 },
          sizeSmall: { minHeight: 38, paddingInline: 14 },
          containedPrimary: { boxShadow: TOV.shadowBtn, '&:hover': { boxShadow: TOV.shadowBtn } },
          outlined: { borderColor: TOV.border, color: TOV.slate, borderWidth: 1.5, '&:hover': { borderWidth: 1.5, borderColor: TOV.slate, background: TOV.white } },
        },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 999, fontWeight: 700 } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: 11, backgroundColor: TOV.white },
          notchedOutline: { borderColor: TOV.border, borderWidth: 1.5 },
        },
      },
      MuiTableContainer: { styleOverrides: { root: { borderRadius: 16 } } },
      MuiTableCell: {
        styleOverrides: {
          root: { borderBottom: `1px solid ${TOV.offwhite}`, fontSize: 15 },
          head: {
            fontFamily: TOV.fontHead,
            fontWeight: 600,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            color: TOV.caption,
            fontSize: 11,
            borderBottom: `2px solid ${TOV.offwhite}`,
          },
        },
      },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 18 } } },
      MuiDialogTitle: { styleOverrides: { root: { fontFamily: TOV.fontHead, fontWeight: 700 } } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 700, fontSize: 15 } } },
      MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: TOV.ink, fontSize: 12 } } },
    },
  },
  ptBR,
)
