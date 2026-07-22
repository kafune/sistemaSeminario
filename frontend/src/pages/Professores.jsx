import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
  InputAdornment, MenuItem, Paper, Snackbar, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import { api } from '../api'
import { TOV } from '../theme'
import { CabecalhoPagina, CartaoLista, LinhaCartao, PilulaStatus, useDialogoTelaCheia } from '../ui'

const VAZIO = { nome: '', e_mail: '', fone1: '', celular: '', sigla: '', status: 'A' }

export default function Professores() {
  const [professores, setProfessores] = useState([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState('')
  const telaCheia = useDialogoTelaCheia()

  function carregar() {
    setCarregando(true)
    api.get(`/professores?busca=${encodeURIComponent(busca)}`)
      .then(setProfessores)
      .catch((e) => setMsg(e.message))
      .finally(() => setCarregando(false))
  }

  useEffect(carregar, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    try {
      if (form.cod_pro) await api.put(`/professores/${form.cod_pro}`, form)
      else await api.post('/professores', form)
      setForm(null)
      carregar()
    } catch (e) {
      setMsg(e.message)
    }
  }

  async function excluir(p) {
    if (!window.confirm(`Excluir o professor ${p.nome}?`)) return
    try {
      await api.del(`/professores/${p.cod_pro}`)
      carregar()
    } catch (e) {
      setMsg(e.message)
    }
  }

  const ativos = professores.filter((p) => p.status === 'A').length
  const acoes = (
    <>
      <Box component="form" onSubmit={(e) => { e.preventDefault(); carregar() }}>
        <TextField
          size="small" placeholder="Buscar professor" value={busca}
          onChange={(e) => setBusca(e.target.value)}
          sx={{ minWidth: { xs: '100%', sm: 240 }, '& .MuiOutlinedInput-root': { height: 46 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: TOV.caption, fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
        />
      </Box>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ ...VAZIO })}>
        Novo professor
      </Button>
    </>
  )

  return (
    <Box>
      <CabecalhoPagina
        titulo="Professores"
        subtitulo={carregando ? ' ' : `${professores.length} ${professores.length === 1 ? 'professor' : 'professores'} · ${ativos} ativos`}
        acoes={acoes}
      />

      {/* Lista em cards — celular/tablet */}
      <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1.25 }}>
        {carregando && professores.length === 0 && (
          <CartaoLista sx={{ alignItems: 'center', color: TOV.caption, py: 4 }}>Carregando…</CartaoLista>
        )}
        {!carregando && professores.length === 0 && (
          <CartaoLista sx={{ alignItems: 'center', color: TOV.caption, py: 5 }}>Nenhum professor encontrado.</CartaoLista>
        )}
        {professores.map((p) => (
          <CartaoLista key={p.cod_pro}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.3 }}>{p.nome}</Box>
                <Box sx={{ fontSize: 13, color: TOV.caption, fontWeight: 600, mt: '2px' }}>
                  Código {String(p.cod_pro).padStart(2, '0')}{p.sigla ? ` · ${p.sigla}` : ''}
                </Box>
              </Box>
              <PilulaStatus status={p.status} sx={{ flexShrink: 0 }} />
            </Box>
            <LinhaCartao rotulo="Telefone" valor={p.fone1 || p.celular} />
            <LinhaCartao rotulo="E-mail" valor={p.e_mail} />
            <Box sx={{ display: 'flex', gap: 1, pt: 1, borderTop: `1px solid ${TOV.offwhite}` }}>
              <Button size="small" variant="outlined" fullWidth onClick={() => setForm({ ...p })}>Editar</Button>
              <Button size="small" variant="outlined" color="error" fullWidth onClick={() => excluir(p)}>Excluir</Button>
            </Box>
          </CartaoLista>
        ))}
      </Box>

      {/* Tabela — desktop */}
      <TableContainer component={Paper} elevation={0} sx={{ boxShadow: TOV.shadowCard, display: { xs: 'none', md: 'block' } }}>
        <Table sx={{ minWidth: 820 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 90 }}>Código</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell sx={{ width: 90 }}>Sigla</TableCell>
              <TableCell>Telefone</TableCell>
              <TableCell>E-mail</TableCell>
              <TableCell sx={{ width: 110 }}>Status</TableCell>
              <TableCell align="right" sx={{ width: 120 }}>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {carregando && professores.length === 0 && (
              <TableRow><TableCell colSpan={7} sx={{ py: 5, textAlign: 'center', color: TOV.caption }}>Carregando…</TableCell></TableRow>
            )}
            {!carregando && professores.length === 0 && (
              <TableRow><TableCell colSpan={7} sx={{ py: 6, textAlign: 'center', color: TOV.caption }}>Nenhum professor encontrado.</TableCell></TableRow>
            )}
            {professores.map((p) => (
              <TableRow key={p.cod_pro} hover>
                <TableCell sx={{ color: TOV.caption, fontWeight: 600 }}>{String(p.cod_pro).padStart(2, '0')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{p.nome}</TableCell>
                <TableCell sx={{ color: TOV.slate }}>{p.sigla || '—'}</TableCell>
                <TableCell sx={{ color: TOV.slate }}>{p.fone1 || p.celular || '—'}</TableCell>
                <TableCell sx={{ color: TOV.slate }}>{p.e_mail || '—'}</TableCell>
                <TableCell><PilulaStatus status={p.status} /></TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'inline-flex', gap: 1.25, alignItems: 'center', fontSize: 13, fontWeight: 600, color: TOV.caption }}>
                    <Box component="button" type="button" onClick={() => setForm({ ...p })}
                      sx={{ appearance: 'none', border: 0, p: 0, bgcolor: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', '&:hover': { color: TOV.coral } }}>
                      Editar
                    </Box>
                    <Box component="span" sx={{ color: TOV.border }}>·</Box>
                    <Box component="button" type="button" onClick={() => excluir(p)}
                      sx={{ appearance: 'none', border: 0, p: 0, bgcolor: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', '&:hover': { color: '#d32f2f' } }}>
                      Excluir
                    </Box>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!form} onClose={() => setForm(null)} maxWidth="sm" fullWidth fullScreen={telaCheia}>
        <DialogTitle>{form?.cod_pro ? 'Editar professor' : 'Novo professor'}</DialogTitle>
        <DialogContent>
          {form && (
            <Grid container spacing={1.5} sx={{ mt: 0 }}>
              <Grid item xs={12} sm={9}>
                <TextField fullWidth required label="Nome" value={form.nome ?? ''}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField fullWidth label="Sigla" value={form.sigla ?? ''}
                  onChange={(e) => setForm({ ...form, sigla: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Telefone" value={form.fone1 ?? ''}
                  onChange={(e) => setForm({ ...form, fone1: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Celular" value={form.celular ?? ''}
                  onChange={(e) => setForm({ ...form, celular: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextField fullWidth label="E-mail" value={form.e_mail ?? ''}
                  onChange={(e) => setForm({ ...form, e_mail: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField select fullWidth label="Status" value={form.status ?? 'A'}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <MenuItem value="A">Ativo</MenuItem>
                  <MenuItem value="I">Inativo</MenuItem>
                </TextField>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button variant="outlined" onClick={() => setForm(null)}>Cancelar</Button>
          <Button variant="contained" onClick={salvar} disabled={!form?.nome}>Salvar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg('')}>
        <Alert severity="error" onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
