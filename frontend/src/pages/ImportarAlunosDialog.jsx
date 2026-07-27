import { useEffect, useRef, useState } from 'react'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, LinearProgress, Typography,
} from '@mui/material'
import CloudSyncIcon from '@mui/icons-material/CloudSync'
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
      <Box sx={{ fontWeight: 700, mb: 0.75 }}>Importação concluída</Box>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', fontSize: 13 }}>
        {itens.map(([rotulo, valor]) => <span key={rotulo}>{rotulo}: <b>{valor || 0}</b></span>)}
      </Box>
      {resultado.mensagem && <Box sx={{ mt: 1, fontSize: 13 }}>{resultado.mensagem}</Box>}
    </Alert>
  )
}

export default function ImportarAlunosDialog({ aberto, aoFechar, aoImportar }) {
  const [arquivo, setArquivo] = useState(null)
  const [enviandoArquivo, setEnviandoArquivo] = useState(false)
  const [resultadoArquivo, setResultadoArquivo] = useState(null)
  const [importacaoGoogle, setImportacaoGoogle] = useState(null)
  const [solicitandoGoogle, setSolicitandoGoogle] = useState(false)
  const [erro, setErro] = useState('')
  const inputArquivo = useRef(null)
  const telaCheia = useDialogoTelaCheia()

  useEffect(() => {
    if (!importacaoGoogle || importacaoGoogle.status === 'CONCLUIDA') return
    let ativo = true
    const consultar = async () => {
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
      }
    }
    const timer = setInterval(consultar, 2500)
    consultar()
    return () => { ativo = false; clearInterval(timer) }
  }, [importacaoGoogle?.id, importacaoGoogle?.status, aoImportar])

  async function importarGoogle() {
    setErro('')
    setSolicitandoGoogle(true)
    try {
      const solicitacao = await api.post('/importacoes/google-forms', {})
      setImportacaoGoogle(solicitacao)
    } catch (e) {
      setErro(e.message)
      setSolicitandoGoogle(false)
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

  const googleEmAndamento = importacaoGoogle && importacaoGoogle.status !== 'CONCLUIDA'
  const processando = enviandoArquivo || solicitandoGoogle || googleEmAndamento

  return (
    <Dialog open={aberto} onClose={processando ? undefined : aoFechar} maxWidth="md" fullWidth fullScreen={telaCheia}>
      <DialogTitle>Importar alunos</DialogTitle>
      <DialogContent>
        {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}

        <Box sx={{ ...cardSx, boxShadow: 'none', border: `1px solid ${TOV.border}`, p: { xs: 2, sm: 2.5 } }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <CloudSyncIcon sx={{ color: TOV.coral, mt: 0.25 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h3" sx={{ fontSize: 19 }}>Planilha do Google Forms</Typography>
              <Typography sx={{ mt: 0.75, color: TOV.caption, fontSize: 14, lineHeight: 1.5 }}>
                Importa todas as respostas antigas da planilha configurada. O Apps Script verifica a solicitação em até um minuto.
              </Typography>
              <Button variant="contained" startIcon={solicitandoGoogle ? <CircularProgress size={16} color="inherit" /> : <CloudSyncIcon />}
                disabled={!!processando} onClick={importarGoogle} sx={{ mt: 2 }}>
                {googleEmAndamento ? 'Aguardando Google Forms…' : 'Importar do Google Forms'}
              </Button>
              {googleEmAndamento && <LinearProgress sx={{ mt: 2, borderRadius: 999 }} />}
              <Resumo resultado={importacaoGoogle} />
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 2.5 }}>ou</Divider>

        <Box sx={{ ...cardSx, boxShadow: 'none', border: `1px solid ${TOV.border}`, p: { xs: 2, sm: 2.5 } }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <UploadFileIcon sx={{ color: TOV.slate, mt: 0.25 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h3" sx={{ fontSize: 19 }}>Arquivo do computador</Typography>
              <Typography sx={{ mt: 0.75, color: TOV.caption, fontSize: 14, lineHeight: 1.5 }}>
                Aceita XLSX, XLS ou CSV. A primeira linha deve conter os cabeçalhos; os nomes usados no formulário já são reconhecidos.
              </Typography>
              <input ref={inputArquivo} hidden type="file" accept=".xlsx,.xls,.csv"
                onChange={(e) => { setArquivo(e.target.files?.[0] || null); setResultadoArquivo(null) }} />
              <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap', mt: 2 }}>
                <Button variant="outlined" startIcon={<UploadFileIcon />} disabled={!!processando}
                  onClick={() => inputArquivo.current?.click()}>
                  Selecionar arquivo
                </Button>
                <Typography sx={{ color: arquivo ? TOV.ink : TOV.caption, fontSize: 14, overflowWrap: 'anywhere' }}>
                  {arquivo?.name || 'Nenhum arquivo selecionado'}
                </Typography>
                <Button variant="contained" disabled={!arquivo || !!processando} onClick={importarArquivo}
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
