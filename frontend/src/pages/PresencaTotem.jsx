import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  IconButton, InputAdornment, TextField, Typography,
} from '@mui/material'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import HowToRegRoundedIcon from '@mui/icons-material/HowToRegRounded'
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import TouchAppRoundedIcon from '@mui/icons-material/TouchAppRounded'
import WifiOffRoundedIcon from '@mui/icons-material/WifiOffRounded'
import { getPublico, postPublico } from '../api'
import { TOV } from '../theme'
import { AvatarIniciais, resetBotao } from '../ui'

function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

const formatadorData = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long', day: '2-digit', month: 'long',
})
const formatadorHora = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
})

function textoData(data) {
  if (!data) return ''
  const texto = formatadorData.format(new Date(`${data}T12:00:00`))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function textoHora(dataHora) {
  if (!dataHora) return ''
  return formatadorHora.format(new Date(dataHora))
}

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0]
}

function reconciliarChamada(atual, recebida) {
  if (
    !atual
    || atual.data !== recebida.data
    || atual.turma?.cod_tur !== recebida.turma?.cod_tur
  ) return recebida
  const anteriores = new Map((atual.alunos || []).map((aluno) => [aluno.cod_alu, aluno]))
  const alunos = (recebida.alunos || []).map((aluno) => {
    const anterior = anteriores.get(aluno.cod_alu)
    if (
      anterior
      && anterior.nome === aluno.nome
      && anterior.presente === aluno.presente
      && anterior.registrado_em === aluno.registrado_em
    ) return anterior
    return aluno
  })
  return { ...recebida, alunos }
}

function Relogio() {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.section, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
      {textoHora(agora.toISOString())}
    </Typography>
  )
}

function CabecalhoSecao({ id, titulo, quantidade, descricao, tom = 'neutral' }) {
  const sucesso = tom === 'success'
  return (
    <Box sx={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 2, mb: 1.5 }}>
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography id={id} component="h2" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: { xs: TOV.type.section, sm: TOV.type.titleSm }, lineHeight: 1.2 }}>
            {titulo}
          </Typography>
          <Box
            component="span"
            sx={{
              minWidth: 28, height: 28, px: 1, display: 'inline-grid', placeItems: 'center',
              borderRadius: TOV.radiusFull, bgcolor: sucesso ? TOV.successTint : TOV.slateTint,
              color: sucesso ? TOV.success : TOV.graphite, fontSize: TOV.type.caption, fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {quantidade}
          </Box>
        </Box>
        {descricao && <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 0.5 }}>{descricao}</Typography>}
      </Box>
    </Box>
  )
}

const CartaoAluno = memo(function CartaoAluno({ aluno, onSelecionar }) {
  const presente = aluno.presente
  return (
    <Box
      component={presente ? 'article' : 'button'}
      type={presente ? undefined : 'button'}
      onClick={presente ? undefined : () => onSelecionar(aluno)}
      aria-label={presente ? `${aluno.nome}, presença marcada às ${textoHora(aluno.registrado_em)}` : `Marcar presença de ${aluno.nome}`}
      sx={{
        ...(presente ? {} : resetBotao),
        minHeight: { xs: 88, sm: 104 }, width: '100%', px: { xs: 1.5, sm: 2.5 }, py: 1.5,
        display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 2 }, textAlign: 'left',
        borderRadius: TOV.radiusLg, border: `1px solid ${presente ? TOV.successBorder : TOV.border}`,
        bgcolor: presente ? TOV.successSurface : TOV.surface,
        boxShadow: presente ? 'none' : TOV.shadowInteractive,
        cursor: presente ? 'default' : 'pointer', position: 'relative', overflow: 'hidden',
        userSelect: 'none', WebkitUserSelect: 'none',
        touchAction: 'manipulation', WebkitTouchCallout: 'none',
        transition: `border-color ${TOV.durationFast} ${TOV.ease}, transform ${TOV.durationFast} ${TOV.ease}, background-color ${TOV.durationFast} ${TOV.ease}`,
        '&::before': presente ? undefined : {
          content: '""', position: 'absolute', inset: '16px auto 16px 0', width: 4,
          borderRadius: `0 ${TOV.radiusXs}px ${TOV.radiusXs}px 0`, bgcolor: TOV.coral,
        },
        '@media (hover: hover)': {
          '&:hover': presente ? {} : { borderColor: TOV.borderHover, bgcolor: TOV.surfaceHover },
        },
        '&:active': presente ? {} : { transform: 'scale(.992)', bgcolor: TOV.canvas },
      }}
    >
      <AvatarIniciais
        nome={aluno.nome}
        tamanho={60}
        radius={TOV.radiusLg}
        fontSize={TOV.type.titleSm}
        sx={presente
          ? { bgcolor: TOV.success, color: TOV.onDark, borderColor: 'transparent' }
          : { bgcolor: TOV.surfaceMuted, color: TOV.graphite, borderColor: TOV.divider }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: { xs: TOV.type.bodyLg, sm: TOV.type.titleSm }, lineHeight: 1.22, color: TOV.ink }}>
          {aluno.nome}
        </Typography>
        <Typography sx={{ color: presente ? TOV.success : TOV.caption, fontSize: TOV.type.bodySm, fontWeight: 700, mt: 0.5 }}>
          {presente ? `Confirmada às ${textoHora(aluno.registrado_em)}` : 'Toque para marcar sua chegada'}
        </Typography>
      </Box>
      <Box
        aria-hidden="true"
        sx={{
          width: 42, height: 42, flex: '0 0 42px', display: 'grid', placeItems: 'center',
          borderRadius: TOV.radiusMd, bgcolor: presente ? 'transparent' : TOV.slateTint,
          color: presente ? TOV.success : TOV.coral,
        }}
      >
        {presente ? <CheckCircleRoundedIcon sx={{ fontSize: TOV.type.titleLg }} /> : <ArrowForwardRoundedIcon sx={{ fontSize: TOV.type.title }} />}
      </Box>
    </Box>
  )
}, (anterior, proximo) => (
  anterior.aluno.cod_alu === proximo.aluno.cod_alu
  && anterior.aluno.nome === proximo.aluno.nome
  && anterior.aluno.presente === proximo.aluno.presente
  && anterior.aluno.registrado_em === proximo.aluno.registrado_em
  && anterior.onSelecionar === proximo.onSelecionar
))

export default function PresencaTotem() {
  const { token } = useParams()
  const [chamada, setChamada] = useState(null)
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const [sucesso, setSucesso] = useState(null)
  const [mostrarPresentes, setMostrarPresentes] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [reconectando, setReconectando] = useState(false)
  const sucessoTimer = useRef(null)
  const requisicaoEmCurso = useRef(false)
  const confirmacaoEmCurso = useRef(false)
  const versaoLocal = useRef(0)

  const carregar = useCallback(async (silencioso = false) => {
    if (requisicaoEmCurso.current) return
    requisicaoEmCurso.current = true
    const versaoAoIniciar = versaoLocal.current
    if (!silencioso) setCarregando(true)
    try {
      const resposta = await getPublico(`/presenca-publica/${token}`)
      // Não deixa uma leitura iniciada antes do toque desfazer a confirmação local.
      if (versaoAoIniciar === versaoLocal.current) {
        setChamada((atual) => reconciliarChamada(atual, resposta))
      }
      setErro('')
      setReconectando(false)
    } catch (e) {
      const terminal = /encerrad|expirad|não encontrad/i.test(e.message)
      if (terminal || !silencioso) {
        setErro(e.message)
        setChamada(null)
      } else {
        // Uma oscilação de rede não deve tirar a lista da tela durante a fila.
        setReconectando(true)
      }
    } finally {
      requisicaoEmCurso.current = false
      if (!silencioso) setCarregando(false)
    }
  }, [token])

  useEffect(() => {
    carregar()
    const atualizarSeVisivel = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) carregar(true)
    }
    const atualizacao = window.setInterval(atualizarSeVisivel, 30_000)
    window.addEventListener('online', atualizarSeVisivel)
    window.addEventListener('focus', atualizarSeVisivel)
    document.addEventListener('visibilitychange', atualizarSeVisivel)
    return () => {
      window.clearInterval(atualizacao)
      window.removeEventListener('online', atualizarSeVisivel)
      window.removeEventListener('focus', atualizarSeVisivel)
      document.removeEventListener('visibilitychange', atualizarSeVisivel)
      if (sucessoTimer.current) window.clearTimeout(sucessoTimer.current)
    }
  }, [carregar])

  useEffect(() => {
    document.title = chamada?.turma?.nome ? `Presença · ${chamada.turma.nome}` : 'Chamada · TOV'
  }, [chamada?.turma?.nome])

  useEffect(() => {
    let bloqueio = null
    async function manterTelaAcesa() {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return
      try { bloqueio = await navigator.wakeLock.request('screen') } catch { /* suporte opcional */ }
    }
    manterTelaAcesa()
    document.addEventListener('visibilitychange', manterTelaAcesa)
    return () => {
      document.removeEventListener('visibilitychange', manterTelaAcesa)
      bloqueio?.release?.().catch?.(() => {})
    }
  }, [])

  const { alunosFiltrados, aguardando, presentes } = useMemo(() => {
    const termo = normalizar(busca.trim())
    const filtrados = termo
      ? (chamada?.alunos || []).filter((aluno) => normalizar(aluno.nome).includes(termo))
      : (chamada?.alunos || [])
    return {
      alunosFiltrados: filtrados,
      aguardando: filtrados.filter((aluno) => !aluno.presente),
      presentes: filtrados.filter((aluno) => aluno.presente),
    }
  }, [busca, chamada])
  const progresso = chamada?.total ? Math.min(100, (chamada.presentes / chamada.total) * 100) : 0
  const buscaAtiva = Boolean(busca.trim())
  const exibirPresentes = buscaAtiva || mostrarPresentes

  const selecionarAluno = useCallback((aluno) => {
    document.activeElement?.blur?.()
    setSelecionado(aluno)
  }, [])

  async function confirmarPresenca() {
    if (!selecionado || confirmacaoEmCurso.current) return
    confirmacaoEmCurso.current = true
    setConfirmando(true)
    try {
      const resposta = await postPublico(`/presenca-publica/${token}`, { cod_alu: selecionado.cod_alu })
      const marcadoEm = resposta.registrado_em
      versaoLocal.current += 1
      setChamada((atual) => ({
        ...atual,
        presentes: atual.presentes + (selecionado.presente ? 0 : 1),
        ausentes: Math.max(0, atual.ausentes - (selecionado.presente ? 0 : 1)),
        alunos: atual.alunos.map((aluno) => aluno.cod_alu === selecionado.cod_alu
          ? { ...aluno, presente: true, registrado_em: marcadoEm }
          : aluno),
      }))
      setSelecionado(null)
      setBusca('')
      setSucesso({ nome: resposta.nome, horario: textoHora(marcadoEm) })
      if (sucessoTimer.current) window.clearTimeout(sucessoTimer.current)
      navigator.vibrate?.(40)
      sucessoTimer.current = window.setTimeout(() => setSucesso(null), 1700)
    } catch (e) {
      setErro(e.message)
      setSelecionado(null)
    } finally {
      confirmacaoEmCurso.current = false
      setConfirmando(false)
    }
  }

  if (carregando) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', bgcolor: TOV.canvas, p: 3 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Box sx={{ width: 64, height: 64, mx: 'auto', mb: 2.5, display: 'grid', placeItems: 'center', borderRadius: TOV.radiusLg, bgcolor: TOV.graphite, color: TOV.onDark, fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.section }}>TOV</Box>
          <CircularProgress size={36} thickness={4.5} />
          <Typography sx={{ mt: 2, color: TOV.caption, fontWeight: 700 }}>Preparando a chamada…</Typography>
        </Box>
      </Box>
    )
  }

  if (erro && !chamada) {
    const encerrada = /encerrad|expirad|não encontrad/i.test(erro)
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', bgcolor: TOV.canvas, p: 3 }}>
        <Box sx={{ width: 'min(520px, 100%)', textAlign: 'center', bgcolor: TOV.surface, border: `1px solid ${TOV.border}`, borderRadius: TOV.radius2xl, overflow: 'hidden' }}>
          <Box sx={{ height: 5, bgcolor: encerrada ? TOV.coral : TOV.warning }} />
          <Box sx={{ p: { xs: 3, sm: 5 } }}>
            <Box sx={{ width: 76, height: 76, mx: 'auto', mb: 2.5, display: 'grid', placeItems: 'center', borderRadius: TOV.radius2xl, bgcolor: encerrada ? TOV.slateTint : TOV.warningTint, color: encerrada ? TOV.graphite : TOV.warning }}>
              {encerrada ? <HowToRegRoundedIcon sx={{ fontSize: TOV.type.display }} /> : <WifiOffRoundedIcon sx={{ fontSize: TOV.type.display }} />}
            </Box>
            <Typography variant="h1" sx={{ fontSize: { xs: TOV.type.displaySm, sm: TOV.type.display } }}>{encerrada ? 'Chamada encerrada' : 'Sem conexão no momento'}</Typography>
            <Typography sx={{ color: TOV.caption, mt: 1.5, fontSize: TOV.type.bodyLg }}>
              {encerrada ? 'Peça à secretaria para abrir a chamada de hoje neste iPad.' : 'Confira a internet do iPad e tente carregar a lista novamente.'}
            </Typography>
            {!encerrada && <Button variant="contained" onClick={() => carregar()} sx={{ mt: 3, minWidth: 180 }}>Tentar novamente</Button>}
          </Box>
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: TOV.canvas, pb: 'max(40px, env(safe-area-inset-bottom))', overscrollBehaviorY: 'none' }}>
      <Box
        component="header"
        sx={{
          position: 'sticky', top: 0, zIndex: 20, color: TOV.onDark, borderTop: `4px solid ${TOV.ink}`,
          bgcolor: TOV.graphite,
          backgroundImage: TOV.darkGradient,
          px: { xs: 2, sm: 3.5 }, pt: 'max(16px, env(safe-area-inset-top))', pb: { xs: 2, sm: 2 },
          boxShadow: TOV.shadowHeader,
        }}
      >
        <Box sx={{ maxWidth: 1160, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: { xs: 1.5, sm: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 1.5 }, minWidth: 0 }}>
            <Box sx={{ width: { xs: 48, sm: 52 }, height: { xs: 48, sm: 52 }, flex: '0 0 auto', display: 'grid', placeItems: 'center', borderRadius: TOV.radiusMd, bgcolor: TOV.onDarkSurface, boxShadow: TOV.shadowHairline, fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.bodyLg }}>
              TOV
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography component="div" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: { xs: TOV.type.section, sm: TOV.type.title }, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {chamada.turma.nome}
              </Typography>
              <Typography sx={{ color: TOV.onDarkMuted, fontSize: { xs: TOV.type.caption, sm: TOV.type.body }, mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {textoData(chamada.data)}{chamada.aula?.materia_nome ? ` · ${chamada.aula.materia_nome}` : ''}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ ml: 'auto', display: { xs: 'none', sm: reconectando ? 'flex' : 'none', md: 'flex' }, alignItems: 'center', gap: 1, px: 1.5, py: 1, borderRadius: TOV.radiusFull, bgcolor: reconectando ? TOV.warningTint : TOV.onDarkSurface, border: `1px solid ${reconectando ? TOV.warningBorder : TOV.onDarkBorder}`, color: reconectando ? TOV.onDarkStrong : TOV.onDarkBody, fontSize: TOV.type.caption, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {reconectando ? <WifiOffRoundedIcon sx={{ fontSize: TOV.type.bodyLg }} /> : <Box aria-hidden="true" sx={{ width: 8, height: 8, borderRadius: TOV.radiusFull, bgcolor: TOV.successBright }} />}
            {reconectando ? 'Reconectando…' : 'Chamada aberta'}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 2 }, flexShrink: 0 }}>
            <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'right' }}>
              <Typography sx={{ color: TOV.onDarkMuted, fontSize: TOV.type.micro, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Agora</Typography>
              <Relogio />
            </Box>
            <Box aria-hidden="true" sx={{ display: { xs: 'none', sm: 'block' }, width: '1px', height: 36, bgcolor: TOV.onDarkBorder }} />
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontFamily: TOV.fontHead, fontSize: { xs: TOV.type.titleSm, sm: TOV.type.titleLg }, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {chamada.presentes}<Box component="span" sx={{ color: TOV.onDarkMuted, fontSize: TOV.type.body }}>/{chamada.total}</Box>
              </Typography>
              <Typography sx={{ color: TOV.onDarkMuted, fontSize: TOV.type.micro, fontWeight: 700, mt: 0.5, whiteSpace: 'nowrap' }}>presentes</Typography>
            </Box>
          </Box>
        </Box>
        <Box aria-hidden="true" sx={{ position: 'absolute', inset: 'auto 0 0', height: 4, bgcolor: TOV.onDarkSurface }}>
          <Box sx={{ width: `${progresso}%`, height: '100%', bgcolor: TOV.successBright, transition: `width ${TOV.transitionBase}` }} />
        </Box>
      </Box>

      <Box component="main" sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 1.5, sm: 3 }, pt: { xs: 2, sm: 0 } }}>
        {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2 }}>{erro}</Alert>}

        <Box
          component="section"
          aria-label="Busca de aluno"
          sx={{
            position: { xs: 'static', sm: 'sticky' }, top: { sm: 'calc(73px + max(16px, env(safe-area-inset-top)))' }, zIndex: 15,
            mx: { sm: -1 }, px: { sm: 1 }, pt: { sm: 2.5 }, pb: { xs: 2.5, sm: 2.5 },
            bgcolor: TOV.canvas,
          }}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(230px,.75fr) minmax(360px,1.25fr)' }, alignItems: 'center', gap: { xs: 2, sm: 3.5 }, p: { xs: 0, sm: 2 }, borderRadius: { sm: TOV.radiusXl }, bgcolor: { sm: TOV.glassSurface }, border: { sm: `1px solid ${TOV.border}` }, boxShadow: { sm: TOV.shadowRaised }, WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box aria-hidden="true" sx={{ width: 52, height: 52, flex: '0 0 52px', display: 'grid', placeItems: 'center', borderRadius: TOV.radiusMd, bgcolor: TOV.slateTint, color: TOV.graphite }}>
                <TouchAppRoundedIcon sx={{ fontSize: TOV.type.titleLg }} />
              </Box>
              <Box>
                <Typography component="h1" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: { xs: TOV.type.title, sm: TOV.type.titleLg }, lineHeight: 1.08 }}>
                  Encontre seu nome
                </Typography>
                <Typography sx={{ color: TOV.caption, fontSize: { xs: TOV.type.bodySm, sm: TOV.type.body }, mt: 0.5 }}>
                  {chamada.ausentes === 0 ? 'Todas as presenças foram confirmadas.' : `${chamada.ausentes} ${chamada.ausentes === 1 ? 'pessoa ainda não confirmou' : 'pessoas ainda não confirmaram'}.`}
                </Typography>
              </Box>
            </Box>
            <TextField
              id="busca-presenca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite seu primeiro nome"
              autoComplete="off"
              inputProps={{ inputMode: 'search', enterKeyHint: 'search', autoCorrect: 'off', spellCheck: false, 'aria-label': 'Digite seu nome para buscar na chamada' }}
              fullWidth
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: TOV.graphite, fontSize: TOV.type.titleLg }} /></InputAdornment>,
                endAdornment: busca
                  ? <InputAdornment position="end"><IconButton aria-label="Limpar busca" onClick={() => setBusca('')} sx={{ width: 44, height: 44 }}><CloseRoundedIcon /></IconButton></InputAdornment>
                  : undefined,
                sx: { height: { xs: 60, sm: 64 }, fontSize: { xs: TOV.type.bodyLg, sm: TOV.type.section }, bgcolor: TOV.surface, borderRadius: TOV.radiusMd, touchAction: 'manipulation' },
              }}
            />
          </Box>
        </Box>

        {alunosFiltrados.length === 0 && (
          <Box sx={{ border: `1px dashed ${TOV.border}`, borderRadius: TOV.radiusXl, bgcolor: TOV.glassSurfaceFaint, py: { xs: 5, sm: 7 }, px: 3, textAlign: 'center' }}>
            <Box sx={{ width: 60, height: 60, mx: 'auto', mb: 2, display: 'grid', placeItems: 'center', borderRadius: TOV.radiusLg, bgcolor: TOV.slateTint, color: TOV.caption }}><SearchRoundedIcon sx={{ fontSize: TOV.type.titleLg }} /></Box>
            <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.titleSm }}>{busca ? 'Nenhum nome encontrado' : 'A lista ainda está vazia'}</Typography>
            <Typography sx={{ color: TOV.caption, mt: 1 }}>{busca ? 'Confira a digitação ou tente apenas o primeiro nome.' : 'Peça à secretaria para conferir os alunos desta turma.'}</Typography>
          </Box>
        )}

        {aguardando.length > 0 && (
          <Box component="section" aria-labelledby="titulo-aguardando">
            <CabecalhoSecao id="titulo-aguardando" titulo="Aguardando confirmação" quantidade={aguardando.length} descricao="Toque no seu nome para registrar a chegada." />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))', md: 'repeat(3,minmax(0,1fr))' }, gap: { xs: 1, sm: 1.5 } }}>
              {aguardando.map((aluno) => <CartaoAluno key={aluno.cod_alu} aluno={aluno} onSelecionar={selecionarAluno} />)}
            </Box>
          </Box>
        )}

        {buscaAtiva && aguardando.length === 0 && presentes.length > 0 && (
          <Box sx={{ mb: 2.5, px: { xs: 2.5, sm: 3 }, py: 2.5, display: 'flex', alignItems: 'center', gap: 2, borderRadius: TOV.radiusXl, bgcolor: TOV.successTint, border: `1px solid ${TOV.successBorder}` }}>
            <CheckCircleRoundedIcon sx={{ color: TOV.success, fontSize: TOV.type.displaySm }} />
            <Box>
              <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.titleSm }}>Presença já confirmada</Typography>
              <Typography sx={{ color: TOV.success, fontSize: TOV.type.body, mt: 0.5 }}>Este nome já está na lista de quem chegou.</Typography>
            </Box>
          </Box>
        )}

        {aguardando.length === 0 && presentes.length > 0 && !busca && (
          <Box sx={{ mb: 3, px: { xs: 2.5, sm: 3.5 }, py: 2.5, display: 'flex', alignItems: 'center', gap: 2, borderRadius: TOV.radiusXl, bgcolor: TOV.successTint, border: `1px solid ${TOV.successBorder}` }}>
            <CheckCircleRoundedIcon sx={{ color: TOV.success, fontSize: TOV.type.display }} />
            <Box>
              <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.titleSm }}>Todo mundo chegou!</Typography>
              <Typography sx={{ color: TOV.success, fontSize: TOV.type.body, mt: 0.5 }}>Todas as presenças desta turma já foram confirmadas.</Typography>
            </Box>
          </Box>
        )}

        {presentes.length > 0 && (
          <Box component="section" aria-label="Presenças já confirmadas" sx={{ mt: aguardando.length ? { xs: 3, sm: 3.75 } : 0 }}>
            {!buscaAtiva && (
              <Button
                fullWidth
                variant="outlined"
                onClick={() => setMostrarPresentes((valor) => !valor)}
                aria-expanded={mostrarPresentes}
                aria-controls="lista-presentes"
                startIcon={<PeopleAltRoundedIcon />}
                endIcon={<ExpandMoreRoundedIcon sx={{ transition: `transform ${TOV.transitionFast}`, transform: mostrarPresentes ? 'rotate(180deg)' : 'none' }} />}
                sx={{ minHeight: 60, justifyContent: 'flex-start', px: 2, color: TOV.graphite, borderColor: TOV.border, bgcolor: TOV.glassSurfaceSoft, '& .MuiButton-endIcon': { ml: 'auto' } }}
              >
                {mostrarPresentes ? 'Ocultar confirmados' : `Ver quem já confirmou (${presentes.length})`}
              </Button>
            )}
            {exibirPresentes && (
              <Box id="lista-presentes" sx={{ mt: buscaAtiva ? 0 : 2 }}>
                <CabecalhoSecao id="titulo-presentes" titulo={buscaAtiva ? 'Resultado confirmado' : 'Já chegaram'} quantidade={presentes.length} descricao={buscaAtiva ? 'Este nome já registrou presença.' : 'Presenças confirmadas nesta chamada.'} tom="success" />
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))', md: 'repeat(3,minmax(0,1fr))' }, gap: { xs: 1, sm: 1.5 } }}>
                  {presentes.map((aluno) => <CartaoAluno key={aluno.cod_alu} aluno={aluno} onSelecionar={selecionarAluno} />)}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>

      <Dialog
        open={!!selecionado}
        onClose={confirmando ? undefined : () => setSelecionado(null)}
        disableEscapeKeyDown={confirmando}
        maxWidth="sm"
        fullWidth
        aria-labelledby="titulo-confirmacao-presenca"
        aria-describedby="descricao-confirmacao-presenca"
        PaperProps={{ sx: { borderRadius: TOV.radius2xl, overflow: 'hidden', m: { xs: 2, sm: 4 }, width: { xs: 'calc(100% - 32px)', sm: '100%' }, maxWidth: 620 } }}
      >
        {selecionado && (
          <>
            <Box sx={{ height: 5, bgcolor: TOV.coral }} />
            <DialogContent sx={{ textAlign: 'center', px: { xs: 2.5, sm: 5 }, pt: { xs: 3, sm: 4 }, pb: 2 }}>
              <Typography variant="overline" sx={{ color: TOV.coral }}>Confirme seu nome</Typography>
              <Typography id="titulo-confirmacao-presenca" component="h2" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: { xs: TOV.type.titleLg, sm: TOV.type.displaySm }, lineHeight: 1.1, mt: 1 }}>
                É você?
              </Typography>
              <AvatarIniciais nome={selecionado.nome} tamanho={80} radius={TOV.radius2xl} fontSize={TOV.type.titleLg} sx={{ mx: 'auto', mt: 2.5, mb: 1.5, bgcolor: TOV.graphite }} />
              <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: { xs: TOV.type.title, sm: TOV.type.titleLg }, lineHeight: 1.22, overflowWrap: 'anywhere' }}>
                {selecionado.nome}
              </Typography>
              <Typography id="descricao-confirmacao-presenca" sx={{ color: TOV.caption, mt: 1 }}>Confira o nome antes de continuar. A chegada será registrada com o horário atual.</Typography>
            </DialogContent>
            <DialogActions sx={{ p: { xs: 2, sm: 3 }, pt: 2, gap: 1.5, bgcolor: TOV.surfaceMuted, borderTop: `1px solid ${TOV.divider}`, '& > button': { flex: 1, minHeight: { xs: 60, sm: 64 }, fontSize: { xs: TOV.type.body, sm: TOV.type.bodyLg }, touchAction: 'manipulation' } }}>
              <Button variant="outlined" onClick={() => setSelecionado(null)} disabled={confirmando}>Não sou eu</Button>
              <Button variant="contained" onClick={confirmarPresenca} disabled={confirmando} startIcon={!confirmando && <CheckCircleRoundedIcon />}>
                {confirmando ? 'Confirmando…' : 'Sim, confirmar'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {sucesso && (
        <Box
          role="status"
          aria-live="assertive"
          onClick={() => setSucesso(null)}
          sx={{
            position: 'fixed', inset: 0, zIndex: 1500, display: 'grid', placeItems: 'center',
            bgcolor: TOV.ink,
            backgroundImage: TOV.feedbackGradient,
            p: 3,
            '@keyframes entradaSucesso': { from: { opacity: 0, transform: 'translateY(12px) scale(.96)' }, to: { opacity: 1, transform: 'translateY(0) scale(1)' } },
          }}
        >
          <Box sx={{ width: 'min(540px, 100%)', textAlign: 'center', color: TOV.onDark, animation: `entradaSucesso ${TOV.transitionBase} both` }}>
            <Box sx={{ width: { xs: 104, sm: 120 }, height: { xs: 104, sm: 120 }, mx: 'auto', display: 'grid', placeItems: 'center', borderRadius: TOV.radiusDisplay, bgcolor: TOV.successBright, color: TOV.ink, boxShadow: TOV.shadowSuccess }}>
              <CheckCircleRoundedIcon sx={{ fontSize: { xs: TOV.type.heroLg, sm: TOV.type.heroLg } }} />
            </Box>
            <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: { xs: TOV.type.displaySm, sm: TOV.type.hero }, lineHeight: 1.05, mt: 3 }}>
              Presença confirmada!
            </Typography>
            <Typography sx={{ color: TOV.onDarkBody, fontSize: { xs: TOV.type.section, sm: TOV.type.titleSm }, mt: 1.5 }}>
              Que bom ter você aqui, {primeiroNome(sucesso.nome)}.
            </Typography>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mt: 2.5, px: 2, py: 1, borderRadius: TOV.radiusFull, bgcolor: TOV.onDarkSurface, border: `1px solid ${TOV.onDarkBorder}`, color: TOV.onDarkBody, fontSize: TOV.type.body, fontWeight: 700 }}>
              Chegada registrada às {sucesso.horario}
            </Box>
            <Typography sx={{ color: TOV.onDarkMuted, fontSize: TOV.type.bodySm, mt: 3 }}>Toque em qualquer lugar para continuar.</Typography>
          </Box>
          <Box aria-hidden="true" sx={{ position: 'absolute', inset: 'auto 0 0', height: 4, bgcolor: TOV.onDarkSurfaceHover, overflow: 'hidden' }}>
            <Box sx={{ height: '100%', bgcolor: TOV.successBright, transformOrigin: 'left', animation: `tempoSucesso ${TOV.transitionFeedback} both`, '@keyframes tempoSucesso': { from: { transform: 'scaleX(1)' }, to: { transform: 'scaleX(0)' } } }} />
          </Box>
        </Box>
      )}
    </Box>
  )
}
