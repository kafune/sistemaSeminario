import { useLocation, useNavigate } from 'react-router-dom'
import { Box, Typography } from '@mui/material'
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
import { iniciais } from './ui'

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
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: 1.75, py: 1.5,
        borderRadius: '11px', cursor: 'pointer', fontSize: 15, userSelect: 'none',
        fontWeight: ativo ? 700 : 600,
        bgcolor: ativo ? '#fff' : 'transparent',
        color: ativo ? TOV.coral : 'rgba(255,255,255,.92)',
        transition: 'background-color .15s, color .15s',
        '&:hover': ativo ? {} : { bgcolor: 'rgba(255,255,255,.12)' },
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

  function sair() {
    clearSession()
    navigate('/login')
  }

  const estaAtivo = (item) =>
    item.exato ? location.pathname === item.rota : location.pathname.startsWith(item.rota)

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: TOV.offwhite }}>
      <Box
        component="aside"
        sx={{
          width: TOV.sidebarW, flex: `0 0 ${TOV.sidebarW}px`, bgcolor: TOV.coral, color: '#fff',
          p: '30px 20px', display: 'flex', flexDirection: 'column', gap: 0.75,
          position: 'sticky', top: 0, height: '100vh', alignSelf: 'flex-start',
        }}
      >
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
          <ItemNav key={item.rota} item={item} ativo={estaAtivo(item)} onClick={() => navigate(item.rota)} />
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
            onClick={sair}
            title="Sair"
            sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 12, opacity: 0.85, cursor: 'pointer', '&:hover': { opacity: 1 } }}
          >
            <LogoutIcon sx={{ fontSize: 16 }} /> Sair
          </Box>
        </Box>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, bgcolor: TOV.offwhite, p: { xs: 2.5, md: '38px 44px' } }}>
        {children}
      </Box>
    </Box>
  )
}
