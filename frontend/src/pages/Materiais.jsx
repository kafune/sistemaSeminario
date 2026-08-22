import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, MenuItem, Snackbar, TextField, Typography,
} from '@mui/material'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EventOutlinedIcon from '@mui/icons-material/EventOutlined'
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined'
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { api, baixarArquivo, enviarArquivoJson } from '../api'
import { TOV } from '../theme'
import {
  BarraFiltros, CabecalhoPagina, DialogoConfirmacao, EstadoVazio, StatusBadge,
  cardSx, useDialogoTelaCheia,
} from '../ui'

const LIMITE_PADRAO_MB = 25

function formatarData(data) {
  if (!data) return 'Data não informada'
  return new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR')
}

function formatarDataHora(data) {
  if (!data) return ''
  return new Date(data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function formatarTamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function rotuloVinculo(vinculo) {
  return [
    vinculo.materia_nome,
    vinculo.turma_nome,
    vinculo.ano && vinculo.semestre ? `${vinculo.ano}/${vinculo.semestre}` : null,
  ].filter(Boolean).join(' · ')
}

function rotuloAula(aula) {
  return [formatarData(aula.data), aula.hora_inicio, aula.tema].filter(Boolean).join(' · ')
}

export default function Materiais() {
  const [searchParams] = useSearchParams()
  const [vinculos, setVinculos] = useState([])
  const [aulas, setAulas] = useState([])
  const [docturmaId, setDocturmaId] = useState(searchParams.get('vinculo') || '')
  const [filtroAula, setFiltroAula] = useState('TODOS')
  const [materiais, setMateriais] = useState([])
  const [limiteMb, setLimiteMb] = useState(LIMITE_PADRAO_MB)
  const [carregando, setCarregando] = useState(false)
  const [dialogoAberto, setDialogoAberto] = useState(false)
  const [arquivo, setArquivo] = useState(null)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [aulaId, setAulaId] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [baixandoId, setBaixandoId] = useState(null)
  const [materialExcluir, setMaterialExcluir] = useState(null)
  const [excluindo, setExcluindo] = useState(false)
  const [msg, setMsg] = useState('')
  const [ehErro, setEhErro] = useState(true)
  const inputArquivo = useRef(null)
  const dialogoTelaCheia = useDialogoTelaCheia()
  const avisar = (texto, erro = true) => { setEhErro(erro); setMsg(texto) }

  const aulasDaMateria = useMemo(
    () => aulas.filter((aula) => String(aula.docturma_id) === String(docturmaId)),
    [aulas, docturmaId],
  )
  const vinculoSelecionado = vinculos.find((item) => String(item.docturma_id) === String(docturmaId))
  const materiaisFiltrados = materiais.filter((material) => {
    if (filtroAula === 'TODOS') return true
    if (filtroAula === 'GERAL') return material.aula_id == null
    return String(material.aula_id) === String(filtroAula)
  })

  const carregarMateriais = useCallback(async (id) => {
    if (!id) { setMateriais([]); return }
    setCarregando(true)
    try {
      setMateriais(await api.get(`/materiais?docturma_id=${id}`))
    } catch (e) {
      avisar(e.message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    api.get('/materiais/opcoes')
      .then((resposta) => {
        setVinculos(resposta.vinculos || [])
        setAulas(resposta.aulas || [])
        setLimiteMb(resposta.limite_upload_mb || LIMITE_PADRAO_MB)
        setDocturmaId((atual) => atual || String(resposta.vinculos?.[0]?.docturma_id || ''))
      })
      .catch((e) => avisar(e.message))
  }, [])

  useEffect(() => {
    setFiltroAula('TODOS')
    carregarMateriais(docturmaId)
  }, [docturmaId, carregarMateriais])

  function abrirDialogo() {
    setArquivo(null)
    setTitulo('')
    setDescricao('')
    setAulaId('')
    if (inputArquivo.current) inputArquivo.current.value = ''
    setDialogoAberto(true)
  }

  function fecharDialogo() {
    if (!enviando) setDialogoAberto(false)
  }

  async function anexar() {
    if (!arquivo || !docturmaId) return
    if (arquivo.size > limiteMb * 1024 * 1024) {
      avisar(`O arquivo deve ter no máximo ${limiteMb} MB.`)
      return
    }
    setEnviando(true)
    try {
      await enviarArquivoJson('/materiais', arquivo, {
        docturma_id: docturmaId,
        aula_id: aulaId || null,
        titulo,
        descricao,
      })
      setDialogoAberto(false)
      avisar('Material anexado com sucesso.', false)
      await carregarMateriais(docturmaId)
    } catch (e) {
      avisar(e.message)
    } finally {
      setEnviando(false)
    }
  }

  async function baixar(material) {
    setBaixandoId(material.id)
    try {
      await baixarArquivo(material.url, material.nome_arquivo)
    } catch (e) {
      avisar(e.message)
    } finally {
      setBaixandoId(null)
    }
  }

  async function excluir() {
    if (!materialExcluir) return
    setExcluindo(true)
    try {
      await api.del(`/materiais/${materialExcluir.id}`)
      setMaterialExcluir(null)
      avisar('Material removido.', false)
      await carregarMateriais(docturmaId)
    } catch (e) {
      avisar(e.message)
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <Box>
      <CabecalhoPagina
        variante="operacional"
        titulo="Materiais didáticos"
        descricao="Compartilhe arquivos para a matéria inteira ou organize-os por aula específica."
        acoes={(
          <Button variant="contained" startIcon={<AttachFileIcon />} disabled={!docturmaId} onClick={abrirDialogo}>
            Anexar material
          </Button>
        )}
      />

      <BarraFiltros sx={{ alignItems: 'flex-end', mb: 2.5 }}>
        <TextField
          select size="small" label="Matéria e turma" value={docturmaId}
          onChange={(e) => setDocturmaId(e.target.value)}
          sx={{ flex: '1 1 330px', maxWidth: 560 }}
        >
          {vinculos.length === 0 && <MenuItem value="">Nenhuma matéria vinculada</MenuItem>}
          {vinculos.map((vinculo) => (
            <MenuItem key={vinculo.docturma_id} value={String(vinculo.docturma_id)}>{rotuloVinculo(vinculo)}</MenuItem>
          ))}
        </TextField>
        <TextField
          select size="small" label="Exibir" value={filtroAula}
          onChange={(e) => setFiltroAula(e.target.value)}
          disabled={!docturmaId}
          sx={{ flex: '1 1 240px', maxWidth: 400 }}
        >
          <MenuItem value="TODOS">Todos os materiais</MenuItem>
          <MenuItem value="GERAL">Gerais da matéria</MenuItem>
          {aulasDaMateria.map((aula) => <MenuItem key={aula.id} value={String(aula.id)}>Aula · {rotuloAula(aula)}</MenuItem>)}
        </TextField>
        <Typography sx={{ ml: { md: 'auto' }, color: TOV.caption, fontSize: TOV.type.bodySm, pb: 1 }}>
          {materiaisFiltrados.length} {materiaisFiltrados.length === 1 ? 'material' : 'materiais'}
        </Typography>
      </BarraFiltros>

      {!docturmaId ? (
        <Box sx={cardSx}>
          <EstadoVazio
            titulo="Nenhuma matéria disponível"
            descricao="Os materiais poderão ser anexados depois que o professor estiver vinculado a uma matéria e turma."
          />
        </Box>
      ) : carregando ? (
        <Box sx={{ ...cardSx, p: 5, textAlign: 'center' }}><CircularProgress size={30} /></Box>
      ) : materiaisFiltrados.length === 0 ? (
        <Box sx={cardSx}>
          <EstadoVazio
            titulo="Nenhum material anexado"
            descricao={`Comece adicionando um arquivo para ${vinculoSelecionado?.materia_nome || 'esta matéria'}.`}
            acao={<Button variant="outlined" startIcon={<AttachFileIcon />} onClick={abrirDialogo}>Anexar primeiro material</Button>}
          />
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
          {materiaisFiltrados.map((material) => (
            <Box key={material.id} component="article" sx={{ ...cardSx, p: { xs: 2, sm: 2.5 }, display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <Box aria-hidden="true" sx={{ width: 46, height: 46, borderRadius: TOV.radiusSm, bgcolor: TOV.graphiteTint, color: TOV.graphite, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <InsertDriveFileOutlinedIcon />
              </Box>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography component="h2" sx={{ fontWeight: 700, fontSize: TOV.type.bodyLg, overflowWrap: 'anywhere' }}>{material.titulo}</Typography>
                    <Typography sx={{ color: TOV.caption, fontSize: TOV.type.caption, mt: 0.5, overflowWrap: 'anywhere' }}>
                      {material.nome_arquivo} · {formatarTamanho(material.tamanho)}
                    </Typography>
                  </Box>
                  <StatusBadge tom={material.aula ? 'info' : 'neutral'} sx={{ flexShrink: 0 }}>
                    {material.aula ? 'Aula específica' : 'Toda a matéria'}
                  </StatusBadge>
                </Box>
                {material.aula && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: TOV.graphite, fontSize: TOV.type.bodySm, mt: 1.5 }}>
                    <EventOutlinedIcon sx={{ fontSize: TOV.type.bodyLg }} />
                    {rotuloAula(material.aula)}
                  </Box>
                )}
                {!material.aula && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: TOV.graphite, fontSize: TOV.type.bodySm, mt: 1.5 }}>
                    <MenuBookOutlinedIcon sx={{ fontSize: TOV.type.bodyLg }} /> Disponível em todas as aulas da matéria
                  </Box>
                )}
                {material.descricao && <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 1.5, whiteSpace: 'pre-wrap' }}>{material.descricao}</Typography>}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 2 }}>
                  <Button size="small" variant="outlined" startIcon={baixandoId === material.id ? <CircularProgress size={15} /> : <CloudDownloadOutlinedIcon />} disabled={baixandoId === material.id} onClick={() => baixar(material)}>
                    Baixar
                  </Button>
                  <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setMaterialExcluir(material)}>Remover</Button>
                  <Typography sx={{ ml: { sm: 'auto' }, color: TOV.caption, fontSize: TOV.type.overline }}>Enviado em {formatarDataHora(material.criado_em)}</Typography>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Dialog open={dialogoAberto} onClose={fecharDialogo} maxWidth="sm" fullWidth fullScreen={dialogoTelaCheia}>
        <DialogTitle>Anexar material</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <Alert severity="info" icon={<MenuBookOutlinedIcon />}>
            {vinculoSelecionado ? rotuloVinculo(vinculoSelecionado) : 'Selecione uma matéria'}
          </Alert>
          <TextField select fullWidth label="Disponibilizar em" value={aulaId} onChange={(e) => setAulaId(e.target.value)}>
            <MenuItem value="">Toda a matéria</MenuItem>
            {aulasDaMateria.map((aula) => <MenuItem key={aula.id} value={String(aula.id)}>Aula · {rotuloAula(aula)}</MenuItem>)}
          </TextField>
          <TextField fullWidth label="Título (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} inputProps={{ maxLength: 150 }} helperText="Se ficar vazio, será usado o nome do arquivo." />
          <TextField fullWidth multiline minRows={3} label="Descrição (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} inputProps={{ maxLength: 2000 }} />
          <Box sx={{ border: `1px dashed ${arquivo ? TOV.coral : TOV.border}`, borderRadius: TOV.radiusMd, p: 2.5, bgcolor: arquivo ? TOV.coralTint : TOV.canvas, textAlign: 'center' }}>
            <UploadFileIcon sx={{ fontSize: TOV.type.displaySm, color: arquivo ? TOV.coral : TOV.caption }} />
            <Typography sx={{ fontWeight: 700, mt: 0.5, overflowWrap: 'anywhere' }}>{arquivo?.name || 'Selecione o arquivo do material'}</Typography>
            <Typography sx={{ color: TOV.caption, fontSize: TOV.type.caption, mt: 0.5 }}>
              PDF, Office, texto, imagem, áudio, vídeo, ZIP ou EPUB · até {limiteMb} MB
            </Typography>
            <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} sx={{ mt: 1.5 }}>
              {arquivo ? 'Trocar arquivo' : 'Escolher arquivo'}
              <input
                ref={inputArquivo}
                hidden type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp,.gif,.mp3,.m4a,.ogg,.wav,.mp4,.webm,.zip,.epub"
                onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              />
            </Button>
          </Box>
          {arquivo?.size > limiteMb * 1024 * 1024 && <Alert severity="error">O arquivo selecionado ultrapassa {limiteMb} MB.</Alert>}
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={fecharDialogo} disabled={enviando}>Cancelar</Button>
          <Button variant="contained" startIcon={enviando ? <CircularProgress size={16} color="inherit" /> : <AttachFileIcon />} disabled={!arquivo || enviando || arquivo.size > limiteMb * 1024 * 1024} onClick={anexar}>
            {enviando ? 'Enviando…' : 'Anexar material'}
          </Button>
        </DialogActions>
      </Dialog>

      <DialogoConfirmacao
        aberto={!!materialExcluir}
        titulo="Remover material?"
        descricao={`O arquivo ${materialExcluir?.nome_arquivo || ''} deixará de ficar disponível nesta matéria.`}
        rotuloConfirmar="Remover"
        processando={excluindo}
        onConfirmar={excluir}
        onFechar={() => !excluindo && setMaterialExcluir(null)}
      />

      <Snackbar open={!!msg} autoHideDuration={5000} onClose={() => setMsg('')}>
        <Alert severity={ehErro ? 'error' : 'success'} onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
