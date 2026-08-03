import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  IconButton, InputAdornment, TextField, Typography,
} from '@mui/material'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import HowToRegRoundedIcon from '@mui/icons-material/HowToRegRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import WifiOffRoundedIcon from '@mui/icons-material/WifiOffRounded'
import { getPublico, postPublico } from '../api'
import { TOV } from '../theme'
import { AvatarIniciais, resetBotao } from '../ui'

function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function textoData(data) {
  if (!data) return ''
  const texto = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  }).format(new Date(`${data}T12:00:00`))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function textoHora(dataHora) {
  if (!dataHora) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(dataHora))
}

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0]
}

function CabecalhoSecao({ id, titulo, quantidade, descricao, tom = 'neutral' }) {
  const sucesso = tom === 'success'
  return (
    <Box sx={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 2, mb: 1.5 }}>
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography id={id} component="h2" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: { xs: 19, sm: 22 }, lineHeight: 1.2 }}>
            {titulo}
          </Typography>
          <Box
            component="span"
            sx={{
              minWidth: 28, height: 28, px: 0.85, display: 'inline-grid', placeItems: 'center',
              borderRadius: 999, bgcolor: sucesso ? TOV.successTint : TOV.slateTint,
              color: sucesso ? TOV.success : TOV.graphite, fontSize: 12, fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {quantidade}
          </Box>
        </Box>
        {descricao && <Typography sx={{ color: TOV.caption, fontSize: 13, mt: 0.35 }}>{descricao}</Typography>}
      </Box>
    </Box>
  )
}

function CartaoAluno({ aluno, onSelecionar }) {
  const presente = aluno.presente
  return (
    <Box
      component={presente ? 'article' : 'button'}
      type={presente ? undefined : 'button'}
      onClick={presente ? undefined : () => onSelecionar(aluno)}
      aria-label={presente ? `${aluno.nome}, presença marcada às ${textoHora(aluno.registrado_em)}` : `Marcar presença de ${aluno.nome}`}
      sx={{
        ...(presente ? {} : resetBotao),
        minHeight: { xs: 84, sm: 94 }, width: '100%', px: { xs: 1.5, sm: 2 }, py: 1.5,
        display: 'flex', alignItems: 'center', gap: { xs: 1.4, sm: 1.75 }, textAlign: 'left',
        borderRadius: '18px', border: `1px solid ${presente ? 'rgba(39,116,81,.20)' : TOV.border}`,
        bgcolor: presente ? 'rgba(39,116,81,.075)' : TOV.surface,
        boxShadow: presente ? 'none' : '0 10px 30px -30px rgba(25,27,29,.55)',
        cursor: presente ? 'default' : 'pointer', position: 'relative', overflow: 'hidden',
        userSelect: 'none', WebkitUserSelect: 'none',
        transition: `border-color ${TOV.durationFast} ${TOV.ease}, transform ${TOV.durationFast} ${TOV.ease}, background-color ${TOV.durationFast} ${TOV.ease}`,
        '&::before': presente ? undefined : {
          content: '""', position: 'absolute', inset: '14px auto 14px 0', width: 3,
          borderRadius: '0 4px 4px 0', bgcolor: TOV.coral,
        },
        '&:hover': presente ? {} : { borderColor: '#C3B9B1', bgcolor: '#FCFAF7' },
        '&:active': presente ? {} : { transform: 'scale(.992)', bgcolor: TOV.canvas },
      }}
    >
      <AvatarIniciais
        nome={aluno.nome}
        tamanho={56}
        radius={17}
        fontSize={19}
        sx={presente
          ? { bgcolor: TOV.success, color: '#fff', borderColor: 'transparent' }
          : { bgcolor: TOV.surfaceMuted, color: TOV.graphite, borderColor: TOV.divider }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: { xs: 17, sm: 18.5 }, lineHeight: 1.25, color: TOV.ink }}>
          {aluno.nome}
        </Typography>
        <Typography sx={{ color: presente ? TOV.success : TOV.caption, fontSize: 12.5, fontWeight: 700, mt: 0.45 }}>
          {presente ? `Presença confirmada às ${textoHora(aluno.registrado_em)}` : 'Toque aqui para confirmar'}
        </Typography>
      </Box>
      <Box
        aria-hidden="true"
        sx={{
          width: 42, height: 42, flex: '0 0 42px', display: 'grid', placeItems: 'center',
          borderRadius: '13px', bgcolor: presente ? 'transparent' : TOV.coralTint,
          color: presente ? TOV.success : TOV.coral,
        }}
      >
        {presente ? <CheckCircleRoundedIcon sx={{ fontSize: 29 }} /> : <ArrowForwardRoundedIcon sx={{ fontSize: 25 }} />}
      </Box>
    </Box>
  )
}

export default function PresencaTotem() {
  const { token } = useParams()
  const [chamada, setChamada] = useState(null)
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const [sucesso, setSucesso] = useState(null)
  const [agora, setAgora] = useState(new Date())
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [reconectando, setReconectando] = useState(false)
  const sucessoTimer = useRef(null)

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const resposta = await getPublico(`/presenca-publica/${token}`)
      setChamada(resposta)
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
      if (!silencioso) setCarregando(false)
    }
  }, [token])

  useEffect(() => {
    carregar()
    const atualizacao = window.setInterval(() => carregar(true), 15_000)
    const relogio = window.setInterval(() => setAgora(new Date()), 30_000)
    return () => {
      window.clearInterval(atualizacao)
      window.clearInterval(relogio)
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

  const alunosFiltrados = useMemo(() => {
    const termo = normalizar(busca.trim())
    if (!termo) return chamada?.alunos || []
    return (chamada?.alunos || []).filter((aluno) => normalizar(aluno.nome).includes(termo))
  }, [busca, chamada])
  const aguardando = alunosFiltrados.filter((aluno) => !aluno.presente)
  const presentes = alunosFiltrados.filter((aluno) => aluno.presente)
  const progresso = chamada?.total ? Math.min(100, (chamada.presentes / chamada.total) * 100) : 0

  async function confirmarPresenca() {
    if (!selecionado) return
    setConfirmando(true)
    try {
      const resposta = await postPublico(`/presenca-publica/${token}`, { cod_alu: selecionado.cod_alu })
      const marcadoEm = resposta.registrado_em
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
      sucessoTimer.current = window.setTimeout(() => setSucesso(null), 2400)
    } catch (e) {
      setErro(e.message)
      setSelecionado(null)
    } finally {
      setConfirmando(false)
    }
  }

  if (carregando) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', bgcolor: TOV.canvas, p: 3 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Box sx={{ width: 62, height: 62, mx: 'auto', mb: 2.5, display: 'grid', placeItems: 'center', borderRadius: '18px', bgcolor: TOV.graphite, color: '#fff', fontFamily: TOV.fontHead, fontWeight: 800, fontSize: 18 }}>TOV</Box>
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
        <Box sx={{ width: 'min(520px, 100%)', textAlign: 'center', bgcolor: TOV.surface, border: `1px solid ${TOV.border}`, borderRadius: '26px', overflow: 'hidden' }}>
          <Box sx={{ height: 5, bgcolor: encerrada ? TOV.coral : TOV.warning }} />
          <Box sx={{ p: { xs: 3, sm: 5 } }}>
            <Box sx={{ width: 76, height: 76, mx: 'auto', mb: 2.5, display: 'grid', placeItems: 'center', borderRadius: '23px', bgcolor: encerrada ? TOV.coralTint : TOV.warningTint, color: encerrada ? TOV.coral : TOV.warning }}>
              {encerrada ? <HowToRegRoundedIcon sx={{ fontSize: 40 }} /> : <WifiOffRoundedIcon sx={{ fontSize: 38 }} />}
            </Box>
            <Typography variant="h1" sx={{ fontSize: { xs: 30, sm: 38 } }}>{encerrada ? 'Chamada encerrada' : 'Sem conexão no momento'}</Typography>
            <Typography sx={{ color: TOV.caption, mt: 1.5, fontSize: 16 }}>
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
          position: 'sticky', top: 0, zIndex: 20, color: '#fff', borderTop: `4px solid ${TOV.coral}`,
          bgcolor: TOV.graphite,
          backgroundImage: 'linear-gradient(115deg, rgba(25,27,29,.26), rgba(52,59,63,0) 58%)',
          px: { xs: 2, sm: 3.5 }, pt: 'max(16px, env(safe-area-inset-top))', pb: { xs: 1.8, sm: 2.15 },
          boxShadow: '0 12px 30px -28px rgba(25,27,29,.85)',
        }}
      >
        <Box sx={{ maxWidth: 1160, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: { xs: 1.5, sm: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.25, sm: 1.5 }, minWidth: 0 }}>
            <Box sx={{ width: { xs: 46, sm: 50 }, height: { xs: 46, sm: 50 }, flex: '0 0 auto', display: 'grid', placeItems: 'center', borderRadius: '15px', bgcolor: TOV.coral, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.1)', fontFamily: TOV.fontHead, fontWeight: 800, fontSize: 16 }}>
              TOV
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography component="div" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: { xs: 18, sm: 23 }, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {chamada.turma.nome}
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.62)', fontSize: { xs: 11.5, sm: 13.5 }, mt: 0.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {textoData(chamada.data)}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ ml: 'auto', display: { xs: 'none', sm: reconectando ? 'flex' : 'none', md: 'flex' }, alignItems: 'center', gap: 0.8, px: 1.2, py: 0.7, borderRadius: 999, bgcolor: reconectando ? 'rgba(154,91,18,.22)' : 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.09)', color: reconectando ? '#F2C47D' : 'rgba(255,255,255,.72)', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {reconectando ? <WifiOffRoundedIcon sx={{ fontSize: 15 }} /> : <Box aria-hidden="true" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#62C596' }} />}
            {reconectando ? 'Reconectando…' : 'Chamada aberta'}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.25, sm: 2 }, flexShrink: 0 }}>
            <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'right' }}>
              <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: 9.5, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>Agora</Typography>
              <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 18, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{textoHora(agora.toISOString())}</Typography>
            </Box>
            <Box aria-hidden="true" sx={{ display: { xs: 'none', sm: 'block' }, width: '1px', height: 35, bgcolor: 'rgba(255,255,255,.12)' }} />
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontFamily: TOV.fontHead, fontSize: { xs: 22, sm: 28 }, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {chamada.presentes}<Box component="span" sx={{ color: 'rgba(255,255,255,.38)', fontSize: '.62em' }}>/{chamada.total}</Box>
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.56)', fontSize: { xs: 9.5, sm: 10.5 }, fontWeight: 700, mt: 0.45, whiteSpace: 'nowrap' }}>presentes</Typography>
            </Box>
          </Box>
        </Box>
        <Box aria-hidden="true" sx={{ position: 'absolute', inset: 'auto 0 0', height: 3, bgcolor: 'rgba(255,255,255,.08)' }}>
          <Box sx={{ width: `${progresso}%`, height: '100%', bgcolor: '#62C596', transition: `width 420ms ${TOV.ease}` }} />
        </Box>
      </Box>

      <Box component="main" sx={{ maxWidth: 1160, mx: 'auto', px: { xs: 1.5, sm: 3 }, pt: { xs: 2.5, sm: 3.5 } }}>
        {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2 }}>{erro}</Alert>}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) 370px' }, alignItems: 'end', gap: { xs: 2.25, md: 4 }, mb: { xs: 3, sm: 3.5 } }}>
          <Box>
            <Typography variant="overline" sx={{ color: TOV.coral, display: 'block', mb: 0.75 }}>Presença de hoje</Typography>
            <Typography component="h1" variant="h1" sx={{ fontSize: { xs: 31, sm: 42 }, maxWidth: 700 }}>
              Olá! Marque sua chegada.
            </Typography>
            <Typography sx={{ color: TOV.caption, fontSize: { xs: 14, sm: 15.5 }, mt: 1, maxWidth: 620 }}>
              Encontre seu nome na lista, toque nele e confirme. Leva só alguns segundos.
            </Typography>
          </Box>
          <Box component="section" aria-label="Busca de aluno">
            <Typography component="label" htmlFor="busca-presenca" variant="overline" sx={{ color: TOV.caption, display: 'block', mb: 0.7 }}>Buscar na lista</Typography>
            <TextField
              id="busca-presenca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite seu primeiro nome"
              autoComplete="off"
              fullWidth
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: TOV.caption }} /></InputAdornment>,
                endAdornment: busca
                  ? <InputAdornment position="end"><IconButton size="small" aria-label="Limpar busca" onClick={() => setBusca('')}><CloseRoundedIcon fontSize="small" /></IconButton></InputAdornment>
                  : undefined,
                sx: { height: 58, fontSize: 16.5, bgcolor: TOV.surface },
              }}
            />
          </Box>
        </Box>

        {alunosFiltrados.length === 0 && (
          <Box sx={{ border: `1px dashed ${TOV.border}`, borderRadius: '20px', bgcolor: 'rgba(255,255,255,.42)', py: { xs: 5, sm: 7 }, px: 3, textAlign: 'center' }}>
            <Box sx={{ width: 58, height: 58, mx: 'auto', mb: 1.75, display: 'grid', placeItems: 'center', borderRadius: '17px', bgcolor: TOV.slateTint, color: TOV.caption }}><SearchRoundedIcon sx={{ fontSize: 29 }} /></Box>
            <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 22 }}>{busca ? 'Nenhum nome encontrado' : 'A lista ainda está vazia'}</Typography>
            <Typography sx={{ color: TOV.caption, mt: 0.75 }}>{busca ? 'Confira a digitação ou tente apenas o primeiro nome.' : 'Peça à secretaria para conferir os alunos desta turma.'}</Typography>
          </Box>
        )}

        {aguardando.length > 0 && (
          <Box component="section" aria-labelledby="titulo-aguardando">
            <CabecalhoSecao id="titulo-aguardando" titulo="Aguardando confirmação" quantidade={aguardando.length} descricao="Toque no seu nome para registrar a chegada." />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))' }, gap: { xs: 1.15, sm: 1.5 } }}>
              {aguardando.map((aluno) => <CartaoAluno key={aluno.cod_alu} aluno={aluno} onSelecionar={setSelecionado} />)}
            </Box>
          </Box>
        )}

        {aguardando.length === 0 && presentes.length > 0 && !busca && (
          <Box sx={{ mb: 3, px: { xs: 2.5, sm: 3.5 }, py: 2.5, display: 'flex', alignItems: 'center', gap: 2, borderRadius: '20px', bgcolor: TOV.successTint, border: '1px solid rgba(39,116,81,.18)' }}>
            <CheckCircleRoundedIcon sx={{ color: TOV.success, fontSize: 40 }} />
            <Box>
              <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 22 }}>Todo mundo chegou!</Typography>
              <Typography sx={{ color: TOV.success, fontSize: 13.5, mt: 0.25 }}>Todas as presenças desta turma já foram confirmadas.</Typography>
            </Box>
          </Box>
        )}

        {presentes.length > 0 && (
          <Box component="section" aria-labelledby="titulo-presentes" sx={{ mt: aguardando.length ? { xs: 3.5, sm: 4.5 } : 0 }}>
            <CabecalhoSecao id="titulo-presentes" titulo="Já chegaram" quantidade={presentes.length} descricao="Presenças confirmadas nesta chamada." tom="success" />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))' }, gap: { xs: 1.15, sm: 1.5 } }}>
              {presentes.map((aluno) => <CartaoAluno key={aluno.cod_alu} aluno={aluno} onSelecionar={setSelecionado} />)}
            </Box>
          </Box>
        )}
      </Box>

      <Dialog
        open={!!selecionado}
        onClose={confirmando ? undefined : () => setSelecionado(null)}
        maxWidth="sm"
        fullWidth
        aria-labelledby="titulo-confirmacao-presenca"
        PaperProps={{ sx: { borderRadius: '26px', overflow: 'hidden', m: { xs: 2, sm: 4 }, width: { xs: 'calc(100% - 32px)', sm: '100%' } } }}
      >
        {selecionado && (
          <>
            <Box sx={{ height: 5, bgcolor: TOV.coral }} />
            <DialogContent sx={{ textAlign: 'center', px: { xs: 2.5, sm: 5 }, pt: { xs: 3, sm: 4 }, pb: 2 }}>
              <Typography variant="overline" sx={{ color: TOV.coral }}>Confirme seu nome</Typography>
              <Typography id="titulo-confirmacao-presenca" component="h2" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: { xs: 29, sm: 36 }, lineHeight: 1.1, mt: 0.75 }}>
                É você?
              </Typography>
              <AvatarIniciais nome={selecionado.nome} tamanho={82} radius={25} fontSize={27} sx={{ mx: 'auto', mt: 2.5, mb: 1.5, bgcolor: TOV.graphite }} />
              <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: { xs: 23, sm: 29 }, lineHeight: 1.22, overflowWrap: 'anywhere' }}>
                {selecionado.nome}
              </Typography>
              <Typography sx={{ color: TOV.caption, mt: 1 }}>Ao confirmar, sua chegada será registrada com o horário atual.</Typography>
            </DialogContent>
            <DialogActions sx={{ p: { xs: 2, sm: 3 }, pt: 2, gap: 1.25, bgcolor: '#FAF8F5', borderTop: `1px solid ${TOV.divider}`, '& > button': { flex: 1, minHeight: 56, fontSize: { xs: 13.5, sm: 14.5 } } }}>
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
          sx={{
            position: 'fixed', inset: 0, zIndex: 1500, display: 'grid', placeItems: 'center',
            bgcolor: TOV.ink,
            backgroundImage: 'radial-gradient(circle at 50% 34%, rgba(39,116,81,.34), transparent 38%), linear-gradient(145deg, #252A2D, #191B1D)',
            p: 3,
            '@keyframes entradaSucesso': { from: { opacity: 0, transform: 'translateY(12px) scale(.96)' }, to: { opacity: 1, transform: 'translateY(0) scale(1)' } },
          }}
        >
          <Box sx={{ width: 'min(540px, 100%)', textAlign: 'center', color: '#fff', animation: `entradaSucesso 360ms ${TOV.ease} both` }}>
            <Box sx={{ width: { xs: 100, sm: 120 }, height: { xs: 100, sm: 120 }, mx: 'auto', display: 'grid', placeItems: 'center', borderRadius: '34px', bgcolor: '#62C596', color: TOV.ink, boxShadow: '0 24px 60px -28px rgba(98,197,150,.7)' }}>
              <CheckCircleRoundedIcon sx={{ fontSize: { xs: 68, sm: 82 } }} />
            </Box>
            <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: { xs: 34, sm: 48 }, lineHeight: 1.05, mt: 3 }}>
              Presença confirmada!
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,.78)', fontSize: { xs: 18, sm: 22 }, mt: 1.5 }}>
              Que bom ter você aqui, {primeiroNome(sucesso.nome)}.
            </Typography>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mt: 2.5, px: 1.6, py: 0.9, borderRadius: 999, bgcolor: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.72)', fontSize: 13.5, fontWeight: 700 }}>
              Chegada registrada às {sucesso.horario}
            </Box>
            <Typography sx={{ color: 'rgba(255,255,255,.42)', fontSize: 12, mt: 3 }}>A lista voltará automaticamente para o próximo aluno.</Typography>
          </Box>
        </Box>
      )}
    </Box>
  )
}
