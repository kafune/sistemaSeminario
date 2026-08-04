import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Box, Button, CircularProgress, TextField, Typography,
} from '@mui/material'
import { getPublico, postPublico } from '../api'
import { TOV } from '../theme'
import { Eyebrow, Superficie } from '../ui'

export default function AcessoProfessor() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [convite, setConvite] = useState(null)
  const [user, setUser] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [concluido, setConcluido] = useState(false)

  useEffect(() => {
    getPublico(`/acesso-professor/${token}`)
      .then((resposta) => {
        setConvite(resposta)
        setUser(resposta.usuario_sugerido || '')
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [token])

  async function criarAcesso(event) {
    event.preventDefault()
    if (senha !== confirmar) {
      setErro('As senhas não conferem.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await postPublico(`/acesso-professor/${token}`, { user, senha })
      setConcluido(true)
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: TOV.canvas, display: 'grid', placeItems: 'center', p: 2 }}>
      <Superficie sx={{ width: '100%', maxWidth: 480, p: { xs: 3, sm: 4.5 } }}>
        <Eyebrow sx={{ mb: 1 }}>Portal do professor</Eyebrow>
        <Typography component="h1" variant="h2">Criar acesso</Typography>
        {carregando && <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>}
        {erro && <Alert severity="error" sx={{ mt: 3 }}>{erro}</Alert>}
        {!carregando && concluido && (
          <Box sx={{ mt: 3 }}>
            <Alert severity="success">Acesso criado. Você já pode lançar as notas das suas turmas.</Alert>
            <Button variant="contained" fullWidth sx={{ mt: 3 }} onClick={() => navigate('/login')}>Entrar no sistema</Button>
          </Box>
        )}
        {!carregando && convite && !concluido && (
          <Box component="form" onSubmit={criarAcesso} sx={{ mt: 3, display: 'grid', gap: 2 }}>
            <Typography sx={{ color: TOV.caption }}>
              Olá, {convite.professor_nome}. Escolha seu usuário e sua senha para acessar somente suas turmas.
            </Typography>
            <TextField required label="Usuário" value={user} onChange={(e) => setUser(e.target.value.toUpperCase())} inputProps={{ maxLength: 50 }} />
            <TextField required type="password" label="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} helperText="Mínimo de 6 caracteres" inputProps={{ minLength: 6 }} />
            <TextField required type="password" label="Confirmar senha" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} error={!!confirmar && senha !== confirmar} />
            <Button type="submit" variant="contained" disabled={salvando || senha.length < 6 || senha !== confirmar}>
              {salvando ? 'Criando…' : 'Criar meu acesso'}
            </Button>
          </Box>
        )}
      </Superficie>
    </Box>
  )
}
