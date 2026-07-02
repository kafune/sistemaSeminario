import { useCallback, useEffect, useState } from 'react'
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, Grid, IconButton, MenuItem,
  Paper, Snackbar, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import { api, abrirArquivo } from '../api'

const FORM_VAZIO = {
  cod_mat: null,
  nota: '',
  falta: '',
  ano: String(new Date().getFullYear()),
  semestre: '1',
  cursou: 'S',
  dispensa: null,
  cod_pro: null,
}

export default function Notas() {
  // seleção de aluno
  const [buscaAluno, setBuscaAluno] = useState('')
  const [opcoes, setOpcoes] = useState([])
  const [aluno, setAluno] = useState(null)
  const [notas, setNotas] = useState([])

  // apoio
  const [materias, setMaterias] = useState([])
  const [professores, setProfessores] = useState([])

  // dialogo (null = fechado; {..., id} = edição; sem id = novo)
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState('')
  const [ehErro, setEhErro] = useState(true)

  useEffect(() => {
    api.get('/materias').then(setMaterias).catch(() => {})
    api.get('/professores').then(setProfessores).catch(() => {})
  }, [])

  useEffect(() => {
    if (buscaAluno.length < 2) return
    const t = setTimeout(() => {
      api.get(`/alunos?busca=${encodeURIComponent(buscaAluno)}&por_pagina=20`)
        .then((r) => setOpcoes(r.itens))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [buscaAluno])

  const carregarNotas = useCallback(() => {
    if (!aluno) { setNotas([]); return }
    api.get(`/notas/aluno/${aluno.cod_alu}`)
      .then((r) => setNotas(r.notas))
      .catch((e) => { setEhErro(true); setMsg(e.message) })
  }, [aluno])

  useEffect(() => { carregarNotas() }, [carregarNotas])

  async function salvar() {
    const corpo = {
      cod_mat: form.cod_mat,
      nota: form.nota === '' || form.nota === null ? null : Number(form.nota),
      falta: form.falta === '' || form.falta === null ? null : Number(form.falta),
      ano: form.ano || null,
      semestre: form.semestre || null,
      cursou: form.cursou || 'S',
      dispensa: form.dispensa || null,
      cod_pro: form.cod_pro,
    }
    try {
      if (form.id) await api.put(`/notas/${form.id}`, corpo)
      else await api.post(`/notas/aluno/${aluno.cod_alu}`, corpo)
      setForm(null)
      carregarNotas()
      setEhErro(false)
      setMsg(form.id ? 'Nota atualizada' : 'Nota adicionada')
    } catch (e) {
      setEhErro(true)
      setMsg(e.message)
    }
  }

  async function excluir(n) {
    if (!window.confirm(`Excluir a nota de ${n.materia_nome}?`)) return
    try {
      await api.del(`/notas/${n.id}`)
      carregarNotas()
    } catch (e) {
      setEhErro(true)
      setMsg(e.message)
    }
  }

  function abrirEdicao(n) {
    setForm({
      id: n.id,
      cod_mat: n.cod_mat,
      nota: n.nota ?? '',
      falta: n.falta ?? '',
      ano: n.ano ?? '',
      semestre: n.semestre ?? '',
      cursou: n.cursou ?? 'S',
      dispensa: n.dispensa ?? null,
      cod_pro: n.cod_pro ?? null,
    })
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Notas e faltas por aluno</Typography>

      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Autocomplete
          sx={{ minWidth: 380 }} size="small" options={opcoes} value={aluno}
          getOptionLabel={(a) => `${a.cod_alu} - ${a.nome}`}
          isOptionEqualToValue={(a, b) => a.cod_alu === b.cod_alu}
          onInputChange={(_, v) => setBuscaAluno(v)}
          onChange={(_, v) => setAluno(v)}
          renderInput={(p) => <TextField {...p} label="Pesquisar aluno (nome ou matrícula)" autoFocus />}
          noOptionsText="Digite ao menos 2 letras"
        />
        {aluno && (
          <>
            <Chip label={`${notas.length} lançamentos`} />
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ ...FORM_VAZIO })}>
              Adicionar nota
            </Button>
            <Button
              variant="outlined" startIcon={<PictureAsPdfIcon />}
              onClick={() => abrirArquivo(`/relatorios/boletim/${aluno.cod_alu}`).catch((e) => { setEhErro(true); setMsg(e.message) })}
            >
              Boletim
            </Button>
          </>
        )}
      </Paper>

      {aluno && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Matéria</TableCell>
                <TableCell>Nota</TableCell>
                <TableCell>Faltas</TableCell>
                <TableCell>Cursou</TableCell>
                <TableCell>Ano</TableCell>
                <TableCell>Semestre</TableCell>
                <TableCell>Professor</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {notas.map((n) => (
                <TableRow key={n.id} hover>
                  <TableCell>{n.materia_nome}</TableCell>
                  <TableCell>{n.nota ?? 'N/C'}</TableCell>
                  <TableCell>{n.falta ?? '—'}</TableCell>
                  <TableCell>{n.cursou}</TableCell>
                  <TableCell>{n.ano}</TableCell>
                  <TableCell>{n.semestre}</TableCell>
                  <TableCell>{n.professor_nome}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => abrirEdicao(n)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => excluir(n)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={!!form} onClose={() => setForm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {form?.id ? 'Editar nota' : `Nova nota para ${aluno?.nome ?? ''}`}
        </DialogTitle>
        <DialogContent>
          {form && (
            <Grid container spacing={1.5} sx={{ mt: 0 }}>
              <Grid item xs={12}>
                <Autocomplete
                  size="small" options={materias}
                  getOptionLabel={(m) => (m.NOME || '').trim()}
                  value={materias.find((m) => m.cod_mat === form.cod_mat) ?? null}
                  onChange={(_, v) => setForm({ ...form, cod_mat: v?.cod_mat ?? null })}
                  renderInput={(p) => <TextField {...p} label="Matéria" autoFocus={!form.id} />}
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField
                  size="small" fullWidth label="Nota (0-10)" type="number"
                  inputProps={{ min: 0, max: 10, step: 0.1 }} value={form.nota}
                  onChange={(e) => setForm({ ...form, nota: e.target.value })}
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField
                  size="small" fullWidth label="Faltas" type="number"
                  inputProps={{ min: 0 }} value={form.falta}
                  onChange={(e) => setForm({ ...form, falta: e.target.value })}
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField
                  size="small" fullWidth label="Ano" value={form.ano}
                  onChange={(e) => setForm({ ...form, ano: e.target.value })}
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField
                  select size="small" fullWidth label="Semestre" value={form.semestre}
                  onChange={(e) => setForm({ ...form, semestre: e.target.value })}
                >
                  <MenuItem value="">—</MenuItem>
                  <MenuItem value="1">1º</MenuItem>
                  <MenuItem value="2">2º</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <Autocomplete
                  size="small" options={professores}
                  getOptionLabel={(p) => p.nome || ''}
                  value={professores.find((p) => p.cod_pro === form.cod_pro) ?? null}
                  onChange={(_, v) => setForm({ ...form, cod_pro: v?.cod_pro ?? null })}
                  renderInput={(p) => <TextField {...p} label="Professor (opcional)" />}
                />
              </Grid>
              <Grid item xs={6}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={(form.cursou ?? 'S') === 'S'}
                      onChange={(e) => setForm({ ...form, cursou: e.target.checked ? 'S' : 'N' })}
                    />
                  }
                  label="Cursou"
                />
              </Grid>
              <Grid item xs={6}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.dispensa === 'S'}
                      onChange={(e) => setForm({ ...form, dispensa: e.target.checked ? 'S' : null })}
                    />
                  }
                  label="Dispensa"
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForm(null)}>Cancelar</Button>
          <Button variant="contained" onClick={salvar} disabled={!form?.cod_mat}>Salvar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={5000} onClose={() => setMsg('')}>
        <Alert severity={ehErro ? 'error' : 'success'} onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
