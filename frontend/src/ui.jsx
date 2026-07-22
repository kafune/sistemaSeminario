// Peças reutilizáveis do design system TOV: régua de seção, eyebrow, cabeçalho
// de página, pílula de status, avatar de iniciais e helpers responsivos.
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography, useMediaQuery, useTheme } from '@mui/material'
import { TOV } from './theme'

/**
 * Reset de estilos para tornar Box clicável um <button> de verdade
 * (acessível por teclado) sem perder o visual do design.
 */
export const resetBotao = {
  appearance: 'none', border: 0, m: 0, p: 0, bgcolor: 'transparent',
  font: 'inherit', color: 'inherit', textAlign: 'inherit', cursor: 'pointer',
  '&:focus-visible': { outline: `2px solid ${TOV.coral}`, outlineOffset: 2, borderRadius: '6px' },
}

/** true abaixo de 600px — usado para abrir diálogos em tela cheia no celular. */
export function useDialogoTelaCheia() {
  const theme = useTheme()
  return useMediaQuery(theme.breakpoints.down('sm'))
}

/** Régua coral 64×5 — marcador de seção que precede os títulos. */
export function Regua({ sx }) {
  return <Box sx={{ width: 64, height: 5, bgcolor: TOV.coral, borderRadius: '3px', ...sx }} />
}

/** Rótulo pequeno em caixa alta (Bricolage 600, tracking largo). */
export function Eyebrow({ children, sx }) {
  return (
    <Typography
      component="div"
      sx={{
        fontFamily: TOV.fontHead, fontWeight: 600, fontSize: 11, letterSpacing: '.2em',
        textTransform: 'uppercase', color: TOV.caption, ...sx,
      }}
    >
      {children}
    </Typography>
  )
}

/**
 * Cabeçalho padrão de página: régua + título grande + subtítulo à esquerda,
 * ações (busca, botões) à direita.
 */
export function CabecalhoPagina({ titulo, subtitulo, acoes, sx }) {
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 2, flexWrap: 'wrap', mb: 3, ...sx,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Regua sx={{ mb: 2 }} />
        <Typography variant="h1" sx={{ fontSize: { xs: 30, sm: 36, md: 44 } }}>{titulo}</Typography>
        {subtitulo != null && (
          <Typography sx={{ mt: 1.25, fontSize: { xs: 14, md: 16 }, color: TOV.caption }}>{subtitulo}</Typography>
        )}
      </Box>
      {acoes && (
        <Box
          sx={{
            display: 'flex', gap: 1.5, flexWrap: 'wrap',
            width: { xs: '100%', md: 'auto' },
            '& > *': { flexGrow: { xs: 1, sm: 0 } },
          }}
        >
          {acoes}
        </Box>
      )}
    </Box>
  )
}

const MAPA_STATUS = {
  A: ['Ativo', TOV.coral, TOV.coralTint],
  I: ['Inativo', TOV.caption, TOV.captionTint],
  F: ['Formado', TOV.slate, TOV.slateTint],
  T: ['Trancado', TOV.caption, TOV.captionTint],
}

/** Pílula de status a partir do código (A/I/F/T). */
export function PilulaStatus({ status, sx }) {
  const [label, color, bg] = MAPA_STATUS[status] || [status || '—', TOV.caption, TOV.captionTint]
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block', px: 1.5, py: '5px', borderRadius: 999,
        bgcolor: bg, color, fontSize: 12, fontWeight: 700, lineHeight: 1.4, ...sx,
      }}
    >
      {label}
    </Box>
  )
}

/** Iniciais (até 2 letras) de um nome, em caixa alta. */
export function iniciais(nome) {
  if (!nome) return '—'
  const partes = String(nome).trim().split(/\s+/)
  const letras = partes.length === 1 ? partes[0].slice(0, 2) : partes[0][0] + partes[partes.length - 1][0]
  return letras.toUpperCase()
}

/** Avatar quadrado coral com iniciais. */
export function AvatarIniciais({ nome, tamanho = 76, radius = 20, fontSize = 30, sx }) {
  return (
    <Box
      sx={{
        width: tamanho, height: tamanho, flex: `0 0 ${tamanho}px`, borderRadius: `${radius}px`,
        bgcolor: TOV.coral, color: '#fff', fontFamily: TOV.fontHead, fontWeight: 700, fontSize,
        display: 'flex', alignItems: 'center', justifyContent: 'center', ...sx,
      }}
    >
      {iniciais(nome)}
    </Box>
  )
}

/** Paper branco no padrão do design (raio 16, sombra sutil). Uso genérico. */
export const cardSx = {
  bgcolor: TOV.white, borderRadius: '16px', boxShadow: TOV.shadowCard,
}

/** Card de item para listas no celular — substitui a linha de tabela. */
export function CartaoLista({ children, onClick, sx }) {
  return (
    <Box
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onClick(e) } : undefined}
      sx={{
        ...cardSx, p: '16px 18px', display: 'flex', flexDirection: 'column', gap: 1,
        ...(onClick ? {
          cursor: 'pointer', '&:active': { bgcolor: TOV.offwhite },
          '&:focus-visible': { outline: `2px solid ${TOV.coral}`, outlineOffset: 2 },
        } : {}),
        ...sx,
      }}
    >
      {children}
    </Box>
  )
}

/**
 * Diálogo de confirmação para ações destrutivas — substitui window.confirm
 * com o visual do design system e estado de processamento.
 */
export function DialogoConfirmacao({ aberto, titulo, descricao, rotuloConfirmar = 'Excluir', processando, onConfirmar, onFechar }) {
  return (
    <Dialog open={aberto} onClose={processando ? undefined : onFechar} maxWidth="xs" fullWidth>
      <DialogTitle>{titulo}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 15, color: TOV.slate }}>{descricao}</Typography>
      </DialogContent>
      <DialogActions sx={{ p: 3, pt: 1 }}>
        <Button variant="outlined" onClick={onFechar} disabled={processando}>Cancelar</Button>
        <Button variant="contained" color="error" onClick={onConfirmar} disabled={processando} autoFocus>
          {processando ? 'Excluindo…' : rotuloConfirmar}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** Par rótulo/valor compacto usado dentro dos cards de lista. */
export function LinhaCartao({ rotulo, valor }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, fontSize: 14 }}>
      <Box component="span" sx={{ color: TOV.caption, flexShrink: 0 }}>{rotulo}</Box>
      <Box component="span" sx={{ fontWeight: 600, color: TOV.slate, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{valor || '—'}</Box>
    </Box>
  )
}
