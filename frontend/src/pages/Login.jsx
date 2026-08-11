import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Alert, Box, Button, IconButton, InputAdornment, TextField, Typography } from '@mui/material'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import { api, setSession } from '../api'
import { TOV } from '../theme'
import { Eyebrow, Regua, Superficie } from '../ui'

export default function Login() {
  const [user, setUser] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const sessaoExpirada = new URLSearchParams(location.search).get('sessao') === 'expirada'

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const r = await api.post('/auth/login', { user, senha })
      setSession(r.token, r.user, r.perfil)
      const retornoSalvo = sessionStorage.getItem('tov_retorno_login') || location.state?.retorno
      sessionStorage.removeItem('tov_retorno_login')
      const retornoSeguro = typeof retornoSalvo === 'string' && retornoSalvo.startsWith('/') && !retornoSalvo.startsWith('//') && !retornoSalvo.startsWith('/login')
        ? retornoSalvo
        : null
      navigate(retornoSeguro || (r.perfil === 'PROFESSOR' ? '/professor' : r.perfil === 'MARKETING' ? '/leads' : '/'), { replace: true })
    } catch (err) {
      setErro(err.message)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <Box component="main" sx={{ display: 'flex', minHeight: '100vh', bgcolor: TOV.canvas }}>
      {/* Painel institucional (esconde no mobile) */}
      <Box
        sx={{
          flex: '0 0 min(46vw, 640px)', maxWidth: 640, bgcolor: TOV.graphite, color: TOV.onDark,
          p: { md: '52px 48px', lg: '64px 60px' }, display: { xs: 'none', md: 'flex' }, flexDirection: 'column',
          justifyContent: 'space-between', position: 'relative', overflow: 'hidden',
          borderRight: `1px solid ${TOV.darkHairline}`,
        }}
      >
        <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, opacity: 0.26, backgroundImage: TOV.loginGrid, backgroundSize: '44px 44px' }} />
        <Box aria-hidden="true" sx={{ position: 'absolute', top: 0, left: 0, width: 4, height: '38%', bgcolor: TOV.onDarkBorderHover }} />
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, position: 'relative' }}>
          <Typography component="span" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.displaySm, letterSpacing: '-.035em' }}>TOV</Typography>
          <Typography component="span" sx={{ fontSize: TOV.type.bodySm, color: TOV.onDarkMuted }}>acadêmico</Typography>
        </Box>
        <Box sx={{ position: 'relative' }}>
          <Regua sx={{ bgcolor: TOV.onDarkBorderHover, mb: 3 }} />
          <Typography component="h2" variant="h1" sx={{ fontSize: { md: TOV.type.display, lg: TOV.type.heroLg }, color: TOV.onDark, maxWidth: 500 }}>
            Centro TOV de Formação Teológica
          </Typography>
          <Typography sx={{ mt: 2.5, fontSize: TOV.type.bodyLg, lineHeight: 1.65, color: TOV.onDarkBody, maxWidth: 440 }}>
            Secretaria acadêmica — alunos, turmas, notas e relatórios em um só lugar.
          </Typography>
        </Box>
        <Typography sx={{ position: 'relative', fontSize: TOV.type.body, color: TOV.onDarkBody, lineHeight: 1.6 }}>
          “Ensina a criança no caminho em que deve andar.”<br />
          <Box component="span" sx={{ fontSize: TOV.type.caption, color: TOV.onDarkMuted }}>Provérbios 22.6</Box>
        </Typography>
      </Box>

      {/* Formulário */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 2, sm: 5, lg: 7 } }}>
        <Superficie
          component="form"
          onSubmit={entrar}
          variante="raised"
          sx={{ width: '100%', maxWidth: 440, p: { xs: 3, sm: 4.5 } }}
        >
          <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1, mb: 4 }}>
            <Box aria-hidden="true" sx={{ width: 4, height: 24, bgcolor: TOV.graphite, borderRadius: TOV.radiusFull }} />
            <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.titleSm }}>TOV</Typography>
            <Typography sx={{ fontSize: TOV.type.caption, color: TOV.caption }}>acadêmico</Typography>
          </Box>
          <Eyebrow sx={{ mb: 1.5 }}>Acesso restrito</Eyebrow>
          <Typography component="h1" variant="h2">Entrar</Typography>
          <Typography sx={{ mt: 1.5, fontSize: TOV.type.body, color: TOV.caption }}>Use suas credenciais de acesso.</Typography>

          {sessaoExpirada && !erro && <Alert severity="warning" sx={{ mt: 3 }}>Sua sessão expirou. Entre novamente para continuar de onde parou.</Alert>}
          {erro && <Alert severity="error" sx={{ mt: 3 }}>{erro}</Alert>}

          <Typography component="label" htmlFor="campo-usuario" sx={{ display: 'block', fontSize: TOV.type.bodySm, fontWeight: 600, color: TOV.slate, mt: erro || sessaoExpirada ? 2 : 4, mb: 1 }}>Usuário</Typography>
          <TextField
            fullWidth value={user} autoFocus placeholder="ADMIN"
            id="campo-usuario"
            inputProps={{ autoComplete: 'username', autoCapitalize: 'characters' }}
            onChange={(e) => setUser(e.target.value.toUpperCase())}
          />

          <Typography component="label" htmlFor="campo-senha" sx={{ display: 'block', fontSize: TOV.type.bodySm, fontWeight: 600, color: TOV.slate, mt: 2.5, mb: 1 }}>Senha</Typography>
          <TextField
            fullWidth type={mostrarSenha ? 'text' : 'password'} value={senha} placeholder="••••••••"
            id="campo-senha"
            inputProps={{ autoComplete: 'current-password' }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setMostrarSenha((v) => !v)}
                    edge="end"
                  >
                    {mostrarSenha ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            onChange={(e) => setSenha(e.target.value)}
          />

          <Button type="submit" variant="contained" fullWidth disabled={carregando} sx={{ mt: 4, height: 52, fontSize: TOV.type.bodyLg }}>
            {carregando ? 'Entrando…' : 'Entrar'}
          </Button>
          <Typography sx={{ mt: 2.5, textAlign: 'center', fontSize: TOV.type.bodySm, color: TOV.caption }}>
            Problemas com o acesso? Fale com a coordenação.
          </Typography>
        </Superficie>
      </Box>
    </Box>
  )
}
