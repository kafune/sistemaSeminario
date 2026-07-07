import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, Grid, IconButton, MenuItem, Paper, Snackbar, Tab, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField,
  Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import { api, abrirArquivo } from '../api'

export default function TurmaDetalhe() {
  const { codTur } = useParams()
  const [turma, setTurma] = useState(null)
  const [aba, setAba] = useState(0)
  const [alunos, setAlunos] = useState([])
  const [materias, setMaterias] = useState([])
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState(true)
  const navigate = useNavigate()

  // dialogo de matricula
  const [buscaAluno, setBuscaAluno] = useState('')
  const [opcoesAluno, setOpcoesAluno] = useState([])
  const [alunoSel, setAlunoSel] = useState(null)
  const [dlgMatricula, setDlgMatricula] = useState(false)

  // dialogo de materia
  const [dlgMateria, setDlgMateria] = useState(false)
  const [todasMaterias, setTodasMaterias] = useState([])
  const [professores, setProfessores] = useState([])
  const [formMateria, setFormMateria] = useState({})

  const avisar = (texto, ehErro = true) => { setErro(ehErro); setMsg(texto) }

  const carregar = useCallback(() => {
    api.get(`/turmas/${codTur}`).then(setTurma).catch((e) => avisar(e.message))
    api.get(`/turmas/${codTur}/alunos`).then(setAlunos).catch(() => {})
    api.get(`/turmas/${codTur}/materias`).then(setMaterias).catch(() => {})
  }, [codTur])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (buscaAluno.length < 2) return
    const t = setTimeout(() => {
      api.get(`/alunos?busca=${encodeURIComponent(buscaAluno)}&por_pagina=20`)
        .then((r) => setOpcoesAluno(r.itens))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [buscaAluno])

  async function matricular() {
    try {
      await api.post(`/turmas/${codTur}/alunos/${alunoSel.cod_alu}`)
      setDlgMatricula(false)
      setAlunoSel(null)
      setBuscaAluno('')
      carregar()
      avisar('Aluno matriculado', false)
    } catch (e) {
      avisar(e.message)
    }
  }

  async function desmatricular(a) {
    if (!window.confirm(`Remover ${a.nome} da turma?`)) return
    try {
      await api.del(`/turmas/${codTur}/alunos/${a.cod_alu}`)
      carregar()
    } catch (e) {
      avisar(e.message)
    }
  }

  async function abrirDlgMateria() {
    setFormMateria({ Ano: String(new Date().getFullYear()), semestre: '1' })
    setDlgMateria(true)
    if (!todasMaterias.length) {
      api.get('/materias').then(setTodasMaterias).catch(() => {})
      api.get('/professores').then(setProfessores).catch(() => {})
    }
  }

  async function salvarMateria() {
    try {
      await api.post(`/turmas/${codTur}/materias`, formMateria)
      setDlgMateria(false)
      carregar()
    } catch (e) {
      avisar(e.message)
    }
  }

  async function removerMateria(m) {
    if (!window.confirm(`Remover ${m.materia_nome?.trim()} da turma?`)) return
    try {
      await api.del(`/turmas/${codTur}/materias/${m.id}`)
      carregar()
    } catch (e) {
      avisar(e.message)
    }
  }

  if (!turma) return <Typography>Carregando...</Typography>

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/turmas')}>Voltar</Button>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>{turma.nome}</Typography>
        <Button
          startIcon={<PictureAsPdfIcon />} variant="outlined"
          onClick={() => abrirArquivo(`/relatorios/lista-turma/${codTur}`).catch((e) => avisar(e.message))}
        >
          Lista de alunos
        </Button>
        <Button
          startIcon={<PictureAsPdfIcon />} variant="outlined"
          onClick={() => abrirArquivo(`/relatorios/boletim-turma/${codTur}`).catch((e) => avisar(e.message))}
        >
          Boletins (ZIP)
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Curso: {turma.curso || '—'} · Horário: {turma.horario || '—'} · {turma.qtd_alunos} alunos
      </Typography>

      <Tabs value={aba} onChange={(_, v) => setAba(v)} sx={{ mb: 2 }}>
        <Tab label={`Alunos (${alunos.length})`} />
        <Tab label={`Matérias e professores (${materias.length})`} />
      </Tabs>

      {aba === 0 && (
        <Box>
          <Button startIcon={<AddIcon />} variant="contained" size="small" sx={{ mb: 1 }}
            onClick={() => setDlgMatricula(true)}>
            Matricular aluno
          </Button>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Matrícula</TableCell>
                  <TableCell>Nome</TableCell>
                  <TableCell>Celular</TableCell>
                  <TableCell>E-mail</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {alunos.map((a) => (
                  <TableRow key={a.cod_alu} hover>
                    <TableCell>{a.cod_alu}</TableCell>
                    <TableCell
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/alunos/${a.cod_alu}`)}
                    >
                      {a.nome}
                    </TableCell>
                    <TableCell>{a.celular}</TableCell>
                    <TableCell>{a.e_mail}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" color="error" title="Remover da turma" onClick={() => desmatricular(a)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {aba === 1 && (
        <Box>
          <Button startIcon={<AddIcon />} variant="contained" size="small" sx={{ mb: 1 }} onClick={abrirDlgMateria}>
            Adicionar matéria
          </Button>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Matéria</TableCell>
                  <TableCell>Professor</TableCell>
                  <TableCell>Ano</TableCell>
                  <TableCell>Semestre</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {materias.map((m) => (
                  <TableRow key={m.id} hover>
                    <TableCell>{m.materia_nome?.trim()}</TableCell>
                    <TableCell>{m.professor_nome}</TableCell>
                    <TableCell>{m.Ano}</TableCell>
                    <TableCell>{m.semestre}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small" title="Diário de classe (PDF)"
                        onClick={() => abrirArquivo(`/relatorios/diario/${codTur}?cod_mat=${m.cod_mat}`).catch((e) => avisar(e.message))}
                      >
                        <PictureAsPdfIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => removerMateria(m)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      <Dialog open={dlgMatricula} onClose={() => setDlgMatricula(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Matricular aluno</DialogTitle>
        <DialogContent>
          <Autocomplete
            sx={{ mt: 1 }} options={opcoesAluno} value={alunoSel}
            getOptionLabel={(a) => `${a.cod_alu} - ${a.nome}`}
            isOptionEqualToValue={(a, b) => a.cod_alu === b.cod_alu}
            onInputChange={(_, v) => setBuscaAluno(v)}
            onChange={(_, v) => setAlunoSel(v)}
            renderInput={(p) => <TextField {...p} label="Digite o nome do aluno" autoFocus />}
            noOptionsText="Digite ao menos 2 letras"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlgMatricula(false)}>Cancelar</Button>
          <Button variant="contained" onClick={matricular} disabled={!alunoSel}>Matricular</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dlgMateria} onClose={() => setDlgMateria(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Adicionar matéria à turma</DialogTitle>
        <DialogContent>
          <Grid container spacing={1.5} sx={{ mt: 0 }}>
            <Grid item xs={12}>
              <Autocomplete
                size="small" options={todasMaterias}
                getOptionLabel={(m) => (m.NOME || '').trim()}
                onChange={(_, v) => setFormMateria({ ...formMateria, cod_mat: v?.cod_mat })}
                renderInput={(p) => <TextField {...p} label="Matéria" />}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                size="small" options={professores}
                getOptionLabel={(p) => p.nome || ''}
                onChange={(_, v) => setFormMateria({ ...formMateria, cod_pro: v?.cod_pro })}
                renderInput={(p) => <TextField {...p} label="Professor" />}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField size="small" fullWidth label="Ano" value={formMateria.Ano ?? ''}
                onChange={(e) => setFormMateria({ ...formMateria, Ano: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField select size="small" fullWidth label="Semestre" value={formMateria.semestre ?? '1'}
                onChange={(e) => setFormMateria({ ...formMateria, semestre: e.target.value })}>
                <MenuItem value="1">1º</MenuItem>
                <MenuItem value="2">2º</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlgMateria(false)}>Cancelar</Button>
          <Button variant="contained" onClick={salvarMateria} disabled={!formMateria.cod_mat}>Adicionar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={5000} onClose={() => setMsg('')}>
        <Alert severity={erro ? 'error' : 'success'} onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
