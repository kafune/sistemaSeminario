import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar, Box, Divider, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, Toolbar, Typography,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import HomeIcon from '@mui/icons-material/Home'
import SchoolIcon from '@mui/icons-material/School'
import PersonIcon from '@mui/icons-material/Person'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import GroupsIcon from '@mui/icons-material/Groups'
import EditNoteIcon from '@mui/icons-material/EditNote'
import DescriptionIcon from '@mui/icons-material/Description'
import LogoutIcon from '@mui/icons-material/Logout'
import { clearSession, getUser } from './api'

const LARGURA = 230

const MENU = [
  { rotulo: 'Início', rota: '/', icone: <HomeIcon /> },
  { rotulo: 'Alunos', rota: '/alunos', icone: <SchoolIcon /> },
  { rotulo: 'Professores', rota: '/professores', icone: <PersonIcon /> },
  { rotulo: 'Matérias', rota: '/materias', icone: <MenuBookIcon /> },
  { rotulo: 'Turmas', rota: '/turmas', icone: <GroupsIcon /> },
  { rotulo: 'Notas e Faltas', rota: '/notas', icone: <EditNoteIcon /> },
  { rotulo: 'Relatórios', rota: '/relatorios', icone: <DescriptionIcon /> },
]

export default function Layout({ children }) {
  const [aberto, setAberto] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()

  function sair() {
    clearSession()
    navigate('/login')
  }

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar variant="dense">
          <IconButton color="inherit" edge="start" onClick={() => setAberto(!aberto)} sx={{ mr: 1 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Centro TOV de Formação Teológica
          </Typography>
          <Typography variant="body2" sx={{ mr: 1 }}>{getUser()}</Typography>
          <IconButton color="inherit" onClick={sair} title="Sair">
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="persistent"
        open={aberto}
        sx={{
          width: aberto ? LARGURA : 0,
          '& .MuiDrawer-paper': { width: LARGURA, boxSizing: 'border-box' },
        }}
      >
        <Toolbar variant="dense" />
        <List dense>
          {MENU.map((item) => (
            <ListItemButton
              key={item.rota}
              selected={item.rota === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.rota)}
              onClick={() => navigate(item.rota)}
            >
              <ListItemIcon>{item.icone}</ListItemIcon>
              <ListItemText primary={item.rotulo} />
            </ListItemButton>
          ))}
        </List>
        <Divider />
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 2, mt: 6 }}>
        {children}
      </Box>
    </Box>
  )
}
