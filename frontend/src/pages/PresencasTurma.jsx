import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Box, Button, CircularProgress, IconButton, Snackbar, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import HowToRegRoundedIcon from '@mui/icons-material/HowToRegRounded'
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined'
import { api } from '../api'
import { TOV } from '../theme'
import {
  CabecalhoPagina, CardMetrica, CartaoLista, DialogoConfirmacao, EstadoVazio,
  LinhaCartao, SkeletonCards, StatusBadge, cardSx, resetBotao, useTelaDesktop,
} from '../ui'

function dataLonga(data) {
  if (!data) return '—'
  const texto = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  }).format(new Date(`${data}T12:00:00`))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function dataCurta(data) {
  if (!data) return '—'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(`${data}T12:00:00`))
    .replace('.', '')
}

function hora(dataHora) {
  if (!dataHora) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(dataHora))
}

function hojeLocal() {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo',
  }).formatToParts(new Date())
  const valor = (tipo) => partes.find((parte) => parte.type === tipo)?.value
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

export default function PresencasTurma() {
  const { codTur } = useParams()
  const navigate = useNavigate()
  const telaDesktop = useTelaDesktop()
  const [turma, setTurma] = useState(null)
  const [chamadas, setChamadas] = useState([])
  const [selecionadaId, setSelecionadaId] = useState(null)
  const [detalhe, setDetalhe] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [confirmarEncerramento, setConfirmarEncerramento] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')

  const carregarLista = useCallback(async () => {
    const resposta = await api.get(`/turmas/${codTur}/chamadas`)
    setChamadas(resposta)
    setSelecionadaId((atual) => atual || resposta[0]?.id || null)
    return resposta
  }, [codTur])

  useEffect(() => {
    let ativo = true
    Promise.all([api.get(`/turmas/${codTur}`), api.get(`/turmas/${codTur}/chamadas`)])
      .then(([dadosTurma, dadosChamadas]) => {
        if (!ativo) return
        setTurma(dadosTurma)
        setChamadas(dadosChamadas)
        setSelecionadaId(dadosChamadas[0]?.id || null)
      })
      .catch((e) => { if (ativo) setErro(e.message) })
      .finally(() => { if (ativo) setCarregando(false) })
    return () => { ativo = false }
  }, [codTur])

  const carregarDetalhe = useCallback(async (silencioso = false) => {
    if (!selecionadaId) {
      setDetalhe(null)
      return
    }
    try {
      const resposta = await api.get(`/turmas/${codTur}/chamadas/${selecionadaId}`)
      setDetalhe(resposta)
      if (!silencioso) setErro('')
    } catch (e) {
      if (!silencioso) setErro(e.message)
    }
  }, [codTur, selecionadaId])

  useEffect(() => { carregarDetalhe() }, [carregarDetalhe])

  useEffect(() => {
    if (detalhe?.status !== 'ABERTA') return undefined
    const intervalo = window.setInterval(async () => {
      await carregarDetalhe(true)
      try { await carregarLista() } catch { /* atualização silenciosa */ }
    }, 10_000)
    return () => window.clearInterval(intervalo)
  }, [carregarDetalhe, carregarLista, detalhe?.status])

  const chamadaHoje = useMemo(
    () => chamadas.find((item) => item.data === hojeLocal()) || null,
    [chamadas],
  )
  const chamadaAbertaHoje = chamadaHoje?.status === 'ABERTA' ? chamadaHoje : null

  async function iniciarChamada() {
    setProcessando(true)
    setErro('')
    try {
      const chamada = await api.post(`/turmas/${codTur}/chamadas/abrir`)
      setSelecionadaId(chamada.id)
      setDetalhe(chamada)
      await carregarLista()
      navigate(`/presenca/${chamada.token}`)
    } catch (e) {
      setErro(e.message)
    } finally {
      setProcessando(false)
    }
  }

  function abrirTotem(chamada = chamadaAbertaHoje || detalhe) {
    if (chamada?.token) navigate(`/presenca/${chamada.token}`)
  }

  async function encerrarChamada() {
    if (!detalhe) return
    setProcessando(true)
    try {
      const resposta = await api.post(`/turmas/${codTur}/chamadas/${detalhe.id}/encerrar`)
      setDetalhe(resposta)
      setConfirmarEncerramento(false)
      setMensagem('Chamada encerrada e presenças salvas.')
      await carregarLista()
    } catch (e) {
      setErro(e.message)
      setConfirmarEncerramento(false)
    } finally {
      setProcessando(false)
    }
  }

  if (carregando) return <SkeletonCards quantidade={3} altura={170} />

  return (
    <Box>
      <Box component="button" type="button" onClick={() => navigate(`/turmas/${codTur}`)} sx={{ ...resetBotao, px: 0.5, display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 14, color: TOV.caption, fontWeight: 700, mb: 1.5, '&:hover': { color: TOV.coral } }}>
        <ArrowBackRoundedIcon sx={{ fontSize: 18 }} /> Voltar para a turma
      </Box>

      <CabecalhoPagina
        eyebrow="Chamada digital"
        titulo={`Presenças · ${turma?.nome || 'Turma'}`}
        descricao="Abra a chamada neste iPad para cada aluno registrar a própria chegada."
        acoes={chamadaAbertaHoje
          ? <Button variant="contained" startIcon={<OpenInFullRoundedIcon />} onClick={() => abrirTotem(chamadaAbertaHoje)}>Abrir modo iPad</Button>
          : <Button variant="contained" startIcon={<PlayArrowRoundedIcon />} onClick={iniciarChamada} disabled={processando}>{chamadaHoje ? 'Reabrir chamada de hoje' : 'Iniciar chamada no iPad'}</Button>}
      />

      {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2 }}>{erro}</Alert>}

      {chamadas.length === 0 && (
        <Box sx={{ ...cardSx, overflow: 'hidden' }}>
          <Box sx={{ p: { xs: 2.5, sm: 4 }, bgcolor: TOV.graphite, color: '#fff', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'auto minmax(0,1fr) auto' }, alignItems: 'center', gap: 2.5 }}>
            <Box sx={{ width: 66, height: 66, display: 'grid', placeItems: 'center', borderRadius: '20px', bgcolor: TOV.coral, color: '#fff' }}>
              <HowToRegRoundedIcon sx={{ fontSize: 34 }} />
            </Box>
            <Box>
              <Typography variant="h2" sx={{ fontSize: { xs: 25, sm: 31 } }}>Pronto para receber a turma</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.68)', mt: 0.75, maxWidth: 620 }}>
                Ao iniciar, o sistema abre uma tela grande com os nomes dos alunos. Cada um toca no próprio nome e confirma a chegada.
              </Typography>
            </Box>
            <Button variant="contained" onClick={iniciarChamada} disabled={processando} sx={{ minWidth: 190 }}>
              {processando ? 'Preparando…' : 'Iniciar agora'}
            </Button>
          </Box>
          <Box sx={{ px: { xs: 2.5, sm: 4 }, py: 2.25, display: 'flex', alignItems: 'flex-start', gap: 1.25, color: TOV.caption }}>
            <CheckCircleRoundedIcon sx={{ color: TOV.success, mt: '1px' }} />
            <Typography sx={{ fontSize: 13.5 }}>Uma confirmação evita toques por engano. O link deixa de funcionar quando a chamada é encerrada ou o dia termina.</Typography>
          </Box>
        </Box>
      )}

      {chamadas.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '280px minmax(0,1fr)' }, gap: 2.5, alignItems: 'start' }}>
          <Box component="aside" sx={{ ...cardSx, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.75, borderBottom: `1px solid ${TOV.divider}`, display: 'flex', alignItems: 'center', gap: 1 }}>
              <HistoryRoundedIcon sx={{ color: TOV.coral, fontSize: 21 }} />
              <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700 }}>Histórico de chamadas</Typography>
            </Box>
            <Box sx={{ p: 1, display: 'flex', flexDirection: { xs: 'row', lg: 'column' }, gap: 0.75, overflowX: 'auto' }}>
              {chamadas.map((chamada) => {
                const ativa = chamada.id === selecionadaId
                return (
                  <Box
                    key={chamada.id}
                    component="button"
                    type="button"
                    onClick={() => { setDetalhe(null); setSelecionadaId(chamada.id) }}
                    sx={{
                      ...resetBotao, minWidth: { xs: 210, lg: 0 }, width: '100%', px: 1.5, py: 1.25,
                      borderRadius: '10px', bgcolor: ativa ? TOV.coralTint : 'transparent',
                      border: `1px solid ${ativa ? 'rgba(201,47,47,.18)' : 'transparent'}`,
                      '&:hover': { bgcolor: ativa ? TOV.coralTint : TOV.slateTint },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{dataCurta(chamada.data)}</Typography>
                      {chamada.status === 'ABERTA' && <StatusBadge tom="success" dot sx={{ minHeight: 24, px: 1, fontSize: 10.5 }}>Aberta</StatusBadge>}
                    </Box>
                    <Typography sx={{ color: TOV.caption, fontSize: 12.5, mt: 0.4 }}>{chamada.presentes} de {chamada.total} presentes</Typography>
                  </Box>
                )
              })}
            </Box>
          </Box>

          <Box sx={{ minWidth: 0 }}>
            {!detalhe && <Box sx={{ ...cardSx, p: 4, display: 'grid', placeItems: 'center' }}><CircularProgress size={32} /></Box>}
            {detalhe && (
              <>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                  <Box>
                    <Typography variant="h2" sx={{ fontSize: { xs: 24, sm: 29 } }}>{dataLonga(detalhe.data)}</Typography>
                    <Box sx={{ mt: 0.9 }}>
                      <StatusBadge tom={detalhe.status === 'ABERTA' ? 'success' : 'muted'} dot>
                        {detalhe.status === 'ABERTA' ? 'Chamada aberta' : `Encerrada${detalhe.encerrada_em ? ` às ${hora(detalhe.encerrada_em)}` : ''}`}
                      </StatusBadge>
                    </Box>
                  </Box>
                  {detalhe.status === 'ABERTA' && (
                    <Box sx={{ display: 'flex', gap: 1, width: { xs: '100%', sm: 'auto' }, '& > button': { flex: { xs: 1, sm: 'initial' } } }}>
                      <Button variant="outlined" startIcon={<OpenInFullRoundedIcon />} onClick={() => abrirTotem(detalhe)}>Modo iPad</Button>
                      <Button color="error" variant="outlined" startIcon={<StopCircleOutlinedIcon />} onClick={() => setConfirmarEncerramento(true)}>Encerrar</Button>
                    </Box>
                  )}
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))', sm: 'repeat(3,minmax(0,1fr))' }, gap: 1.5, mb: 2.5 }}>
                  <CardMetrica rotulo="Presentes" valor={detalhe.presentes} nota="chegadas confirmadas" destaque />
                  <CardMetrica rotulo="Ausentes" valor={detalhe.ausentes} nota="ainda não chegaram" />
                  <CardMetrica rotulo="Total" valor={detalhe.total} nota="alunos na chamada" sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }} />
                </Box>

                {!telaDesktop && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {detalhe.alunos.length === 0 && <CartaoLista><EstadoVazio compacto titulo="Nenhum aluno nesta chamada" descricao="Matricule alunos na turma antes de abrir a chamada." /></CartaoLista>}
                    {detalhe.alunos.map((aluno) => (
                      <CartaoLista key={aluno.cod_alu}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                          <Typography sx={{ fontWeight: 700 }}>{aluno.nome}</Typography>
                          <StatusBadge tom={aluno.presente ? 'success' : 'muted'} dot>{aluno.presente ? 'Presente' : 'Ausente'}</StatusBadge>
                        </Box>
                        <LinhaCartao rotulo="Chegada" valor={aluno.presente ? hora(aluno.registrado_em) : '—'} />
                      </CartaoLista>
                    ))}
                  </Box>
                )}

                {telaDesktop && (
                  <TableContainer component={Box} sx={{ ...cardSx, overflow: 'hidden' }}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Aluno</TableCell>
                          <TableCell>Situação</TableCell>
                          <TableCell align="right">Horário de chegada</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detalhe.alunos.length === 0 && <TableRow><TableCell colSpan={3} sx={{ p: 0 }}><EstadoVazio titulo="Nenhum aluno nesta chamada" descricao="Matricule alunos na turma antes de abrir a chamada." /></TableCell></TableRow>}
                        {detalhe.alunos.map((aluno) => (
                          <TableRow key={aluno.cod_alu}>
                            <TableCell sx={{ fontWeight: 700 }}>{aluno.nome}</TableCell>
                            <TableCell><StatusBadge tom={aluno.presente ? 'success' : 'muted'} dot>{aluno.presente ? 'Presente' : 'Ausente'}</StatusBadge></TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: TOV.caption, fontWeight: 600 }}>{aluno.presente ? hora(aluno.registrado_em) : '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </>
            )}
          </Box>
        </Box>
      )}

      <DialogoConfirmacao
        aberto={confirmarEncerramento}
        titulo="Encerrar chamada?"
        descricao="Os alunos não poderão mais marcar presença neste iPad. O histórico e os horários já registrados serão mantidos."
        rotuloConfirmar="Encerrar chamada"
        processando={processando}
        onConfirmar={encerrarChamada}
        onFechar={() => setConfirmarEncerramento(false)}
      />

      <Snackbar
        open={!!mensagem}
        autoHideDuration={3500}
        onClose={() => setMensagem('')}
        message={mensagem}
        action={<IconButton size="small" color="inherit" onClick={() => setMensagem('')}><CloseRoundedIcon fontSize="small" /></IconButton>}
      />
    </Box>
  )
}
