import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar, BottomNavigation, BottomNavigationAction, Box, Drawer, IconButton,
  ListItemIcon, ListItemText, Menu, MenuItem, Paper, Toolbar, Typography,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import SpaceDashboardIcon from '@mui/icons-material/SpaceDashboard'
import SchoolIcon from '@mui/icons-material/School'
import PersonIcon from '@mui/icons-material/Person'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import GroupsIcon from '@mui/icons-material/Groups'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import EditNoteIcon from '@mui/icons-material/EditNote'
import FolderCopyOutlinedIcon from '@mui/icons-material/FolderCopyOutlined'
import DescriptionIcon from '@mui/icons-material/Description'
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import CampaignIcon from '@mui/icons-material/Campaign'
import LogoutIcon from '@mui/icons-material/Logout'
import CheckIcon from '@mui/icons-material/Check'
import HistoryEduIcon from '@mui/icons-material/HistoryEdu'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import { api, clearSession, getPerfil, getUser } from './api'
import { TOV } from './theme'
import { DialogoConfirmacao, iniciais, resetBotao } from './ui'
import NotificationCenter, { BotaoInstalarPwa, BotaoNotificacoes, useNotificacoes } from './NotificationCenter'
import { UnsavedChangesContext } from './UnsavedChanges'

const STG_URL = (import.meta.env.VITE_STG_URL?.trim() || 'https://stg.kafune.xyz').replace(/\/+$/, '')

const MENU = [
  { rotulo: 'Dashboard', rota: '/', icone: SpaceDashboardIcon, exato: true, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Início', rota: '/professor', icone: SpaceDashboardIcon, exato: true, perfis: ['PROFESSOR'] },
  { rotulo: 'Minhas turmas', rota: '/professor/turmas', icone: SchoolIcon, perfis: ['PROFESSOR'] },
  { rotulo: 'Alunos', rota: '/alunos', icone: SchoolIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Professores', rota: '/professores', icone: PersonIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Matérias', rota: '/materias', icone: MenuBookIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Turmas', rota: '/turmas', icone: GroupsIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Calendário', rota: '/calendario', icone: CalendarMonthIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Notas e Faltas', rota: '/notas', icone: EditNoteIcon, perfis: ['ADMIN', 'SECRETARIA', 'PROFESSOR'] },
  { rotulo: 'Materiais', rota: '/materiais', icone: FolderCopyOutlinedIcon, perfis: ['ADMIN', 'SECRETARIA', 'PROFESSOR'] },
  { rotulo: 'Relatórios', rota: '/relatorios', icone: DescriptionIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Leads', rota: '/leads', icone: CampaignIcon, perfis: ['ADMIN', 'MARKETING'] },
  { rotulo: 'WhatsApp', rota: '/whatsapp', icone: WhatsAppIcon, perfis: ['ADMIN', 'SECRETARIA', 'MARKETING'] },
  { rotulo: 'Usuários', rota: '/usuarios', icone: ManageAccountsIcon, perfis: ['ADMIN'] },
]

function ItemNav({ item, ativo, onClick }) {
  const Icone = item.icone
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-current={ativo ? 'page' : undefined}
      sx={{
        ...resetBotao,
        display: 'flex', alignItems: 'center', gap: 1.5, px: 1.75, py: 1.25, width: '100%',
        minHeight: 46, borderRadius: '10px', fontSize: 14, userSelect: 'none',
        fontWeight: ativo ? 700 : 600,
        bgcolor: ativo ? TOV.surface : 'transparent',
        color: ativo ? TOV.ink : 'rgba(255,255,255,.76)',
        position: 'relative',
        transition: `background-color ${TOV.durationFast} ${TOV.ease}, color ${TOV.durationFast} ${TOV.ease}`,
        '&::before': ativo ? {
          content: '""', position: 'absolute', left: 0, top: 10, bottom: 10,
          width: 3, borderRadius: '0 3px 3px 0', bgcolor: TOV.coral,
        } : undefined,
        '&:hover': ativo ? {} : { bgcolor: 'rgba(255,255,255,.07)', color: '#fff' },
        '&:focus-visible': { outline: `3px solid rgba(241,73,73,.35)`, outlineOffset: 1, borderRadius: '10px' },
        '& .MuiSvgIcon-root': { color: ativo ? TOV.coral : 'rgba(255,255,255,.62)' },
      }}
    >
      <Icone sx={{ fontSize: 20 }} />
      {item.rotulo}
    </Box>
  )
}

function SeletorSistema({ onTrocar }) {
  const [ancora, setAncora] = useState(null)
  const aberto = Boolean(ancora)

  function fechar() {
    setAncora(null)
  }

  function selecionarSTG() {
    fechar()
    onTrocar(STG_URL)
  }

  return (
    <>
      <Box
        component="button"
        type="button"
        aria-label="Trocar sistema. Sistema atual: TOV Acadêmico"
        aria-haspopup="menu"
        aria-expanded={aberto ? 'true' : undefined}
        onClick={(event) => setAncora(event.currentTarget)}
        sx={{
          ...resetBotao,
          display: 'flex', alignItems: 'center', gap: 1.25, width: '100%', mb: 2.25,
          p: 1.25, minHeight: 58, border: '1px solid rgba(255,255,255,.12)', borderRadius: '12px',
          bgcolor: 'rgba(255,255,255,.055)', color: '#fff', textAlign: 'left',
          transition: `background-color ${TOV.durationFast} ${TOV.ease}, border-color ${TOV.durationFast} ${TOV.ease}`,
          '&:hover': { bgcolor: 'rgba(255,255,255,.09)', borderColor: 'rgba(255,255,255,.22)' },
          '&:focus-visible': { outline: `3px solid rgba(241,73,73,.35)`, outlineOffset: 1 },
        }}
      >
        <Box sx={{ width: 34, height: 34, borderRadius: '9px', bgcolor: TOV.coralTintStrong, color: '#FF9D9D', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <SchoolIcon sx={{ fontSize: 19 }} />
        </Box>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Box sx={{ fontSize: 10, lineHeight: 1.2, opacity: 0.72, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Sistema atual
          </Box>
          <Box sx={{ mt: 0.25, fontSize: 14, lineHeight: 1.25, fontWeight: 700 }}>
            TOV Acadêmico
          </Box>
        </Box>
        <KeyboardArrowDownIcon
          sx={{ fontSize: 20, flexShrink: 0, transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
        />
      </Box>

      <Menu
        anchorEl={ancora}
        open={aberto}
        onClose={fechar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{
          elevation: 8,
          sx: { mt: 0.75, width: 300, maxWidth: 'calc(100vw - 32px)', borderRadius: '14px' },
        }}
        MenuListProps={{ 'aria-label': 'Selecionar sistema', sx: { p: 0.75 } }}
      >
        <MenuItem selected onClick={fechar} sx={{ borderRadius: '9px', py: 1 }}>
          <ListItemIcon><SchoolIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="TOV Acadêmico" secondary="Sistema atual" />
          <CheckIcon color="primary" fontSize="small" />
        </MenuItem>
        <MenuItem onClick={selecionarSTG} sx={{ borderRadius: '9px', py: 1 }}>
          <ListItemIcon><HistoryEduIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="STG Legado" secondary="Seminário Teológico de Guarulhos" />
        </MenuItem>
      </Menu>
    </>
  )
}

export default function Layout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const usuario = getUser() || 'Usuário'
  const perfil = getPerfil()
  const menuVisivel = MENU.filter((item) => !item.perfis || item.perfis.includes(perfil))
  const [menuAberto, setMenuAberto] = useState(false)
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false)
  const [alteracoesPendentes, setAlteracoesPendentes] = useState(null)
  const alteracoesPendentesRef = useRef(null)
  const [destinoPendente, setDestinoPendente] = useState(null)
  const acaoAposFecharMenu = useRef(null)
  const conteudoPrincipalRef = useRef(null)
  const estadoNotificacoes = useNotificacoes()
  const registrarAlteracoesPendentes = useCallback((mensagem) => {
    alteracoesPendentesRef.current = mensagem
    setAlteracoesPendentes(mensagem)
  }, [])
  const bloqueador = useBlocker(({ currentLocation, nextLocation }) => (
    Boolean(alteracoesPendentesRef.current)
    && `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}` !== `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`
  ))

  useEffect(() => {
    if (bloqueador.state === 'blocked') setDestinoPendente({ tipo: 'rota-bloqueada' })
  }, [bloqueador.state])

  function executarComMenuFechado(acao) {
    if (!menuAberto) {
      acao()
      return
    }
    acaoAposFecharMenu.current = acao
    setMenuAberto(false)
  }

  function concluirFechamentoMenu() {
    const acao = acaoAposFecharMenu.current
    acaoAposFecharMenu.current = null
    acao?.()
  }

  function fecharMenu() {
    acaoAposFecharMenu.current = null
    setMenuAberto(false)
  }

  async function executarSaida() {
    try {
      const registro = await navigator.serviceWorker?.ready
      const inscricao = await registro?.pushManager?.getSubscription?.()
      if (inscricao) {
        await api.post('/notificacoes/push/desinscrever', { endpoint: inscricao.endpoint })
        await inscricao.unsubscribe()
      }
    } catch {
      // Sair não depende da rede; a inscrição local será removida quando possível.
    }
    clearSession()
    navigate('/login')
  }

  function sair() {
    executarComMenuFechado(() => {
      if (alteracoesPendentes) {
        setDestinoPendente({ tipo: 'sair' })
        return
      }
      executarSaida()
    })
  }

  function irPara(rota) {
    executarComMenuFechado(() => {
      if (rota === location.pathname) return
      navigate(rota)
    })
  }

  function trocarSistema(url) {
    executarComMenuFechado(() => {
      if (alteracoesPendentes) {
        setDestinoPendente({ tipo: 'sistema', url })
        return
      }
      window.location.assign(url)
    })
  }

  function confirmarNavegacao() {
    const destino = destinoPendente
    setDestinoPendente(null)
    registrarAlteracoesPendentes(null)
    if (destino?.tipo === 'rota-bloqueada' && bloqueador.state === 'blocked') bloqueador.proceed()
    else if (destino?.tipo === 'sair') executarSaida()
    else if (destino?.tipo === 'sistema' && destino.url) window.location.assign(destino.url)
    else if (destino?.rota) navigate(destino.rota)
  }

  function cancelarNavegacao() {
    if (bloqueador.state === 'blocked') bloqueador.reset()
    setDestinoPendente(null)
  }

  const estaAtivo = (item) =>
    item.exato ? location.pathname === item.rota : location.pathname.startsWith(item.rota)

  const tituloAtual = menuVisivel.find(estaAtivo)?.rotulo || 'TOV'
  const valorNavegacao = location.pathname === '/'
    ? '/'
    : location.pathname === '/professor'
      ? '/professor'
    : location.pathname.startsWith('/professor/turmas')
      ? '/professor/turmas'
    : location.pathname.startsWith('/materiais')
      ? '/materiais'
    : location.pathname.startsWith('/notas')
      ? '/notas'
    : location.pathname.startsWith('/alunos')
      ? '/alunos'
        : location.pathname.startsWith('/turmas')
          ? '/turmas'
          : location.pathname.startsWith('/leads')
            ? '/leads'
          : 'mais'

  // Título da aba acompanha a seção e o scroll volta ao topo a cada rota.
  useEffect(() => {
    document.title = `${tituloAtual} · TOV Acadêmico`
    window.scrollTo(0, 0)
    const quadro = window.requestAnimationFrame(() => {
      conteudoPrincipalRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(quadro)
  }, [location.pathname, tituloAtual])

  const conteudoMenu = (
    <>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, px: 1, mb: 1.75 }}>
        <Typography component="span" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 27, letterSpacing: '-.035em' }}>
          TOV
        </Typography>
        <Typography component="span" sx={{ fontSize: 11, color: 'rgba(255,255,255,.56)' }}>acadêmico</Typography>
      </Box>

      {perfil !== 'PROFESSOR' && <SeletorSistema onTrocar={trocarSistema} />}

      <Box sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,.62)', px: 1.25, mb: 0.75 }}>
        {perfil === 'MARKETING' ? 'Marketing' : perfil === 'PROFESSOR' ? 'Portal do professor' : 'Secretaria'}
      </Box>

      <Box component="nav" aria-label="Navegação principal" sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {menuVisivel.map((item) => (
          <ItemNav key={item.rota} item={item} ativo={estaAtivo(item)} onClick={() => irPara(item.rota)} />
        ))}
      </Box>

      <Box sx={{ mt: 1, px: 1 }}>
        <BotaoInstalarPwa sx={{ color: 'rgba(255,255,255,.78)', borderColor: 'rgba(255,255,255,.18)', bgcolor: 'transparent', '&:hover': { color: '#fff', borderColor: 'rgba(255,255,255,.35)', bgcolor: 'rgba(255,255,255,.06)' } }} />
      </Box>

      <Box
        sx={{
          mt: 'auto', display: 'grid', gridTemplateColumns: '44px 36px minmax(0,1fr) 44px',
          alignItems: 'center', gap: 1, pt: 2, px: 0.25,
          borderTop: '1px solid rgba(255,255,255,.1)',
        }}
      >
        <BotaoNotificacoes naoLidas={estadoNotificacoes.naoLidas} onClick={() => setNotificacoesAbertas(true)} />
        <Box sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.1)', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
          {iniciais(usuario)}
        </Box>
        <Box sx={{ lineHeight: 1.2, overflow: 'hidden' }}>
          <Box sx={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{usuario}</Box>
          <Box sx={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>
            {perfil === 'ADMIN' ? 'Administrador' : perfil === 'MARKETING' ? 'Marketing' : perfil === 'PROFESSOR' ? 'Professor' : 'Secretaria'}
          </Box>
        </Box>
        <Box
          component="button"
          type="button"
          onClick={sair}
          title="Sair"
          aria-label="Sair do sistema"
          sx={{ ...resetBotao, width: 44, height: 44, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.58)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,.06)' }, '&:focus-visible': { outline: `3px solid rgba(241,73,73,.35)`, outlineOffset: 1, borderRadius: '8px' } }}
        >
          <LogoutIcon sx={{ fontSize: 19 }} />
        </Box>
      </Box>
    </>
  )

  const estiloPainel = {
    bgcolor: TOV.graphite, color: '#fff', p: '26px 18px 22px',
    borderRight: '1px solid rgba(25,27,29,.14)',
    display: 'flex', flexDirection: 'column', gap: 0.5, overflowY: 'auto',
  }

  return (
    <UnsavedChangesContext.Provider value={registrarAlteracoesPendentes}>
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: TOV.canvas }}>
      <Box
        component="a"
        href="#conteudo-principal"
        sx={{
          position: 'fixed', zIndex: (theme) => theme.zIndex.tooltip + 1,
          top: 8, left: 8, px: 2, py: 1.25, borderRadius: '8px',
          bgcolor: TOV.ink, color: '#fff', textDecoration: 'none',
          transform: 'translateY(-160%)', transition: `transform ${TOV.durationFast} ${TOV.ease}`,
          '&:focus': { transform: 'translateY(0)' },
        }}
      >
        Ir para o conteúdo
      </Box>
      {/* Barra superior — só no mobile/tablet */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          display: { xs: 'flex', md: 'none' }, bgcolor: TOV.surface,
          color: TOV.ink, borderBottom: `1px solid ${TOV.border}`,
          pt: 'env(safe-area-inset-top)',
        }}
      >
        <Toolbar sx={{ gap: 1, minHeight: { xs: 60 } }}>
          <IconButton
            edge="start"
            color="inherit"
            aria-label="Abrir menu"
            onClick={() => setMenuAberto(true)}
            sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            <Box aria-hidden="true" sx={{ width: 3, height: 24, borderRadius: 99, bgcolor: TOV.coral }} />
            <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 19, letterSpacing: '-.025em' }}>TOV</Typography>
            <Typography noWrap sx={{ fontSize: 12, color: TOV.caption }}>{tituloAtual}</Typography>
          </Box>
          <Box sx={{ ml: 'auto' }}>
            <BotaoNotificacoes naoLidas={estadoNotificacoes.naoLidas} onClick={() => setNotificacoesAbertas(true)} />
          </Box>
        </Toolbar>
      </AppBar>

      {/* Menu gaveta — mobile/tablet */}
      <Drawer
        variant="temporary"
        open={menuAberto}
        onClose={fecharMenu}
        ModalProps={{
          keepMounted: true,
          closeAfterTransition: true,
          onTransitionExited: concluirFechamentoMenu,
        }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            ...estiloPainel, width: 292, maxWidth: '88vw', border: 0,
            pt: 'calc(26px + env(safe-area-inset-top))',
            pb: 'calc(30px + env(safe-area-inset-bottom))',
          },
        }}
      >
        {conteudoMenu}
      </Drawer>

      {/* Sidebar fixa — desktop */}
      <Box
        component="aside"
        aria-label="Navegação lateral"
        sx={{
          ...estiloPainel,
          display: { xs: 'none', md: 'flex' },
          width: TOV.sidebarW, flex: `0 0 ${TOV.sidebarW}px`,
          position: 'sticky', top: 0, height: '100vh', alignSelf: 'flex-start',
        }}
      >
        {conteudoMenu}
      </Box>

      <Box
        component="main"
        id="conteudo-principal"
        tabIndex={-1}
        ref={conteudoPrincipalRef}
        sx={{
          flexGrow: 1, minWidth: 0, bgcolor: TOV.canvas,
          pt: { xs: 'calc(82px + env(safe-area-inset-top))', sm: 'calc(88px + env(safe-area-inset-top))', md: '42px' },
          px: { xs: '16px', sm: '28px', md: 'clamp(36px,4vw,64px)' },
          pb: { xs: 'calc(96px + env(safe-area-inset-bottom))', sm: '44px', md: '52px' },
          '& > *': { width: '100%', maxWidth: 1500, mx: 'auto' },
          '&:focus': { outline: 'none' },
        }}
      >
        {children}
      </Box>
      <NotificationCenter
        aberto={notificacoesAbertas}
        onFechar={() => setNotificacoesAbertas(false)}
        onNavigate={irPara}
        estado={estadoNotificacoes}
      />

      {/* Atalhos de uso frequente — somente em celulares. */}
      <Paper
        elevation={0}
        sx={{
          display: { xs: 'block', sm: 'none' }, position: 'fixed', inset: 'auto 0 0',
          zIndex: (theme) => theme.zIndex.appBar,
          pb: 'env(safe-area-inset-bottom)', borderRadius: 0,
          borderTop: `1px solid ${TOV.border}`,
          boxShadow: '0 -8px 24px rgba(25,27,29,.04)',
        }}
      >
        <BottomNavigation
          showLabels
          value={valorNavegacao}
          onChange={(_, valor) => {
            if (valor === 'mais') setMenuAberto(true)
            else irPara(valor)
          }}
          sx={{
            height: 66,
            '& .MuiBottomNavigationAction-root': {
              minWidth: 64, minHeight: 60, color: TOV.caption, position: 'relative',
              '&::before': { content: '""', position: 'absolute', top: 0, width: 28, height: 3, borderRadius: '0 0 3px 3px', bgcolor: 'transparent' },
            },
            '& .Mui-selected': { color: TOV.coral, '&::before': { bgcolor: TOV.coral } },
            '& .MuiBottomNavigationAction-label': { fontSize: 11, fontWeight: 700 },
          }}
        >
          {perfil === 'PROFESSOR' ? (
            <>
              <BottomNavigationAction label="Início" value="/professor" icon={<SpaceDashboardIcon />} />
              <BottomNavigationAction label="Turmas" value="/professor/turmas" icon={<SchoolIcon />} />
              <BottomNavigationAction label="Notas" value="/notas" icon={<EditNoteIcon />} />
              <BottomNavigationAction label="Materiais" value="/materiais" icon={<FolderCopyOutlinedIcon />} />
            </>
          ) : <>
            {perfil === 'MARKETING' ? (
              <BottomNavigationAction label="Leads" value="/leads" icon={<CampaignIcon />} />
            ) : (
              <BottomNavigationAction label="Início" value="/" icon={<SpaceDashboardIcon />} />
            )}
            {perfil === 'MARKETING' ? (
              <BottomNavigationAction label="WhatsApp" value="/whatsapp" icon={<WhatsAppIcon />} />
            ) : (
              <BottomNavigationAction label="Alunos" value="/alunos" icon={<SchoolIcon />} />
            )}
            {perfil !== 'MARKETING' && <BottomNavigationAction label="Turmas" value="/turmas" icon={<GroupsIcon />} />}
          </>}
          <BottomNavigationAction label="Mais" value="mais" icon={<MoreHorizIcon />} />
        </BottomNavigation>
      </Paper>
    </Box>
    <DialogoConfirmacao
      aberto={!!destinoPendente}
      titulo="Descartar alterações?"
      descricao={alteracoesPendentes || 'Há alterações que ainda não foram salvas.'}
      rotuloConfirmar="Descartar e continuar"
      processando={false}
      onConfirmar={confirmarNavegacao}
      onFechar={cancelarNavegacao}
    />
    </UnsavedChangesContext.Provider>
  )
}
