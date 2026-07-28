import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar, BottomNavigation, BottomNavigationAction, Box, Drawer, IconButton,
  Paper, Toolbar, Typography,
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
import DescriptionIcon from '@mui/icons-material/Description'
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import CampaignIcon from '@mui/icons-material/Campaign'
import LogoutIcon from '@mui/icons-material/Logout'
import { api, clearSession, getPerfil, getUser } from './api'
import { TOV } from './theme'
import { DialogoConfirmacao, iniciais, resetBotao } from './ui'
import NotificationCenter, { BotaoInstalarPwa, BotaoNotificacoes, useNotificacoes } from './NotificationCenter'
import { UnsavedChangesContext } from './UnsavedChanges'

const MENU = [
  { rotulo: 'Dashboard', rota: '/', icone: SpaceDashboardIcon, exato: true, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Alunos', rota: '/alunos', icone: SchoolIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Professores', rota: '/professores', icone: PersonIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Matérias', rota: '/materias', icone: MenuBookIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Turmas', rota: '/turmas', icone: GroupsIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Calendário', rota: '/calendario', icone: CalendarMonthIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Notas e Faltas', rota: '/notas', icone: EditNoteIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Relatórios', rota: '/relatorios', icone: DescriptionIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Leads', rota: '/leads', icone: CampaignIcon, perfis: ['ADMIN', 'MARKETING'] },
  { rotulo: 'WhatsApp', rota: '/whatsapp', icone: WhatsAppIcon },
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
        display: 'flex', alignItems: 'center', gap: 1.5, px: 1.75, py: 1.5, width: '100%',
        borderRadius: '11px', fontSize: 15, userSelect: 'none',
        fontWeight: ativo ? 700 : 600,
        bgcolor: ativo ? '#fff' : 'transparent',
        color: ativo ? TOV.coral : 'rgba(255,255,255,.92)',
        transition: 'background-color .15s, color .15s',
        '&:hover': ativo ? {} : { bgcolor: 'rgba(255,255,255,.12)' },
        '&:focus-visible': { outline: '2px solid #fff', outlineOffset: 2, borderRadius: '11px' },
      }}
    >
      <Icone sx={{ fontSize: 20 }} />
      {item.rotulo}
    </Box>
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
  const [destinoPendente, setDestinoPendente] = useState(null)
  const estadoNotificacoes = useNotificacoes()

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
    if (alteracoesPendentes) {
      setMenuAberto(false)
      setDestinoPendente({ tipo: 'sair' })
      return
    }
    executarSaida()
  }

  function irPara(rota) {
    setMenuAberto(false)
    if (rota === location.pathname) return
    if (alteracoesPendentes) {
      setDestinoPendente({ tipo: 'rota', rota })
      return
    }
    navigate(rota)
  }

  function confirmarNavegacao() {
    const destino = destinoPendente
    setDestinoPendente(null)
    setAlteracoesPendentes(null)
    if (destino?.tipo === 'sair') executarSaida()
    else if (destino?.rota) navigate(destino.rota)
  }

  const estaAtivo = (item) =>
    item.exato ? location.pathname === item.rota : location.pathname.startsWith(item.rota)

  const tituloAtual = menuVisivel.find(estaAtivo)?.rotulo || 'TOV'
  const valorNavegacao = location.pathname === '/'
    ? '/'
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
  }, [location.pathname, tituloAtual])

  const conteudoMenu = (
    <>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, px: 1, mb: 2.5 }}>
        <Typography component="span" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 27, letterSpacing: '-.02em' }}>
          TOV
        </Typography>
        <Typography component="span" sx={{ fontSize: 11, opacity: 0.75 }}>acadêmico</Typography>
      </Box>

      <Box sx={{ fontFamily: TOV.fontHead, fontWeight: 600, fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)', px: 1.25, mb: 0.75 }}>
        {perfil === 'MARKETING' ? 'Marketing' : 'Secretaria'}
      </Box>

      {menuVisivel.map((item) => (
        <ItemNav key={item.rota} item={item} ativo={estaAtivo(item)} onClick={() => irPara(item.rota)} />
      ))}

      <Box sx={{ mt: 1, px: 1 }}>
        <BotaoInstalarPwa sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.7)', '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,.12)' } }} />
      </Box>

      <Box
        sx={{
          mt: 'auto', display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5,
          borderRadius: '12px', bgcolor: 'rgba(255,255,255,.12)',
        }}
      >
        <BotaoNotificacoes naoLidas={estadoNotificacoes.naoLidas} onClick={() => setNotificacoesAbertas(true)} />
        <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: '#fff', color: TOV.coral, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
          {iniciais(usuario)}
        </Box>
        <Box sx={{ lineHeight: 1.2, overflow: 'hidden' }}>
          <Box sx={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{usuario}</Box>
          <Box sx={{ fontSize: 12, opacity: 0.8 }}>
            {perfil === 'ADMIN' ? 'Administrador' : perfil === 'MARKETING' ? 'Marketing' : 'Secretaria'}
          </Box>
        </Box>
        <Box
          component="button"
          type="button"
          onClick={sair}
          title="Sair"
          sx={{ ...resetBotao, ml: 'auto', minHeight: 44, px: 0.75, display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 12, opacity: 0.85, '&:hover': { opacity: 1 }, '&:focus-visible': { outline: '2px solid #fff', outlineOffset: 2, borderRadius: '6px' } }}
        >
          <LogoutIcon sx={{ fontSize: 16 }} /> Sair
        </Box>
      </Box>
    </>
  )

  const estiloPainel = {
    bgcolor: TOV.coral, color: '#fff', p: '30px 20px',
    display: 'flex', flexDirection: 'column', gap: 0.75,
  }

  return (
    <UnsavedChangesContext.Provider value={setAlteracoesPendentes}>
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: TOV.offwhite }}>
      {/* Barra superior — só no mobile/tablet */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          display: { xs: 'flex', md: 'none' }, bgcolor: TOV.coral,
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
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
            <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 20, letterSpacing: '-.02em' }}>TOV</Typography>
            <Typography noWrap sx={{ fontSize: 13, opacity: 0.85 }}>{tituloAtual}</Typography>
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
        onClose={() => setMenuAberto(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            ...estiloPainel, width: 280, maxWidth: '85vw', border: 0,
            pt: 'calc(30px + env(safe-area-inset-top))',
            pb: 'calc(30px + env(safe-area-inset-bottom))',
          },
        }}
      >
        {conteudoMenu}
      </Drawer>

      {/* Sidebar fixa — desktop */}
      <Box
        component="aside"
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
        sx={{
          flexGrow: 1, minWidth: 0, bgcolor: TOV.offwhite,
          pt: { xs: 'calc(80px + env(safe-area-inset-top))', sm: 'calc(84px + env(safe-area-inset-top))', md: '38px' },
          px: { xs: '16px', sm: '24px', md: '44px' },
          pb: { xs: 'calc(96px + env(safe-area-inset-bottom))', sm: '40px', md: '38px' },
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
        elevation={8}
        sx={{
          display: { xs: 'block', sm: 'none' }, position: 'fixed', inset: 'auto 0 0',
          zIndex: (theme) => theme.zIndex.appBar,
          pb: 'env(safe-area-inset-bottom)', borderRadius: 0,
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
            '& .MuiBottomNavigationAction-root': { minWidth: 64, minHeight: 58, color: TOV.caption },
            '& .Mui-selected': { color: TOV.coral },
            '& .MuiBottomNavigationAction-label': { fontSize: 12, fontWeight: 700 },
          }}
        >
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
      onFechar={() => setDestinoPendente(null)}
    />
    </UnsavedChangesContext.Provider>
  )
}
