import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, Grid, InputAdornment,
  Snackbar, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import { api } from '../api'
import { TOV } from '../theme'
import { useDirtyForm } from '../UnsavedChanges'
import {
  BarraFiltros, CabecalhoPagina, CartaoLista, DialogoConfirmacao, EstadoErro,
  EstadoVazio, LinhasSkeleton, SkeletonCards, TituloDialogo, acaoTabelaSx,
  useDialogoTelaCheia, useTelaDesktop
} from '../ui'

const VAZIA = { NOME: '', APELIDO: '', area: '', observa: '' }

function PilulaArea({ area }) {
  return (
    <Box component="span" sx={{ display: 'inline-block', px: 1.5, py: 0.5, bgcolor: TOV.canvas, color: TOV.graphite, borderRadius: TOV.radiusFull, fontSize: TOV.type.caption, fontWeight: 600 }}>
      {area || 'Sem área'}
    </Box>
  )
}

export default function Materias() {
  const [materias, setMaterias] = useState([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  // Falha da própria lista: vira `EstadoErro` no corpo, não estado vazio.
  const [erroCarga, setErroCarga] = useState('')
  const [form, setForm] = useState(null)
  const [confirmarFecharForm, setConfirmarFecharForm] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [paraExcluir, setParaExcluir] = useState(null)
  const [excluindo, setExcluindo] = useState(false)
  const [msg, setMsg] = useState('')
  const telaCheia = useDialogoTelaCheia()
  const telaDesktop = useTelaDesktop()
  const formAlterado = useDirtyForm(!!form, form, 'Há dados da matéria que ainda não foram salvos.')

  function abrirForm(dados) {
    setForm({ ...dados })
    setConfirmarFecharForm(false)
  }

  function fecharForm() {
    if (formAlterado) setConfirmarFecharForm(true)
    else setForm(null)
  }

  function carregar() {
    setCarregando(true)
    setErroCarga('')
    api.get(`/materias?busca=${encodeURIComponent(busca)}`)
      .then(setMaterias)
      .catch((e) => {
        setErroCarga(e.message)
        setMaterias([])
      })
      .finally(() => setCarregando(false))
  }

  useEffect(carregar, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    setSalvando(true)
    try {
      const dados = { ...form, NOME: (form.NOME || '').trim(), area: form.area?.trim() || null, APELIDO: form.APELIDO?.trim() || null, observa: form.observa || null }
      if (form.cod_mat) await api.put(`/materias/${form.cod_mat}`, dados)
      else await api.post('/materias', dados)
      setForm(null)
      carregar()
    } catch (e) {
      setMsg(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function excluir() {
    setExcluindo(true)
    try {
      await api.del(`/materias/${paraExcluir.cod_mat}`)
      setParaExcluir(null)
      carregar()
    } catch (e) {
      setMsg(e.message)
      setParaExcluir(null)
    } finally {
      setExcluindo(false)
    }
  }

  const areas = new Set(materias.map((m) => m.area?.trim()).filter(Boolean)).size
  const acoes = (
    <>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => abrirForm(VAZIA)}>
        Nova matéria
      </Button>
    </>
  )

  return (
    <Box>
      <CabecalhoPagina
        variante="operacional"
        titulo="Matérias"
        metadados={carregando || erroCarga ? ' ' : `${materias.length} ${materias.length === 1 ? 'matéria' : 'matérias'} · ${areas} ${areas === 1 ? 'área' : 'áreas'}`}
        acoes={acoes}
      />

      {/* Regra 9: busca e recorte vivem na mesma barra; o cabeçalho fica com
          criação. Aqui a busca morava ao lado de "Nova matéria". */}
      <BarraFiltros>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); carregar() }} sx={{ flex: '1 1 240px', maxWidth: 380 }}>
          <TextField
            fullWidth size="small" label="Buscar matéria" value={busca}
            onChange={(e) => setBusca(e.target.value)}
            inputProps={{ enterKeyHint: 'search' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: TOV.caption, fontSize: TOV.type.titleSm }} />
                </InputAdornment>
              ),
            }}
          />
        </Box>
      </BarraFiltros>

      {/* Lista em cards — celular/tablet */}
      {!telaDesktop && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {carregando && materias.length === 0 && (
          <SkeletonCards quantidade={4} altura={112} colunas="1fr" />
        )}
        {!carregando && erroCarga && (
          <EstadoErro titulo="Não foi possível carregar as matérias" descricao={erroCarga} onTentarNovamente={carregar} />
        )}
        {!carregando && !erroCarga && materias.length === 0 && (
          <CartaoLista><EstadoVazio compacto titulo="Nenhuma matéria encontrada" descricao="Revise a busca ou cadastre uma nova matéria." /></CartaoLista>
        )}
        {materias.map((m) => (
          <CartaoLista key={m.cod_mat}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ fontWeight: 700, fontSize: TOV.type.bodyLg, lineHeight: 1.3 }}>{m.NOME?.trim()}</Box>
                {m.APELIDO?.trim() && (
                  <Box sx={{ fontSize: TOV.type.bodySm, color: TOV.caption, fontWeight: 600, mt: 0.5 }}>{m.APELIDO.trim()}</Box>
                )}
              </Box>
              <PilulaArea area={m.area?.trim()} />
            </Box>
            <Box sx={{ display: 'flex', gap: 1, pt: 1, borderTop: `1px solid ${TOV.divider}` }}>
              <Button size="small" variant="outlined" fullWidth onClick={() => abrirForm(m)}>Editar</Button>
              <Button size="small" variant="outlined" color="error" fullWidth onClick={() => setParaExcluir(m)}>Excluir</Button>
            </Box>
          </CartaoLista>
        ))}
      </Box>}

      {/* Tabela — desktop */}
      {telaDesktop && <TableContainer component={Box} sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 680 }}>
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell>Apelido</TableCell>
              <TableCell>Área</TableCell>
              <TableCell align="right" sx={{ width: 120 }}>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {carregando && materias.length === 0 && (
              <LinhasSkeleton colunas={4} />
            )}
            {!carregando && erroCarga && (
              <TableRow><TableCell colSpan={4} sx={{ p: 2 }}><EstadoErro titulo="Não foi possível carregar as matérias" descricao={erroCarga} onTentarNovamente={carregar} /></TableCell></TableRow>
            )}
            {!carregando && !erroCarga && materias.length === 0 && (
              <TableRow><TableCell colSpan={4} sx={{ p: 0 }}><EstadoVazio titulo="Nenhuma matéria encontrada" descricao="Revise a busca ou cadastre uma nova matéria." /></TableCell></TableRow>
            )}
            {materias.map((m) => (
              <TableRow key={m.cod_mat} hover>
                <TableCell sx={{ fontWeight: 700 }}>{m.NOME?.trim()}</TableCell>
                <TableCell sx={{ color: TOV.graphite }}>{m.APELIDO?.trim() || '—'}</TableCell>
                <TableCell><PilulaArea area={m.area?.trim()} /></TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'inline-flex', gap: 1.5, alignItems: 'center', fontSize: TOV.type.bodySm, fontWeight: 600, color: TOV.caption }}>
                    <Box component="button" type="button" onClick={() => abrirForm(m)}
                      sx={acaoTabelaSx}>
                      Editar
                    </Box>
                    <Box component="span" aria-hidden="true" sx={{ color: TOV.caption }}>·</Box>
                    <Box component="button" type="button" onClick={() => setParaExcluir(m)}
                      sx={{ ...acaoTabelaSx, '&:hover': { color: TOV.danger, textDecorationStyle: 'solid' } }}>
                      Excluir
                    </Box>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>}

      <Dialog open={!!form} onClose={salvando ? undefined : fecharForm} maxWidth="sm" fullWidth fullScreen={telaCheia}>
        <TituloDialogo onFechar={salvando ? undefined : fecharForm}>{form?.cod_mat ? 'Editar matéria' : 'Nova matéria'}</TituloDialogo>
        <DialogContent>
          {form && (
            <Grid container spacing={1.5} sx={{ mt: 0 }}>
              <Grid item xs={12}>
                <TextField fullWidth required label="Nome" value={form.NOME ?? ''}
                  onChange={(e) => setForm({ ...form, NOME: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Apelido" value={form.APELIDO ?? ''}
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
          <Button variant="outlined" onClick={fecharForm} disabled={salvando}>Cancelar</Button>
          <Button variant="contained" onClick={salvar} disabled={!form?.NOME?.trim() || salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>

      <DialogoConfirmacao
        aberto={confirmarFecharForm}
        titulo="Descartar alterações?"
        descricao="As informações preenchidas sobre a matéria serão perdidas."
        rotuloConfirmar="Descartar"
        processando={false}
        onConfirmar={() => { setConfirmarFecharForm(false); setForm(null) }}
        onFechar={() => setConfirmarFecharForm(false)}
      />

      <DialogoConfirmacao
        aberto={!!paraExcluir}
        titulo="Excluir matéria"
        descricao={`Excluir a matéria ${paraExcluir?.NOME?.trim()}? Esta ação não pode ser desfeita.`}
        processando={excluindo}
        onConfirmar={excluir}
        onFechar={() => setParaExcluir(null)}
      />

      <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg('')}>
        <Alert severity="error" onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
