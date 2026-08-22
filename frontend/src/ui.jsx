import { useCallback, useEffect, useState } from 'react'
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Skeleton,
  TableCell, TableRow, Typography, useMediaQuery, useTheme,
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
  minHeight: TOV.controlHSm,
  cursor: 'pointer',
  '&:focus-visible': focusRing,
}

export function useDialogoTelaCheia() {
  const theme = useTheme()
  return useMediaQuery(theme.breakpoints.down('sm'))
}

/**
 * Verdadeiro a partir de 768px: o iPad retrato recebe tabela, não cartões.
 * A sidebar completa continua aparecendo só em `md`; entre 600 e 900px quem
 * navega é a trilha de ícones do Layout.
 */
export function useTelaDesktop() {
  const theme = useTheme()
  return useMediaQuery(theme.breakpoints.up('tablet'), { noSsr: true })
}

const PREFIXO_PREFERENCIA = 'tov.pref.'

/** Estado lembrado por usuário no navegador (densidade, página, por página). */
export function usePreferencia(chave, inicial) {
  const [valor, setValor] = useState(() => {
    try {
      const bruto = window.localStorage.getItem(PREFIXO_PREFERENCIA + chave)
      return bruto == null ? inicial : JSON.parse(bruto)
    } catch {
      return inicial
    }
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(PREFIXO_PREFERENCIA + chave, JSON.stringify(valor))
    } catch {
      // Navegação privada ou storage cheio: a preferência vale só nesta sessão.
    }
  }, [chave, valor])
  return [valor, setValor]
}

export const DENSIDADES = [
  { valor: 'compacta', rotulo: 'Compacta' },
  { valor: 'confortavel', rotulo: 'Confortável' },
]

/** Densidade da tabela, lembrada entre sessões. */
export function useDensidade() {
  return usePreferencia('densidade', 'compacta')
}

/**
 * Escolha única entre poucas opções, num controle só.
 *
 * Substitui a mistura de pílula própria com select do MUI: dois vocabulários
 * e duas alturas para a mesma tarefa é o que mais lê como descuido numa barra
 * de filtros.
 */
export function GrupoSegmentado({ rotulo, opcoes, valor, onChange, sx }) {
  return (
    <Box
      role="group"
      aria-label={rotulo}
      sx={{
        display: 'inline-flex', height: TOV.controlHSm, flexShrink: 0, maxWidth: '100%',
        border: `1px solid ${TOV.border}`, borderRadius: TOV.radiusSm,
        bgcolor: TOV.surface, overflowX: 'auto', overscrollBehaviorInline: 'contain',
        scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
        ...sx,
      }}
    >
      {opcoes.map((opcao, indice) => {
        const ativo = valor === opcao.valor
        return (
          <Box
            key={opcao.valor}
            component="button"
            type="button"
            aria-pressed={ativo}
            onClick={() => onChange(opcao.valor)}
            sx={{
              ...resetBotao,
              alignSelf: 'stretch', minHeight: 0, px: 1.5, flexShrink: 0, whiteSpace: 'nowrap',
              fontSize: TOV.type.bodySm, fontWeight: ativo ? 700 : 600,
              color: ativo ? TOV.ink : TOV.caption,
              bgcolor: ativo ? TOV.surfaceMuted : 'transparent',
              borderLeft: indice > 0 ? `1px solid ${TOV.border}` : 0,
              '&:hover': ativo ? {} : { color: TOV.ink },
            }}
          >
            {opcao.rotulo}
          </Box>
        )
      })}
    </Box>
  )
}

export function SeletorDensidade({ valor, onChange, sx }) {
  return (
    <GrupoSegmentado
      rotulo="Densidade da tabela"
      opcoes={DENSIDADES}
      valor={valor}
      onChange={onChange}
      sx={sx}
    />
  )
}

/**
 * Barra de ação ancorada na base da janela, em qualquer largura.
 * Só ocupa altura quando há algo pendente; no celular sobe acima da
 * navegação inferior e no desktop respeita a sidebar.
 */
export function BarraAcaoFixa({ visivel, resumo, selo, acoes, rotulo = 'Alterações pendentes' }) {
  if (!visivel) return null
  return (
    <>
      {/* No celular a barra empilha resumo e botões: reserva mais altura. */}
      <Box aria-hidden="true" sx={{ height: { xs: 148, sm: 88 } }} />
      <Paper
        role="region"
        aria-label={rotulo}
        elevation={0}
        sx={{
          position: 'fixed',
          zIndex: (theme) => theme.zIndex.appBar + 1,
          left: { xs: 0, sm: `${TOV.railW}px`, md: `${TOV.sidebarW}px` },
          right: 0,
          bottom: { xs: 'calc(66px + env(safe-area-inset-bottom))', sm: 0 },
          pb: { xs: 0, sm: 'env(safe-area-inset-bottom)' },
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 2, flexWrap: 'wrap',
          px: { xs: 2, sm: 3 }, py: 1.5,
          borderRadius: TOV.radiusNone,
          borderTop: `1px solid ${TOV.border}`,
          bgcolor: TOV.surface,
          boxShadow: TOV.shadowTop,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flexGrow: 1 }}>
          {selo}
          {resumo && (
            <Typography noWrap sx={{ fontSize: TOV.type.body, color: TOV.caption, minWidth: 0 }}>
              {resumo}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, '& > *': { flexGrow: { xs: 1, sm: 0 } }, width: { xs: '100%', sm: 'auto' } }}>
          {acoes}
        </Box>
      </Paper>
    </>
  )
}

/** Cmd/Ctrl+S sem acionar a impressão nem o "salvar página" do navegador. */
export function useAtalhoSalvar(ativo, aoSalvar) {
  const salvar = useCallback((evento) => {
    if (!ativo) return
    if (!(evento.key === 's' || evento.key === 'S') || !(evento.metaKey || evento.ctrlKey)) return
    evento.preventDefault()
    aoSalvar()
  }, [ativo, aoSalvar])

  useEffect(() => {
    window.addEventListener('keydown', salvar)
    return () => window.removeEventListener('keydown', salvar)
  }, [salvar])
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

const ACOES_CABECALHO = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  flexWrap: 'wrap',
  '& > *': { flexGrow: { xs: 1, sm: 0 } },
  '& form': { flexGrow: { xs: 1, sm: 0 } },
  '& .MuiOutlinedInput-root, & .MuiButton-root': { minHeight: TOV.controlH },
}

/**
 * Cabeçalho de página em duas variantes.
 *
 * `editorial` (padrão) é a capa: régua, título grande e descrição. Vale para
 * painel, detalhe e portal — telas em que a página se apresenta.
 *
 * `operacional` é para tela de trabalho: título e contagem na mesma linha das
 * ações, sem régua e sem capa. Devolve cerca de 120px acima da dobra em toda
 * lista, que é onde a secretaria passa o dia.
 *
 * `subtitulo` continua aceito como alias de `descricao`.
 */
export function CabecalhoPagina({
  titulo, descricao, subtitulo, metadados, acoes, eyebrow, variante = 'editorial', sx,
}) {
  const texto = descricao ?? subtitulo

  if (variante === 'operacional') {
    return (
      <Box component="header" sx={{ mb: 2, ...sx }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap', minWidth: 0 }}>
            <Typography
              component="h1"
              sx={{
                fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.title,
                lineHeight: 1.2, letterSpacing: '-.02em', overflowWrap: 'anywhere',
              }}
            >
              {titulo}
            </Typography>
            {metadados != null && (
              <Box sx={{ fontSize: TOV.type.body, color: TOV.caption, fontVariantNumeric: 'tabular-nums' }}>
                {metadados}
              </Box>
            )}
          </Box>
          {acoes && <Box sx={{ ...ACOES_CABECALHO, width: { xs: '100%', sm: 'auto' }, justifyContent: { sm: 'flex-end' } }}>{acoes}</Box>}
        </Box>
        {texto != null && (
          <Typography sx={{ mt: 1, fontSize: TOV.type.bodySm, color: TOV.caption, maxWidth: '72ch' }}>
            {texto}
          </Typography>
        )}
      </Box>
    )
  }

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
              // Ponto e metadado no mesmo item de flex: quando a linha quebra,
              // os dois descem juntos e o separador não fica órfão no fim.
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                {texto != null && <Box aria-hidden="true" sx={{ width: 4, height: 4, flex: '0 0 4px', borderRadius: TOV.radiusFull, bgcolor: TOV.border }} />}
                {/* Sem `minWidth: 0` o item de flex não encolhe abaixo do
                    conteúdo e o metadado longo empurra a largura da página. */}
                <Box sx={{ minWidth: 0, fontSize: TOV.type.bodySm, color: TOV.caption }}>{metadados}</Box>
              </Box>
            )}
          </Box>
        )}
      </Box>
      {acoes && (
        <Box
          sx={{
            ...ACOES_CABECALHO,
            justifyContent: { xs: 'stretch', sm: 'flex-start', md: 'flex-end' },
            width: { xs: '100%', md: 'auto' },
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
      sx={{ borderRadius: TOV.radiusMd, ...SUPERFICIES[variante], ...sx }}
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
        // A barra define o pe de altura: campo, select e botao fecham a mesma
        // linha de base sem cada pagina cravar a sua altura.
        '& .MuiOutlinedInput-root, & .MuiButton-root': { minHeight: TOV.controlHSm },
        ...sx,
      }}
      {...props}
    >
      {children}
    </Superficie>
  )
}

const STATUS_TONES = {
  neutral: { color: TOV.graphite, bg: TOV.graphiteTint, border: TOV.graphiteBorder },
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

/**
 * Dado que o sistema calcula e o usuário não digita.
 * Existe para não vestir de campo (borda, fundo, altura de input) algo que
 * não aceita clique: quem vê uma caixa espera poder editar.
 */
export function Metadado({ rotulo, valor, nota, sx }) {
  return (
    <Box sx={{ minWidth: 0, ...sx }}>
      <Box sx={{ fontSize: TOV.type.caption, color: TOV.caption, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {rotulo}
      </Box>
      <Box sx={{ mt: 0.5, fontSize: TOV.type.body, fontWeight: 700, color: TOV.ink, fontVariantNumeric: 'tabular-nums' }}>
        {valor == null || valor === '' ? '—' : valor}
      </Box>
      {nota && <Box sx={{ mt: 0.5, fontSize: TOV.type.caption, color: TOV.caption }}>{nota}</Box>}
    </Box>
  )
}

/**
 * Um dado operacional e a nota que o contextualiza.
 *
 * Com `onClick` o cartão vira botão e leva à lista correspondente — é assim
 * que ele deve ser usado no painel: número que não abre a lista de onde saiu
 * não muda decisão nenhuma, só informa o que já se sabia.
 */
export function CardMetrica({ rotulo, valor, nota, destaque = false, icone, onClick, sx }) {
  const acionavel = typeof onClick === 'function'
  return (
    <Superficie
      variante={destaque ? 'inverse' : 'base'}
      component={acionavel ? 'button' : 'section'}
      type={acionavel ? 'button' : undefined}
      onClick={onClick}
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
        ...(acionavel ? {
          appearance: 'none',
          font: 'inherit',
          textAlign: 'left',
          width: '100%',
          cursor: 'pointer',
          transition: `border-color ${TOV.durationFast} ${TOV.ease}, background-color ${TOV.durationFast} ${TOV.ease}`,
          '&:hover': { borderColor: destaque ? TOV.onDarkBorderStrong : TOV.graphite },
          '&:focus-visible': focusRing,
        } : null),
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
        <Typography
          component="div"
          sx={{
            mt: 1, fontSize: TOV.type.bodySm, color: destaque ? TOV.onDarkMuted : TOV.caption,
            display: 'flex', alignItems: 'center', gap: 0.5,
          }}
        >
          {typeof nota === 'object' ? nota.texto : nota}
          {acionavel && <Box component="span" aria-hidden="true" sx={{ fontWeight: 700 }}>→</Box>}
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
      <Box sx={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: TOV.radiusFull, bgcolor: TOV.graphiteTint, color: TOV.graphite, mb: 1.5 }}>
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
        <Skeleton key={i} variant="rounded" height={altura} sx={{ borderRadius: TOV.radiusMd }} />
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

/**
 * Esqueleto com a forma da própria tabela: mesmas colunas, mesma altura de
 * linha. Substitui o "Carregando…" centralizado, que muda o layout duas vezes
 * (uma ao aparecer, outra ao virar tabela de verdade).
 */
export function LinhasSkeleton({ linhas = 6, colunas = 4 }) {
  return Array.from({ length: linhas }, (_, linha) => (
    <TableRow key={linha} aria-hidden="true">
      {Array.from({ length: colunas }, (_, coluna) => (
        <TableCell key={coluna}><Skeleton height={20} /></TableCell>
      ))}
    </TableRow>
  ))
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
        borderRadius: radius,
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
  borderRadius: TOV.radiusMd,
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

/**
 * Confirmação de ação destrutiva. `itens` lista o impacto real
 * ("Leitura 2 · 24 notas"); o botão nomeia a ação, nunca "OK".
 * O foco nunca começa no botão destrutivo.
 */
export function DialogoConfirmacao({
  aberto, titulo, descricao, itens, rotuloConfirmar = 'Excluir', processando, onConfirmar, onFechar,
}) {
  return (
    <Dialog open={aberto} onClose={processando ? undefined : onFechar} maxWidth="xs" fullWidth>
      <DialogTitle>{titulo}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: TOV.type.body, color: TOV.caption }}>{descricao}</Typography>
        {itens?.length > 0 && (
          <Box sx={{ mt: 2, border: `1px solid ${TOV.divider}`, borderRadius: TOV.radiusSm, overflow: 'hidden' }}>
            {itens.map((item, indice) => (
              <Box
                key={item.chave ?? item.rotulo}
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2,
                  px: 1.5, py: 1.5, fontSize: TOV.type.body,
                  borderTop: indice > 0 ? `1px solid ${TOV.divider}` : 0,
                }}
              >
                <Box component="span" sx={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{item.rotulo}</Box>
                <Box component="span" sx={{ color: TOV.caption, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{item.detalhe}</Box>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onFechar} disabled={processando}>Cancelar</Button>
        <Button variant="contained" color="error" onClick={onConfirmar} disabled={processando}>
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
