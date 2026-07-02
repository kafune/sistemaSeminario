import { useEffect, useState } from 'react'
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, Grid, IconButton, List, ListItemButton, ListItemText, Paper,
  Snackbar, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import { api } from '../api'

export default function Grades() {
  const [grades, setGrades] = useState([])
  const [selecionada, setSelecionada] = useState(null) // grade com itens
  const [dlgGrade, setDlgGrade] = useState(false)
  const [nomeNova, setNomeNova] = useState('')
  const [dlgItem, setDlgItem] = useState(false)
  const [materias, setMaterias] = useState([])
  const [formItem, setFormItem] = useState({})
  const [msg, setMsg] = useState('')

  function carregarLista() {
    api.get('/grades').then(setGrades).catch((e) => setMsg(e.message))
  }
  useEffect(carregarLista, [])

  function abrir(g) {
    api.get(`/grades/${g.cod_gra}`).then(setSelecionada).catch((e) => setMsg(e.message))
  }

  async function criarGrade() {
    try {
      const nova = await api.post('/grades', { nome: nomeNova })
      setDlgGrade(false)
      setNomeNova('')
      carregarLista()
      abrir(nova)
    } catch (e) {
      setMsg(e.message)
    }
  }

  async function adicionarItem() {
    try {
      await api.post(`/grades/${selecionada.cod_gra}/itens`, formItem)
      setDlgItem(false)
      abrir(selecionada)
      carregarLista()
    } catch (e) {
      setMsg(e.message)
    }
  }

  async function removerItem(item) {
    if (!window.confirm(`Remover ${item.materia_nome?.trim()} da grade?`)) return
    try {
      await api.del(`/grades/${selecionada.cod_gra}/itens/${item.id}`)
      abrir(selecionada)
      carregarLista()
    } catch (e) {
      setMsg(e.message)
    }
  }

  return (
    <Box sx={{ display: 'flex', gap: 2 }}>
      <Paper sx={{ width: 300, p: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', px: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Grades</Typography>
          <IconButton color="primary" onClick={() => setDlgGrade(true)}><AddIcon /></IconButton>
        </Box>
        <List dense>
          {grades.map((g) => (
            <ListItemButton
              key={g.cod_gra}
              selected={selecionada?.cod_gra === g.cod_gra}
              onClick={() => abrir(g)}
            >
              <ListItemText primary={g.nome} secondary={`${g.qitens ?? 0} matérias`} />
            </ListItemButton>
          ))}
        </List>
      </Paper>

      <Box sx={{ flexGrow: 1 }}>
        {selecionada ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6" sx={{ flexGrow: 1 }}>{selecionada.nome}</Typography>
              <Button
                startIcon={<AddIcon />} variant="contained" size="small"
                onClick={() => {
                  setFormItem({})
                  setDlgItem(true)
                  if (!materias.length) api.get('/materias').then(setMaterias).catch(() => {})
                }}
              >
                Adicionar matéria
              </Button>
            </Box>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Matéria</TableCell>
                    <TableCell>Créditos</TableCell>
                    <TableCell>Carga horária</TableCell>
                    <TableCell align="right">Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selecionada.itens.map((i) => (
                    <TableRow key={i.id} hover>
                      <TableCell>{i.ite_gra}</TableCell>
                      <TableCell>{i.materia_nome?.trim()}</TableCell>
                      <TableCell>{i.creditos}</TableCell>
                      <TableCell>{i.cargahor}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" color="error" onClick={() => removerItem(i)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        ) : (
          <Typography color="text.secondary" sx={{ mt: 4, textAlign: 'center' }}>
            Selecione uma grade curricular à esquerda
          </Typography>
        )}
      </Box>

      <Dialog open={dlgGrade} onClose={() => setDlgGrade(false)}>
        <DialogTitle>Nova grade curricular</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus label="Nome" value={nomeNova} sx={{ mt: 1, width: 320 }}
            onChange={(e) => setNomeNova(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlgGrade(false)}>Cancelar</Button>
          <Button variant="contained" onClick={criarGrade} disabled={!nomeNova}>Criar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dlgItem} onClose={() => setDlgItem(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Adicionar matéria à grade</DialogTitle>
        <DialogContent>
          <Grid container spacing={1.5} sx={{ mt: 0 }}>
            <Grid item xs={12}>
              <Autocomplete
                size="small" options={materias}
                getOptionLabel={(m) => (m.NOME || '').trim()}
                onChange={(_, v) => setFormItem({ ...formItem, cod_mat: v?.cod_mat })}
                renderInput={(p) => <TextField {...p} label="Matéria" autoFocus />}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField size="small" fullWidth type="number" label="Créditos" value={formItem.creditos ?? ''}
                onChange={(e) => setFormItem({ ...formItem, creditos: e.target.value ? Number(e.target.value) : null })} />
            </Grid>
            <Grid item xs={6}>
              <TextField size="small" fullWidth type="number" label="Carga horária" value={formItem.cargahor ?? ''}
                onChange={(e) => setFormItem({ ...formItem, cargahor: e.target.value ? Number(e.target.value) : null })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlgItem(false)}>Cancelar</Button>
          <Button variant="contained" onClick={adicionarItem} disabled={!formItem.cod_mat}>Adicionar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg('')}>
        <Alert severity="error" onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
