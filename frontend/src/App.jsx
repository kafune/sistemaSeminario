import { Navigate, Route, Routes } from 'react-router-dom'
import { getPerfil, getToken } from './api'
import Layout from './Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Alunos from './pages/Alunos'
import AlunoDetalhe from './pages/AlunoDetalhe'
import Professores from './pages/Professores'
import AutocadastroProfessor from './pages/AutocadastroProfessor'
import Materias from './pages/Materias'
import Turmas from './pages/Turmas'
import TurmaDetalhe from './pages/TurmaDetalhe'
import Calendario from './pages/Calendario'
import CalendarioPublico from './pages/CalendarioPublico'
import Notas from './pages/Notas'
import Relatorios from './pages/Relatorios'
import Usuarios from './pages/Usuarios'
import WhatsApp from './pages/WhatsApp'
import Leads from './pages/Leads'
import OfflineScreen from './OfflineScreen'

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
    <OfflineScreen><Routes>
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
    </Routes></OfflineScreen>
  )
}
