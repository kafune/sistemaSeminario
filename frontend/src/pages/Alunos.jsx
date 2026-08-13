import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Box, Button, InputAdornment, Menu, Pagination, Snackbar, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography, IconButton,
  MenuItem, Tooltip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import CloseIcon from '@mui/icons-material/Close'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { api, abrirArquivo } from '../api'
import { TOV, focusRing } from '../theme'
import {
  BarraFiltros, CabecalhoPagina, CartaoLista, EstadoVazio, LinhaCartao,
  PilulaStatus, SeletorDensidade, resetBotao, useDensidade, usePreferencia, useTelaDesktop,
} from '../ui'
import AlunoForm from './AlunoForm'
import ImportarAlunosDialog from './ImportarAlunosDialog'

const OPCOES_POR_PAGINA = [25, 50, 100]
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
  const [pagina, setPagina] = usePreferencia('alunos.pagina', 1)
  const [porPagina, setPorPagina] = usePreferencia('alunos.porPagina', 50)
  const [densidade, setDensidade] = useDensidade()
  const [formAberto, setFormAberto] = useState(false)
  const [importacaoAberta, setImportacaoAberta] = useState(false)
  const [versaoLista, setVersaoLista] = useState(0)
  const [erro, setErro] = useState('')
  const [menuLinha, setMenuLinha] = useState(null)
  const navigate = useNavigate()
  const telaDesktop = useTelaDesktop()

  useEffect(() => {
    const controller = new AbortController()
    let ativo = true
    setCarregando(true)
    const filtroStatus = status ? `&status=${status}` : ''
    api
      .get(`/alunos?busca=${encodeURIComponent(buscaAtiva)}${filtroStatus}&ordenacao=${ordenacao}&pagina=${pagina}&por_pagina=${porPagina}`, { signal: controller.signal })
      .then((resposta) => { if (ativo) setDados(resposta) })
      .catch((e) => { if (ativo && e.name !== 'AbortError') setErro(e.message) })
      .finally(() => { if (ativo) setCarregando(false) })
    return () => {
      ativo = false
      controller.abort()
    }
  }, [buscaAtiva, status, ordenacao, pagina, porPagina, versaoLista])

  // A primeira execução apenas registra a busca inicial: a página lembrada
  // da sessão anterior não pode ser descartada no carregamento.
  const primeiraBusca = useRef(true)
  useEffect(() => {
    if (primeiraBusca.current) {
      primeiraBusca.current = false
      return undefined
    }
    const temporizador = window.setTimeout(() => {
      setPagina(1)
      setBuscaAtiva(busca)
    }, 350)
    return () => window.clearTimeout(temporizador)
  }, [busca, setPagina])

  // Menos registros no filtro do que a página lembrada exige: volta ao começo.
  const totalPaginas = Math.max(1, Math.ceil(dados.total / porPagina))
  useEffect(() => {
    if (!carregando && pagina > totalPaginas) setPagina(1)
  }, [carregando, pagina, totalPaginas, setPagina])

  const recarregarLista = useCallback(() => {
    setPagina(1)
    setVersaoLista((versao) => versao + 1)
  }, [])

  function pesquisar(e) {
    e.preventDefault()
    setPagina(1)
    setBuscaAtiva(busca)
  }

  const inicio = dados.total === 0 ? 0 : (pagina - 1) * porPagina + 1
  const fim = Math.min(pagina * porPagina, dados.total)
  const alunoDoMenu = menuLinha?.aluno

  const barraTabela = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
      <Typography sx={{ fontSize: TOV.type.body, color: TOV.caption, fontVariantNumeric: 'tabular-nums' }}>
        {dados.total === 0 ? 'Nenhum registro' : `Mostrando ${inicio}–${fim} de ${dados.total}`}
      </Typography>
      {totalPaginas > 1 && (
        <Pagination
          size="small" count={totalPaginas} page={Math.min(pagina, totalPaginas)}
          onChange={(_, p) => setPagina(p)} shape="rounded" siblingCount={0}
        />
      )}
      <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        {telaDesktop && <SeletorDensidade valor={densidade} onChange={setDensidade} />}
        <TextField
          select size="small" value={porPagina}
          onChange={(e) => { setPorPagina(Number(e.target.value)); setPagina(1) }}
          inputProps={{ 'aria-label': 'Registros por página' }}
          sx={{ width: 132, '& .MuiOutlinedInput-root': { height: 40 } }}
        >
          {OPCOES_POR_PAGINA.map((opcao) => (
            <MenuItem key={opcao} value={opcao}>{opcao} por página</MenuItem>
          ))}
        </TextField>
      </Box>
    </Box>
  )

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

      {barraTabela}

      {/* Lista em cards — celular */}
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

      {/* Tabela — tablet e desktop */}
      {telaDesktop && <TableContainer component={Box} data-densidade={densidade} sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 760 }}>
          <TableHead>
            <TableRow>
              <TableCell align="right" sx={{ width: 120 }}>Matrícula</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Telefone</TableCell>
              <TableCell>Celular</TableCell>
              <TableCell sx={{ width: 140 }}>Situação</TableCell>
              <TableCell align="right" sx={{ width: 108 }}>Ações</TableCell>
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
                <TableCell align="right" sx={{ color: TOV.caption, fontWeight: 600 }}>{a.cod_alu}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{a.nome}</TableCell>
                <TableCell sx={{ color: TOV.graphite }}>{a.fone1 || '—'}</TableCell>
                <TableCell sx={{ color: TOV.graphite }}>{a.celular || '—'}</TableCell>
                <TableCell><PilulaStatus status={a.status} /></TableCell>
                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                  <Box sx={{ display: 'inline-flex', gap: 0.5, alignItems: 'center' }}>
                    <Tooltip title="Boletim em PDF">
                      <IconButton
                        aria-label={`Boletim em PDF de ${a.nome}`}
                        sx={{ color: TOV.caption, '&:hover': { color: TOV.coral } }}
                        onClick={() => abrirArquivo(`/relatorios/boletim/${a.cod_alu}`).catch((e) => setErro(e.message))}
                      >
                        <PictureAsPdfOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <IconButton
                      aria-label={`Mais ações para ${a.nome}`}
                      aria-haspopup="menu"
                      sx={{ color: TOV.caption, '&:hover': { color: TOV.coral } }}
                      onClick={(e) => setMenuLinha({ ancora: e.currentTarget, aluno: a })}
                    >
                      <MoreHorizIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>}

      {totalPaginas > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Pagination
            count={totalPaginas} page={Math.min(pagina, totalPaginas)}
            onChange={(_, p) => { setPagina(p); window.scrollTo({ top: 0 }) }}
            shape="rounded" siblingCount={0}
          />
        </Box>
      )}

      <Menu
        anchorEl={menuLinha?.ancora}
        open={!!menuLinha}
        onClose={() => setMenuLinha(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        MenuListProps={{ 'aria-label': `Ações de ${alunoDoMenu?.nome || 'aluno'}` }}
      >
        <MenuItem onClick={() => { setMenuLinha(null); navigate(`/alunos/${alunoDoMenu.cod_alu}`) }}>
          <OpenInNewIcon fontSize="small" sx={{ mr: 1.5, color: TOV.caption }} />
          Abrir ficha
        </MenuItem>
        <MenuItem
          disabled={!alunoDoMenu?.celular}
          onClick={() => { setMenuLinha(null); navigate(`/whatsapp?aluno=${alunoDoMenu.cod_alu}`) }}
        >
          <WhatsAppIcon fontSize="small" sx={{ mr: 1.5, color: TOV.caption }} />
          Conversa no WhatsApp
        </MenuItem>
      </Menu>

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
