import { useEffect, useRef, useState } from 'react'
import {
  Alert, Autocomplete, Box, Button, CircularProgress, MenuItem, Snackbar,
  TextField, Typography,
} from '@mui/material'
import { api, abrirArquivo, enviarArquivoEBaixar } from '../api'
import { TOV } from '../theme'
import { Eyebrow, Regua, cardSx } from '../ui'

/** Botão-pílula usado nas ações dos cards (fundo off-white ou escuro). */
function PillAcao({ children, escuro, disabled, onClick }) {
  return (
    <Box
      onClick={disabled ? undefined : onClick}
      sx={{
        px: 2.25, py: 1.4, borderRadius: '10px', fontWeight: 600, fontSize: 14,
        textAlign: 'center', flexGrow: { xs: 1, sm: 0 },
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, userSelect: 'none',
        bgcolor: escuro ? TOV.ink : TOV.offwhite, color: escuro ? '#fff' : TOV.ink,
        transition: 'background-color .15s, color .15s',
        '&:hover': disabled ? {} : { bgcolor: escuro ? '#000' : TOV.coralTint, color: escuro ? '#fff' : TOV.coral },
      }}
    >
      {children}
    </Box>
  )
}

function IconeCard({ letra, cor, bg }) {
  return (
    <Box sx={{ width: 44, height: 44, borderRadius: '12px', bgcolor: bg, color: cor, fontFamily: TOV.fontHead, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
      {letra}
    </Box>
  )
}

export default function Relatorios() {
  const [turmas, setTurmas] = useState([])
  const [codTur, setCodTur] = useState('')
  const [buscaAluno, setBuscaAluno] = useState('')
  const [opcoes, setOpcoes] = useState([])
  const [aluno, setAluno] = useState(null)
  const [msg, setMsg] = useState('')
  const [ehErro, setEhErro] = useState(true)

  const [tipoLote, setTipoLote] = useState('boletim')
  const [arquivoLote, setArquivoLote] = useState(null)
  const [gerandoLote, setGerandoLote] = useState(false)
  const [arrastando, setArrastando] = useState(false)
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
    if (!arquivoLote) return
    setGerandoLote(true)
    try {
      await enviarArquivoEBaixar(`/relatorios/lote?tipo=${tipoLote}`, arquivoLote, `${tipoLote}s_lote.zip`)
      setEhErro(false)
      setMsg('ZIP gerado e baixado. Confira o arquivo _NAO_ENCONTRADOS.txt caso algum aluno não tenha sido localizado.')
    } catch (e) {
      setEhErro(true)
      setMsg(e.message)
    } finally {
      setGerandoLote(false)
    }
  }

  function soltarArquivo(e) {
    e.preventDefault()
    setArrastando(false)
    const f = e.dataTransfer.files?.[0]
    if (f) setArquivoLote(f)
  }

  return (
    <Box>
      <Regua sx={{ mb: 2 }} />
      <Typography variant="h1" sx={{ fontSize: { xs: 30, sm: 36, md: 44 }, mb: 1 }}>Relatórios e documentos</Typography>
      <Typography sx={{ fontSize: 16, color: TOV.caption, mb: 3.25 }}>
        Gere boletins, históricos, diários e listas em PDF — individual, por turma ou em lote.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '18px', mb: '18px' }}>
        {/* Por aluno */}
        <Box sx={{ ...cardSx, p: { xs: '20px', md: '28px 30px' } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.25 }}>
            <IconeCard letra="A" cor={TOV.coral} bg={TOV.coralTint} />
            <Typography variant="h3" sx={{ fontSize: 22 }}>Por aluno</Typography>
          </Box>
          <Autocomplete
            size="small" options={opcoes} value={aluno}
            getOptionLabel={(a) => `${a.cod_alu} - ${a.nome}`}
            isOptionEqualToValue={(a, b) => a.cod_alu === b.cod_alu}
            onInputChange={(_, v) => setBuscaAluno(v)}
            onChange={(_, v) => setAluno(v)}
            renderInput={(p) => <TextField {...p} label="Buscar aluno por nome ou matrícula" />}
            noOptionsText="Digite ao menos 2 letras"
            sx={{ mb: 2.25 }}
          />
          <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
            <PillAcao disabled={!aluno} onClick={() => abrir(`/relatorios/boletim/${aluno.cod_alu}`)}>Boletim</PillAcao>
            <PillAcao disabled={!aluno} onClick={() => abrir(`/relatorios/historico/${aluno.cod_alu}`)}>Histórico escolar</PillAcao>
            <PillAcao disabled={!aluno} onClick={() => abrir(`/relatorios/ficha-aluno/${aluno.cod_alu}`)}>Ficha cadastral</PillAcao>
          </Box>
        </Box>

        {/* Por turma */}
        <Box sx={{ ...cardSx, p: { xs: '20px', md: '28px 30px' } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.25 }}>
            <IconeCard letra="T" cor={TOV.slate} bg={TOV.slateTint} />
            <Typography variant="h3" sx={{ fontSize: 22 }}>Por turma</Typography>
          </Box>
          <TextField select fullWidth size="small" label="Turma" value={codTur}
            onChange={(e) => setCodTur(e.target.value)} sx={{ mb: 2.25 }}>
            {turmas.map((t) => (
              <MenuItem key={t.cod_tur} value={t.cod_tur}>{t.nome} ({t.qtd_alunos} alunos)</MenuItem>
            ))}
          </TextField>
          <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
            <PillAcao disabled={!codTur} onClick={() => abrir(`/relatorios/lista-turma/${codTur}`)}>Lista de alunos</PillAcao>
            <PillAcao disabled={!codTur} onClick={() => abrir(`/relatorios/diario/${codTur}`)}>Diário de classe</PillAcao>
            <PillAcao escuro disabled={!codTur} onClick={() => abrir(`/relatorios/boletim-turma/${codTur}`)}>Boletins da turma (ZIP)</PillAcao>
          </Box>
        </Box>
      </Box>

      {/* Geração em lote */}
      <Box sx={{ bgcolor: TOV.ink, borderRadius: '16px', p: { xs: '20px', md: '30px 34px' }, color: '#fff' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 3.75, flexWrap: 'wrap' }}>
          <Box sx={{ maxWidth: 520 }}>
            <Eyebrow sx={{ color: TOV.coral, mb: 1.25 }}>Geração em lote</Eyebrow>
            <Typography variant="h3" sx={{ fontSize: 26, color: '#fff', mb: 1.5 }}>Vários PDFs de uma vez</Typography>
            <Typography sx={{ fontSize: 15, lineHeight: 1.5, color: 'rgba(255,255,255,.75)' }}>
              Envie um arquivo <b style={{ color: '#fff' }}>.csv</b>, <b style={{ color: '#fff' }}>.xlsx</b> ou <b style={{ color: '#fff' }}>.xls</b> com
              as matrículas ou nomes na primeira coluna. Geramos um ZIP com um PDF por aluno.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 2.25 }}>
              {[['boletim', 'Boletins'], ['historico', 'Históricos']].map(([v, label]) => (
                <Box key={v} onClick={() => setTipoLote(v)}
                  sx={{ px: 2, py: 1.1, borderRadius: 999, fontWeight: tipoLote === v ? 700 : 600, fontSize: 13, cursor: 'pointer',
                    bgcolor: tipoLote === v ? TOV.coral : 'rgba(255,255,255,.12)', color: tipoLote === v ? '#fff' : 'rgba(255,255,255,.85)' }}>
                  {label}
                </Box>
              ))}
            </Box>
          </Box>

          <Box
            onClick={() => inputArquivo.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
            onDragLeave={() => setArrastando(false)}
            onDrop={soltarArquivo}
            sx={{
              flex: 1, minWidth: { xs: '100%', sm: 300 }, border: `2px dashed ${arrastando ? TOV.coral : 'rgba(255,255,255,.25)'}`,
              borderRadius: '14px', p: { xs: '24px 16px', sm: '34px' }, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', textAlign: 'center', cursor: 'pointer', transition: 'border-color .15s',
              bgcolor: arrastando ? 'rgba(241,73,73,.08)' : 'transparent',
            }}
          >
            <input ref={inputArquivo} type="file" hidden accept=".csv,.xlsx,.xls,.txt"
              onChange={(e) => setArquivoLote(e.target.files[0] ?? null)} />
            <Box sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 40, color: TOV.coral }}>↑</Box>
            <Box sx={{ fontWeight: 700, fontSize: 16, mt: 1 }}>Arraste um arquivo ou clique</Box>
            <Box sx={{ fontSize: 13, color: arquivoLote ? '#fff' : 'rgba(255,255,255,.6)', mt: 0.75 }}>
              {arquivoLote ? arquivoLote.name : 'nenhum arquivo selecionado'}
            </Box>
            <Button
              variant="contained" disabled={!arquivoLote || gerandoLote}
              startIcon={gerandoLote ? <CircularProgress size={16} color="inherit" /> : null}
              onClick={(e) => { e.stopPropagation(); gerarLote() }}
              sx={{ mt: 2.25, height: 46 }}
            >
              {gerandoLote ? 'Gerando…' : 'Gerar ZIP'}
            </Button>
          </Box>
        </Box>
      </Box>

      <Snackbar open={!!msg} autoHideDuration={8000} onClose={() => setMsg('')}>
        <Alert severity={ehErro ? 'error' : 'success'} onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
