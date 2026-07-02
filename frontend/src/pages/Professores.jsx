import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
  IconButton, Paper, Snackbar, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { api } from '../api'

const VAZIO = { nome: '', e_mail: '', fone1: '', celular: '', sigla: '', status: 'A' }

export default function Professores() {
  const [professores, setProfessores] = useState([])
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState(null) // null = fechado; objeto = aberto
  const [msg, setMsg] = useState('')

  function carregar() {
    api.get(`/professores?busca=${encodeURIComponent(busca)}`).then(setProfessores).catch((e) => setMsg(e.message))
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

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Professores</Typography>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); carregar() }} sx={{ display: 'flex', gap: 1 }}>
          <TextField size="small" label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Button type="submit" variant="outlined">Buscar</Button>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm(VAZIO)}>Novo</Button>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Código</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Sigla</TableCell>
              <TableCell>Telefone</TableCell>
              <TableCell>E-mail</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {professores.map((p) => (
              <TableRow key={p.cod_pro} hover>
                <TableCell>{p.cod_pro}</TableCell>
                <TableCell>{p.nome}</TableCell>
                <TableCell>{p.sigla}</TableCell>
                <TableCell>{p.fone1 || p.celular}</TableCell>
                <TableCell>{p.e_mail}</TableCell>
                <TableCell>{p.status}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => setForm(p)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => excluir(p)}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!form} onClose={() => setForm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{form?.cod_pro ? 'Editar professor' : 'Novo professor'}</DialogTitle>
        <DialogContent>
          {form && (
            <Grid container spacing={1.5} sx={{ mt: 0 }}>
              <Grid item xs={12} sm={9}>
                <TextField size="small" fullWidth required label="Nome" value={form.nome ?? ''}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField size="small" fullWidth label="Sigla" value={form.sigla ?? ''}
                  onChange={(e) => setForm({ ...form, sigla: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField size="small" fullWidth label="Telefone" value={form.fone1 ?? ''}
                  onChange={(e) => setForm({ ...form, fone1: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField size="small" fullWidth label="Celular" value={form.celular ?? ''}
                  onChange={(e) => setForm({ ...form, celular: e.target.value })} />
              </Grid>
              <Grid item xs={12}>
                <TextField size="small" fullWidth label="E-mail" value={form.e_mail ?? ''}
                  onChange={(e) => setForm({ ...form, e_mail: e.target.value })} />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForm(null)}>Cancelar</Button>
          <Button variant="contained" onClick={salvar} disabled={!form?.nome}>Salvar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg('')}>
        <Alert severity="error" onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
