import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Snackbar, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DownloadIcon from '@mui/icons-material/Download'
import LinkIcon from '@mui/icons-material/Link'
import { api, baixarArquivo } from '../api'
import { TOV } from '../theme'
import { CabecalhoPagina, DialogoConfirmacao, cardSx, useDialogoTelaCheia } from '../ui'
import CalendarioGrade, { intervaloGrade, isoLocal } from './CalendarioGrade'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const FORM_VAZIO = {
  docturma_id: '', data: '', hora_inicio: '', hora_fim: '', local: '',
  tema: '', observacao: '', status: 'AGENDADA', repetir_ate: '',
}

function unicos(itens, chave, rotulo) {
  const mapa = new Map()
  itens.forEach((item) => {
    if (item[chave] != null) mapa.set(item[chave], item[rotulo] || '—')
  })
  return [...mapa].map(([valor, nome]) => ({ valor, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
}

export default function Calendario() {
  const [mes, setMes] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [aulas, setAulas] = useState([])
  const [vinculos, setVinculos] = useState([])
  const [filtros, setFiltros] = useState({ cod_tur: '', cod_mat: '', cod_pro: '' })
  const [dialogo, setDialogo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [excluir, setExcluir] = useState(null)
  const [mensagem, setMensagem] = useState('')
  const [ehErro, setEhErro] = useState(false)
  const [tokenPublico, setTokenPublico] = useState(null)
  const [turmaDiario, setTurmaDiario] = useState('')
  const [vinculoDiario, setVinculoDiario] = useState('')
  const telaCheia = useDialogoTelaCheia()

  const carregar = useCallback(() => {
    const periodo = intervaloGrade(mes)
    const query = new URLSearchParams(periodo)
    Object.entries(filtros).forEach(([chave, valor]) => { if (valor) query.set(chave, valor) })
    api.get(`/calendario?${query}`).then(setAulas).catch((e) => { setEhErro(true); setMensagem(e.message) })
  }, [mes, filtros])

  useEffect(() => {
    api.get('/calendario/opcoes').then((r) => setVinculos(r.vinculos)).catch(() => {})
    api.get('/calendario/compartilhamento').then((r) => setTokenPublico(r.token)).catch(() => {})
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const turmas = useMemo(() => unicos(vinculos, 'cod_tur', 'turma_nome'), [vinculos])
  const materias = useMemo(() => unicos(vinculos, 'cod_mat', 'materia_nome'), [vinculos])
  const professores = useMemo(() => unicos(vinculos, 'cod_pro', 'professor_nome'), [vinculos])
  const materiasDiario = vinculos.filter((item) => String(item.cod_tur) === String(turmaDiario))

  function abrirNovo(data = isoLocal(new Date())) {
    setEditando(null)
    setForm({ ...FORM_VAZIO, data })
    setDialogo(true)
  }

  function abrirEdicao(aula) {
    setEditando(aula)
    setForm({
      docturma_id: aula.docturma_id, data: aula.data,
      hora_inicio: aula.hora_inicio || '', hora_fim: aula.hora_fim || '',
      local: aula.local || '', tema: aula.tema || '', observacao: aula.observacao || '',
      status: aula.status, repetir_ate: '',
    })
    setDialogo(true)
  }

  async function salvar() {
    setSalvando(true)
    setEhErro(false)
    const corpo = Object.fromEntries(
      Object.entries(form).map(([chave, valor]) => [chave, valor === '' ? null : valor]),
    )
    try {
      if (editando) await api.put(`/calendario/aulas/${editando.id}`, corpo)
      else await api.post('/calendario', corpo)
      setDialogo(false)
      carregar()
      setMensagem(editando ? 'Aula atualizada.' : 'Aula(s) adicionada(s) ao calendário.')
    } catch (e) {
      setEhErro(true)
      setMensagem(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarExclusao() {
    try {
      await api.del(`/calendario/aulas/${excluir.id}`)
      setExcluir(null)
      setDialogo(false)
      carregar()
      setMensagem('Aula excluída.')
    } catch (e) {
      setEhErro(true)
      setMensagem(e.message)
    }
  }

  async function garantirLink(renovar = false) {
    try {
      const resposta = await api.post(`/calendario/compartilhamento${renovar ? '/renovar' : ''}`, {})
      setTokenPublico(resposta.token)
      return resposta.token
    } catch (e) {
      setEhErro(true)
      setMensagem(e.message)
      return null
    }
  }

  async function copiarLink() {
    const token = tokenPublico || await garantirLink()
    if (!token) return
    const url = `${window.location.origin}/agenda/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setMensagem('Link público copiado.')
    } catch {
      setEhErro(true)
      setMensagem(`Não foi possível copiar automaticamente. Link: ${url}`)
    }
  }

  async function baixarDiario() {
    try {
      await baixarArquivo(`/calendario/diario.xlsx?docturma_id=${vinculoDiario}`, 'diario.xlsx')
    } catch (e) {
      setEhErro(true)
      setMensagem(e.message)
    }
  }

  const tituloMes = `${MESES[mes.getMonth()]} de ${mes.getFullYear()}`
  const mudarMes = (delta) => setMes(new Date(mes.getFullYear(), mes.getMonth() + delta, 1))

  const acoes = (
    <>
      <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={copiarLink}>Copiar link dos alunos</Button>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => abrirNovo()}>Nova aula</Button>
    </>
  )

  return (
    <Box>
      <CabecalhoPagina titulo="Calendário de aulas" subtitulo="Turmas, matérias e professores em uma única agenda" acoes={acoes} />

      <Box sx={{ ...cardSx, p: 2.25, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField select size="small" label="Turma" value={filtros.cod_tur} onChange={(e) => setFiltros({ ...filtros, cod_tur: e.target.value })} sx={{ minWidth: 180 }}>
            <MenuItem value="">Todas</MenuItem>
            {turmas.map((item) => <MenuItem key={item.valor} value={item.valor}>{item.nome}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Matéria" value={filtros.cod_mat} onChange={(e) => setFiltros({ ...filtros, cod_mat: e.target.value })} sx={{ minWidth: 200 }}>
            <MenuItem value="">Todas</MenuItem>
            {materias.map((item) => <MenuItem key={item.valor} value={item.valor}>{item.nome}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Professor" value={filtros.cod_pro} onChange={(e) => setFiltros({ ...filtros, cod_pro: e.target.value })} sx={{ minWidth: 190 }}>
            <MenuItem value="">Todos</MenuItem>
            {professores.map((item) => <MenuItem key={item.valor} value={item.valor}>{item.nome}</MenuItem>)}
          </TextField>
          <Box sx={{ ml: { md: 'auto' }, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button variant="outlined" onClick={() => mudarMes(-1)}>‹</Button>
            <Typography sx={{ minWidth: 190, textAlign: 'center', fontWeight: 700, textTransform: 'capitalize' }}>{tituloMes}</Typography>
            <Button variant="outlined" onClick={() => mudarMes(1)}>›</Button>
          </Box>
        </Box>
      </Box>

      <Box sx={{ ...cardSx, overflowX: 'auto', mb: 2.5 }}>
        <CalendarioGrade mes={mes} aulas={aulas} onSelecionar={abrirEdicao} onNovo={abrirNovo} />
      </Box>
      <Typography sx={{ color: TOV.caption, fontSize: 13, mb: 3 }}>
        Dica: dê dois cliques em um dia vazio para cadastrar uma aula naquela data.
      </Typography>

      <Box sx={{ ...cardSx, p: { xs: 2.25, md: 3 }, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
        <Box>
          <Typography variant="h3" sx={{ fontSize: 20, mb: 1 }}>Diário de classe em Excel</Typography>
          <Typography sx={{ color: TOV.caption, fontSize: 14, mb: 2 }}>Selecione a turma e depois a matéria. As datas vêm das aulas cadastradas acima.</Typography>
          <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
            <TextField select size="small" label="Turma" value={turmaDiario} onChange={(e) => { setTurmaDiario(e.target.value); setVinculoDiario('') }} sx={{ minWidth: 180 }}>
              {turmas.map((item) => <MenuItem key={item.valor} value={item.valor}>{item.nome}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Matéria / professor" value={vinculoDiario} onChange={(e) => setVinculoDiario(e.target.value)} sx={{ minWidth: 260 }}>
              {materiasDiario.map((item) => <MenuItem key={item.docturma_id} value={item.docturma_id}>{item.materia_nome} · {item.professor_nome || 'Sem professor'}</MenuItem>)}
            </TextField>
            <Button variant="contained" startIcon={<DownloadIcon />} disabled={!vinculoDiario} onClick={baixarDiario}>Baixar XLSX</Button>
          </Box>
        </Box>
        <Box>
          <Typography variant="h3" sx={{ fontSize: 20, mb: 1 }}>Visualização para alunos</Typography>
          <Typography sx={{ color: TOV.caption, fontSize: 14, mb: 2 }}>O link mostra apenas a agenda. Cadastro, notas e ações de edição continuam protegidos.</Typography>
          <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
            <Button variant="outlined" startIcon={<LinkIcon />} onClick={copiarLink}>Copiar link</Button>
            <Button variant="text" onClick={() => garantirLink(true)}>Renovar link</Button>
          </Box>
        </Box>
      </Box>

      <Dialog open={dialogo} onClose={() => setDialogo(false)} maxWidth="md" fullWidth fullScreen={telaCheia}>
        <DialogTitle>{editando ? 'Editar aula' : 'Nova aula'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5, mt: 1 }}>
            <TextField select label="Turma · matéria · professor" value={form.docturma_id} onChange={(e) => setForm({ ...form, docturma_id: e.target.value })} sx={{ gridColumn: { sm: '1 / -1' } }} required>
              {vinculos.map((item) => <MenuItem key={item.docturma_id} value={item.docturma_id}>{item.turma_nome} · {item.materia_nome} · {item.professor_nome || 'Sem professor'}</MenuItem>)}
            </TextField>
            <TextField label="Data" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} InputLabelProps={{ shrink: true }} required />
            {!editando && <TextField label="Repetir semanalmente até" type="date" value={form.repetir_ate} onChange={(e) => setForm({ ...form, repetir_ate: e.target.value })} InputLabelProps={{ shrink: true }} />}
            <TextField label="Início" type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField label="Fim" type="time" value={form.hora_fim} onChange={(e) => setForm({ ...form, hora_fim: e.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField label="Tema / conteúdo" value={form.tema} onChange={(e) => setForm({ ...form, tema: e.target.value })} />
            <TextField label="Local" value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} />
            <TextField select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <MenuItem value="AGENDADA">Agendada</MenuItem>
              <MenuItem value="REALIZADA">Realizada</MenuItem>
              <MenuItem value="CANCELADA">Cancelada</MenuItem>
            </TextField>
            <TextField multiline minRows={2} label="Observações" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} sx={{ gridColumn: { sm: '1 / -1' } }} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          {editando && <Button color="error" onClick={() => setExcluir(editando)} sx={{ mr: 'auto' }}>Excluir</Button>}
          <Button variant="outlined" onClick={() => setDialogo(false)} disabled={salvando}>Cancelar</Button>
          <Button variant="contained" onClick={salvar} disabled={!form.docturma_id || !form.data || salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
        </DialogActions>
      </Dialog>

      <DialogoConfirmacao aberto={!!excluir} titulo="Excluir aula" descricao="Excluir esta aula do calendário?" processando={false} onConfirmar={confirmarExclusao} onFechar={() => setExcluir(null)} />
      <Snackbar open={!!mensagem} autoHideDuration={6000} onClose={() => setMensagem('')}>
        <Alert severity={ehErro ? 'error' : 'success'} onClose={() => setMensagem('')}>{mensagem}</Alert>
      </Snackbar>
    </Box>
  )
}
