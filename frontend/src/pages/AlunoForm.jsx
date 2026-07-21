import { useEffect, useState } from 'react'
import {
  Alert, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, Grid, MenuItem, TextField,
} from '@mui/material'
import { api } from '../api'
import { useDialogoTelaCheia } from '../ui'

const VAZIO = {
  nome: '', endereco: '', complemento: '', bairro: '', cidade: '', uf: '', cep: '',
  fone1: '', celular: '', e_mail: '', sexo: '', escolaridade: '', est_civ: '',
  dat_nas: null, rg: '', cpf: '', profissao: '', igreja: '', local_igreja: '',
  nome_pastor: '', membro_desde: null, status: 'A', nacionalidade: 'BRASILEIRO',
  cod_tur: null,
}

/** Formulário de aluno (criação e edição). `aluno` preenchido = edição. */
export default function AlunoForm({ aberto, aoFechar, aoSalvar, aluno }) {
  const [form, setForm] = useState(VAZIO)
  const [turmas, setTurmas] = useState([])
  const [erro, setErro] = useState('')
  const telaCheia = useDialogoTelaCheia()

  useEffect(() => {
    if (!aberto) return
    setErro('')
    setForm(aluno ? { ...VAZIO, ...aluno } : VAZIO)
    api.get('/turmas').then(setTurmas).catch((e) => setErro(e.message))
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
    for (const k of ['dat_nas', 'membro_desde', 'cod_tur']) {
      if (corpo[k] === '') corpo[k] = null
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
    <Dialog open={aberto} onClose={aoFechar} maxWidth="md" fullWidth fullScreen={telaCheia}>
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
          <Grid item xs={6} sm={3}>{campo('complemento', { label: 'Complemento' })}</Grid>
          <Grid item xs={6} sm={3}>{campo('bairro', { label: 'Bairro' })}</Grid>
          <Grid item xs={6} sm={4}>{campo('cidade', { label: 'Cidade' })}</Grid>
          <Grid item xs={3} sm={2}>{campo('uf', { label: 'UF', inputProps: { maxLength: 2 } })}</Grid>
          <Grid item xs={3} sm={3}>{campo('cep', { label: 'CEP' })}</Grid>
          <Grid item xs={6} sm={3}>{campo('fone1', { label: 'Telefone' })}</Grid>
          <Grid item xs={6} sm={3}>{campo('celular', { label: 'Celular' })}</Grid>
          <Grid item xs={12} sm={6}>{campo('e_mail', { label: 'E-mail' })}</Grid>
          <Grid item xs={6} sm={3}>{campo('escolaridade', { label: 'Escolaridade' })}</Grid>
          <Grid item xs={6} sm={3}>{campo('est_civ', { label: 'Estado civil' })}</Grid>
          <Grid item xs={12} sm={6}>{campo('igreja', { label: 'Igreja' })}</Grid>
          <Grid item xs={12} sm={6}>{campo('local_igreja', { label: 'Local da igreja' })}</Grid>
          <Grid item xs={12} sm={6}>{campo('nome_pastor', { label: 'Pastor' })}</Grid>
          <Grid item xs={6} sm={3}>
            {campo('membro_desde', { label: 'Membro desde', type: 'date', InputLabelProps: { shrink: true } })}
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
      <DialogActions sx={{ p: { xs: 2, sm: 3 }, pt: { xs: 1.5, sm: 1.5 }, '& > button': { flex: { xs: 1, sm: '0 0 auto' } } }}>
        <Button variant="outlined" onClick={aoFechar}>Cancelar</Button>
        <Button variant="contained" onClick={salvar} disabled={!form.nome}>Salvar</Button>
      </DialogActions>
    </Dialog>
  )
}
