import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
  IconButton, Paper, Snackbar, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { api } from '../api'

export default function Materias() {
  const [materias, setMaterias] = useState([])
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState('')

  function carregar() {
    api.get(`/materias?busca=${encodeURIComponent(busca)}`).then(setMaterias).catch((e) => setMsg(e.message))
  }
  useEffect(() => {
    carregar()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    try {
      if (form.cod_mat) await api.put(`/materias/${form.cod_mat}`, form)
      else await api.post('/materias', form)
      setForm(null)
      carregar()
    } catch (e) {
      setMsg(e.message)
    }
  }

  async function excluir(m) {
    if (!window.confirm(`Excluir a matéria ${m.NOME?.trim()}?`)) return
    try {
      await api.del(`/materias/${m.cod_mat}`)
      carregar()
    } catch (e) {
      setMsg(e.message)
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Matérias</Typography>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); carregar() }} sx={{ display: 'flex', gap: 1 }}>
          <TextField size="small" label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Button type="submit" variant="outlined">Buscar</Button>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ NOME: '', APELIDO: '', area: '' })}>
          Nova
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Código</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Apelido</TableCell>
              <TableCell>Área</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {materias.map((m) => (
              <TableRow key={m.cod_mat} hover>
                <TableCell>{m.cod_mat}</TableCell>
                <TableCell>{m.NOME?.trim()}</TableCell>
                <TableCell>{m.APELIDO?.trim()}</TableCell>
                <TableCell>{m.area}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => setForm(m)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => excluir(m)}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!form} onClose={() => setForm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{form?.cod_mat ? 'Editar matéria' : 'Nova matéria'}</DialogTitle>
        <DialogContent>
          {form && (
            <Grid container spacing={1.5} sx={{ mt: 0 }}>
              <Grid item xs={12}>
                <TextField size="small" fullWidth required label="Nome" value={form.NOME?.trim() ?? ''}
                  onChange={(e) => setForm({ ...form, NOME: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField size="small" fullWidth label="Apelido" value={form.APELIDO?.trim() ?? ''}
                  onChange={(e) => setForm({ ...form, APELIDO: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField size="small" fullWidth label="Área" value={form.area ?? ''}
                  onChange={(e) => setForm({ ...form, area: e.target.value || null })} />
              </Grid>
              <Grid item xs={12}>
                <TextField size="small" fullWidth label="Observações" multiline rows={2} value={form.observa ?? ''}
                  onChange={(e) => setForm({ ...form, observa: e.target.value })} />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForm(null)}>Cancelar</Button>
          <Button variant="contained" onClick={salvar} disabled={!form?.NOME}>Salvar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg('')}>
        <Alert severity="error" onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
