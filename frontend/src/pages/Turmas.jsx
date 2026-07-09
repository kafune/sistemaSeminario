import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
  Paper, Snackbar, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { api } from '../api'

export default function Turmas() {
  const [turmas, setTurmas] = useState([])
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState('')
  const navigate = useNavigate()

  function carregar() {
    api.get('/turmas').then(setTurmas).catch((e) => setMsg(e.message))
  }
  useEffect(() => {
    carregar()
  }, [])

  async function salvar() {
    try {
      const criada = await api.post('/turmas', form)
      setForm(null)
      navigate(`/turmas/${criada.cod_tur}`)
    } catch (e) {
      setMsg(e.message)
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Turmas</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ nome: '' })}>Nova turma</Button>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Código</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Curso</TableCell>
              <TableCell>Horário</TableCell>
              <TableCell>Alunos</TableCell>
              <TableCell>Início</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {turmas.map((t) => (
              <TableRow
                key={t.cod_tur} hover sx={{ cursor: 'pointer' }}
                onClick={() => navigate(`/turmas/${t.cod_tur}`)}
              >
                <TableCell>{t.cod_tur}</TableCell>
                <TableCell>{t.nome}</TableCell>
                <TableCell>{t.curso}</TableCell>
                <TableCell>{t.horario}</TableCell>
                <TableCell>{t.qtd_alunos}</TableCell>
                <TableCell>{t.dat_ini}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!form} onClose={() => setForm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Nova turma</DialogTitle>
        <DialogContent>
          {form && (
            <Grid container spacing={1.5} sx={{ mt: 0 }}>
              <Grid item xs={12}>
                <TextField size="small" fullWidth required label="Nome" value={form.nome ?? ''}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField size="small" fullWidth label="Curso" value={form.curso ?? ''}
                  onChange={(e) => setForm({ ...form, curso: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField size="small" fullWidth label="Horário" placeholder="ex.: Sábado 19h"
                  value={form.horario ?? ''}
                  onChange={(e) => setForm({ ...form, horario: e.target.value })} />
              </Grid>
              <Grid item xs={6}>
                <TextField size="small" fullWidth label="Data de início" type="date"
                  InputLabelProps={{ shrink: true }} value={form.dat_ini ?? ''}
                  onChange={(e) => setForm({ ...form, dat_ini: e.target.value || null })} />
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
