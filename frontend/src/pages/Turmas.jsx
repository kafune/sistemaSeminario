import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
  MenuItem, Paper, Snackbar, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { api } from '../api'

export default function Turmas() {
  const [turmas, setTurmas] = useState([])
  const [cursos, setCursos] = useState([])
  const [grades, setGrades] = useState([])
  const [horarios, setHorarios] = useState([])
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState('')
  const navigate = useNavigate()

  function carregar() {
    api.get('/turmas').then(setTurmas).catch((e) => setMsg(e.message))
  }
  useEffect(() => {
    carregar()
    api.get('/apoio/cursos').then(setCursos).catch(() => {})
    api.get('/grades').then(setGrades).catch(() => {})
    api.get('/apoio/horarios').then(setHorarios).catch(() => {})
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
              <TableCell>Grade</TableCell>
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
                <TableCell>{t.curso_nome}</TableCell>
                <TableCell>{t.grade_nome}</TableCell>
                <TableCell>{t.horario_nome}</TableCell>
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
                <TextField select size="small" fullWidth label="Curso" value={form.cod_cur ?? ''}
                  onChange={(e) => setForm({ ...form, cod_cur: e.target.value || null })}>
                  {cursos.map((c) => <MenuItem key={c.cod_cur} value={c.cod_cur}>{c.nome}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={6}>
                <TextField select size="small" fullWidth label="Grade curricular" value={form.cod_gra ?? ''}
                  onChange={(e) => setForm({ ...form, cod_gra: e.target.value || null })}>
                  {grades.map((g) => <MenuItem key={g.cod_gra} value={g.cod_gra}>{g.nome}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={6}>
                <TextField select size="small" fullWidth label="Horário" value={form.cod_hor ?? ''}
                  onChange={(e) => setForm({ ...form, cod_hor: e.target.value || null })}>
                  {horarios.map((h) => <MenuItem key={h.cod_hor} value={h.cod_hor}>{h.nome}</MenuItem>)}
                </TextField>
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
