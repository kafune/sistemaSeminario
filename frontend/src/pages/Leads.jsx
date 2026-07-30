import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, InputAdornment, MenuItem, Pagination, Paper, Snackbar, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import SearchIcon from '@mui/icons-material/Search'
import { api } from '../api'
import { TOV } from '../theme'
import {
  AvatarIniciais, CabecalhoPagina, CartaoLista, LinhaCartao, cardSx, resetBotao,
  useDialogoTelaCheia, useTelaDesktop,
} from '../ui'
import ImportarLeadsDialog from './ImportarLeadsDialog'

const FUNIL = {
  NOVO: 'Novo',
  NUTRICAO: 'Em nutrição',
  QUALIFICADO: 'Qualificado',
  OPORTUNIDADE: 'Oportunidade',
  CONVERTIDO: 'Convertido',
  DESCARTADO: 'Descartado',
}

const CONSENTIMENTO = {
  PENDENTE: ['Opt-in pendente', 'default'],
  CONFIRMADO: ['Opt-in confirmado', 'success'],
  RECUSADO: ['Sem consentimento', 'warning'],
  REVOGADO: ['Opt-out', 'error'],
}

const FORM_INICIAL = {
  nome: '',
  telefone: '',
  e_mail: '',
  origem: '',
  campanha: '',
  captado_em: new Date().toISOString().slice(0, 10),
  tags: '',
  status: 'ATIVO',
  status_funil: 'NOVO',
  consentimento_status: 'PENDENTE',
  consentimento_origem: '',
}

function PilulaConsentimento({ status }) {
  const [rotulo, cor] = CONSENTIMENTO[status] || [status, 'default']
  return <Chip size="small" label={rotulo} color={cor} />
}

function FormLead({ form, setForm }) {
  const atualizar = (campo) => (e) => setForm({ ...form, [campo]: e.target.value })
  return (
    <Grid container spacing={1.5} sx={{ mt: 0 }}>
      <Grid item xs={12} sm={7}>
        <TextField fullWidth required autoFocus label="Nome" value={form.nome} onChange={atualizar('nome')} />
      </Grid>
      <Grid item xs={12} sm={5}>
        <TextField fullWidth required label="WhatsApp" value={form.telefone} onChange={atualizar('telefone')} />
      </Grid>
      <Grid item xs={12}>
        <TextField fullWidth label="E-mail" value={form.e_mail || ''} onChange={atualizar('e_mail')} />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField fullWidth label="Origem" value={form.origem || ''} onChange={atualizar('origem')} />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField fullWidth label="Campanha" value={form.campanha || ''} onChange={atualizar('campanha')} />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          fullWidth type="date" label="Data de captação" value={form.captado_em || ''}
          onChange={atualizar('captado_em')} InputLabelProps={{ shrink: true }}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField select fullWidth label="Status no funil" value={form.status_funil} onChange={atualizar('status_funil')}>
          {Object.entries(FUNIL).map(([valor, rotulo]) => <MenuItem key={valor} value={valor}>{rotulo}</MenuItem>)}
        </TextField>
      </Grid>
      <Grid item xs={12}>
        <TextField fullWidth label="Tags / segmentos" value={form.tags || ''} onChange={atualizar('tags')} helperText="Separe as tags por vírgula." />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField select fullWidth label="Consentimento" value={form.consentimento_status} onChange={atualizar('consentimento_status')}>
          {Object.entries(CONSENTIMENTO).map(([valor, [rotulo]]) => <MenuItem key={valor} value={valor}>{rotulo}</MenuItem>)}
        </TextField>
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField fullWidth label="Origem do consentimento" value={form.consentimento_origem || ''} onChange={atualizar('consentimento_origem')} placeholder="Ex.: formulário da campanha" />
      </Grid>
      <Grid item xs={12}>
        <TextField select fullWidth label="Status do cadastro" value={form.status} onChange={atualizar('status')}>
          <MenuItem value="ATIVO">Ativo</MenuItem>
          <MenuItem value="INATIVO">Inativo</MenuItem>
        </TextField>
      </Grid>
    </Grid>
  )
}

export default function Leads() {
  const [dados, setDados] = useState({ total: 0, itens: [] })
  const [opcoes, setOpcoes] = useState({ origens: [], campanhas: [], tags: [] })
  const [busca, setBusca] = useState('')
  const [filtros, setFiltros] = useState({ status: '', origem: '', campanha: '', status_funil: '', consentimento: '' })
  const [pagina, setPagina] = useState(1)
  const [carregando, setCarregando] = useState(true)
  const [importacaoAberta, setImportacaoAberta] = useState(false)
  const [form, setForm] = useState(null)
  const [leadEditando, setLeadEditando] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const telaCheia = useDialogoTelaCheia()
  const telaDesktop = useTelaDesktop()
  const porPagina = 50

  const carregar = useCallback((signal) => {
    setCarregando(true)
    const params = new URLSearchParams({
      pagina,
      por_pagina: porPagina,
      busca,
      ...Object.fromEntries(Object.entries(filtros).filter(([, valor]) => valor)),
    })
    api.get(`/leads?${params}`, { signal })
      .then(setDados)
      .catch((e) => { if (e.name !== 'AbortError') setErro(e.message) })
      .finally(() => { if (!signal?.aborted) setCarregando(false) })
  }, [pagina, busca, filtros])

  const carregarOpcoes = useCallback(() => {
    api.getCached('/leads/opcoes').then(setOpcoes).catch(() => {})
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => carregar(controller.signal), 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [carregar])
  useEffect(carregarOpcoes, [carregarOpcoes])

  function mudarFiltro(campo, valor) {
    setPagina(1)
    setFiltros((atuais) => ({ ...atuais, [campo]: valor }))
  }

  function novo() {
    setLeadEditando(null)
    setForm({ ...FORM_INICIAL })
  }

  function editar(lead) {
    setLeadEditando(lead)
    setForm({
      ...FORM_INICIAL,
      ...lead,
      tags: lead.tags || '',
      captado_em: lead.captado_em || '',
    })
  }

  async function salvar() {
    setSalvando(true)
    try {
      if (leadEditando) {
        await api.put(`/leads/${leadEditando.id}`, form)
        setOk('Lead atualizado.')
      } else {
        await api.post('/leads', form)
        setOk('Lead criado.')
      }
      setForm(null)
      carregar()
      carregarOpcoes()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(dados.total / porPagina))
  const intervalo = useMemo(() => {
    if (!dados.total) return [0, 0]
    const inicio = (pagina - 1) * porPagina + 1
    return [inicio, Math.min(dados.total, inicio + dados.itens.length - 1)]
  }, [dados, pagina])

  const acoes = (
    <>
      <Button variant="outlined" startIcon={<FileUploadIcon />} onClick={() => setImportacaoAberta(true)}>Importar</Button>
      <Button variant="contained" startIcon={<AddIcon />} onClick={novo}>Novo lead</Button>
    </>
  )

  return (
    <Box>
      <CabecalhoPagina
        titulo="Leads"
        subtitulo={carregando && !dados.itens.length ? 'Carregando base de marketing…' : `${dados.total} ${dados.total === 1 ? 'contato encontrado' : 'contatos encontrados'}`}
        acoes={acoes}
      />

      <Box sx={{ ...cardSx, p: 2, mb: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr', lg: '2fr repeat(4,1fr)' }, gap: 1.25 }}>
        <TextField
          size="small" label="Buscar" value={busca}
          onChange={(e) => { setBusca(e.target.value); setPagina(1) }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <TextField select size="small" label="Status" value={filtros.status} onChange={(e) => mudarFiltro('status', e.target.value)}>
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="ATIVO">Ativos</MenuItem>
          <MenuItem value="INATIVO">Inativos</MenuItem>
        </TextField>
        <TextField select size="small" label="Origem" value={filtros.origem} onChange={(e) => mudarFiltro('origem', e.target.value)}>
          <MenuItem value="">Todas</MenuItem>
          {opcoes.origens?.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Campanha" value={filtros.campanha} onChange={(e) => mudarFiltro('campanha', e.target.value)}>
          <MenuItem value="">Todas</MenuItem>
          {opcoes.campanhas?.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Funil" value={filtros.status_funil} onChange={(e) => mudarFiltro('status_funil', e.target.value)}>
          <MenuItem value="">Todos</MenuItem>
          {Object.entries(FUNIL).map(([valor, rotulo]) => <MenuItem key={valor} value={valor}>{rotulo}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Consentimento" value={filtros.consentimento} onChange={(e) => mudarFiltro('consentimento', e.target.value)}>
          <MenuItem value="">Todos</MenuItem>
          {Object.entries(CONSENTIMENTO).map(([valor, [rotulo]]) => <MenuItem key={valor} value={valor}>{rotulo}</MenuItem>)}
        </TextField>
      </Box>

      {!telaDesktop && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {dados.itens.map((lead) => (
          <CartaoLista key={lead.id} onClick={() => editar(lead)}>
            <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center' }}>
              <AvatarIniciais nome={lead.nome} tamanho={42} radius={12} fontSize={15} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontWeight: 700 }}>{lead.nome}</Typography>
                <Typography sx={{ color: TOV.caption, fontSize: 12 }}>{lead.telefone}</Typography>
              </Box>
              <PilulaConsentimento status={lead.consentimento_status} />
            </Box>
            <LinhaCartao rotulo="Campanha" valor={lead.campanha || lead.origem} />
            <LinhaCartao rotulo="Funil" valor={FUNIL[lead.status_funil] || lead.status_funil} />
          </CartaoLista>
        ))}
      </Box>}

      {telaDesktop && <TableContainer component={Paper} elevation={0} sx={{ boxShadow: TOV.shadowCard }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Lead</TableCell>
              <TableCell>Origem / campanha</TableCell>
              <TableCell>Tags</TableCell>
              <TableCell>Funil</TableCell>
              <TableCell>Consentimento</TableCell>
              <TableCell align="right">Ação</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!carregando && dados.itens.length === 0 && (
              <TableRow><TableCell colSpan={6} sx={{ py: 6, textAlign: 'center', color: TOV.caption }}>Nenhum lead encontrado.</TableCell></TableRow>
            )}
            {dados.itens.map((lead) => (
              <TableRow key={lead.id} hover>
                <TableCell>
                  <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{lead.nome}</Typography>
                  <Typography sx={{ color: TOV.caption, fontSize: 12 }}>{lead.telefone}{lead.e_mail ? ` · ${lead.e_mail}` : ''}</Typography>
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: 14 }}>{lead.campanha || '—'}</Typography>
                  <Typography sx={{ color: TOV.caption, fontSize: 12 }}>{lead.origem || 'Origem não informada'}</Typography>
                </TableCell>
                <TableCell sx={{ color: TOV.slate, maxWidth: 200 }}>{lead.tags || '—'}</TableCell>
                <TableCell><Chip size="small" variant="outlined" label={FUNIL[lead.status_funil] || lead.status_funil} /></TableCell>
                <TableCell><PilulaConsentimento status={lead.consentimento_status} /></TableCell>
                <TableCell align="right">
                  <Box component="button" type="button" onClick={() => editar(lead)} sx={{ ...resetBotao, fontSize: 13, fontWeight: 700, color: TOV.caption, '&:hover': { color: TOV.coral } }}>Editar</Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2.25, gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ color: TOV.caption, fontSize: 14 }}>
          {dados.total ? `Mostrando ${intervalo[0]}–${intervalo[1]} de ${dados.total}` : 'Nenhum registro'}
        </Typography>
        <Pagination count={totalPaginas} page={pagina} onChange={(_, valor) => setPagina(valor)} shape="rounded" siblingCount={0} />
      </Box>

      <ImportarLeadsDialog
        aberto={importacaoAberta}
        aoFechar={() => setImportacaoAberta(false)}
        aoImportar={() => { carregar(); carregarOpcoes() }}
      />

      <Dialog open={!!form} onClose={salvando ? undefined : () => setForm(null)} maxWidth="sm" fullWidth fullScreen={telaCheia}>
        <DialogTitle>{leadEditando ? 'Editar lead' : 'Novo lead'}</DialogTitle>
        <DialogContent>{form && <FormLead form={form} setForm={setForm} />}</DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button variant="outlined" onClick={() => setForm(null)} disabled={salvando}>Cancelar</Button>
          <Button variant="contained" onClick={salvar} disabled={salvando || !form?.nome.trim() || !form?.telefone.trim()}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!erro} autoHideDuration={6000} onClose={() => setErro('')}>
        <Alert severity="error" onClose={() => setErro('')}>{erro}</Alert>
      </Snackbar>
      <Snackbar open={!!ok} autoHideDuration={3000} onClose={() => setOk('')}>
        <Alert severity="success" onClose={() => setOk('')}>{ok}</Alert>
      </Snackbar>
    </Box>
  )
}
