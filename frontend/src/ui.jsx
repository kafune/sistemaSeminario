import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Skeleton,
  Typography, useMediaQuery, useTheme,
} from '@mui/material'
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { TOV, focusRing } from './theme'

export const resetBotao = {
  appearance: 'none',
  border: 0,
  m: 0,
  p: 0,
  bgcolor: 'transparent',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'inherit',
  minHeight: 44,
  cursor: 'pointer',
  '&:focus-visible': focusRing,
}

export function useDialogoTelaCheia() {
  const theme = useTheme()
  return useMediaQuery(theme.breakpoints.down('sm'))
}

export function useTelaDesktop() {
  const theme = useTheme()
  return useMediaQuery(theme.breakpoints.up('md'), { noSsr: true })
}

/** Filete estrutural neutro; coral fica reservado a ação, seleção e alerta. */
export function Regua({ sx }) {
  return <Box aria-hidden="true" sx={{ width: 44, height: 4, bgcolor: TOV.graphite, borderRadius: TOV.radiusFull, ...sx }} />
}

export function Eyebrow({ children, sx, ...props }) {
  return (
    <Typography
      component="div"
      variant="overline"
      sx={{ color: TOV.caption, ...sx }}
      {...props}
    >
      {children}
    </Typography>
  )
}

/**
 * Cabeçalho editorial de página.
 * `subtitulo` continua aceito como alias de `descricao`.
 */
export function CabecalhoPagina({
  titulo, descricao, subtitulo, metadados, acoes, eyebrow, sx,
}) {
  const texto = descricao ?? subtitulo
  return (
    <Box
      component="header"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: acoes ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)' },
        alignItems: 'end',
        gap: { xs: 2, md: 3 },
        mb: { xs: 3, md: 3.5 },
        ...sx,
      }}
    >
      <Box sx={{ minWidth: 0, maxWidth: 760 }}>
        {eyebrow && <Eyebrow sx={{ mb: 1 }}>{eyebrow}</Eyebrow>}
        <Regua sx={{ mb: 1.5 }} />
        <Typography component="h1" variant="h1" sx={{ overflowWrap: 'anywhere' }}>{titulo}</Typography>
        {(texto != null || metadados != null) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
            {texto != null && (
              <Typography sx={{ fontSize: { xs: TOV.type.body, md: TOV.type.bodyLg }, color: TOV.caption, maxWidth: '72ch' }}>
                {texto}
              </Typography>
            )}
            {metadados != null && (
              <>
                {texto != null && <Box aria-hidden="true" sx={{ width: 4, height: 4, borderRadius: TOV.radiusFull, bgcolor: TOV.border }} />}
                <Box sx={{ fontSize: TOV.type.bodySm, color: TOV.caption }}>{metadados}</Box>
              </>
            )}
          </Box>
        )}
      </Box>
      {acoes && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: { xs: 'stretch', sm: 'flex-start', md: 'flex-end' },
            gap: 1,
            flexWrap: 'wrap',
            width: { xs: '100%', md: 'auto' },
            '& > *': { flexGrow: { xs: 1, sm: 0 } },
            '& form': { flexGrow: { xs: 1, sm: 0 } },
          }}
        >
          {acoes}
        </Box>
      )}
    </Box>
  )
}

const SUPERFICIES = {
  base: {
    bgcolor: TOV.surface,
    color: TOV.ink,
    border: `1px solid ${TOV.border}`,
    boxShadow: 'none',
  },
  raised: {
    bgcolor: TOV.surface,
    color: TOV.ink,
    border: `1px solid ${TOV.divider}`,
    boxShadow: TOV.shadowRaised,
  },
  inverse: {
    bgcolor: TOV.graphite,
    color: TOV.onDark,
    border: `1px solid ${TOV.onDarkBorder}`,
    boxShadow: 'none',
  },
}

export function Superficie({ variante = 'base', component = 'section', children, sx, ...props }) {
  return (
    <Box
      component={component}
      sx={{ borderRadius: `${TOV.radiusMd}px`, ...SUPERFICIES[variante], ...sx }}
      {...props}
    >
      {children}
    </Box>
  )
}

export function BarraFiltros({ children, sx, ...props }) {
  return (
    <Superficie
      component="section"
      aria-label="Filtros"
      sx={{
        p: { xs: 1.5, sm: 2 },
        mb: 2,
        display: 'flex',
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: 1.5,
        flexWrap: 'wrap',
        '& .MuiTextField-root': { minWidth: { xs: '100%', sm: 180 } },
        ...sx,
      }}
      {...props}
    >
      {children}
    </Superficie>
  )
}

const STATUS_TONES = {
  neutral: { color: TOV.graphite, bg: TOV.slateTint, border: TOV.slateBorder },
  muted: { color: TOV.caption, bg: TOV.captionTint, border: TOV.captionBorder },
  success: { color: TOV.success, bg: TOV.successTint, border: TOV.successBorder },
  warning: { color: TOV.warning, bg: TOV.warningTint, border: TOV.warningBorder },
  error: { color: TOV.danger, bg: TOV.dangerTint, border: TOV.dangerBorder },
  info: { color: TOV.info, bg: TOV.infoTint, border: TOV.infoBorder },
}

const MAPA_STATUS = {
  P: ['Pré-cadastro', 'warning'],
  A: ['Ativo', 'success'],
  I: ['Inativo', 'muted'],
  F: ['Formado', 'info'],
  T: ['Trancado', 'neutral'],
}

export function StatusBadge({ children, tom = 'neutral', dot = false, sx, ...props }) {
  const tone = STATUS_TONES[tom] || STATUS_TONES.neutral
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        minHeight: 28,
        px: 1.5,
        py: 0.5,
        borderRadius: TOV.radiusFull,
        bgcolor: tone.bg,
        color: tone.color,
        border: `1px solid ${tone.border}`,
        fontSize: TOV.type.caption,
        fontWeight: 700,
        lineHeight: 1.35,
        whiteSpace: 'nowrap',
        ...sx,
      }}
      {...props}
    >
      {dot && <Box aria-hidden="true" sx={{ width: 8, height: 8, borderRadius: TOV.radiusFull, bgcolor: 'currentColor' }} />}
      {children}
    </Box>
  )
}

export function PilulaStatus({ status, sx }) {
  const [label, tom] = MAPA_STATUS[status] || [status || '—', 'muted']
  return <StatusBadge tom={tom} dot sx={sx}>{label}</StatusBadge>
}

export function CardMetrica({ rotulo, valor, nota, destaque = false, icone, sx }) {
  return (
    <Superficie
      variante={destaque ? 'inverse' : 'base'}
      sx={{
        minWidth: 0,
        p: { xs: 2, sm: 2.5, md: 3 },
        position: 'relative',
        overflow: 'hidden',
        '&::before': destaque ? {
          content: '""',
          position: 'absolute',
          inset: '0 auto 0 0',
          width: 3,
          bgcolor: TOV.onDarkBorderHover,
        } : undefined,
        ...sx,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Eyebrow sx={{ color: destaque ? TOV.onDarkMuted : TOV.caption }}>{rotulo}</Eyebrow>
        {icone && <Box sx={{ color: destaque ? TOV.onDarkBody : TOV.graphite, lineHeight: 0 }}>{icone}</Box>}
      </Box>
      <Typography
        component="div"
        sx={{
          fontFamily: TOV.fontHead,
          fontWeight: 700,
          fontSize: { xs: TOV.type.displaySm, md: TOV.type.display },
          letterSpacing: '-.04em',
          mt: 1.5,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valor}
      </Typography>
      {nota && (
        <Typography sx={{ mt: 1, fontSize: TOV.type.bodySm, color: destaque ? TOV.onDarkMuted : TOV.caption }}>
          {typeof nota === 'object' ? nota.texto : nota}
        </Typography>
      )}
    </Superficie>
  )
}

export function EstadoVazio({
  titulo = 'Nenhum resultado encontrado',
  descricao,
  acao,
  icone: Icone = InboxOutlinedIcon,
  compacto = false,
  sx,
}) {
  return (
    <Box
      role="status"
      sx={{
        minHeight: compacto ? 140 : 220,
        px: 2,
        py: compacto ? 3 : 5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: TOV.caption,
        ...sx,
      }}
    >
      <Box sx={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: TOV.radiusFull, bgcolor: TOV.slateTint, color: TOV.graphite, mb: 1.5 }}>
        <Icone sx={{ fontSize: TOV.type.titleSm }} />
      </Box>
      <Typography variant="h4" sx={{ fontSize: TOV.type.section, color: TOV.ink }}>{titulo}</Typography>
      {descricao && <Typography sx={{ mt: 1, maxWidth: 480, fontSize: TOV.type.body }}>{descricao}</Typography>}
      {acao && <Box sx={{ mt: 2 }}>{acao}</Box>}
    </Box>
  )
}

export function EstadoErro({
  titulo = 'Não foi possível carregar',
  descricao = 'Confira sua conexão e tente novamente.',
  onTentarNovamente,
  sx,
}) {
  return (
    <Superficie role="alert" sx={{ p: { xs: 2.5, sm: 3.5 }, ...sx }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
        <Box aria-hidden="true" sx={{ width: 44, height: 44, flex: '0 0 44px', display: 'grid', placeItems: 'center', borderRadius: TOV.radiusMd, bgcolor: TOV.dangerTint, color: TOV.danger }}>
          <ErrorOutlineIcon />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h3" sx={{ fontSize: TOV.type.section }}>{titulo}</Typography>
          <Typography sx={{ mt: 1, color: TOV.caption, fontSize: TOV.type.body }}>{descricao}</Typography>
          {onTentarNovamente && (
            <Button variant="outlined" size="small" onClick={onTentarNovamente} sx={{ mt: 2 }}>
              Tentar novamente
            </Button>
          )}
        </Box>
      </Box>
    </Superficie>
  )
}

export function SkeletonCards({ quantidade = 3, altura = 150, colunas, sx }) {
  return (
    <Box
      role="status"
      aria-label="Carregando conteúdo"
      sx={{
        display: 'grid',
        gridTemplateColumns: colunas || { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))', lg: `repeat(${Math.min(quantidade, 4)},minmax(0,1fr))` },
        gap: 2,
        ...sx,
      }}
    >
      {Array.from({ length: quantidade }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={altura} sx={{ borderRadius: `${TOV.radiusMd}px` }} />
      ))}
    </Box>
  )
}

export function SkeletonTabela({ linhas = 5, sx }) {
  return (
    <Box role="status" aria-label="Carregando tabela" sx={{ p: 2, ...sx }}>
      {Array.from({ length: linhas }, (_, i) => (
        <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '100px 2fr 1fr 100px', gap: 2, py: 1.5, borderBottom: i < linhas - 1 ? `1px solid ${TOV.divider}` : 0 }}>
          <Skeleton height={24} />
          <Skeleton height={24} />
          <Skeleton height={24} />
          <Skeleton height={24} />
        </Box>
      ))}
    </Box>
  )
}

export function iniciais(nome) {
  if (!nome) return '—'
  const partes = String(nome).trim().split(/\s+/)
  const letras = partes.length === 1 ? partes[0].slice(0, 2) : partes[0][0] + partes[partes.length - 1][0]
  return letras.toUpperCase()
}

export function AvatarIniciais({ nome, tamanho = 76, radius = TOV.radiusXl, fontSize = TOV.type.displaySm, sx }) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: tamanho,
        height: tamanho,
        flex: `0 0 ${tamanho}px`,
        borderRadius: `${radius}px`,
        bgcolor: TOV.graphite,
        color: TOV.onDark,
        border: `1px solid ${TOV.onDarkBorder}`,
        fontFamily: TOV.fontHead,
        fontWeight: 700,
        fontSize,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...sx,
      }}
    >
      {iniciais(nome)}
    </Box>
  )
}

export const cardSx = {
  bgcolor: TOV.surface,
  borderRadius: `${TOV.radiusMd}px`,
  border: `1px solid ${TOV.border}`,
  boxShadow: 'none',
}

export function CartaoLista({ children, onClick, sx }) {
  return (
    <Box
      component={onClick ? 'button' : 'article'}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      sx={{
        ...(onClick ? resetBotao : {}),
        ...cardSx,
        p: '16px 20px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        ...(onClick ? {
          cursor: 'pointer',
          transition: `border-color ${TOV.durationFast} ${TOV.ease}, background-color ${TOV.durationFast} ${TOV.ease}`,
          '&:hover': { borderColor: TOV.borderHover, bgcolor: TOV.surfaceHover },
          '&:active': { bgcolor: TOV.canvas },
        } : {}),
        ...sx,
      }}
    >
      {children}
    </Box>
  )
}

export function DialogoConfirmacao({
  aberto, titulo, descricao, rotuloConfirmar = 'Excluir', processando, onConfirmar, onFechar,
}) {
  return (
    <Dialog open={aberto} onClose={processando ? undefined : onFechar} maxWidth="xs" fullWidth>
      <DialogTitle>{titulo}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: TOV.type.body, color: TOV.caption }}>{descricao}</Typography>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onFechar} disabled={processando}>Cancelar</Button>
        <Button variant="contained" color="error" onClick={onConfirmar} disabled={processando} autoFocus>
          {processando ? 'Processando…' : rotuloConfirmar}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export function LinhaCartao({ rotulo, valor }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, fontSize: TOV.type.body }}>
      <Box component="span" sx={{ color: TOV.caption, flexShrink: 0 }}>{rotulo}</Box>
      <Box component="span" sx={{ fontWeight: 600, color: TOV.graphite, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>
        {valor || '—'}
      </Box>
    </Box>
  )
}
