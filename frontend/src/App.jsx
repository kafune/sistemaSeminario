import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Box, Skeleton } from '@mui/material'
import { getPerfil, getToken } from './api'
import OfflineScreen from './OfflineScreen'
import ErrorBoundary from './ErrorBoundary'
import { TOV } from './theme'

const Layout = lazy(() => import('./Layout'))
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Alunos = lazy(() => import('./pages/Alunos'))
const AlunoDetalhe = lazy(() => import('./pages/AlunoDetalhe'))
const Professores = lazy(() => import('./pages/Professores'))
const AutocadastroProfessor = lazy(() => import('./pages/AutocadastroProfessor'))
const AcessoProfessor = lazy(() => import('./pages/AcessoProfessor'))
const Materias = lazy(() => import('./pages/Materias'))
const Turmas = lazy(() => import('./pages/Turmas'))
const TurmaDetalhe = lazy(() => import('./pages/TurmaDetalhe'))
const PresencasTurma = lazy(() => import('./pages/PresencasTurma'))
const PresencaTotem = lazy(() => import('./pages/PresencaTotem'))
const Calendario = lazy(() => import('./pages/Calendario'))
const CalendarioPublico = lazy(() => import('./pages/CalendarioPublico'))
const Notas = lazy(() => import('./pages/Notas'))
const Materiais = lazy(() => import('./pages/Materiais'))
const PortalProfessor = lazy(() => import('./pages/PortalProfessor'))
const TurmaProfessor = lazy(() => import('./pages/TurmaProfessor'))
const Relatorios = lazy(() => import('./pages/Relatorios'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const WhatsApp = lazy(() => import('./pages/WhatsApp'))
const Leads = lazy(() => import('./pages/Leads'))

function CarregandoRota() {
  return (
    <Box
      role="status"
      aria-label="Carregando página"
      sx={{
        minHeight: '45vh', width: '100%', maxWidth: 1180, mx: 'auto',
        px: { xs: 2, md: 5 }, py: { xs: 4, md: 6 },
      }}
    >
      <Skeleton width={44} height={8} sx={{ mb: 1.5 }} />
      <Skeleton width="min(420px, 74vw)" height={58} sx={{ mb: 3 }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', lg: 'repeat(3,1fr)' }, gap: 2 }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={150} sx={{ borderRadius: `${TOV.radiusMd}px` }} />)}
      </Box>
    </Box>
  )
}

function Protegida({ children, perfis }) {
  const location = useLocation()
  if (!getToken()) return <Navigate to="/login" replace state={{ retorno: `${location.pathname}${location.search}${location.hash}` }} />
  const perfil = getPerfil()
  if (perfis && !perfis.includes(perfil)) {
    const inicio = perfil === 'MARKETING' ? '/leads' : perfil === 'PROFESSOR' ? '/professor' : '/'
    return <Navigate to={inicio} replace />
  }
  return <Layout>{children}</Layout>
}

export default function App() {
  return (
    <ErrorBoundary>
      <OfflineScreen>
        <Suspense fallback={<CarregandoRota />}>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/agenda/:token" element={<CalendarioPublico />} />
          <Route path="/cadastro-professor/:token" element={<AutocadastroProfessor />} />
          <Route path="/acesso-professor/:token" element={<AcessoProfessor />} />
          <Route path="/presenca/:token" element={<PresencaTotem />} />
          <Route path="/" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><Dashboard /></Protegida>} />
          <Route path="/alunos" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><Alunos /></Protegida>} />
          <Route path="/alunos/:codAlu" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><AlunoDetalhe /></Protegida>} />
          <Route path="/professores" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><Professores /></Protegida>} />
          <Route path="/materias" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><Materias /></Protegida>} />
          <Route path="/turmas" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><Turmas /></Protegida>} />
          <Route path="/turmas/:codTur" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><TurmaDetalhe /></Protegida>} />
          <Route path="/turmas/:codTur/presencas" element={<Protegida perfis={['ADMIN', 'SECRETARIA', 'PROFESSOR']}><PresencasTurma /></Protegida>} />
          <Route path="/calendario" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><Calendario /></Protegida>} />
          <Route path="/notas" element={<Protegida perfis={['ADMIN', 'SECRETARIA', 'PROFESSOR']}><Notas /></Protegida>} />
          <Route path="/materiais" element={<Protegida perfis={['ADMIN', 'SECRETARIA', 'PROFESSOR']}><Materiais /></Protegida>} />
          <Route path="/professor" element={<Protegida perfis={['PROFESSOR']}><PortalProfessor /></Protegida>} />
          <Route path="/professor/turmas" element={<Protegida perfis={['PROFESSOR']}><PortalProfessor somenteTurmas /></Protegida>} />
          <Route path="/professor/turmas/:docturmaId" element={<Protegida perfis={['PROFESSOR']}><TurmaProfessor /></Protegida>} />
          <Route path="/relatorios" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><Relatorios /></Protegida>} />
          <Route path="/leads" element={<Protegida perfis={['ADMIN', 'MARKETING']}><Leads /></Protegida>} />
          <Route path="/usuarios" element={<Protegida perfis={['ADMIN']}><Usuarios /></Protegida>} />
          <Route path="/whatsapp" element={<Protegida perfis={['ADMIN', 'SECRETARIA', 'MARKETING']}><WhatsApp /></Protegida>} />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </OfflineScreen>
    </ErrorBoundary>
  )
}
