import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
  Snackbar, TextField, Typography,
} from '@mui/material'
import { api } from '../api'
import { TOV } from '../theme'
import { CabecalhoPagina, DialogoConfirmacao, EstadoErro, SkeletonCards, resetBotao, useDialogoTelaCheia } from '../ui'
import { useClearUnsavedChanges, useDirtyForm } from '../UnsavedChanges'

function mesAno(iso) {
  if (!iso) return null
  const [ano, mes] = iso.split('-')
  return mes ? `${mes}/${ano}` : ano
}

function CardTurma({ turma, onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        ...resetBotao, display: 'block', width: '100%',
        bgcolor: TOV.surface, borderRadius: `${TOV.radiusMd}px`, p: '24px 26px',
        border: `1px solid ${TOV.border}`, boxShadow: 'none',
        transition: `transform ${TOV.durationFast} ${TOV.ease}, border-color ${TOV.durationFast} ${TOV.ease}`,
        '&:hover': { transform: 'translateY(-1px)', borderColor: '#BFB5AD' },
        '&:focus-visible': { outline: `3px solid ${TOV.coralTintStrong}`, outlineOffset: 2, borderRadius: `${TOV.radiusMd}px` },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box component="span" sx={{ px: 1.5, py: '5px', bgcolor: TOV.coralTint, color: TOV.coral, borderRadius: 999, fontSize: 12, fontWeight: 700 }}>#{turma.cod_tur}</Box>
        {turma.horario && <Typography component="span" sx={{ fontSize: 13, color: TOV.caption }}>{turma.horario}</Typography>}
      </Box>
      <Typography variant="h3" sx={{ fontSize: 24, mb: 0.75 }}>{turma.nome}</Typography>
      <Typography sx={{ fontSize: 14, color: TOV.caption, mb: 2.5 }}>{turma.curso || 'Curso não informado'}</Typography>
      <Box sx={{ display: 'flex', gap: 3, pt: 2.25, borderTop: `1px solid ${TOV.offwhite}`, alignItems: 'flex-end' }}>
        <Box>
          <Box sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 28 }}>{turma.qtd_alunos ?? 0}</Box>
          <Box sx={{ fontSize: 12, color: TOV.caption }}>alunos</Box>
        </Box>
        {mesAno(turma.dat_ini) && (
          <Box sx={{ ml: 'auto', fontSize: 13, color: TOV.caption }}>Início {mesAno(turma.dat_ini)}</Box>
        )}
      </Box>
    </Box>
  )
}

export default function Turmas() {
  const [turmas, setTurmas] = useState(null)
  const [form, setForm] = useState(null)
  const [confirmarFecharForm, setConfirmarFecharForm] = useState(false)
  const [msg, setMsg] = useState('')
  const navigate = useNavigate()
  const telaCheia = useDialogoTelaCheia()
  const formAlterado = useDirtyForm(!!form, form, 'Há dados da turma que ainda não foram salvos.')
  const liberarProtecao = useClearUnsavedChanges()

  function abrirForm() {
    setForm({ nome: '' })
    setConfirmarFecharForm(false)
  }

  function fecharForm() {
    if (formAlterado) setConfirmarFecharForm(true)
    else setForm(null)
  }

  function carregar() {
    setMsg('')
    api.getCached('/turmas').then(setTurmas).catch((e) => setMsg(e.message))
  }
  useEffect(() => { carregar() }, [])

  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    try {
      const criada = await api.post('/turmas', form)
      liberarProtecao()
      setForm(null)
      navigate(`/turmas/${criada.cod_tur}`)
    } catch (e) {
      setMsg(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const cursos = turmas ? new Set(turmas.map((t) => t.curso).filter(Boolean)).size : 0

  return (
    <Box>
      <CabecalhoPagina
        titulo="Turmas"
        subtitulo={turmas ? `${turmas.length} ${turmas.length === 1 ? 'turma' : 'turmas'} · ${cursos} ${cursos === 1 ? 'curso' : 'cursos'}` : ' '}
        acoes={<Button variant="contained" onClick={abrirForm} sx={{ height: 46 }}>+ Nova turma</Button>}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', lg: 'repeat(3,1fr)' }, gap: '18px' }}>
        {!turmas && msg && <EstadoErro titulo="Não foi possível carregar as turmas" descricao={msg} onTentarNovamente={carregar} sx={{ gridColumn: '1 / -1' }} />}
        {!turmas && !msg && <SkeletonCards quantidade={3} altura={200} sx={{ display: 'contents' }} />}
        {turmas && turmas.map((t) => (
          <CardTurma key={t.cod_tur} turma={t} onClick={() => navigate(`/turmas/${t.cod_tur}`)} />
        ))}
        {turmas && (
          <Box
            component="button"
            type="button"
            onClick={abrirForm}
            sx={{
              ...resetBotao,
              bgcolor: 'transparent', border: `1px dashed #C8BDB4`, borderRadius: `${TOV.radiusMd}px`, p: '26px 28px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              color: TOV.caption, minHeight: 200,
              '&:hover': { borderColor: TOV.coral },
              '&:focus-visible': { outline: `3px solid ${TOV.coralTintStrong}`, outlineOffset: 2, borderRadius: `${TOV.radiusMd}px` },
            }}
          >
            <Box sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 34, color: TOV.coral }}>+</Box>
            <Box sx={{ fontWeight: 600, mt: 0.75 }}>Criar nova turma</Box>
          </Box>
        )}
      </Box>

      <Dialog open={!!form} onClose={salvando ? undefined : fecharForm} maxWidth="sm" fullWidth fullScreen={telaCheia}>
        <DialogTitle>Nova turma</DialogTitle>
        <DialogContent>
          {form && (
            <Grid container spacing={1.5} sx={{ mt: 0 }}>
              <Grid item xs={12}>
                <TextField size="small" fullWidth required label="Nome" value={form.nome ?? ''}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField size="small" fullWidth label="Curso" value={form.curso ?? ''}
                  onChange={(e) => setForm({ ...form, curso: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField size="small" fullWidth label="Horário" placeholder="ex.: Sábado 19h"
                  value={form.horario ?? ''}
                  onChange={(e) => setForm({ ...form, horario: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField size="small" fullWidth label="Data de início" type="date"
                  InputLabelProps={{ shrink: true }} value={form.dat_ini ?? ''}
                  onChange={(e) => setForm({ ...form, dat_ini: e.target.value || null })} />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button onClick={fecharForm} variant="outlined" disabled={salvando}>Cancelar</Button>
          <Button variant="contained" onClick={salvar} disabled={!form?.nome?.trim() || salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>

      <DialogoConfirmacao
        aberto={confirmarFecharForm}
        titulo="Descartar nova turma?"
        descricao="As informações preenchidas serão perdidas."
        rotuloConfirmar="Descartar"
        processando={false}
        onConfirmar={() => { setConfirmarFecharForm(false); setForm(null) }}
        onFechar={() => setConfirmarFecharForm(false)}
      />

      <Snackbar open={!!msg && !!turmas} autoHideDuration={6000} onClose={() => setMsg('')}>
        <Alert severity="error" onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
