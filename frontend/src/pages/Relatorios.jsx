import { useEffect, useRef, useState } from 'react'
import {
  Alert, Autocomplete, Box, Button, CircularProgress, MenuItem, Snackbar,
  TextField, Typography,
} from '@mui/material'
import { api, abrirArquivo, enviarArquivoEBaixar } from '../api'
import { TOV, focusRing, focusRingOnDark } from '../theme'
import { CabecalhoPagina, Eyebrow, Superficie, cardSx, resetBotao } from '../ui'

/** Botão-pílula usado nas ações dos cards (fundo off-white ou escuro). */
function PillAcao({ children, escuro, disabled, carregando, onClick }) {
  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      aria-busy={carregando || undefined}
      sx={{
        ...resetBotao,
        px: 2.5, py: 1.5, borderRadius: TOV.radiusSm, fontWeight: 600, fontSize: TOV.type.body,
        textAlign: 'center', flexGrow: { xs: 1, sm: 0 }, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 1,
        opacity: disabled ? 0.45 : 1, userSelect: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        bgcolor: escuro ? TOV.ink : TOV.offwhite, color: escuro ? TOV.onDark : TOV.ink,
        transition: `background-color ${TOV.transitionFast}, color ${TOV.transitionFast}`,
        '&:hover': disabled ? {} : { bgcolor: escuro ? TOV.graphite : TOV.coralTint, color: escuro ? TOV.onDark : TOV.coral },
        '&:focus-visible': escuro ? focusRingOnDark : focusRing,
      }}
    >
      {carregando && <CircularProgress size={16} color="inherit" />}
      {carregando ? 'Gerando…' : children}
    </Box>
  )
}

function IconeCard({ letra, cor, bg }) {
  return (
    <Box sx={{ width: 44, height: 44, borderRadius: TOV.radiusMd, bgcolor: bg, color: cor, fontFamily: TOV.fontHead, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: TOV.type.titleSm }}>
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
  const [abrindo, setAbrindo] = useState('')

  const [tipoLote, setTipoLote] = useState('boletim')
  const [arquivoLote, setArquivoLote] = useState(null)
  const [gerandoLote, setGerandoLote] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const inputArquivo = useRef(null)

  useEffect(() => {
    api.getCached('/turmas').then(setTurmas).catch(() => {})
  }, [])

  useEffect(() => {
    if (buscaAluno.length < 2) return
    const controller = new AbortController()
    const t = setTimeout(() => {
      api.get(`/alunos?busca=${encodeURIComponent(buscaAluno)}&por_pagina=20`, { signal: controller.signal })
        .then((r) => setOpcoes(r.itens))
        .catch((e) => { if (e.name !== 'AbortError') setOpcoes([]) })
    }, 300)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [buscaAluno])

  const abrir = async (path) => {
    if (abrindo) return
    setAbrindo(path)
    try {
      await abrirArquivo(path)
    } catch (e) {
      setEhErro(true)
      setMsg(e.message)
    } finally {
      setAbrindo('')
    }
  }

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
      <CabecalhoPagina
        titulo="Relatórios e documentos"
        descricao="Gere boletins, históricos, diários e listas em PDF — individualmente, por turma ou em lote."
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5, mb: 2.5 }}>
        {/* Por aluno */}
          <Box sx={{ ...cardSx, p: { xs: '20px', md: '28px 32px' } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
            <IconeCard letra="A" cor={TOV.graphite} bg={TOV.slateTint} />
            <Typography variant="h3" sx={{ fontSize: TOV.type.titleSm }}>Por aluno</Typography>
          </Box>
          <Autocomplete
            size="small" options={opcoes} value={aluno}
            getOptionLabel={(a) => `${a.cod_alu} - ${a.nome}`}
            isOptionEqualToValue={(a, b) => a.cod_alu === b.cod_alu}
            onInputChange={(_, v) => setBuscaAluno(v)}
            onChange={(_, v) => setAluno(v)}
            renderInput={(p) => <TextField {...p} label="Buscar aluno por nome ou matrícula" />}
            noOptionsText="Digite ao menos 2 letras"
            sx={{ mb: 2.5 }}
          />
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <PillAcao disabled={!aluno || !!abrindo} carregando={abrindo === `/relatorios/boletim/${aluno?.cod_alu}`} onClick={() => abrir(`/relatorios/boletim/${aluno.cod_alu}`)}>Boletim</PillAcao>
            <PillAcao disabled={!aluno || !!abrindo} carregando={abrindo === `/relatorios/historico/${aluno?.cod_alu}`} onClick={() => abrir(`/relatorios/historico/${aluno.cod_alu}`)}>Histórico escolar</PillAcao>
            <PillAcao disabled={!aluno || !!abrindo} carregando={abrindo === `/relatorios/ficha-aluno/${aluno?.cod_alu}`} onClick={() => abrir(`/relatorios/ficha-aluno/${aluno.cod_alu}`)}>Ficha cadastral</PillAcao>
          </Box>
        </Box>

        {/* Por turma */}
          <Box sx={{ ...cardSx, p: { xs: '20px', md: '28px 32px' } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
            <IconeCard letra="T" cor={TOV.slate} bg={TOV.slateTint} />
            <Typography variant="h3" sx={{ fontSize: TOV.type.titleSm }}>Por turma</Typography>
          </Box>
          <TextField select fullWidth size="small" label="Turma" value={codTur}
            onChange={(e) => setCodTur(e.target.value)} sx={{ mb: 2.5 }}>
            {turmas.map((t) => (
              <MenuItem key={t.cod_tur} value={t.cod_tur}>{t.nome} ({t.qtd_alunos} alunos)</MenuItem>
            ))}
          </TextField>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <PillAcao disabled={!codTur || !!abrindo} carregando={abrindo === `/relatorios/lista-turma/${codTur}`} onClick={() => abrir(`/relatorios/lista-turma/${codTur}`)}>Lista de alunos</PillAcao>
            <PillAcao disabled={!codTur || !!abrindo} carregando={abrindo === `/relatorios/diario/${codTur}`} onClick={() => abrir(`/relatorios/diario/${codTur}`)}>Diário de classe</PillAcao>
            <PillAcao escuro disabled={!codTur || !!abrindo} carregando={abrindo === `/relatorios/boletim-turma/${codTur}`} onClick={() => abrir(`/relatorios/boletim-turma/${codTur}`)}>Boletins da turma (ZIP)</PillAcao>
          </Box>
        </Box>
      </Box>

      {/* Geração em lote */}
      <Superficie variante="inverse" sx={{ p: { xs: 2.5, md: 4 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4, flexWrap: 'wrap' }}>
          <Box sx={{ maxWidth: 520 }}>
            <Eyebrow sx={{ color: TOV.onDarkMuted, mb: 1.5 }}>Geração em lote</Eyebrow>
            <Typography variant="h3" sx={{ fontSize: TOV.type.title, color: TOV.onDark, mb: 1.5 }}>Vários PDFs de uma vez</Typography>
            <Typography sx={{ fontSize: TOV.type.bodyLg, lineHeight: 1.5, color: TOV.onDarkBody }}>
              Envie um arquivo <b style={{ color: TOV.onDark }}>.csv</b>, <b style={{ color: TOV.onDark }}>.xlsx</b> ou <b style={{ color: TOV.onDark }}>.xls</b> com
              as matrículas ou nomes na primeira coluna. Geramos um ZIP com um PDF por aluno.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 2.5 }}>
              {[['boletim', 'Boletins'], ['historico', 'Históricos']].map(([v, label]) => (
                <Box component="button" type="button" key={v} onClick={() => setTipoLote(v)}
                  aria-pressed={tipoLote === v}
                  sx={{ ...resetBotao, px: 2, py: 1, borderRadius: TOV.radiusFull, fontWeight: tipoLote === v ? 700 : 600, fontSize: TOV.type.bodySm,
                    bgcolor: tipoLote === v ? TOV.coral : TOV.onDarkSurfaceHover, color: tipoLote === v ? TOV.onDark : TOV.onDarkStrong,
                    '&:focus-visible': focusRingOnDark }}>
                  {label}
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{ flex: 1, minWidth: { xs: '100%', sm: 300 }, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1.5 }}>
            <input id="arquivo-relatorios-lote" ref={inputArquivo} type="file" hidden accept=".csv,.xlsx,.xls,.txt"
              onChange={(e) => setArquivoLote(e.target.files[0] ?? null)} />
            <Box
              component="button"
              type="button"
              onClick={() => inputArquivo.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
              onDragLeave={() => setArrastando(false)}
              onDrop={soltarArquivo}
              aria-describedby="ajuda-arquivo-relatorios"
              sx={{
                ...resetBotao, width: '100%', flex: 1, border: `2px dashed ${arrastando ? TOV.coralOnDark : TOV.onDarkBorderStrong}`,
                borderRadius: TOV.radiusMd, p: { xs: '24px 16px', sm: '32px' }, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', textAlign: 'center', cursor: 'pointer', transition: `border-color ${TOV.transitionFast}`,
                bgcolor: arrastando ? TOV.coralTint : 'transparent', color: TOV.onDark,
              }}
            >
              <Box aria-hidden="true" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.display, color: TOV.onDarkStrong }}>↑</Box>
              <Box sx={{ fontWeight: 700, fontSize: TOV.type.bodyLg, mt: 1 }}>Selecionar ou arrastar arquivo</Box>
              <Box id="ajuda-arquivo-relatorios" sx={{ fontSize: TOV.type.bodySm, color: arquivoLote ? TOV.onDark : TOV.onDarkBody, mt: 1, overflowWrap: 'anywhere' }}>
                {arquivoLote ? arquivoLote.name : 'CSV ou planilha; use Enter para escolher'}
              </Box>
            </Box>
            <Button
              variant="contained" disabled={!arquivoLote || gerandoLote}
              startIcon={gerandoLote ? <CircularProgress size={16} color="inherit" /> : null}
              onClick={gerarLote}
              sx={{ height: 46 }}
            >
              {gerandoLote ? 'Gerando…' : 'Gerar ZIP'}
            </Button>
          </Box>
        </Box>
      </Superficie>

      <Snackbar open={!!msg} autoHideDuration={8000} onClose={() => setMsg('')}>
        <Alert severity={ehErro ? 'error' : 'success'} onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
