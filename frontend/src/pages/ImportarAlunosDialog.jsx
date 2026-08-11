import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, InputAdornment, LinearProgress,
  TextField, Typography,
} from '@mui/material'
import CloudSyncIcon from '@mui/icons-material/CloudSync'
import SearchIcon from '@mui/icons-material/Search'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { api, enviarArquivoJson } from '../api'
import { TOV } from '../theme'
import { cardSx, useDialogoTelaCheia } from '../ui'

function Resumo({ resultado }) {
  if (!resultado || !['CONCLUIDA', 'ARQUIVO'].includes(resultado.status)) return null
  const itens = [
    ['Criados', resultado.criados],
    ['Atualizados', resultado.atualizados],
    ['Já cadastrados', resultado.ja_cadastrados],
    ['Já processados', resultado.ja_processados],
    ['Erros', resultado.erros],
  ]
  return (
    <Alert severity={resultado.erros ? 'warning' : 'success'} sx={{ mt: 2 }}>
      <Box sx={{ fontWeight: 700, mb: 1 }}>Importação concluída</Box>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', fontSize: TOV.type.bodySm }}>
        {itens.map(([rotulo, valor]) => <span key={rotulo}>{rotulo}: <b>{valor || 0}</b></span>)}
      </Box>
      {resultado.mensagem && <Box sx={{ mt: 1, fontSize: TOV.type.bodySm }}>{resultado.mensagem}</Box>}
    </Alert>
  )
}

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export default function ImportarAlunosDialog({ aberto, aoFechar, aoImportar }) {
  const [arquivo, setArquivo] = useState(null)
  const [enviandoArquivo, setEnviandoArquivo] = useState(false)
  const [resultadoArquivo, setResultadoArquivo] = useState(null)
  const [importacaoGoogle, setImportacaoGoogle] = useState(null)
  const [solicitandoGoogle, setSolicitandoGoogle] = useState(false)
  const [previaGoogle, setPreviaGoogle] = useState(null)
  const [itensGoogle, setItensGoogle] = useState([])
  const [selecionados, setSelecionados] = useState([])
  const [buscaGoogle, setBuscaGoogle] = useState('')
  const [carregandoPrevia, setCarregandoPrevia] = useState(false)
  const [importandoSelecao, setImportandoSelecao] = useState(false)
  const [resultadoSelecao, setResultadoSelecao] = useState(null)
  const [erro, setErro] = useState('')
  const inputArquivo = useRef(null)
  const telaCheia = useDialogoTelaCheia()

  useEffect(() => {
    if (!importacaoGoogle || !['PENDENTE', 'PROCESSANDO'].includes(importacaoGoogle.status)) return
    let ativo = true
    let consultando = false
    const consultar = async () => {
      if (consultando) return
      consultando = true
      try {
        const atual = await api.get(`/importacoes/google-forms/${importacaoGoogle.id}`)
        if (!ativo) return
        setImportacaoGoogle(atual)
        if (atual.status === 'CONCLUIDA') {
          setSolicitandoGoogle(false)
          aoImportar()
        }
      } catch (e) {
        if (ativo) {
          setErro(e.message)
          setSolicitandoGoogle(false)
        }
      } finally {
        consultando = false
      }
    }
    const timer = setInterval(consultar, 2500)
    consultar()
    return () => { ativo = false; clearInterval(timer) }
  }, [importacaoGoogle?.id, importacaoGoogle?.status, aoImportar])

  useEffect(() => {
    if (!previaGoogle || !['PENDENTE', 'PROCESSANDO'].includes(previaGoogle.status)) return
    let ativo = true
    let consultando = false
    const consultar = async () => {
      if (consultando) return
      consultando = true
      try {
        const atual = await api.get(`/importacoes/google-forms/${previaGoogle.id}`)
        if (!ativo) return
        if (atual.status === 'PREVIA_PRONTA') {
          const resposta = await api.get(`/importacoes/google-forms/${atual.id}/itens`)
          if (!ativo) return
          setPreviaGoogle(atual)
          setItensGoogle(resposta.itens || [])
          setSelecionados([])
          setCarregandoPrevia(false)
        } else if (atual.status === 'CONCLUIDA') {
          setPreviaGoogle(atual)
          setCarregandoPrevia(false)
          setErro(atual.mensagem || 'Não foi possível carregar as pessoas da planilha.')
        } else {
          setPreviaGoogle(atual)
        }
      } catch (e) {
        if (ativo) {
          setErro(e.message)
          setCarregandoPrevia(false)
        }
      } finally {
        consultando = false
      }
    }
    const timer = setInterval(consultar, 2500)
    consultar()
    return () => { ativo = false; clearInterval(timer) }
  }, [previaGoogle?.id, previaGoogle?.status])

  const itensFiltrados = useMemo(() => {
    const busca = normalizar(buscaGoogle.trim())
    if (!busca) return itensGoogle
    return itensGoogle.filter((item) => normalizar(item.nome).includes(busca))
  }, [buscaGoogle, itensGoogle])

  const idsSelecionados = useMemo(() => new Set(selecionados), [selecionados])
  const todosVisiveisSelecionados = itensFiltrados.length > 0
    && itensFiltrados.every((item) => idsSelecionados.has(item.id))
  const algumVisivelSelecionado = itensFiltrados.some((item) => idsSelecionados.has(item.id))

  async function importarGoogle() {
    setErro('')
    setSolicitandoGoogle(true)
    setResultadoSelecao(null)
    try {
      const solicitacao = await api.post('/importacoes/google-forms', {})
      setImportacaoGoogle(solicitacao)
    } catch (e) {
      setErro(e.message)
      setSolicitandoGoogle(false)
    }
  }

  async function carregarPessoasGoogle() {
    setErro('')
    setCarregandoPrevia(true)
    setResultadoSelecao(null)
    setItensGoogle([])
    setSelecionados([])
    setBuscaGoogle('')
    try {
      const solicitacao = await api.post('/importacoes/google-forms/previa', {})
      setPreviaGoogle(solicitacao)
    } catch (e) {
      setErro(e.message)
      setCarregandoPrevia(false)
    }
  }

  function alternarSelecionado(id) {
    setSelecionados((atuais) => (
      atuais.includes(id)
        ? atuais.filter((itemId) => itemId !== id)
        : [...atuais, id]
    ))
  }

  function alternarVisiveis() {
    const idsVisiveis = itensFiltrados.map((item) => item.id)
    if (todosVisiveisSelecionados) {
      const remover = new Set(idsVisiveis)
      setSelecionados((atuais) => atuais.filter((id) => !remover.has(id)))
    } else {
      setSelecionados((atuais) => [...new Set([...atuais, ...idsVisiveis])])
    }
  }

  async function importarSelecionados() {
    if (!previaGoogle || selecionados.length === 0) return
    setErro('')
    setImportandoSelecao(true)
    try {
      const resultado = await api.post(
        `/importacoes/google-forms/${previaGoogle.id}/importar-selecao`,
        { ids: selecionados },
      )
      setResultadoSelecao({ ...resultado, status: 'ARQUIVO' })
      setPreviaGoogle(null)
      setItensGoogle([])
      setSelecionados([])
      setBuscaGoogle('')
      aoImportar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setImportandoSelecao(false)
    }
  }

  async function importarArquivo() {
    if (!arquivo) return
    setErro('')
    setEnviandoArquivo(true)
    setResultadoArquivo(null)
    try {
      const resultado = await enviarArquivoJson('/importacoes/arquivo', arquivo)
      setResultadoArquivo({ ...resultado, status: 'ARQUIVO' })
      aoImportar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviandoArquivo(false)
    }
  }

  const googleEmAndamento = importacaoGoogle
    && ['PENDENTE', 'PROCESSANDO'].includes(importacaoGoogle.status)
  const previaEmAndamento = previaGoogle
    && ['PENDENTE', 'PROCESSANDO'].includes(previaGoogle.status)
  const previaPronta = previaGoogle?.status === 'PREVIA_PRONTA'
  const processando = enviandoArquivo || solicitandoGoogle || googleEmAndamento
    || carregandoPrevia || previaEmAndamento || importandoSelecao

  return (
    <Dialog open={aberto} onClose={processando ? undefined : aoFechar} maxWidth="md" fullWidth fullScreen={telaCheia}>
      <DialogTitle>Importar alunos</DialogTitle>
      <DialogContent>
        {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}

        <Box sx={{ ...cardSx, boxShadow: 'none', border: `1px solid ${TOV.border}`, p: { xs: 2, sm: 2.5 } }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <CloudSyncIcon sx={{ color: TOV.graphite, mt: 0.5 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h3" sx={{ fontSize: TOV.type.section }}>Planilha do Google Forms</Typography>
              <Typography sx={{ mt: 1, color: TOV.caption, fontSize: TOV.type.body, lineHeight: 1.5 }}>
                Pesquise e escolha algumas pessoas ou importe todas as respostas. O Apps Script verifica a solicitação em até um minuto.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 2 }}>
                <Button
                  variant="contained"
                  startIcon={carregandoPrevia ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
                  disabled={!!processando}
                  onClick={carregarPessoasGoogle}
                >
                  {previaEmAndamento ? 'Carregando pessoas…' : 'Escolher pessoas'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={solicitandoGoogle ? <CircularProgress size={16} color="inherit" /> : <CloudSyncIcon />}
                  disabled={!!processando || previaPronta}
                  onClick={importarGoogle}
                >
                  {googleEmAndamento ? 'Aguardando Google Forms…' : 'Importar todas'}
                </Button>
              </Box>

              {(googleEmAndamento || previaEmAndamento) && (
                <Box sx={{ mt: 2 }}>
                  <LinearProgress sx={{ borderRadius: TOV.radiusFull }} />
                  <Typography sx={{ mt: 1, color: TOV.caption, fontSize: TOV.type.caption }}>
                    Aguardando o Apps Script consultar a planilha…
                  </Typography>
                </Box>
              )}

              {previaPronta && (
                <Box sx={{ mt: 2.5 }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Pesquisar por nome"
                    value={buscaGoogle}
                    onChange={(e) => setBuscaGoogle(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                      ),
                    }}
                  />

                  <Box sx={{
                    mt: 1.5,
                    border: `1px solid ${TOV.border}`,
                    borderRadius: TOV.radiusLg,
                    overflow: 'hidden',
                  }}>
                    <Box sx={{
                      px: 1.5,
                      py: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      bgcolor: TOV.offwhite,
                      borderBottom: `1px solid ${TOV.border}`,
                    }}>
                      <Checkbox
                        size="small"
                        checked={todosVisiveisSelecionados}
                        indeterminate={!todosVisiveisSelecionados && algumVisivelSelecionado}
                        disabled={itensFiltrados.length === 0}
                        onChange={alternarVisiveis}
                        inputProps={{ 'aria-label': 'Selecionar pessoas visíveis' }}
                      />
                      <Typography sx={{ flex: 1, fontSize: TOV.type.bodySm, fontWeight: 700 }}>
                        {itensFiltrados.length} {itensFiltrados.length === 1 ? 'pessoa encontrada' : 'pessoas encontradas'}
                      </Typography>
                      {selecionados.length > 0 && (
                        <Button size="small" onClick={() => setSelecionados([])}>Limpar seleção</Button>
                      )}
                    </Box>

                    <Box sx={{ maxHeight: 310, overflowY: 'auto' }}>
                      {itensFiltrados.map((item) => (
                        <Box
                          component="label"
                          key={item.id}
                          sx={{
                            px: 1.5,
                            py: 1,
                            display: 'flex',
                            gap: 1,
                            alignItems: 'flex-start',
                            cursor: 'pointer',
                            borderBottom: `1px solid ${TOV.border}`,
                            '&:last-child': { borderBottom: 0 },
                            '&:hover': { bgcolor: TOV.offwhite },
                          }}
                        >
                          <Checkbox
                            size="small"
                            checked={idsSelecionados.has(item.id)}
                            onChange={() => alternarSelecionado(item.id)}
                            sx={{ mt: -0.5 }}
                          />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontSize: TOV.type.body, fontWeight: 700 }}>{item.nome}</Typography>
                            <Typography sx={{ mt: 0.5, color: TOV.caption, fontSize: TOV.type.caption, overflowWrap: 'anywhere' }}>
                              {[item.e_mail, item.telefone, item.turma_interesse].filter(Boolean).join(' • ') || 'Sem outros dados'}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                      {itensFiltrados.length === 0 && (
                        <Typography sx={{ p: 2.5, textAlign: 'center', color: TOV.caption, fontSize: TOV.type.body }}>
                          Nenhuma pessoa encontrada com esse nome.
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mt: 1.5 }}>
                    <Button
                      variant="contained"
                      disabled={selecionados.length === 0 || importandoSelecao}
                      onClick={importarSelecionados}
                      startIcon={importandoSelecao ? <CircularProgress size={16} color="inherit" /> : null}
                    >
                      {importandoSelecao ? 'Importando…' : `Importar selecionados (${selecionados.length})`}
                    </Button>
                    <Button variant="text" disabled={importandoSelecao} onClick={carregarPessoasGoogle}>
                      Atualizar lista
                    </Button>
                  </Box>
                </Box>
              )}

              <Resumo resultado={importacaoGoogle} />
              <Resumo resultado={resultadoSelecao} />
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 2.5 }}>ou</Divider>

        <Box sx={{ ...cardSx, boxShadow: 'none', border: `1px solid ${TOV.border}`, p: { xs: 2, sm: 2.5 } }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <UploadFileIcon sx={{ color: TOV.slate, mt: 0.5 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h3" sx={{ fontSize: TOV.type.section }}>Arquivo do computador</Typography>
              <Typography sx={{ mt: 1, color: TOV.caption, fontSize: TOV.type.body, lineHeight: 1.5 }}>
                Aceita XLSX, XLS ou CSV. A primeira linha deve conter os cabeçalhos; os nomes usados no formulário já são reconhecidos.
              </Typography>
              <input ref={inputArquivo} hidden type="file" accept=".xlsx,.xls,.csv"
                onChange={(e) => { setArquivo(e.target.files?.[0] || null); setResultadoArquivo(null) }} />
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mt: 2 }}>
                <Button variant="outlined" startIcon={<UploadFileIcon />} disabled={!!processando || previaPronta}
                  onClick={() => inputArquivo.current?.click()}>
                  Selecionar arquivo
                </Button>
                <Typography sx={{ color: arquivo ? TOV.ink : TOV.caption, fontSize: TOV.type.body, overflowWrap: 'anywhere' }}>
                  {arquivo?.name || 'Nenhum arquivo selecionado'}
                </Typography>
                <Button variant="contained" disabled={!arquivo || !!processando || previaPronta} onClick={importarArquivo}
                  startIcon={enviandoArquivo ? <CircularProgress size={16} color="inherit" /> : null}>
                  {enviandoArquivo ? 'Importando…' : 'Importar arquivo'}
                </Button>
              </Box>
              <Resumo resultado={resultadoArquivo} />
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 3, pt: 1.5 }}>
        <Button variant="outlined" onClick={aoFechar} disabled={!!processando}>Fechar</Button>
      </DialogActions>
    </Dialog>
  )
}
