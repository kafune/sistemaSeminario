import { useEffect, useState } from 'react'
import {
  Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, Grid, MenuItem, TextField,
} from '@mui/material'
import { api } from '../api'

const VAZIO = {
  nome: '', endereco: '', bairro: '', cod_cid: null, cep: '', fone1: '', fone2: '',
  celular: '', e_mail: '', sexo: '', cod_esc: null, est_civ: null, dat_nas: null,
  rg: '', cpf: '', profissao: '', igreja: '', local_igreja: '', nome_pastor: '',
  status: 'A', nacionalidade: 'BRASILEIRO', cd_cur: null, cod_tur: null,
}

/** Formulário de aluno (criação e edição). `aluno` preenchido = edição. */
export default function AlunoForm({ aberto, aoFechar, aoSalvar, aluno }) {
  const [form, setForm] = useState(VAZIO)
  const [cidades, setCidades] = useState([])
  const [cursos, setCursos] = useState([])
  const [turmas, setTurmas] = useState([])
  const [escolaridades, setEscolaridades] = useState([])
  const [estadosCivis, setEstadosCivis] = useState([])
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!aberto) return
    setErro('')
    setForm(aluno ? { ...VAZIO, ...aluno } : VAZIO)
    Promise.all([
      api.get('/apoio/cidades'),
      api.get('/apoio/cursos'),
      api.get('/turmas'),
      api.get('/apoio/escolaridades'),
      api.get('/apoio/estados-civis'),
    ])
      .then(([cid, cur, tur, esc, est]) => {
        setCidades(cid)
        setCursos(cur)
        setTurmas(tur)
        setEscolaridades(esc)
        setEstadosCivis(est)
      })
      .catch((e) => setErro(e.message))
  }, [aberto, aluno])

  function campo(nome, props = {}) {
    return (
      <TextField
        size="small" fullWidth label={props.label} value={form[nome] ?? ''}
        onChange={(e) => setForm({ ...form, [nome]: e.target.value })}
        {...props}
      />
    )
  }

  async function salvar() {
    setErro('')
    const corpo = { ...form }
    delete corpo.cod_alu
    // strings vazias viram null para campos não-texto
    for (const k of ['dat_nas', 'cod_cid', 'cod_esc', 'est_civ', 'cd_cur', 'cod_tur']) {
      if (corpo[k] === '' ) corpo[k] = null
    }
    try {
      const salvo = aluno
        ? await api.put(`/alunos/${aluno.cod_alu}`, corpo)
        : await api.post('/alunos', corpo)
      aoSalvar(salvo)
    } catch (e) {
      setErro(e.message)
    }
  }

  return (
    <Dialog open={aberto} onClose={aoFechar} maxWidth="md" fullWidth>
      <DialogTitle>{aluno ? `Editar aluno ${aluno.cod_alu}` : 'Novo aluno'}</DialogTitle>
      <DialogContent>
        {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}
        <Grid container spacing={1.5} sx={{ mt: 0 }}>
          <Grid item xs={12} sm={8}>{campo('nome', { label: 'Nome completo', required: true })}</Grid>
          <Grid item xs={6} sm={2}>
            <TextField
              select size="small" fullWidth label="Sexo" value={form.sexo ?? ''}
              onChange={(e) => setForm({ ...form, sexo: e.target.value })}
            >
              <MenuItem value="M">M</MenuItem>
              <MenuItem value="F">F</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField
              select size="small" fullWidth label="Status" value={form.status ?? 'A'}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <MenuItem value="A">Ativo</MenuItem>
              <MenuItem value="I">Inativo</MenuItem>
              <MenuItem value="F">Formado</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3}>
            {campo('dat_nas', { label: 'Nascimento', type: 'date', InputLabelProps: { shrink: true } })}
          </Grid>
          <Grid item xs={6} sm={3}>{campo('rg', { label: 'RG' })}</Grid>
          <Grid item xs={6} sm={3}>{campo('cpf', { label: 'CPF' })}</Grid>
          <Grid item xs={6} sm={3}>{campo('profissao', { label: 'Profissão' })}</Grid>
          <Grid item xs={12} sm={6}>{campo('endereco', { label: 'Endereço' })}</Grid>
          <Grid item xs={6} sm={3}>{campo('bairro', { label: 'Bairro' })}</Grid>
          <Grid item xs={6} sm={3}>{campo('cep', { label: 'CEP' })}</Grid>
          <Grid item xs={12} sm={6}>
            <Autocomplete
              size="small" options={cidades}
              getOptionLabel={(c) => `${c.nome ?? ''}${c.uf ? ' - ' + c.uf : ''}`}
              value={cidades.find((c) => c.cod_cid === form.cod_cid) ?? null}
              onChange={(_, v) => setForm({ ...form, cod_cid: v ? v.cod_cid : null })}
              renderInput={(p) => <TextField {...p} label="Cidade" />}
            />
          </Grid>
          <Grid item xs={6} sm={3}>{campo('fone1', { label: 'Telefone' })}</Grid>
          <Grid item xs={6} sm={3}>{campo('celular', { label: 'Celular' })}</Grid>
          <Grid item xs={12} sm={6}>{campo('e_mail', { label: 'E-mail' })}</Grid>
          <Grid item xs={6} sm={3}>
            <TextField
              select size="small" fullWidth label="Escolaridade" value={form.cod_esc ?? ''}
              onChange={(e) => setForm({ ...form, cod_esc: e.target.value || null })}
            >
              {escolaridades.map((e2) => (
                <MenuItem key={e2.cod_esc} value={e2.cod_esc}>{e2.nome}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField
              select size="small" fullWidth label="Estado civil" value={form.est_civ ?? ''}
              onChange={(e) => setForm({ ...form, est_civ: e.target.value || null })}
            >
              {estadosCivis.map((e2) => (
                <MenuItem key={e2.cod_est} value={e2.cod_est}>{e2.nome}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>{campo('igreja', { label: 'Igreja' })}</Grid>
          <Grid item xs={12} sm={6}>{campo('local_igreja', { label: 'Local da igreja' })}</Grid>
          <Grid item xs={12} sm={6}>{campo('nome_pastor', { label: 'Pastor' })}</Grid>
          <Grid item xs={6} sm={3}>
            <TextField
              select size="small" fullWidth label="Curso" value={form.cd_cur ?? ''}
              onChange={(e) => setForm({ ...form, cd_cur: e.target.value || null })}
            >
              {cursos.map((c) => (
                <MenuItem key={c.cod_cur} value={c.cod_cur}>{c.nome}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField
              select size="small" fullWidth label="Turma" value={form.cod_tur ?? ''}
              onChange={(e) => setForm({ ...form, cod_tur: e.target.value || null })}
            >
              {turmas.map((t) => (
                <MenuItem key={t.cod_tur} value={t.cod_tur}>{t.nome}</MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={aoFechar}>Cancelar</Button>
        <Button variant="contained" onClick={salvar} disabled={!form.nome}>Salvar</Button>
      </DialogActions>
    </Dialog>
  )
}
