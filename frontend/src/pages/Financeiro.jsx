import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, InputAdornment, LinearProgress, MenuItem,
  Snackbar, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material'
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined'
import AddIcon from '@mui/icons-material/Add'
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined'
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined'
import { api } from '../api'
import { TOV } from '../theme'
import {
  BarraAcaoFixa, BarraFiltros, CabecalhoPagina, CardMetrica, CartaoLista,
  EstadoVazio, LinhasSkeleton, SkeletonCards, StatusBadge, Superficie,
  cardSx, resetBotao, useDialogoTelaCheia, useTelaDesktop,
} from '../ui'
import { formatarCompetencia, formatarDataBr, formatarMoeda } from '../formatters'
import { DialogoPagamento, SeloSituacao, numeroDoCampo, hojeIso } from './FinanceiroComum'

const SITUACOES_FILTRO = [
  { valor: '', rotulo: 'Todas as situações' },
  { valor: 'VENCIDA', rotulo: 'Vencidas' },
  { valor: 'ABERTA', rotulo: 'Em aberto' },
  { valor: 'PARCIAL', rotulo: 'Pagas em parte' },
  { valor: 'PAGA', rotulo: 'Pagas' },
  { valor: 'CANCELADA', rotulo: 'Canceladas' },
  { valor: 'ISENTA', rotulo: 'Isentas' },
]

const TIPOS_FILTRO = [
  { valor: '', rotulo: 'Matrícula e mensalidades' },
  { valor: 'MATRICULA', rotulo: 'Só matrícula' },
  { valor: 'MENSALIDADE', rotulo: 'Só mensalidades' },
  { valor: 'AVULSA', rotulo: 'Só avulsas' },
]

const POR_PAGINA = 50

export default function Financeiro() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const telaDesktop = useTelaDesktop()
  const telaCheia = useDialogoTelaCheia()

  const [painel, setPainel] = useState(null)
  const [opcoes, setOpcoes] = useState({ turmas: [], meses: [] })
  const [alunos, setAlunos] = useState([])
  const [lista, setLista] = useState({ cobrancas: [], total: 0, saldo: 0, pagina: 1, paginas: 1 })
  const [carregandoPainel, setCarregandoPainel] = useState(true)
  const [carregandoLista, setCarregandoLista] = useState(true)
  const [erro, setErro] = useState('')

  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [turma, setTurma] = useState(searchParams.get('turma') || '')
  const [situacao, setSituacao] = useState(searchParams.get('situacao') || '')
  const [mes, setMes] = useState(searchParams.get('mes') || '')
  const [tipo, setTipo] = useState('')
  const [pagina, setPagina] = useState(1)
  const [versao, setVersao] = useState(0)

  const [selecionadas, setSelecionadas] = useState([])
  const [cobrancaPagando, setCobrancaPagando] = useState(null)
  const [processando, setProcessando] = useState(false)
  const [novaAberta, setNovaAberta] = useState(false)
  const [nova, setNova] = useState({ cod_alu: '', cod_tur: '', descricao: '', valor: '', vencimento: hojeIso() })
  const [msg, setMsg] = useState('')
  const [ehErro, setEhErro] = useState(true)
  const avisar = (texto, falhou = true) => { setEhErro(falhou); setMsg(texto) }
  const recarregar = useCallback(() => setVersao((atual) => atual + 1), [])

  const carregarPainel = useCallback(() => {
    setCarregandoPainel(true)
    api.get('/financeiro/resumo')
      .then(setPainel)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregandoPainel(false))
  }, [])

  useEffect(() => { carregarPainel() }, [carregarPainel, versao])

  useEffect(() => {
    api.get('/financeiro/opcoes').then(setOpcoes).catch(() => setOpcoes({ turmas: [], meses: [] }))
  }, [versao])

  // A busca espera a digitação parar: cada tecla não vale uma consulta.
  useEffect(() => {
    const atraso = window.setTimeout(() => setBuscaAplicada(busca.trim()), 350)
    return () => window.clearTimeout(atraso)
  }, [busca])

  // Trocar o recorte recomeça da primeira página; ficar na página 7 de um
  // filtro que agora tem duas é uma tela vazia sem motivo.
  useEffect(() => { setPagina(1) }, [buscaAplicada, turma, situacao, tipo, mes])

  useEffect(() => {
    const controlador = new AbortController()
    const parametros = new URLSearchParams({ pagina: String(pagina), por_pagina: String(POR_PAGINA) })
    if (turma) parametros.set('cod_tur', turma)
    if (situacao) parametros.set('situacao', situacao)
    if (tipo) parametros.set('tipo', tipo)
    if (mes) parametros.set('mes', mes)
    if (buscaAplicada) parametros.set('busca', buscaAplicada)

    setCarregandoLista(true)
    setErro('')
    api.get(`/financeiro/cobrancas?${parametros}`, { signal: controlador.signal })
      .then((resposta) => {
        setLista(resposta)
        setSelecionadas([])
      })
      .catch((e) => {
        // O cancelamento é o caminho normal enquanto alguém digita.
        if (e.name !== 'AbortError') setErro(e.message)
      })
      .finally(() => {
        if (!controlador.signal.aborted) setCarregandoLista(false)
      })
    return () => controlador.abort()
  }, [buscaAplicada, turma, situacao, tipo, mes, pagina, versao])

  // O recorte vive na URL: recarregar a página e voltar do extrato preservam
  // o que a pessoa escolheu.
  useEffect(() => {
    const proximo = new URLSearchParams()
    if (turma) proximo.set('turma', turma)
    if (situacao) proximo.set('situacao', situacao)
    if (mes) proximo.set('mes', mes)
    setSearchParams(proximo, { replace: true })
  }, [turma, situacao, mes, setSearchParams])

  const cobrancas = lista.cobrancas || []
  const selecionaveis = useMemo(
    () => cobrancas.filter((item) => item.saldo > 0 && !['CANCELADA', 'ISENTA'].includes(item.status)),
    [cobrancas],
  )
  const totalSelecionado = useMemo(
    () => cobrancas.filter((item) => selecionadas.includes(item.id)).reduce((soma, item) => soma + item.saldo, 0),
    [cobrancas, selecionadas],
  )

  function alternar(id) {
    setSelecionadas((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]))
  }

  function alternarTodas() {
    setSelecionadas((atual) => (atual.length === selecionaveis.length ? [] : selecionaveis.map((item) => item.id)))
  }

  async function lancarPagamento(dados) {
    setProcessando(true)
    try {
      await api.post(`/financeiro/cobrancas/${cobrancaPagando.id}/pagamentos`, dados)
      setCobrancaPagando(null)
      avisar('Pagamento lançado.', false)
      recarregar()
    } catch (e) {
      avisar(e.message)
    } finally {
      setProcessando(false)
    }
  }

  async function marcarSelecionadasComoPagas() {
    setProcessando(true)
    try {
      const resposta = await api.post('/financeiro/cobrancas/pagamentos-lote', {
        ids: selecionadas,
        data_pagamento: hojeIso(),
        forma: 'PIX',
      })
      avisar(
        `${resposta.quitadas} cobrança(s) marcada(s) como paga(s).${resposta.ignoradas ? ` ${resposta.ignoradas} já estava(m) quitada(s).` : ''}`,
        false,
      )
      recarregar()
    } catch (e) {
      avisar(e.message)
    } finally {
      setProcessando(false)
    }
  }

  async function criarAvulsa() {
    setProcessando(true)
    try {
      await api.post('/financeiro/cobrancas', {
        cod_alu: Number(nova.cod_alu),
        cod_tur: nova.cod_tur ? Number(nova.cod_tur) : null,
        tipo: 'AVULSA',
        descricao: nova.descricao.trim(),
        valor: numeroDoCampo(nova.valor),
        vencimento: nova.vencimento,
      })
      setNovaAberta(false)
      avisar('Cobrança avulsa criada.', false)
      recarregar()
    } catch (e) {
      avisar(e.message)
    } finally {
      setProcessando(false)
    }
  }

  function abrirNova() {
    setNova({ cod_alu: '', cod_tur: turma || '', descricao: '', valor: '', vencimento: hojeIso() })
    setNovaAberta(true)
    // A lista de alunos só desce quando o formulário que precisa dela abre.
    if (alunos.length === 0) {
      api.getCached('/financeiro/opcoes/alunos').then(setAlunos).catch(() => setAlunos([]))
    }
  }

  const podeCriar = nova.cod_alu && nova.descricao.trim() && numeroDoCampo(nova.valor) > 0 && nova.vencimento
  const alternarRecorte = (proxima) => setSituacao((atual) => (atual === proxima ? '' : proxima))

  const acoes = (
    <>
      <Button
        variant="outlined"
        startIcon={<AccountBalanceOutlinedIcon />}
        onClick={() => navigate('/financeiro/conciliacao')}
      >
        Conciliação
        {painel?.conciliacao_pendente ? ` · ${painel.conciliacao_pendente}` : ''}
      </Button>
      <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNova}>Cobrança avulsa</Button>
    </>
  )

  return (
    <Box>
      <CabecalhoPagina
        variante="operacional"
        titulo="Financeiro"
        descricao="Matrícula e mensalidades de cada turma, baixa dos pagamentos e o que o banco já identificou."
        metadados={`${lista.total} cobrança(s) no recorte · ${formatarMoeda(lista.saldo)} em aberto`}
        acoes={acoes}
      />

      {erro && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={recarregar}>Tentar novamente</Button>}>{erro}</Alert>
      )}

      {carregandoPainel && !painel ? (
        <SkeletonCards quantidade={4} altura={140} sx={{ mb: 2.5 }} />
      ) : painel && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))', lg: 'repeat(4,minmax(0,1fr))' }, gap: 2, mb: 2.5 }}>
          <CardMetrica
            destaque
            rotulo="Vencido"
            valor={formatarMoeda(painel.vencido)}
            nota={{ texto: `${painel.vencidas} cobrança(s) atrasada(s)` }}
            icone={<EventBusyOutlinedIcon />}
            onClick={() => alternarRecorte('VENCIDA')}
          />
          <CardMetrica
            rotulo="A receber"
            valor={formatarMoeda(painel.a_receber)}
            nota={{ texto: 'Tudo que ainda tem saldo' }}
            icone={<ReceiptLongOutlinedIcon />}
            onClick={() => { setSituacao(''); setMes('') }}
          />
          <CardMetrica
            rotulo="Vence em 7 dias"
            valor={formatarMoeda(painel.a_vencer_semana)}
            nota={{ texto: 'Cobrar antes de virar atraso' }}
            icone={<PaidOutlinedIcon />}
            onClick={() => alternarRecorte('ABERTA')}
          />
          <CardMetrica
            rotulo="Recebido no mês"
            valor={formatarMoeda(painel.recebido_mes)}
            nota={{ texto: 'Baixas lançadas neste mês' }}
            icone={<TrendingUpOutlinedIcon />}
            onClick={() => { setSituacao('PAGA'); setMes(painel.mes_corrente || '') }}
          />
        </Box>
      )}

      {painel?.turmas?.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2,minmax(0,1fr))' }, gap: 2, mb: 2.5 }}>
          {painel.turmas.map((item) => (
            <Superficie
              key={item.cod_tur ?? 'sem-turma'}
              component={item.cod_tur ? 'button' : 'section'}
              type={item.cod_tur ? 'button' : undefined}
              onClick={item.cod_tur ? () => navigate(`/financeiro/turmas/${item.cod_tur}`) : undefined}
              sx={{
                p: { xs: 2, sm: 2.5 }, textAlign: 'left', width: '100%',
                ...(item.cod_tur ? {
                  ...resetBotao,
                  border: `1px solid ${TOV.border}`,
                  borderRadius: TOV.radiusMd,
                  cursor: 'pointer',
                  transition: `border-color ${TOV.durationFast} ${TOV.ease}`,
                  '&:hover': { borderColor: TOV.graphite },
                } : {}),
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography component="h2" sx={{ fontWeight: 700, fontSize: TOV.type.bodyLg, overflowWrap: 'anywhere' }}>
                    {item.turma_nome}
                  </Typography>
                  <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 0.5 }}>
                    {item.alunos} aluno(s) · {item.cobrancas} cobrança(s)
                  </Typography>
                </Box>
                <StatusBadge tom={item.vencido > 0 ? 'error' : 'success'} dot sx={{ flexShrink: 0 }}>
                  {item.vencido > 0 ? `${item.vencidas} em atraso` : 'Sem atraso'}
                </StatusBadge>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 1.5, mt: 2 }}>
                {[
                  ['Previsto', formatarMoeda(item.previsto)],
                  ['Recebido', formatarMoeda(item.recebido)],
                  ['Em aberto', formatarMoeda(item.em_aberto)],
                ].map(([rotulo, valor]) => (
                  <Box key={rotulo} sx={{ minWidth: 0 }}>
                    <Box sx={{ fontSize: TOV.type.overline, textTransform: 'uppercase', letterSpacing: '.08em', color: TOV.caption, fontWeight: 700 }}>{rotulo}</Box>
                    <Box sx={{ mt: 0.5, fontWeight: 700, fontSize: TOV.type.body, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{valor}</Box>
                  </Box>
                ))}
              </Box>
            </Superficie>
          ))}
        </Box>
      )}

      <BarraFiltros>
        <TextField
          size="small" label="Buscar aluno ou código" value={busca}
          onChange={(e) => setBusca(e.target.value)}
          sx={{ flex: '1 1 240px', maxWidth: 380 }}
        />
        <TextField
          select size="small" label="Mês do vencimento" value={mes}
          onChange={(e) => setMes(e.target.value)}
          sx={{ flex: '0 1 200px' }}
        >
          <MenuItem value="">Todos os meses</MenuItem>
          {painel?.mes_corrente && (
            <MenuItem value={painel.mes_corrente}>Este mês · {formatarCompetencia(painel.mes_corrente)}</MenuItem>
          )}
          {(opcoes.meses || [])
            .filter((item) => item.mes !== painel?.mes_corrente)
            .map((item) => (
              <MenuItem key={item.mes} value={item.mes}>
                {formatarCompetencia(item.mes)} · {item.cobrancas}
              </MenuItem>
            ))}
        </TextField>
        <TextField
          select size="small" label="Turma" value={turma}
          onChange={(e) => setTurma(e.target.value)}
          sx={{ flex: '0 1 200px' }}
        >
          <MenuItem value="">Todas as turmas</MenuItem>
          {opcoes.turmas.map((item) => (
            <MenuItem key={item.cod_tur} value={String(item.cod_tur)}>{item.nome}</MenuItem>
          ))}
        </TextField>
        <TextField
          select size="small" label="Situação" value={situacao}
          onChange={(e) => setSituacao(e.target.value)}
          sx={{ flex: '0 1 190px' }}
        >
          {SITUACOES_FILTRO.map((item) => <MenuItem key={item.valor} value={item.valor}>{item.rotulo}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" label="Tipo" value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          sx={{ flex: '0 1 210px' }}
        >
          {TIPOS_FILTRO.map((item) => <MenuItem key={item.valor} value={item.valor}>{item.rotulo}</MenuItem>)}
        </TextField>
      </BarraFiltros>

      {/* Refinar o filtro não pode apagar a lista: a barra fina avisa que a
          próxima página está vindo e o conteúdo antigo continua legível. */}
      <Box sx={{ height: 4, mb: 1 }}>
        {carregandoLista && cobrancas.length > 0 && <LinearProgress sx={{ borderRadius: TOV.radiusFull }} />}
      </Box>

      {!telaDesktop && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {carregandoLista && cobrancas.length === 0 && <SkeletonCards quantidade={4} altura={148} colunas="1fr" />}
          {!carregandoLista && cobrancas.length === 0 && (
            <CartaoLista>
              <EstadoVazio
                compacto
                titulo="Nenhuma cobrança neste recorte"
                descricao="Ajuste os filtros ou gere as cobranças pelo plano da turma."
              />
            </CartaoLista>
          )}
          {cobrancas.map((item) => (
            <CartaoLista key={item.id}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => navigate(`/financeiro/alunos/${item.cod_alu}`)}
                    sx={{ ...resetBotao, fontWeight: 700, fontSize: TOV.type.body, textAlign: 'left', overflowWrap: 'anywhere', '&:hover': { color: TOV.coral } }}
                  >
                    {item.aluno_nome}
                  </Box>
                  <Box sx={{ fontSize: TOV.type.bodySm, color: TOV.caption, mt: 0.5, overflowWrap: 'anywhere' }}>
                    {item.descricao}
                  </Box>
                </Box>
                <SeloSituacao situacao={item.situacao} sx={{ flexShrink: 0 }} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, fontSize: TOV.type.body }}>
                <Box component="span" sx={{ color: TOV.caption }}>Vencimento</Box>
                <Box component="span" sx={{ fontWeight: 600 }}>{formatarDataBr(item.vencimento)}</Box>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, fontSize: TOV.type.body }}>
                <Box component="span" sx={{ color: TOV.caption }}>Valor · saldo</Box>
                <Box component="span" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatarMoeda(item.valor)} · {formatarMoeda(item.saldo)}
                </Box>
              </Box>
              {item.saldo > 0 && (
                <Button size="small" variant="outlined" startIcon={<PaidOutlinedIcon />} onClick={() => setCobrancaPagando(item)}>
                  Registrar pagamento
                </Button>
              )}
            </CartaoLista>
          ))}
        </Box>
      )}

      {telaDesktop && (
        <TableContainer component={Box} sx={{ ...cardSx, overflowX: 'auto' }}>
          <Table sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selecionaveis.length > 0 && selecionadas.length === selecionaveis.length}
                    indeterminate={selecionadas.length > 0 && selecionadas.length < selecionaveis.length}
                    disabled={selecionaveis.length === 0}
                    onChange={alternarTodas}
                    inputProps={{ 'aria-label': 'Selecionar todas as cobranças em aberto desta página' }}
                  />
                </TableCell>
                <TableCell>Aluno</TableCell>
                <TableCell>Cobrança</TableCell>
                <TableCell>Vencimento</TableCell>
                <TableCell align="right">Valor</TableCell>
                <TableCell align="right">Saldo</TableCell>
                <TableCell>Situação</TableCell>
                <TableCell align="right">Ação</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {carregandoLista && cobrancas.length === 0 && <LinhasSkeleton colunas={8} />}
              {!carregandoLista && cobrancas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} sx={{ p: 0 }}>
                    <EstadoVazio
                      titulo="Nenhuma cobrança neste recorte"
                      descricao="Ajuste os filtros ou gere as cobranças pelo plano da turma."
                      acao={opcoes.turmas[0] && (
                        <Button variant="outlined" onClick={() => navigate(`/financeiro/turmas/${opcoes.turmas[0].cod_tur}`)}>
                          Abrir plano da turma
                        </Button>
                      )}
                    />
                  </TableCell>
                </TableRow>
              )}
              {cobrancas.map((item) => {
                const podeSelecionar = item.saldo > 0 && !['CANCELADA', 'ISENTA'].includes(item.status)
                return (
                  <TableRow key={item.id} hover selected={selecionadas.includes(item.id)}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selecionadas.includes(item.id)}
                        disabled={!podeSelecionar}
                        onChange={() => alternar(item.id)}
                        inputProps={{ 'aria-label': `Selecionar cobrança de ${item.aluno_nome}` }}
                      />
                    </TableCell>
                    <TableCell>
                      <Box
                        component="button"
                        type="button"
                        onClick={() => navigate(`/financeiro/alunos/${item.cod_alu}`)}
                        sx={{ ...resetBotao, fontWeight: 600, textAlign: 'left', '&:hover': { color: TOV.coral } }}
                      >
                        {item.aluno_nome}
                      </Box>
                      <Box sx={{ fontSize: TOV.type.caption, color: TOV.caption }}>{item.turma_nome || 'Sem turma'}</Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ fontWeight: 600 }}>{item.descricao}</Box>
                      <Box sx={{ fontSize: TOV.type.caption, color: TOV.caption }}>{item.tipo_rotulo} · {item.referencia}</Box>
                    </TableCell>
                    <TableCell sx={{ color: TOV.graphite, whiteSpace: 'nowrap' }}>{formatarDataBr(item.vencimento)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatarMoeda(item.valor)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{formatarMoeda(item.saldo)}</TableCell>
                    <TableCell><SeloSituacao situacao={item.situacao} /></TableCell>
                    <TableCell align="right">
                      {item.saldo > 0 ? (
                        <Box
                          component="button"
                          type="button"
                          onClick={() => setCobrancaPagando(item)}
                          sx={{ ...resetBotao, fontSize: TOV.type.bodySm, fontWeight: 600, color: TOV.caption, '&:hover': { color: TOV.coral } }}
                        >
                          Registrar pagamento
                        </Box>
                      ) : (
                        <Box component="span" sx={{ fontSize: TOV.type.bodySm, color: TOV.border }}>—</Box>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {lista.paginas > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mt: 2 }}>
          <Typography sx={{ fontSize: TOV.type.bodySm, color: TOV.caption }}>
            Página {lista.pagina} de {lista.paginas} · {lista.total} cobrança(s) no recorte
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined" size="small"
              disabled={carregandoLista || lista.pagina <= 1}
              onClick={() => setPagina((atual) => Math.max(atual - 1, 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outlined" size="small"
              disabled={carregandoLista || lista.pagina >= lista.paginas}
              onClick={() => setPagina((atual) => atual + 1)}
            >
              Próxima
            </Button>
          </Box>
        </Box>
      )}

      <BarraAcaoFixa
        visivel={selecionadas.length > 0}
        rotulo="Cobranças selecionadas"
        selo={<StatusBadge tom="info">{selecionadas.length} selecionada(s)</StatusBadge>}
        resumo={`${formatarMoeda(totalSelecionado)} serão marcados como pagos hoje`}
        acoes={(
          <>
            <Button variant="outlined" onClick={() => setSelecionadas([])} disabled={processando}>Limpar</Button>
            <Button
              variant="contained"
              startIcon={processando ? <CircularProgress size={16} color="inherit" /> : <PaidOutlinedIcon />}
              disabled={processando}
              onClick={marcarSelecionadasComoPagas}
            >
              Marcar como pagas
            </Button>
          </>
        )}
      />

      <DialogoPagamento
        cobranca={cobrancaPagando}
        processando={processando}
        onConfirmar={lancarPagamento}
        onFechar={() => !processando && setCobrancaPagando(null)}
      />

      <Dialog open={novaAberta} onClose={processando ? undefined : () => setNovaAberta(false)} maxWidth="sm" fullWidth fullScreen={telaCheia}>
        <DialogTitle>Nova cobrança avulsa</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <Alert severity="info">
            Matrícula e mensalidades saem do plano da turma. Use a avulsa para taxas pontuais, como segunda via ou material.
          </Alert>
          <TextField
            select label="Aluno" value={nova.cod_alu}
            onChange={(e) => {
              const aluno = alunos.find((item) => String(item.cod_alu) === e.target.value)
              setNova({ ...nova, cod_alu: e.target.value, cod_tur: aluno?.cod_tur ? String(aluno.cod_tur) : '' })
            }}
            helperText={alunos.length === 0 ? 'Carregando alunos…' : ' '}
          >
            {alunos.map((item) => (
              <MenuItem key={item.cod_alu} value={String(item.cod_alu)}>{item.nome}</MenuItem>
            ))}
          </TextField>
          <TextField select label="Turma (opcional)" value={nova.cod_tur} onChange={(e) => setNova({ ...nova, cod_tur: e.target.value })}>
            <MenuItem value="">Sem turma</MenuItem>
            {opcoes.turmas.map((item) => <MenuItem key={item.cod_tur} value={String(item.cod_tur)}>{item.nome}</MenuItem>)}
          </TextField>
          <TextField
            label="Descrição" value={nova.descricao}
            onChange={(e) => setNova({ ...nova, descricao: e.target.value })}
            inputProps={{ maxLength: 120 }}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField
              label="Valor" value={nova.valor}
              onChange={(e) => setNova({ ...nova, valor: e.target.value })}
              InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
              inputProps={{ inputMode: 'decimal' }}
            />
            <TextField
              label="Vencimento" type="date" value={nova.vencimento}
              onChange={(e) => setNova({ ...nova, vencimento: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setNovaAberta(false)} disabled={processando}>Cancelar</Button>
          <Button variant="contained" disabled={!podeCriar || processando} onClick={criarAvulsa}>
            {processando ? 'Criando…' : 'Criar cobrança'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={5000} onClose={() => setMsg('')}>
        <Alert severity={ehErro ? 'error' : 'success'} onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
