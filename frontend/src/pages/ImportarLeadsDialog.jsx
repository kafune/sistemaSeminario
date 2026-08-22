import { useRef, useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, LinearProgress, Typography,
} from '@mui/material'
import CloudSyncIcon from '@mui/icons-material/CloudSync'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import { api, baixarArquivo, enviarArquivoJson } from '../api'
import { TOV } from '../theme'
import { cardSx, useDialogoTelaCheia } from '../ui'

const ACAO = {
  CRIAR: { rotulo: 'Novo', cor: 'success' },
  ATUALIZAR: { rotulo: 'Atualizar', cor: 'info' },
  IGNORAR: { rotulo: 'Ignorar', cor: 'default' },
  ERRO: { rotulo: 'Erro', cor: 'error' },
}

function Resumo({ importacao }) {
  if (!importacao) return null
  const concluida = importacao.status === 'CONCLUIDA'
  const itens = concluida
    ? [
        ['Importados', importacao.total_criados],
        ['Atualizados', importacao.total_atualizados],
        ['Ignorados', importacao.total_ignorados],
        ['Com erro', importacao.total_erros],
      ]
    : [
        ['A criar', importacao.itens.filter((item) => item.acao === 'CRIAR').length],
        ['A atualizar', importacao.itens.filter((item) => item.acao === 'ATUALIZAR').length],
        ['Ignorados', importacao.total_ignorados],
        ['Com erro', importacao.total_erros],
      ]
  return (
    <Alert severity={concluida ? 'success' : 'info'} sx={{ mt: 2 }}>
      <Box sx={{ fontWeight: 700, mb: 1 }}>
        {concluida ? 'Importação concluída' : 'Prévia pronta para conferência'}
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', fontSize: TOV.type.bodySm }}>
        {itens.map(([rotulo, valor]) => (
          <span key={rotulo}>{rotulo}: <b>{valor || 0}</b></span>
        ))}
      </Box>
    </Alert>
  )
}

export default function ImportarLeadsDialog({ aberto, aoFechar, aoImportar }) {
  const [arquivo, setArquivo] = useState(null)
  const [importacao, setImportacao] = useState(null)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  const inputArquivo = useRef(null)
  const telaCheia = useDialogoTelaCheia()

  function limpar() {
    setArquivo(null)
    setImportacao(null)
    setErro('')
    if (inputArquivo.current) inputArquivo.current.value = ''
  }

  function fechar() {
    if (processando) return
    limpar()
    aoFechar()
  }

  async function gerarPrevia() {
    if (!arquivo) return
    setProcessando(true)
    setErro('')
    try {
      setImportacao(await enviarArquivoJson('/leads/importacoes/previa', arquivo))
    } catch (e) {
      setErro(e.message)
    } finally {
      setProcessando(false)
    }
  }

  async function baixarModelo() {
    setErro('')
    try {
      await baixarArquivo('/leads/importacoes/modelo', 'modelo-importacao-leads.xlsx')
    } catch (e) {
      setErro(e.message)
    }
  }

  async function confirmar() {
    setProcessando(true)
    setErro('')
    try {
      const resultado = await api.post(`/leads/importacoes/${importacao.id}/confirmar`, {})
      setImportacao(resultado)
      aoImportar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setProcessando(false)
    }
  }

  const previa = importacao?.status === 'PREVIA'
  const concluida = importacao?.status === 'CONCLUIDA'

  return (
    <Dialog open={aberto} onClose={fechar} maxWidth="md" fullWidth fullScreen={telaCheia}>
      <DialogTitle>Importar leads</DialogTitle>
      <DialogContent>
        {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}

        <Box sx={{ ...cardSx, boxShadow: 'none', border: `1px solid ${TOV.border}`, p: { xs: 2, sm: 2.5 } }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <UploadFileIcon sx={{ color: TOV.graphite, mt: 0.5 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h3" sx={{ fontSize: TOV.type.section }}>Arquivo do computador</Typography>
              <Typography sx={{ mt: 1, color: TOV.caption, fontSize: TOV.type.body, lineHeight: 1.55 }}>
                Aceita XLSX, XLS ou CSV. A primeira linha deve ter os cabeçalhos Nome e
                Telefone/Celular. E-mail, origem, campanha, data de captação, tags,
                status do funil e opt-in são opcionais.
              </Typography>
              <Alert severity="info" sx={{ mt: 1.5 }}>
                Sem coluna de consentimento, o lead entra como <b>opt-in pendente</b> e
                não poderá receber disparos de marketing.
              </Alert>
              <input
                ref={inputArquivo}
                hidden
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  setArquivo(e.target.files?.[0] || null)
                  setImportacao(null)
                }}
              />
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mt: 2 }}>
                <Button variant="text" onClick={baixarModelo} disabled={processando}>
                  Baixar planilha de exemplo
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<UploadFileIcon />}
                  disabled={processando || previa}
                  onClick={() => inputArquivo.current?.click()}
                >
                  Selecionar arquivo
                </Button>
                <Typography sx={{ color: arquivo ? TOV.ink : TOV.caption, fontSize: TOV.type.body, overflowWrap: 'anywhere' }}>
                  {arquivo?.name || 'Nenhum arquivo selecionado'}
                </Typography>
                <Button
                  variant="contained"
                  disabled={!arquivo || processando || previa || concluida}
                  onClick={gerarPrevia}
                  startIcon={processando && !previa ? <CircularProgress size={16} color="inherit" /> : null}
                >
                  Gerar prévia
                </Button>
              </Box>
              {processando && <LinearProgress sx={{ mt: 2, borderRadius: TOV.radiusFull }} />}
              <Resumo importacao={importacao} />
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 2.5 }}>ou</Divider>

        <Box sx={{ ...cardSx, boxShadow: 'none', border: `1px solid ${TOV.border}`, p: { xs: 2, sm: 2.5 } }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <CloudSyncIcon sx={{ color: TOV.graphite, mt: 0.5 }} />
            <Box>
              <Typography variant="h3" sx={{ fontSize: TOV.type.section }}>Planilha do Google Forms</Typography>
              <Typography sx={{ mt: 1, color: TOV.caption, fontSize: TOV.type.body, lineHeight: 1.55 }}>
                A integração atual está vinculada ao formulário acadêmico de alunos.
                Ela permanece desativada aqui para impedir que respostas acadêmicas
                sejam misturadas à base de marketing.
              </Typography>
              <Chip size="small" label="Requer funil de captação próprio" sx={{ mt: 1.5 }} />
            </Box>
          </Box>
        </Box>

        {previa && (
          <Box sx={{ mt: 2.5 }}>
            <Typography variant="h3" sx={{ fontSize: TOV.type.section, mb: 1.5 }}>
              Conferir dados ({importacao.total_linhas})
            </Typography>
            <Box sx={{ border: `1px solid ${TOV.border}`, borderRadius: TOV.radiusLg, maxHeight: 330, overflowY: 'auto' }}>
              {importacao.itens.map((item, indice) => {
                const acao = ACAO[item.acao] || ACAO.ERRO
                return (
                  <Box
                    key={item.id}
                    sx={{
                      p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5,
                      borderTop: indice ? `1px solid ${TOV.divider}` : 0,
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: TOV.type.body, fontWeight: 700 }}>
                        Linha {item.numero_linha} · {item.nome || 'Sem nome'}
                      </Typography>
                      <Typography sx={{ color: TOV.caption, fontSize: TOV.type.caption, overflowWrap: 'anywhere' }}>
                        {item.telefone || 'Sem telefone'}
                        {item.motivo ? ` · ${item.motivo}` : ''}
                      </Typography>
                    </Box>
                    <Chip size="small" label={acao.rotulo} color={acao.cor} />
                  </Box>
                )
              })}
            </Box>
          </Box>
        )}

        {concluida && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 2, color: TOV.whatsappSuccess }}>
            <CheckCircleOutlineIcon />
            <Typography sx={{ fontWeight: 700 }}>A base de leads foi atualizada.</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 3, pt: 1.5 }}>
        <Button variant="outlined" onClick={fechar} disabled={processando}>Fechar</Button>
        {previa && (
          <Button variant="contained" onClick={confirmar} disabled={!importacao.total_validos || processando}>
            {processando ? 'Importando…' : `Confirmar ${importacao.total_validos} registros`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
