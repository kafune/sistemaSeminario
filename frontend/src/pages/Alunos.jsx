import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Box, Button, InputAdornment, Pagination, Paper, Snackbar, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography, IconButton,
  MenuItem,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import CloseIcon from '@mui/icons-material/Close'
import { api, abrirArquivo } from '../api'
import { TOV, focusRing } from '../theme'
import {
  BarraFiltros, CabecalhoPagina, CartaoLista, EstadoVazio, LinhaCartao,
  PilulaStatus, resetBotao, useTelaDesktop,
} from '../ui'
import AlunoForm from './AlunoForm'
import ImportarAlunosDialog from './ImportarAlunosDialog'

const POR_PAGINA = 15
const FILTROS = [
  { rotulo: 'Todos', valor: '' },
  { rotulo: 'Pré-cadastros', valor: 'P' },
  { rotulo: 'Ativos', valor: 'A' },
  { rotulo: 'Inativos', valor: 'I' },
  { rotulo: 'Formados', valor: 'F' },
]
const ORDENACOES = [
  { rotulo: 'Nome (A–Z)', valor: 'nome_asc' },
  { rotulo: 'Nome (Z–A)', valor: 'nome_desc' },
  { rotulo: 'Mais recentes', valor: 'recentes' },
  { rotulo: 'Mais antigos', valor: 'antigos' },
]

function ChipFiltro({ ativo, children, onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      sx={{
        ...resetBotao,
        px: 2, py: 1, borderRadius: TOV.radiusFull, fontSize: TOV.type.body, fontWeight: 600, userSelect: 'none',
        minHeight: 44, flexShrink: 0,
        bgcolor: ativo ? TOV.graphite : TOV.surface, color: ativo ? TOV.onDark : TOV.graphite,
        border: `1px solid ${ativo ? TOV.graphite : TOV.border}`,
        boxShadow: 'none',
        '&:hover': ativo ? {} : { color: TOV.ink, borderColor: TOV.caption },
        '&:focus-visible': focusRing,
      }}
    >
      {children}
    </Box>
  )
}

export default function Alunos() {
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState('')
  const [status, setStatus] = useState('')
  const [ordenacao, setOrdenacao] = useState('nome_asc')
  const [dados, setDados] = useState({ total: 0, itens: [] })
  const [carregando, setCarregando] = useState(true)
  const [pagina, setPagina] = useState(1)
  const [formAberto, setFormAberto] = useState(false)
  const [importacaoAberta, setImportacaoAberta] = useState(false)
  const [versaoLista, setVersaoLista] = useState(0)
  const [erro, setErro] = useState('')
  const navigate = useNavigate()
  const telaDesktop = useTelaDesktop()

  useEffect(() => {
    const controller = new AbortController()
    let ativo = true
    setCarregando(true)
    const filtroStatus = status ? `&status=${status}` : ''
    api
      .get(`/alunos?busca=${encodeURIComponent(buscaAtiva)}${filtroStatus}&ordenacao=${ordenacao}&pagina=${pagina}&por_pagina=${POR_PAGINA}`, { signal: controller.signal })
      .then((resposta) => { if (ativo) setDados(resposta) })
      .catch((e) => { if (ativo && e.name !== 'AbortError') setErro(e.message) })
      .finally(() => { if (ativo) setCarregando(false) })
    return () => {
      ativo = false
      controller.abort()
    }
  }, [buscaAtiva, status, ordenacao, pagina, versaoLista])

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      setPagina(1)
      setBuscaAtiva(busca)
    }, 350)
    return () => window.clearTimeout(temporizador)
  }, [busca])

  const recarregarLista = useCallback(() => {
    setPagina(1)
    setVersaoLista((versao) => versao + 1)
  }, [])

  function pesquisar(e) {
    e.preventDefault()
    setPagina(1)
    setBuscaAtiva(busca)
  }

  const totalPaginas = Math.max(1, Math.ceil(dados.total / POR_PAGINA))
  const inicio = dados.total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1
  const fim = Math.min(pagina * POR_PAGINA, dados.total)

  const acoes = (
    <>
      <Box component="form" onSubmit={pesquisar}>
        <TextField
          size="small" placeholder="Buscar por nome ou matrícula" value={busca}
          onChange={(e) => setBusca(e.target.value)}
          sx={{ minWidth: { xs: '100%', sm: 280 }, '& .MuiOutlinedInput-root': { height: 46, bgcolor: TOV.white } }}
          inputProps={{ enterKeyHint: 'search', 'aria-label': 'Buscar por nome ou matrícula' }}
          InputProps={{
            startAdornment: (<InputAdornment position="start"><SearchIcon sx={{ fontSize: TOV.type.titleSm, color: TOV.caption }} /></InputAdornment>),
            endAdornment: busca ? (
              <InputAdornment position="end">
                <IconButton size="small" aria-label="Limpar busca" onClick={() => setBusca('')}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
        />
      </Box>
      <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportacaoAberta(true)} sx={{ height: 46 }}>
        Importar
      </Button>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormAberto(true)} sx={{ height: 46 }}>
        Novo aluno
      </Button>
    </>
  )

  return (
    <Box>
      <CabecalhoPagina
        titulo="Alunos"
        subtitulo={`${dados.total} ${dados.total === 1 ? 'registro' : 'registros'}`}
        acoes={acoes}
      />

      <BarraFiltros
        sx={{
          display: 'flex', flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { sm: 'center' }, justifyContent: 'space-between',
          gap: 1.5, mb: 2,
        }}
      >
        <Box
          aria-label="Filtrar alunos por status"
          sx={{
            display: 'flex', gap: 1.5, overflowX: 'auto', pb: 0.5,
            width: '100%', maxWidth: '100%', minWidth: 0,
            overscrollBehaviorInline: 'contain',
            scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {FILTROS.map((f) => (
            <ChipFiltro key={f.valor} ativo={status === f.valor} onClick={() => { setStatus(f.valor); setPagina(1) }}>
              {f.rotulo}
            </ChipFiltro>
          ))}
        </Box>
        <TextField
          select
          size="small"
          label="Ordenar por"
          value={ordenacao}
          onChange={(e) => { setOrdenacao(e.target.value); setPagina(1) }}
          sx={{
            width: { xs: '100%', sm: 190 }, flexShrink: 0,
            '& .MuiOutlinedInput-root': { height: 46, bgcolor: TOV.white },
          }}
          inputProps={{ 'aria-label': 'Ordenar alunos' }}
        >
          {ORDENACOES.map((opcao) => (
            <MenuItem key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</MenuItem>
          ))}
        </TextField>
      </BarraFiltros>

      {/* Lista em cards — celular/tablet */}
      {!telaDesktop && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {carregando && dados.itens.length === 0 && (
          <CartaoLista sx={{ alignItems: 'center', color: TOV.caption, py: 4 }}>Carregando…</CartaoLista>
        )}
        {!carregando && dados.itens.length === 0 && (
          <CartaoLista><EstadoVazio compacto titulo="Nenhum aluno encontrado" descricao="Ajuste a busca ou os filtros para ver outros registros." /></CartaoLista>
        )}
        {dados.itens.map((a) => (
          <CartaoLista key={a.cod_alu} onClick={() => navigate(`/alunos/${a.cod_alu}`)}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ fontWeight: 700, fontSize: TOV.type.bodyLg, lineHeight: 1.3 }}>{a.nome}</Box>
                <Box sx={{ fontSize: TOV.type.bodySm, color: TOV.caption, fontWeight: 600, mt: 0.5 }}>Matrícula {a.cod_alu}</Box>
              </Box>
              <PilulaStatus status={a.status} sx={{ flexShrink: 0 }} />
            </Box>
            <LinhaCartao rotulo="Celular" valor={a.celular || a.fone1} />
          </CartaoLista>
        ))}
      </Box>}

      {/* Tabela — desktop */}
      {telaDesktop && <TableContainer component={Paper} elevation={0} sx={{ boxShadow: TOV.shadowCard }}>
        <Table sx={{ minWidth: 760 }}>
          <TableHead>
            <TableRow>
              <TableCell>Matrícula</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Telefone</TableCell>
              <TableCell>Celular</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {carregando && dados.itens.length === 0 && (
              <TableRow><TableCell colSpan={6} sx={{ py: 4, textAlign: 'center', color: TOV.caption }}>Carregando…</TableCell></TableRow>
            )}
            {!carregando && dados.itens.length === 0 && (
              <TableRow><TableCell colSpan={6} sx={{ p: 0 }}><EstadoVazio titulo="Nenhum aluno encontrado" descricao="Ajuste a busca ou os filtros para ver outros registros." /></TableCell></TableRow>
            )}
            {dados.itens.map((a) => (
              <TableRow key={a.cod_alu} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/alunos/${a.cod_alu}`)}>
                <TableCell sx={{ color: TOV.caption, fontWeight: 600 }}>{a.cod_alu}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{a.nome}</TableCell>
                <TableCell sx={{ color: TOV.slate }}>{a.fone1 || '—'}</TableCell>
                <TableCell sx={{ color: TOV.slate }}>{a.celular || '—'}</TableCell>
                <TableCell><PilulaStatus status={a.status} /></TableCell>
                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                  <Box sx={{ display: 'inline-flex', gap: 1.5, alignItems: 'center', fontSize: TOV.type.bodySm, fontWeight: 600, color: TOV.caption }}>
                    <Box component="button" type="button" sx={{ ...resetBotao, '&:hover': { color: TOV.coral } }} onClick={() => navigate(`/alunos/${a.cod_alu}`)}>Ver</Box>
                    <Box component="span" sx={{ color: TOV.border }}>·</Box>
                    <Box component="button" type="button" title="Boletim em PDF" sx={{ ...resetBotao, '&:hover': { color: TOV.coral } }} onClick={() => abrirArquivo(`/relatorios/boletim/${a.cod_alu}`).catch((e) => setErro(e.message))}>PDF</Box>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>}

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2.5, flexWrap: 'wrap', gap: 1 }}>
        <Typography sx={{ fontSize: TOV.type.body, color: TOV.caption }}>
          {dados.total === 0 ? 'Nenhum registro' : `Mostrando ${inicio}–${fim} de ${dados.total}`}
        </Typography>
        <Pagination
          count={totalPaginas} page={pagina} onChange={(_, p) => setPagina(p)} shape="rounded" siblingCount={0}
        />
      </Box>

      <ImportarAlunosDialog
        aberto={importacaoAberta}
        aoFechar={() => setImportacaoAberta(false)}
        aoImportar={recarregarLista}
      />
      <AlunoForm
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
        aoSalvar={(novo) => { setFormAberto(false); navigate(`/alunos/${novo.cod_alu}`) }}
      />
      <Snackbar open={!!erro} autoHideDuration={6000} onClose={() => setErro('')}>
        <Alert severity="error" onClose={() => setErro('')}>{erro}</Alert>
      </Snackbar>
    </Box>
  )
}
