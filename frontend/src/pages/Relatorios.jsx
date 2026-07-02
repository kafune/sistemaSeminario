import { useEffect, useRef, useState } from 'react'
import {
  Alert, Autocomplete, Box, Button, Card, CardActions, CardContent, Chip,
  CircularProgress, Grid, MenuItem, Snackbar, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import FolderZipIcon from '@mui/icons-material/FolderZip'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { api, abrirArquivo, enviarArquivoEBaixar } from '../api'

export default function Relatorios() {
  const [turmas, setTurmas] = useState([])
  const [codTur, setCodTur] = useState('')
  const [buscaAluno, setBuscaAluno] = useState('')
  const [opcoes, setOpcoes] = useState([])
  const [aluno, setAluno] = useState(null)
  const [msg, setMsg] = useState('')
  const [ehErro, setEhErro] = useState(true)

  // geração em lote
  const [tipoLote, setTipoLote] = useState('boletim')
  const [arquivoLote, setArquivoLote] = useState(null)
  const [gerandoLote, setGerandoLote] = useState(false)
  const inputArquivo = useRef(null)

  useEffect(() => {
    api.get('/turmas').then(setTurmas).catch(() => {})
  }, [])

  useEffect(() => {
    if (buscaAluno.length < 2) return
    const t = setTimeout(() => {
      api.get(`/alunos?busca=${encodeURIComponent(buscaAluno)}&por_pagina=20`)
        .then((r) => setOpcoes(r.itens))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [buscaAluno])

  const abrir = (path) => abrirArquivo(path).catch((e) => { setEhErro(true); setMsg(e.message) })

  async function gerarLote() {
    setGerandoLote(true)
    try {
      await enviarArquivoEBaixar(
        `/relatorios/lote?tipo=${tipoLote}`,
        arquivoLote,
        `${tipoLote}s_lote.zip`,
      )
      setEhErro(false)
      setMsg('ZIP gerado e baixado. Confira o arquivo _NAO_ENCONTRADOS.txt caso algum aluno não tenha sido localizado.')
    } catch (e) {
      setEhErro(true)
      setMsg(e.message)
    } finally {
      setGerandoLote(false)
    }
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Relatórios e documentos</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Por aluno</Typography>
              <Autocomplete
                size="small" options={opcoes} value={aluno}
                getOptionLabel={(a) => `${a.cod_alu} - ${a.nome}`}
                isOptionEqualToValue={(a, b) => a.cod_alu === b.cod_alu}
                onInputChange={(_, v) => setBuscaAluno(v)}
                onChange={(_, v) => setAluno(v)}
                renderInput={(p) => <TextField {...p} label="Buscar aluno" />}
                noOptionsText="Digite ao menos 2 letras"
              />
            </CardContent>
            <CardActions sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Button startIcon={<PictureAsPdfIcon />} disabled={!aluno}
                onClick={() => abrir(`/relatorios/boletim/${aluno.cod_alu}`)}>Boletim</Button>
              <Button startIcon={<PictureAsPdfIcon />} disabled={!aluno}
                onClick={() => abrir(`/relatorios/historico/${aluno.cod_alu}`)}>Histórico escolar</Button>
              <Button startIcon={<PictureAsPdfIcon />} disabled={!aluno}
                onClick={() => abrir(`/relatorios/ficha-aluno/${aluno.cod_alu}`)}>Ficha cadastral</Button>
            </CardActions>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Por turma</Typography>
              <TextField
                select fullWidth size="small" label="Turma" value={codTur}
                onChange={(e) => setCodTur(e.target.value)}
              >
                {turmas.map((t) => (
                  <MenuItem key={t.cod_tur} value={t.cod_tur}>
                    {t.nome} ({t.qtd_alunos} alunos)
                  </MenuItem>
                ))}
              </TextField>
            </CardContent>
            <CardActions sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Button startIcon={<PictureAsPdfIcon />} disabled={!codTur}
                onClick={() => abrir(`/relatorios/lista-turma/${codTur}`)}>Lista de alunos</Button>
              <Button startIcon={<PictureAsPdfIcon />} disabled={!codTur}
                onClick={() => abrir(`/relatorios/diario/${codTur}`)}>Diário de classe</Button>
              <Button startIcon={<FolderZipIcon />} disabled={!codTur}
                onClick={() => abrir(`/relatorios/boletim-turma/${codTur}`)}>Boletins da turma (ZIP)</Button>
            </CardActions>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Em lote (a partir de arquivo)</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Envie um arquivo <b>.csv</b>, <b>.xlsx</b> ou <b>.xls</b> com as matrículas
                ou os nomes dos alunos na <b>primeira coluna</b> (uma linha por aluno; o
                cabeçalho é ignorado). Será gerado um ZIP com um PDF por aluno.
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <ToggleButtonGroup
                  exclusive size="small" value={tipoLote}
                  onChange={(_, v) => v && setTipoLote(v)}
                >
                  <ToggleButton value="boletim">Boletins</ToggleButton>
                  <ToggleButton value="historico">Históricos</ToggleButton>
                </ToggleButtonGroup>
                <input
                  ref={inputArquivo} type="file" hidden accept=".csv,.xlsx,.xls,.txt"
                  onChange={(e) => setArquivoLote(e.target.files[0] ?? null)}
                />
                <Button
                  variant="outlined" startIcon={<UploadFileIcon />}
                  onClick={() => inputArquivo.current.click()}
                >
                  Escolher arquivo
                </Button>
                {arquivoLote && (
                  <Chip label={arquivoLote.name} onDelete={() => { setArquivoLote(null); inputArquivo.current.value = '' }} />
                )}
                <Button
                  variant="contained" disabled={!arquivoLote || gerandoLote}
                  startIcon={gerandoLote ? <CircularProgress size={16} /> : <FolderZipIcon />}
                  onClick={gerarLote}
                >
                  {gerandoLote ? 'Gerando...' : 'Gerar ZIP'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <Snackbar open={!!msg} autoHideDuration={8000} onClose={() => setMsg('')}>
        <Alert severity={ehErro ? 'error' : 'success'} onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
