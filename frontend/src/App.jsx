import { Navigate, Route, Routes } from 'react-router-dom'
import { getToken } from './api'
import Layout from './Layout'
import Login from './pages/Login'
import Alunos from './pages/Alunos'
import AlunoDetalhe from './pages/AlunoDetalhe'
import Professores from './pages/Professores'
import Materias from './pages/Materias'
import Turmas from './pages/Turmas'
import TurmaDetalhe from './pages/TurmaDetalhe'
import Grades from './pages/Grades'
import Notas from './pages/Notas'
import Apoio from './pages/Apoio'
import Relatorios from './pages/Relatorios'

function Protegida({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protegida><Alunos /></Protegida>} />
      <Route path="/alunos" element={<Protegida><Alunos /></Protegida>} />
      <Route path="/alunos/:codAlu" element={<Protegida><AlunoDetalhe /></Protegida>} />
      <Route path="/professores" element={<Protegida><Professores /></Protegida>} />
      <Route path="/materias" element={<Protegida><Materias /></Protegida>} />
      <Route path="/turmas" element={<Protegida><Turmas /></Protegida>} />
      <Route path="/turmas/:codTur" element={<Protegida><TurmaDetalhe /></Protegida>} />
      <Route path="/grades" element={<Protegida><Grades /></Protegida>} />
      <Route path="/notas" element={<Protegida><Notas /></Protegida>} />
      <Route path="/apoio" element={<Protegida><Apoio /></Protegida>} />
      <Route path="/relatorios" element={<Protegida><Relatorios /></Protegida>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
