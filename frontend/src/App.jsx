import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { getPerfil, getToken } from './api'
import OfflineScreen from './OfflineScreen'

const Layout = lazy(() => import('./Layout'))
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Alunos = lazy(() => import('./pages/Alunos'))
const AlunoDetalhe = lazy(() => import('./pages/AlunoDetalhe'))
const Professores = lazy(() => import('./pages/Professores'))
const AutocadastroProfessor = lazy(() => import('./pages/AutocadastroProfessor'))
const Materias = lazy(() => import('./pages/Materias'))
const Turmas = lazy(() => import('./pages/Turmas'))
const TurmaDetalhe = lazy(() => import('./pages/TurmaDetalhe'))
const Calendario = lazy(() => import('./pages/Calendario'))
const CalendarioPublico = lazy(() => import('./pages/CalendarioPublico'))
const Notas = lazy(() => import('./pages/Notas'))
const Relatorios = lazy(() => import('./pages/Relatorios'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const WhatsApp = lazy(() => import('./pages/WhatsApp'))
const Leads = lazy(() => import('./pages/Leads'))

function CarregandoRota() {
  return (
    <div
      role="status"
      style={{
        minHeight: '35vh', display: 'grid', placeItems: 'center',
        color: '#6B7680', fontFamily: "'Open Sans', sans-serif",
      }}
    >
      Carregando…
    </div>
  )
}

function Protegida({ children, perfis }) {
  if (!getToken()) return <Navigate to="/login" replace />
  const perfil = getPerfil()
  if (perfis && !perfis.includes(perfil)) {
    return <Navigate to={perfil === 'MARKETING' ? '/leads' : '/'} replace />
  }
  return <Layout>{children}</Layout>
}

export default function App() {
  return (
    <OfflineScreen>
      <Suspense fallback={<CarregandoRota />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/agenda/:token" element={<CalendarioPublico />} />
          <Route path="/cadastro-professor/:token" element={<AutocadastroProfessor />} />
          <Route path="/" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><Dashboard /></Protegida>} />
          <Route path="/alunos" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><Alunos /></Protegida>} />
          <Route path="/alunos/:codAlu" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><AlunoDetalhe /></Protegida>} />
          <Route path="/professores" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><Professores /></Protegida>} />
          <Route path="/materias" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><Materias /></Protegida>} />
          <Route path="/turmas" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><Turmas /></Protegida>} />
          <Route path="/turmas/:codTur" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><TurmaDetalhe /></Protegida>} />
          <Route path="/calendario" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><Calendario /></Protegida>} />
          <Route path="/notas" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><Notas /></Protegida>} />
          <Route path="/relatorios" element={<Protegida perfis={['ADMIN', 'SECRETARIA']}><Relatorios /></Protegida>} />
          <Route path="/leads" element={<Protegida perfis={['ADMIN', 'MARKETING']}><Leads /></Protegida>} />
          <Route path="/usuarios" element={<Protegida perfis={['ADMIN']}><Usuarios /></Protegida>} />
          <Route path="/whatsapp" element={<Protegida><WhatsApp /></Protegida>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </OfflineScreen>
  )
}
