import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AppBar, Box, Drawer, IconButton, Toolbar, Typography } from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import SpaceDashboardIcon from '@mui/icons-material/SpaceDashboard'
import SchoolIcon from '@mui/icons-material/School'
import PersonIcon from '@mui/icons-material/Person'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import GroupsIcon from '@mui/icons-material/Groups'
import EditNoteIcon from '@mui/icons-material/EditNote'
import DescriptionIcon from '@mui/icons-material/Description'
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts'
import LogoutIcon from '@mui/icons-material/Logout'
import { clearSession, getUser } from './api'
import { TOV } from './theme'
import { iniciais, resetBotao } from './ui'

const MENU = [
  { rotulo: 'Dashboard', rota: '/', icone: SpaceDashboardIcon, exato: true },
  { rotulo: 'Alunos', rota: '/alunos', icone: SchoolIcon },
  { rotulo: 'Professores', rota: '/professores', icone: PersonIcon },
  { rotulo: 'Matérias', rota: '/materias', icone: MenuBookIcon },
  { rotulo: 'Turmas', rota: '/turmas', icone: GroupsIcon },
  { rotulo: 'Notas e Faltas', rota: '/notas', icone: EditNoteIcon },
  { rotulo: 'Relatórios', rota: '/relatorios', icone: DescriptionIcon },
  { rotulo: 'Usuários', rota: '/usuarios', icone: ManageAccountsIcon },
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
  const [menuAberto, setMenuAberto] = useState(false)

  function sair() {
    clearSession()
    navigate('/login')
  }

  function irPara(rota) {
    setMenuAberto(false)
    navigate(rota)
  }

  const estaAtivo = (item) =>
    item.exato ? location.pathname === item.rota : location.pathname.startsWith(item.rota)

  const tituloAtual = MENU.find(estaAtivo)?.rotulo || 'TOV'

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
        Secretaria
      </Box>

      {MENU.map((item) => (
        <ItemNav key={item.rota} item={item} ativo={estaAtivo(item)} onClick={() => irPara(item.rota)} />
      ))}

      <Box
        sx={{
          mt: 'auto', display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5,
          borderRadius: '12px', bgcolor: 'rgba(255,255,255,.12)',
        }}
      >
        <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: '#fff', color: TOV.coral, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
          {iniciais(usuario)}
        </Box>
        <Box sx={{ lineHeight: 1.2, overflow: 'hidden' }}>
          <Box sx={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{usuario}</Box>
          <Box sx={{ fontSize: 12, opacity: 0.8 }}>Secretaria</Box>
        </Box>
        <Box
          component="button"
          type="button"
          onClick={sair}
          title="Sair"
          sx={{ ...resetBotao, ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 12, opacity: 0.85, p: 0.5, '&:hover': { opacity: 1 }, '&:focus-visible': { outline: '2px solid #fff', outlineOffset: 2, borderRadius: '6px' } }}
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
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: TOV.offwhite }}>
      {/* Barra superior — só no mobile/tablet */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{ display: { xs: 'flex', md: 'none' }, bgcolor: TOV.coral }}
      >
        <Toolbar sx={{ gap: 1, minHeight: { xs: 60 } }}>
          <IconButton edge="start" color="inherit" aria-label="Abrir menu" onClick={() => setMenuAberto(true)}>
            <MenuIcon />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
            <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 20, letterSpacing: '-.02em' }}>TOV</Typography>
            <Typography noWrap sx={{ fontSize: 13, opacity: 0.85 }}>{tituloAtual}</Typography>
          </Box>
          <IconButton edge="end" color="inherit" aria-label="Sair" onClick={sair} sx={{ ml: 'auto' }}>
            <LogoutIcon sx={{ fontSize: 20 }} />
          </IconButton>
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
          '& .MuiDrawer-paper': { ...estiloPainel, width: 280, maxWidth: '85vw', border: 0 },
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
          p: { xs: '80px 16px 32px', sm: '84px 24px 40px', md: '38px 44px' },
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
