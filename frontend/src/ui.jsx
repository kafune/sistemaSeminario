// Peças reutilizáveis do design system TOV: régua de seção, eyebrow, cabeçalho
// de página, pílula de status e avatar de iniciais.
import { Box, Typography } from '@mui/material'
import { TOV } from './theme'

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
      <Box>
        <Regua sx={{ mb: 2 }} />
        <Typography variant="h1" sx={{ fontSize: { xs: 32, md: 44 } }}>{titulo}</Typography>
        {subtitulo != null && (
          <Typography sx={{ mt: 1.25, fontSize: 16, color: TOV.caption }}>{subtitulo}</Typography>
        )}
      </Box>
      {acoes && <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>{acoes}</Box>}
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
