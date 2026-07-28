import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Badge, Box, Button, Divider, Drawer, IconButton, List, ListItemButton,
  ListItemText, Switch, Tooltip, Typography,
} from '@mui/material'
import NotificationsIcon from '@mui/icons-material/Notifications'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import InstallMobileIcon from '@mui/icons-material/InstallMobile'
import CloseIcon from '@mui/icons-material/Close'
import { api } from './api'
import { TOV } from './theme'

const CATEGORIAS = [
  ['push_whatsapp', 'WhatsApp'],
  ['push_cadastros', 'Cadastros'],
  ['push_aulas', 'Aulas'],
]

function dataHora(iso) {
  return new Date(`${iso}${iso.endsWith('Z') ? '' : 'Z'}`).toLocaleString('pt-BR', {
    dateStyle: 'short', timeStyle: 'short',
  })
}

function urlBase64ParaUint8Array(valor) {
  const base64 = `${valor}`.replace(/-/g, '+').replace(/_/g, '/')
  const preenchido = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')
  const dados = atob(preenchido)
  return Uint8Array.from(dados, (caractere) => caractere.charCodeAt(0))
}

function ios() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

function instalado() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone
}

export function BotaoInstalarPwa({ compacto = false, sx }) {
  const [prompt, setPrompt] = useState(null)
  const [mostrarIOS, setMostrarIOS] = useState(false)
  useEffect(() => {
    const capturar = (evento) => {
      evento.preventDefault()
      setPrompt(evento)
    }
    const instaladoAgora = () => setPrompt(null)
    window.addEventListener('beforeinstallprompt', capturar)
    window.addEventListener('appinstalled', instaladoAgora)
    return () => {
      window.removeEventListener('beforeinstallprompt', capturar)
      window.removeEventListener('appinstalled', instaladoAgora)
    }
  }, [])
  if (instalado()) return null
  const botao = (aoClicar) => compacto ? (
    <Tooltip title="Instalar aplicativo"><IconButton color="inherit" aria-label="Instalar aplicativo" onClick={aoClicar} sx={sx}><InstallMobileIcon /></IconButton></Tooltip>
  ) : (
    <Button startIcon={<InstallMobileIcon />} variant="outlined" onClick={aoClicar} sx={sx}>Instalar aplicativo</Button>
  )
  if (prompt) {
    return botao(async () => {
      await prompt.prompt()
      setPrompt(null)
    })
  }
  if (ios()) {
    return (
      <>
        {botao(() => setMostrarIOS(!mostrarIOS))}
        {mostrarIOS && <Alert severity="info" sx={{ mt: 1, fontSize: 13 }}>No Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”.</Alert>}
      </>
    )
  }
  return null
}

export function useNotificacoes() {
  const [itens, setItens] = useState([])
  const [naoLidas, setNaoLidas] = useState(0)
  const [preferencias, setPreferencias] = useState(null)
  const [configuracao, setConfiguracao] = useState(null)
  const [erro, setErro] = useState('')

  const atualizar = useCallback(async () => {
    try {
      const [lista, contador, prefs, config] = await Promise.all([
        api.get('/notificacoes?por_pagina=90'),
        api.get('/notificacoes/nao-lidas'),
        api.get('/notificacoes/preferencias'),
        api.get('/notificacoes/push/configuracao'),
      ])
      setItens(lista.itens || [])
      setNaoLidas(contador.quantidade || 0)
      setPreferencias(prefs)
      setConfiguracao(config)
      setErro('')
    } catch (e) {
      // Falhas transitórias não escondem o histórico já carregado.
      setErro(e.message || 'Não foi possível atualizar as notificações.')
    }
  }, [])

  useEffect(() => {
    atualizar()
    const temporizador = window.setInterval(atualizar, 60_000)
    const aoFocar = () => atualizar()
    const aoPush = (evento) => {
      if (evento.data?.type === 'TOV_PUSH') atualizar()
    }
    window.addEventListener('focus', aoFocar)
    navigator.serviceWorker?.addEventListener('message', aoPush)
    return () => {
      window.clearInterval(temporizador)
      window.removeEventListener('focus', aoFocar)
      navigator.serviceWorker?.removeEventListener('message', aoPush)
    }
  }, [atualizar])

  return { itens, naoLidas, preferencias, configuracao, erro, setErro, atualizar, setItens, setNaoLidas, setPreferencias }
}

export function BotaoNotificacoes({ naoLidas, onClick, color = 'inherit' }) {
  return (
    <Tooltip title="Notificações">
      <IconButton color={color} aria-label="Abrir notificações" onClick={onClick}>
        <Badge badgeContent={naoLidas} color="error" max={99}>
          {naoLidas ? <NotificationsIcon /> : <NotificationsNoneIcon />}
        </Badge>
      </IconButton>
    </Tooltip>
  )
}

export default function NotificationCenter({ aberto, onFechar, estado }) {
  const navigate = useNavigate()
  const {
    itens, naoLidas, preferencias, configuracao, erro, setErro, atualizar,
    setItens, setNaoLidas, setPreferencias,
  } = estado
  const [dispositivoAtivo, setDispositivoAtivo] = useState(false)
  const [processandoPush, setProcessandoPush] = useState(false)
  const [filtro, setFiltro] = useState('todas')

  const sincronizarInscricao = useCallback(async () => {
    const registro = await navigator.serviceWorker?.ready
    const inscricao = await registro?.pushManager.getSubscription()
    setDispositivoAtivo(Boolean(inscricao))
  }, [])

  useEffect(() => {
    if (aberto) sincronizarInscricao().catch(() => {})
  }, [aberto, sincronizarInscricao])

  const exibidas = useMemo(
    () => filtro === 'nao-lidas' ? itens.filter((item) => !item.lida) : itens,
    [filtro, itens],
  )

  async function abrir(item) {
    try {
      if (!item.lida) {
        await api.post(`/notificacoes/${item.id}/ler`, {})
        setItens((atuais) => atuais.map((atual) => atual.id === item.id ? { ...atual, lida: true } : atual))
        setNaoLidas((quantidade) => Math.max(0, quantidade - 1))
      }
      onFechar()
      navigate(item.rota || '/')
    } catch (e) { setErro(e.message) }
  }

  async function marcarTodas() {
    try {
      await api.post('/notificacoes/ler-todas', {})
      setItens((atuais) => atuais.map((item) => ({ ...item, lida: true })))
      setNaoLidas(0)
    } catch (e) { setErro(e.message) }
  }

  async function alterarPreferencia(campo, valor) {
    const proximo = { ...preferencias, [campo]: valor }
    setPreferencias(proximo)
    try {
      setPreferencias(await api.put('/notificacoes/preferencias', proximo))
    } catch (e) {
      setPreferencias(preferencias)
      setErro(e.message)
    }
  }

  async function alternarPush() {
    if (!configuracao?.disponivel) return
    setProcessandoPush(true)
    try {
      const registro = await navigator.serviceWorker.ready
      const atual = await registro.pushManager.getSubscription()
      if (atual) {
        await api.post('/notificacoes/push/desinscrever', { endpoint: atual.endpoint })
        await atual.unsubscribe()
        setDispositivoAtivo(false)
        return
      }
      const permissao = await Notification.requestPermission()
      if (permissao !== 'granted') {
        throw new Error(permissao === 'denied' ? 'A permissão de notificações foi negada no navegador.' : 'Permissão de notificações não concedida.')
      }
      const nova = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ParaUint8Array(configuracao.chave_publica),
      })
      await api.post('/notificacoes/push/inscricoes', nova.toJSON())
      setDispositivoAtivo(true)
    } catch (e) { setErro(e.message || 'Não foi possível configurar as notificações push.') }
    finally { setProcessandoPush(false) }
  }

  return (
    <Drawer anchor="right" open={aberto} onClose={onFechar} PaperProps={{ sx: { width: { xs: '100%', sm: 430 }, maxWidth: '100%' } }}>
      <Box sx={{ p: { xs: 2, sm: 3 }, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <NotificationsIcon sx={{ color: TOV.coral }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5">Notificações</Typography>
            <Typography sx={{ color: TOV.caption, fontSize: 13 }}>{naoLidas ? `${naoLidas} não lida${naoLidas === 1 ? '' : 's'}` : 'Tudo em dia'}</Typography>
          </Box>
          <Tooltip title="Marcar todas como lidas"><span><IconButton disabled={!naoLidas} onClick={marcarTodas}><DoneAllIcon /></IconButton></span></Tooltip>
          <Tooltip title="Fechar notificações"><IconButton aria-label="Fechar notificações" onClick={onFechar}><CloseIcon /></IconButton></Tooltip>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
          <Button size="small" variant={filtro === 'todas' ? 'contained' : 'outlined'} onClick={() => setFiltro('todas')}>Todas</Button>
          <Button size="small" variant={filtro === 'nao-lidas' ? 'contained' : 'outlined'} onClick={() => setFiltro('nao-lidas')}>Não lidas</Button>
        </Box>
        {erro && <Alert severity="warning" onClose={() => setErro('')} sx={{ mt: 2 }}>{erro}</Alert>}
        <Divider sx={{ my: 2 }} />
        <List disablePadding sx={{ flex: 1, overflow: 'auto' }}>
          {exibidas.map((item) => (
            <ListItemButton key={item.id} onClick={() => abrir(item)} alignItems="flex-start" sx={{ px: 1.25, py: 1.4, borderRadius: 2, mb: .5, bgcolor: item.lida ? 'transparent' : TOV.coralTint }}>
              <ListItemText
                primary={<Typography sx={{ fontWeight: item.lida ? 600 : 800, fontSize: 14 }}>{item.titulo}</Typography>}
                secondary={<><Typography component="span" sx={{ display: 'block', color: TOV.ink, fontSize: 13, mt: .4 }}>{item.corpo}</Typography><Typography component="span" sx={{ display: 'block', color: TOV.caption, fontSize: 11, mt: .6 }}>{item.categoria} · {dataHora(item.criado_em)}</Typography></>}
              />
            </ListItemButton>
          ))}
          {!exibidas.length && <Typography sx={{ color: TOV.caption, textAlign: 'center', py: 5 }}>Nenhuma notificação por aqui.</Typography>}
        </List>
        <Divider sx={{ my: 2 }} />
        <Typography variant="h6" sx={{ fontSize: 16 }}>Preferências</Typography>
        {configuracao?.disponivel ? (
          <Button sx={{ alignSelf: 'flex-start', mt: 1 }} variant={dispositivoAtivo ? 'outlined' : 'contained'} disabled={processandoPush} onClick={alternarPush}>
            {processandoPush ? 'Configurando…' : dispositivoAtivo ? 'Desativar push neste dispositivo' : 'Ativar push neste dispositivo'}
          </Button>
        ) : <Alert severity="info" sx={{ mt: 1, fontSize: 13 }}>Push está indisponível nesta instalação. O histórico interno continua ativo.</Alert>}
        {preferencias && CATEGORIAS.map(([campo, rotulo]) => (
          <Box key={campo} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: .5 }}>
            <Typography sx={{ fontSize: 14 }}>{rotulo}</Typography>
            <Switch checked={Boolean(preferencias[campo])} onChange={(evento) => alterarPreferencia(campo, evento.target.checked)} inputProps={{ 'aria-label': `Push de ${rotulo}` }} />
          </Box>
        ))}
      </Box>
    </Drawer>
  )
}
