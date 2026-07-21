import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
  InputAdornment, Paper, Snackbar, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import { api } from '../api'
import { TOV } from '../theme'
import { CabecalhoPagina, CartaoLista, LinhaCartao, useDialogoTelaCheia } from '../ui'

const VAZIA = { NOME: '', APELIDO: '', area: '', observa: '' }

function PilulaArea({ area }) {
  return (
    <Box component="span" sx={{ display: 'inline-block', px: 1.5, py: '5px', bgcolor: TOV.offwhite, color: TOV.slate, borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
      {area || 'Sem área'}
    </Box>
  )
}

export default function Materias() {
  const [materias, setMaterias] = useState([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState('')
  const telaCheia = useDialogoTelaCheia()

  function carregar() {
    setCarregando(true)
    api.get(`/materias?busca=${encodeURIComponent(busca)}`)
      .then(setMaterias)
      .catch((e) => setMsg(e.message))
      .finally(() => setCarregando(false))
  }

  useEffect(carregar, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    try {
      const dados = { ...form, area: form.area || null, APELIDO: form.APELIDO || null, observa: form.observa || null }
      if (form.cod_mat) await api.put(`/materias/${form.cod_mat}`, dados)
      else await api.post('/materias', dados)
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

  const areas = new Set(materias.map((m) => m.area?.trim()).filter(Boolean)).size
  const acoes = (
    <>
      <Box component="form" onSubmit={(e) => { e.preventDefault(); carregar() }}>
        <TextField
          size="small" placeholder="Buscar matéria" value={busca}
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
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ ...VAZIA })}>
        Nova matéria
      </Button>
    </>
  )

  return (
    <Box>
      <CabecalhoPagina
        titulo="Matérias"
        subtitulo={carregando ? ' ' : `${materias.length} ${materias.length === 1 ? 'matéria' : 'matérias'} · ${areas} ${areas === 1 ? 'área' : 'áreas'}`}
        acoes={acoes}
      />

      {/* Lista em cards — celular/tablet */}
      <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1.25 }}>
        {carregando && materias.length === 0 && (
          <CartaoLista sx={{ alignItems: 'center', color: TOV.caption, py: 4 }}>Carregando…</CartaoLista>
        )}
        {!carregando && materias.length === 0 && (
          <CartaoLista sx={{ alignItems: 'center', color: TOV.caption, py: 5 }}>Nenhuma matéria encontrada.</CartaoLista>
        )}
        {materias.map((m) => (
          <CartaoLista key={m.cod_mat}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.3 }}>{m.NOME?.trim()}</Box>
                <Box sx={{ fontSize: 13, color: TOV.caption, fontWeight: 600, mt: '2px' }}>MT-{String(m.cod_mat).padStart(2, '0')}</Box>
              </Box>
              <PilulaArea area={m.area?.trim()} />
            </Box>
            <LinhaCartao rotulo="Apelido" valor={m.APELIDO?.trim()} />
            <Box sx={{ display: 'flex', gap: 1, pt: 1, borderTop: `1px solid ${TOV.offwhite}` }}>
              <Button size="small" variant="outlined" fullWidth onClick={() => setForm({ ...m })}>Editar</Button>
              <Button size="small" variant="outlined" color="error" fullWidth onClick={() => excluir(m)}>Excluir</Button>
            </Box>
          </CartaoLista>
        ))}
      </Box>

      {/* Tabela — desktop */}
      <TableContainer component={Paper} elevation={0} sx={{ boxShadow: TOV.shadowCard, display: { xs: 'none', md: 'block' } }}>
        <Table sx={{ minWidth: 680 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 100 }}>Código</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Apelido</TableCell>
              <TableCell>Área</TableCell>
              <TableCell align="right" sx={{ width: 120 }}>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {carregando && materias.length === 0 && (
              <TableRow><TableCell colSpan={5} sx={{ py: 5, textAlign: 'center', color: TOV.caption }}>Carregando…</TableCell></TableRow>
            )}
            {!carregando && materias.length === 0 && (
              <TableRow><TableCell colSpan={5} sx={{ py: 6, textAlign: 'center', color: TOV.caption }}>Nenhuma matéria encontrada.</TableCell></TableRow>
            )}
            {materias.map((m) => (
              <TableRow key={m.cod_mat} hover>
                <TableCell sx={{ color: TOV.caption, fontWeight: 600 }}>MT-{String(m.cod_mat).padStart(2, '0')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{m.NOME?.trim()}</TableCell>
                <TableCell sx={{ color: TOV.slate }}>{m.APELIDO?.trim() || '—'}</TableCell>
                <TableCell><PilulaArea area={m.area?.trim()} /></TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'inline-flex', gap: 1.25, alignItems: 'center', fontSize: 13, fontWeight: 600, color: TOV.caption }}>
                    <Box component="button" type="button" onClick={() => setForm({ ...m })}
                      sx={{ appearance: 'none', border: 0, p: 0, bgcolor: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', '&:hover': { color: TOV.coral } }}>
                      Editar
                    </Box>
                    <Box component="span" sx={{ color: TOV.border }}>·</Box>
                    <Box component="button" type="button" onClick={() => excluir(m)}
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
        <DialogTitle>{form?.cod_mat ? 'Editar matéria' : 'Nova matéria'}</DialogTitle>
        <DialogContent>
          {form && (
            <Grid container spacing={1.5} sx={{ mt: 0 }}>
              <Grid item xs={12}>
                <TextField fullWidth required label="Nome" value={form.NOME?.trim() ?? ''}
                  onChange={(e) => setForm({ ...form, NOME: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Apelido" value={form.APELIDO?.trim() ?? ''}
                  onChange={(e) => setForm({ ...form, APELIDO: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Área" value={form.area ?? ''}
                  onChange={(e) => setForm({ ...form, area: e.target.value })} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Observações" multiline rows={3} value={form.observa ?? ''}
                  onChange={(e) => setForm({ ...form, observa: e.target.value })} />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button variant="outlined" onClick={() => setForm(null)}>Cancelar</Button>
          <Button variant="contained" onClick={salvar} disabled={!form?.NOME?.trim()}>Salvar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg('')}>
        <Alert severity="error" onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
