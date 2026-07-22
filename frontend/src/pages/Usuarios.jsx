import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
  Paper, Snackbar, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { api, getUser } from '../api'
import { TOV } from '../theme'
import { CabecalhoPagina, CartaoLista, iniciais, useDialogoTelaCheia } from '../ui'

const SENHA_MINIMA = 6

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState(null) // null = fechado; { user, senha, confirmar, novo }
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')
  const atual = getUser()
  const telaCheia = useDialogoTelaCheia()

  function carregar() {
    setCarregando(true)
    api.get('/usuarios')
      .then(setUsuarios)
      .catch((e) => setMsg(e.message))
      .finally(() => setCarregando(false))
  }

  useEffect(carregar, []) // eslint-disable-line react-hooks/exhaustive-deps

  function novo() {
    setForm({ user: '', senha: '', confirmar: '', novo: true })
  }

  function redefinir(u) {
    setForm({ user: u.user, senha: '', confirmar: '', novo: false })
  }

  const senhaCurta = form && form.senha.length > 0 && form.senha.length < SENHA_MINIMA
  const naoConfere = form && form.confirmar.length > 0 && form.senha !== form.confirmar
  const podeSalvar =
    form &&
    (!form.novo || form.user.trim()) &&
    form.senha.length >= SENHA_MINIMA &&
    form.senha === form.confirmar

  async function salvar() {
    try {
      if (form.novo) {
        await api.post('/usuarios', { user: form.user, senha: form.senha })
        setOk('Usuário criado.')
      } else {
        await api.put(`/usuarios/${encodeURIComponent(form.user)}/senha`, { senha: form.senha })
        setOk('Senha redefinida.')
      }
      setForm(null)
      carregar()
    } catch (e) {
      setMsg(e.message)
    }
  }

  async function excluir(u) {
    if (!window.confirm(`Excluir o usuário ${u.user}?`)) return
    try {
      await api.del(`/usuarios/${encodeURIComponent(u.user)}`)
      setOk('Usuário excluído.')
      carregar()
    } catch (e) {
      setMsg(e.message)
    }
  }

  const acoes = (
    <Button variant="contained" startIcon={<AddIcon />} onClick={novo}>
      Novo usuário
    </Button>
  )

  return (
    <Box>
      <CabecalhoPagina
        titulo="Usuários"
        subtitulo={carregando ? ' ' : `${usuarios.length} ${usuarios.length === 1 ? 'usuário com acesso' : 'usuários com acesso'} ao sistema`}
        acoes={acoes}
      />

      {/* Lista em cards — celular/tablet */}
      <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1.25 }}>
        {carregando && usuarios.length === 0 && (
          <CartaoLista sx={{ alignItems: 'center', color: TOV.caption, py: 4 }}>Carregando…</CartaoLista>
        )}
        {!carregando && usuarios.length === 0 && (
          <CartaoLista sx={{ alignItems: 'center', color: TOV.caption, py: 5 }}>Nenhum usuário cadastrado.</CartaoLista>
        )}
        {usuarios.map((u) => {
          const euMesmo = u.user === atual
          return (
            <CartaoLista key={u.user}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{
                  width: 38, height: 38, flex: '0 0 38px', borderRadius: '11px',
                  bgcolor: TOV.coral, color: '#fff', fontFamily: TOV.fontHead, fontWeight: 700,
                  fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {iniciais(u.user)}
                </Box>
                <Box component="span" sx={{ fontWeight: 700, fontSize: 16 }}>{u.user}</Box>
                {euMesmo && (
                  <Box component="span" sx={{
                    px: 1.25, py: '3px', borderRadius: 999, bgcolor: TOV.coralTint,
                    color: TOV.coral, fontSize: 11, fontWeight: 700,
                  }}>
                    você
                  </Box>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, pt: 1, borderTop: `1px solid ${TOV.offwhite}` }}>
                <Button size="small" variant="outlined" fullWidth onClick={() => redefinir(u)}>Redefinir senha</Button>
                <Button size="small" variant="outlined" color="error" fullWidth disabled={euMesmo} onClick={() => excluir(u)}>Excluir</Button>
              </Box>
            </CartaoLista>
          )
        })}
      </Box>

      {/* Tabela — desktop */}
      <TableContainer component={Paper} elevation={0} sx={{ boxShadow: TOV.shadowCard, display: { xs: 'none', md: 'block' } }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Usuário</TableCell>
              <TableCell align="right" sx={{ width: 220 }}>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {carregando && usuarios.length === 0 && (
              <TableRow><TableCell colSpan={2} sx={{ py: 5, textAlign: 'center', color: TOV.caption }}>Carregando…</TableCell></TableRow>
            )}
            {!carregando && usuarios.length === 0 && (
              <TableRow><TableCell colSpan={2} sx={{ py: 6, textAlign: 'center', color: TOV.caption }}>Nenhum usuário cadastrado.</TableCell></TableRow>
            )}
            {usuarios.map((u) => {
              const euMesmo = u.user === atual
              return (
                <TableRow key={u.user} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{
                        width: 38, height: 38, flex: '0 0 38px', borderRadius: '11px',
                        bgcolor: TOV.coral, color: '#fff', fontFamily: TOV.fontHead, fontWeight: 700,
                        fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {iniciais(u.user)}
                      </Box>
                      <Box component="span" sx={{ fontWeight: 700 }}>{u.user}</Box>
                      {euMesmo && (
                        <Box component="span" sx={{
                          px: 1.25, py: '3px', borderRadius: 999, bgcolor: TOV.coralTint,
                          color: TOV.coral, fontSize: 11, fontWeight: 700,
                        }}>
                          você
                        </Box>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'inline-flex', gap: 1.25, alignItems: 'center', fontSize: 13, fontWeight: 600, color: TOV.caption }}>
                      <Box component="button" type="button" onClick={() => redefinir(u)}
                        sx={{ appearance: 'none', border: 0, p: 0, bgcolor: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', '&:hover': { color: TOV.coral } }}>
                        Redefinir senha
                      </Box>
                      <Box component="span" sx={{ color: TOV.border }}>·</Box>
                      {euMesmo ? (
                        <Box component="span" title="Não é possível excluir o próprio usuário"
                          sx={{ color: TOV.border, cursor: 'not-allowed' }}>
                          Excluir
                        </Box>
                      ) : (
                        <Box component="button" type="button" onClick={() => excluir(u)}
                          sx={{ appearance: 'none', border: 0, p: 0, bgcolor: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', '&:hover': { color: '#d32f2f' } }}>
                          Excluir
                        </Box>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!form} onClose={() => setForm(null)} maxWidth="xs" fullWidth fullScreen={telaCheia}>
        <DialogTitle>{form?.novo ? 'Novo usuário' : `Redefinir senha — ${form?.user}`}</DialogTitle>
        <DialogContent>
          {form && (
            <Grid container spacing={1.5} sx={{ mt: 0 }}>
              {form.novo && (
                <Grid item xs={12}>
                  <TextField
                    fullWidth required autoFocus label="Usuário"
                    value={form.user}
                    onChange={(e) => setForm({ ...form, user: e.target.value })}
                    helperText="O nome é gravado em maiúsculas."
                  />
                </Grid>
              )}
              <Grid item xs={12}>
                <TextField
                  fullWidth required type="password" label="Senha"
                  autoFocus={!form.novo}
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  error={senhaCurta}
                  helperText={senhaCurta ? `Mínimo de ${SENHA_MINIMA} caracteres.` : ' '}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth required type="password" label="Confirmar senha"
                  value={form.confirmar}
                  onChange={(e) => setForm({ ...form, confirmar: e.target.value })}
                  error={naoConfere}
                  helperText={naoConfere ? 'As senhas não conferem.' : ' '}
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button variant="outlined" onClick={() => setForm(null)}>Cancelar</Button>
          <Button variant="contained" onClick={salvar} disabled={!podeSalvar}>Salvar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg('')}>
        <Alert severity="error" onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
      <Snackbar open={!!ok} autoHideDuration={3000} onClose={() => setOk('')}>
        <Alert severity="success" onClose={() => setOk('')}>{ok}</Alert>
      </Snackbar>
    </Box>
  )
}
