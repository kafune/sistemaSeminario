import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Paper, Snackbar, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { api } from '../api'

// Configuração de cada cadastro simples: rota da API, chave primária e colunas
const CADASTROS = [
  { rota: 'cursos', rotulo: 'Cursos', pk: 'cod_cur', campos: [{ k: 'nome', rotulo: 'Nome' }] },
  { rota: 'areas', rotulo: 'Áreas', pk: 'cod_are', campos: [{ k: 'nome', rotulo: 'Nome' }] },
  { rota: 'horarios', rotulo: 'Horários', pk: 'cod_hor', campos: [{ k: 'nome', rotulo: 'Nome' }] },
  { rota: 'escolaridades', rotulo: 'Escolaridade', pk: 'cod_esc', campos: [{ k: 'nome', rotulo: 'Nome' }] },
  { rota: 'estados-civis', rotulo: 'Estado civil', pk: 'cod_est', campos: [{ k: 'nome', rotulo: 'Nome' }] },
  { rota: 'titulos', rotulo: 'Títulos', pk: 'cod_tit', campos: [{ k: 'nome', rotulo: 'Nome' }] },
  {
    rota: 'cidades', rotulo: 'Cidades', pk: 'cod_cid',
    campos: [
      { k: 'nome', rotulo: 'Nome' },
      { k: 'uf', rotulo: 'UF' },
      { k: 'ddd', rotulo: 'DDD' },
    ],
  },
  {
    rota: 'congregacoes', rotulo: 'Congregações', pk: 'codigo',
    campos: [
      { k: 'nome', rotulo: 'Nome' },
      { k: 'bairro', rotulo: 'Bairro' },
      { k: 'telefone', rotulo: 'Telefone' },
      { k: 'dirigente', rotulo: 'Dirigente' },
    ],
  },
]

export default function Apoio() {
  const [aba, setAba] = useState(0)
  const [itens, setItens] = useState([])
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState('')

  const cad = CADASTROS[aba]

  function carregar() {
    api.get(`/apoio/${cad.rota}?busca=${encodeURIComponent(busca)}`)
      .then(setItens)
      .catch((e) => setMsg(e.message))
  }
  useEffect(() => { setBusca(''); setItens([]) }, [aba])
  useEffect(carregar, [aba]) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    try {
      if (form[cad.pk]) await api.put(`/apoio/${cad.rota}/${form[cad.pk]}`, form)
      else await api.post(`/apoio/${cad.rota}`, form)
      setForm(null)
      carregar()
    } catch (e) {
      setMsg(e.message)
    }
  }

  async function excluir(item) {
    if (!window.confirm(`Excluir "${item.nome}"?`)) return
    try {
      await api.del(`/apoio/${cad.rota}/${item[cad.pk]}`)
      carregar()
    } catch (e) {
      setMsg(e.message)
    }
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1 }}>Cadastros de apoio</Typography>
      <Tabs value={aba} onChange={(_, v) => setAba(v)} sx={{ mb: 2 }} variant="scrollable">
        {CADASTROS.map((c) => <Tab key={c.rota} label={c.rotulo} />)}
      </Tabs>

      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); carregar() }} sx={{ display: 'flex', gap: 1, flexGrow: 1 }}>
          <TextField size="small" label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Button type="submit" variant="outlined">Buscar</Button>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({})}>Novo</Button>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Código</TableCell>
              {cad.campos.map((c) => <TableCell key={c.k}>{c.rotulo}</TableCell>)}
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {itens.map((item) => (
              <TableRow key={item[cad.pk]} hover>
                <TableCell>{item[cad.pk]}</TableCell>
                {cad.campos.map((c) => <TableCell key={c.k}>{item[c.k]}</TableCell>)}
                <TableCell align="right">
                  <IconButton size="small" onClick={() => setForm(item)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => excluir(item)}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!form} onClose={() => setForm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{form?.[cad.pk] ? `Editar ${cad.rotulo.toLowerCase()}` : `Novo em ${cad.rotulo}`}</DialogTitle>
        <DialogContent>
          {form && cad.campos.map((c) => (
            <TextField
              key={c.k} size="small" fullWidth margin="dense" label={c.rotulo}
              value={form[c.k] ?? ''}
              onChange={(e) => setForm({ ...form, [c.k]: e.target.value })}
            />
          ))}
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
