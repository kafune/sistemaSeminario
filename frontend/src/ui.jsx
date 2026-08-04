import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Skeleton,
  Typography, useMediaQuery, useTheme,
} from '@mui/material'
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { TOV } from './theme'

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
  '&:focus-visible': {
    outline: `3px solid ${TOV.coralTintStrong}`,
    outlineOffset: 2,
    borderRadius: `${TOV.radiusSm}px`,
  },
}

export function useDialogoTelaCheia() {
  const theme = useTheme()
  return useMediaQuery(theme.breakpoints.down('sm'))
}

export function useTelaDesktop() {
  const theme = useTheme()
  return useMediaQuery(theme.breakpoints.up('md'), { noSsr: true })
}

/** Filete coral — assinatura visual breve, nunca uma grande massa de cor. */
export function Regua({ sx }) {
  return <Box aria-hidden="true" sx={{ width: 44, height: 3, bgcolor: TOV.coral, borderRadius: 99, ...sx }} />
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 1.25 }}>
            {texto != null && (
              <Typography sx={{ fontSize: { xs: 14, md: 15 }, color: TOV.caption, maxWidth: '72ch' }}>
                {texto}
              </Typography>
            )}
            {metadados != null && (
              <>
                {texto != null && <Box aria-hidden="true" sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: TOV.border }} />}
                <Box sx={{ fontSize: 13, color: TOV.caption }}>{metadados}</Box>
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
    color: '#fff',
    border: '1px solid rgba(255,255,255,.08)',
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
        gap: 1.25,
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
  coral: { color: TOV.coral, bg: TOV.coralTint, border: 'rgba(201,47,47,.18)' },
  neutral: { color: TOV.graphite, bg: TOV.slateTint, border: 'rgba(52,59,63,.13)' },
  muted: { color: TOV.caption, bg: TOV.captionTint, border: 'rgba(104,115,122,.15)' },
  success: { color: TOV.success, bg: TOV.successTint, border: 'rgba(39,116,81,.17)' },
  warning: { color: TOV.warning, bg: TOV.warningTint, border: 'rgba(154,91,18,.18)' },
  error: { color: TOV.danger, bg: TOV.dangerTint, border: 'rgba(180,35,42,.17)' },
  info: { color: TOV.info, bg: TOV.infoTint, border: 'rgba(53,106,130,.17)' },
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
        gap: 0.75,
        minHeight: 28,
        px: 1.25,
        py: '3px',
        borderRadius: 999,
        bgcolor: tone.bg,
        color: tone.color,
        border: `1px solid ${tone.border}`,
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.35,
        whiteSpace: 'nowrap',
        ...sx,
      }}
      {...props}
    >
      {dot && <Box aria-hidden="true" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'currentColor' }} />}
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
          bgcolor: TOV.coralBright,
        } : undefined,
        ...sx,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Eyebrow sx={{ color: destaque ? 'rgba(255,255,255,.62)' : TOV.caption }}>{rotulo}</Eyebrow>
        {icone && <Box sx={{ color: destaque ? 'rgba(255,255,255,.7)' : TOV.coral, lineHeight: 0 }}>{icone}</Box>}
      </Box>
      <Typography
        component="div"
        sx={{
          fontFamily: TOV.fontHead,
          fontWeight: 700,
          fontSize: { xs: 32, md: 42 },
          letterSpacing: '-.04em',
          mt: 1.25,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valor}
      </Typography>
      {nota && (
        <Typography sx={{ mt: 0.9, fontSize: 12.5, color: destaque ? 'rgba(255,255,255,.68)' : TOV.caption }}>
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
      <Box sx={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: TOV.slateTint, color: TOV.graphite, mb: 1.5 }}>
        <Icone sx={{ fontSize: 22 }} />
      </Box>
      <Typography variant="h4" sx={{ fontSize: 17, color: TOV.ink }}>{titulo}</Typography>
      {descricao && <Typography sx={{ mt: 0.75, maxWidth: 480, fontSize: 13.5 }}>{descricao}</Typography>}
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
        <Box aria-hidden="true" sx={{ width: 44, height: 44, flex: '0 0 44px', display: 'grid', placeItems: 'center', borderRadius: '12px', bgcolor: TOV.dangerTint, color: TOV.danger }}>
          <ErrorOutlineIcon />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h3" sx={{ fontSize: 18 }}>{titulo}</Typography>
          <Typography sx={{ mt: 0.75, color: TOV.caption, fontSize: 14 }}>{descricao}</Typography>
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
        <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '100px 2fr 1fr 100px', gap: 2, py: 1.25, borderBottom: i < linhas - 1 ? `1px solid ${TOV.divider}` : 0 }}>
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

export function AvatarIniciais({ nome, tamanho = 76, radius = 20, fontSize = 30, sx }) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: tamanho,
        height: tamanho,
        flex: `0 0 ${tamanho}px`,
        borderRadius: `${radius}px`,
        bgcolor: TOV.graphite,
        color: '#fff',
        border: '1px solid rgba(255,255,255,.12)',
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
        p: '16px 18px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        ...(onClick ? {
          cursor: 'pointer',
          transition: `border-color ${TOV.durationFast} ${TOV.ease}, background-color ${TOV.durationFast} ${TOV.ease}`,
          '&:hover': { borderColor: '#C7BDB5', bgcolor: '#FBF9F6' },
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
        <Typography sx={{ fontSize: 14.5, color: TOV.caption }}>{descricao}</Typography>
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
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, fontSize: 13.5 }}>
      <Box component="span" sx={{ color: TOV.caption, flexShrink: 0 }}>{rotulo}</Box>
      <Box component="span" sx={{ fontWeight: 600, color: TOV.graphite, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>
        {valor || '—'}
      </Box>
    </Box>
  )
}
