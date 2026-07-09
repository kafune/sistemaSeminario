import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Card, CardContent, TextField, Typography } from '@mui/material'
import { api, setSession } from '../api'

export default function Login() {
  const [user, setUser] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const navigate = useNavigate()

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const r = await api.post('/auth/login', { user, senha })
      setSession(r.token, r.user)
      navigate('/alunos')
    } catch (err) {
      setErro(err.message)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', bgcolor: '#eef2e0' }}>
      <Card sx={{ width: 380 }}>
        <CardContent component="form" onSubmit={entrar} sx={{ p: 4 }}>
          <Typography variant="h5" align="center" gutterBottom color="primary" fontWeight="bold">
            Centro TOV
          </Typography>
          <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 3 }}>
            Centro TOV de Formação Teológica
          </Typography>
          {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}
          <TextField
            label="Usuário" fullWidth margin="normal" value={user}
            onChange={(e) => setUser(e.target.value.toUpperCase())} autoFocus
          />
          <TextField
            label="Senha" type="password" fullWidth margin="normal" value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          <Button type="submit" variant="contained" fullWidth sx={{ mt: 3 }} disabled={carregando}>
            {carregando ? 'Entrando...' : 'Entrar'}
          </Button>
        </CardContent>
      </Card>
    </Box>
  )
}
