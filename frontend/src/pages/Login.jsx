import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Button, TextField, Typography } from '@mui/material'
import { api, setSession } from '../api'
import { TOV } from '../theme'
import { Eyebrow, Regua } from '../ui'

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
      navigate('/')
    } catch (err) {
      setErro(err.message)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: TOV.white }}>
      {/* Painel coral (esconde no mobile) */}
      <Box
        sx={{
          flex: '0 0 600px', maxWidth: 600, bgcolor: TOV.coral, color: '#fff',
          p: '64px 60px', display: { xs: 'none', md: 'flex' }, flexDirection: 'column',
          justifyContent: 'space-between', position: 'relative', overflow: 'hidden',
        }}
      >
        <Box sx={{ position: 'absolute', right: -120, top: -120, width: 360, height: 360, borderRadius: '50%', bgcolor: 'rgba(255,255,255,.08)' }} />
        <Box sx={{ position: 'absolute', right: 60, bottom: -80, width: 220, height: 220, borderRadius: '50%', bgcolor: 'rgba(255,255,255,.06)' }} />
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, position: 'relative' }}>
          <Typography component="span" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 34, letterSpacing: '-.02em' }}>TOV</Typography>
          <Typography component="span" sx={{ fontSize: 14, opacity: 0.8 }}>acadêmico</Typography>
        </Box>
        <Box sx={{ position: 'relative' }}>
          <Regua sx={{ bgcolor: '#fff', mb: 3.5 }} />
          <Typography variant="h1" sx={{ fontSize: 56, color: '#fff' }}>Centro TOV de Formação Teológica</Typography>
          <Typography sx={{ mt: 2.75, fontSize: 18, lineHeight: 1.5, opacity: 0.92, maxWidth: 420 }}>
            Secretaria acadêmica — alunos, turmas, notas e relatórios em um só lugar.
          </Typography>
        </Box>
        <Typography sx={{ position: 'relative', fontSize: 15, opacity: 0.8, lineHeight: 1.5 }}>
          “Ensina a criança no caminho em que deve andar.”<br />
          <Box component="span" sx={{ fontSize: 13, opacity: 0.7 }}>Provérbios 22.6</Box>
        </Typography>
      </Box>

      {/* Formulário */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 3, sm: '60px' } }}>
        <Box component="form" onSubmit={entrar} sx={{ width: '100%', maxWidth: 400 }}>
          <Eyebrow sx={{ mb: 1.5 }}>Acesso restrito</Eyebrow>
          <Typography variant="h2" sx={{ fontSize: 38 }}>Entrar</Typography>
          <Typography sx={{ mt: 1.25, fontSize: 15, color: TOV.caption }}>Use suas credenciais da secretaria.</Typography>

          {erro && <Alert severity="error" sx={{ mt: 3 }}>{erro}</Alert>}

          <Typography component="label" sx={{ display: 'block', fontSize: 13, fontWeight: 600, color: TOV.slate, mt: erro ? 2 : 4, mb: 1 }}>Usuário</Typography>
          <TextField
            fullWidth value={user} autoFocus placeholder="ADMIN"
            onChange={(e) => setUser(e.target.value.toUpperCase())}
          />

          <Typography component="label" sx={{ display: 'block', fontSize: 13, fontWeight: 600, color: TOV.slate, mt: 2.5, mb: 1 }}>Senha</Typography>
          <TextField
            fullWidth type="password" value={senha} placeholder="••••••••"
            onChange={(e) => setSenha(e.target.value)}
          />

          <Button type="submit" variant="contained" fullWidth disabled={carregando} sx={{ mt: 3.75, height: 54, fontSize: 17 }}>
            {carregando ? 'Entrando...' : 'Entrar'}
          </Button>
          <Typography sx={{ mt: 2.5, textAlign: 'center', fontSize: 13, color: TOV.caption }}>
            Problemas com o acesso? Fale com a coordenação.
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
