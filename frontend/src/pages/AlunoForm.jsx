import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, Grid, LinearProgress, MenuItem, TextField, Typography,
} from '@mui/material'
import { api } from '../api'
import { TOV } from '../theme'
import {
  DialogoConfirmacao, LinhaCartao, cardSx, useDialogoTelaCheia,
} from '../ui'
import { useUnsavedChanges } from '../UnsavedChanges'
import { emailValido, formatarCepInput, formatarCpfInput, formatarTelefoneInput } from '../formatters'

const VAZIO = {
  nome: '', endereco: '', complemento: '', bairro: '', cidade: '', uf: '', cep: '',
  fone1: '', celular: '', e_mail: '', sexo: '', escolaridade: '', est_civ: '',
  dat_nas: null, rg: '', cpf: '', profissao: '', igreja: '', local_igreja: '',
  nome_pastor: '', membro_desde: null, status: 'A', nacionalidade: 'BRASILEIRO',
  turma_interesse: '', nome_conjuge: '', cur_teologicos: '', cod_tur: null,
}

const ETAPAS = [
  ['Identificação', 'Dados pessoais e documentos'],
  ['Contato', 'Como falar com o aluno'],
  ['Endereço', 'Onde o aluno reside'],
  ['Igreja', 'Vínculo e informações da igreja'],
  ['Acadêmico', 'Escolaridade e turma'],
  ['Revisar', 'Confira antes de salvar'],
]

const STATUS_ALUNO = {
  P: 'Pré-cadastro',
  A: 'Ativo',
  I: 'Inativo',
  F: 'Formado',
  T: 'Trancado',
}

function valorOuTraco(valor) {
  return valor == null || valor === '' ? '—' : valor
}

/** Formulário de aluno em etapas. `aluno` preenchido = edição. */
export default function AlunoForm({ aberto, aoFechar, aoSalvar, aluno }) {
  const [form, setForm] = useState(VAZIO)
  const [inicial, setInicial] = useState(VAZIO)
  const [turmas, setTurmas] = useState([])
  const [etapa, setEtapa] = useState(0)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [confirmarFechar, setConfirmarFechar] = useState(false)
  const telaCheia = useDialogoTelaCheia()

  useEffect(() => {
    if (!aberto) return
    const dados = aluno ? { ...VAZIO, ...aluno } : { ...VAZIO }
    setErro('')
    setEtapa(0)
    setForm(dados)
    setInicial(dados)
    setConfirmarFechar(false)
    api.getCached('/turmas').then(setTurmas).catch((e) => setErro(e.message))
  }, [aberto, aluno])

  function alterar(nome, valor) {
    setForm((atual) => ({ ...atual, [nome]: valor }))
    if (erro) setErro('')
  }

  function campo(nome, props = {}) {
    return (
      <TextField
        size="small"
        fullWidth
        label={props.label}
        value={form[nome] ?? ''}
        onChange={(e) => alterar(nome, e.target.value)}
        {...props}
      />
    )
  }

  const alterado = JSON.stringify(form) !== JSON.stringify(inicial)
  const ultimaEtapa = etapa === ETAPAS.length - 1
  const emailInvalido = !emailValido(form.e_mail)
  const liberarProtecao = useUnsavedChanges(aberto && alterado, 'Há dados do aluno que ainda não foram salvos.')

  function pedirFechar() {
    if (alterado && !salvando) setConfirmarFechar(true)
    else aoFechar()
  }

  function continuar() {
    if (etapa === 0 && form.nome.trim().length < 2) {
      setErro('Informe o nome completo para continuar.')
      return
    }
    setErro('')
    setEtapa((atual) => Math.min(ETAPAS.length - 1, atual + 1))
  }

  async function salvar() {
    setErro('')
    setSalvando(true)
    const corpo = { ...form }
    delete corpo.cod_alu
    for (const k of ['dat_nas', 'membro_desde', 'cod_tur']) {
      if (corpo[k] === '') corpo[k] = null
    }
    try {
      const salvo = aluno
        ? await api.put(`/alunos/${aluno.cod_alu}`, corpo)
        : await api.post('/alunos', corpo)
      setInicial(form)
      liberarProtecao()
      aoSalvar(salvo)
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  function resumo(titulo, indice, linhas) {
    return (
      <Box sx={{ ...cardSx, border: `1px solid ${TOV.divider}`, p: 2, mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
          <Typography variant="h3" sx={{ fontSize: TOV.type.bodyLg }}>{titulo}</Typography>
          <Button size="small" onClick={() => setEtapa(indice)}>Editar</Button>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {linhas.map(([rotulo, valor]) => (
            <LinhaCartao key={rotulo} rotulo={rotulo} valor={valorOuTraco(valor)} />
          ))}
        </Box>
      </Box>
    )
  }

  return (
    <>
      <Dialog open={aberto} onClose={pedirFechar} maxWidth="md" fullWidth fullScreen={telaCheia}>
        <DialogTitle sx={{ pb: 1.5 }}>
          <Typography component="div" variant="h2" sx={{ fontSize: { xs: TOV.type.title, sm: TOV.type.titleLg } }}>
            {aluno ? `Editar aluno ${aluno.cod_alu}` : 'Novo aluno'}
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mt: 1.5 }}>
            <Typography sx={{ color: TOV.graphite, fontSize: TOV.type.body, fontWeight: 700 }}>
              {ETAPAS[etapa][0]}
            </Typography>
            <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm }}>
              Etapa {etapa + 1} de {ETAPAS.length}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={((etapa + 1) / ETAPAS.length) * 100}
            aria-label={`Etapa ${etapa + 1} de ${ETAPAS.length}`}
            sx={{ mt: 1, height: 8, borderRadius: TOV.radiusFull, bgcolor: TOV.coralTint }}
          />
        </DialogTitle>

        <DialogContent>
          <Typography sx={{ color: TOV.caption, fontSize: TOV.type.body, mb: 2.5 }}>
            {ETAPAS[etapa][1]}
          </Typography>
          {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}

          {etapa === 0 && (
            <Grid container spacing={1.5}>
              <Grid item xs={12}>
                {campo('nome', {
                  label: 'Nome completo', required: true, autoFocus: true,
                  autoComplete: 'name',
                })}
              </Grid>
              <Grid item xs={6}>
                <TextField
                  select size="small" fullWidth label="Sexo" value={form.sexo ?? ''}
                  onChange={(e) => alterar('sexo', e.target.value)}
                >
                  <MenuItem value="">Não informado</MenuItem>
                  <MenuItem value="F">Feminino</MenuItem>
                  <MenuItem value="M">Masculino</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={6}>
                <TextField
                  select size="small" fullWidth label="Status" value={form.status ?? 'A'}
                  onChange={(e) => alterar('status', e.target.value)}
                >
                  <MenuItem value="P">Pré-cadastro</MenuItem>
                  <MenuItem value="A">Ativo</MenuItem>
                  <MenuItem value="I">Inativo</MenuItem>
                  <MenuItem value="F">Formado</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                {campo('dat_nas', {
                  label: 'Data de nascimento', type: 'date',
                  InputLabelProps: { shrink: true }, autoComplete: 'bday',
                })}
              </Grid>
              <Grid item xs={6} sm={4}>
                {campo('cpf', { label: 'CPF', inputProps: { inputMode: 'numeric', maxLength: 14 }, onChange: (e) => alterar('cpf', formatarCpfInput(e.target.value)) })}
              </Grid>
              <Grid item xs={6} sm={4}>
                {campo('rg', { label: 'RG', inputProps: { inputMode: 'numeric', maxLength: 20 } })}
              </Grid>
              <Grid item xs={12} sm={6}>
                {campo('nacionalidade', { label: 'Nacionalidade', autoComplete: 'country-name' })}
              </Grid>
              <Grid item xs={12} sm={6}>{campo('profissao', { label: 'Profissão' })}</Grid>
            </Grid>
          )}

          {etapa === 1 && (
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}>
                {campo('celular', {
                  label: 'Celular / WhatsApp', type: 'tel', autoComplete: 'tel',
                  inputProps: { inputMode: 'tel', maxLength: 15 },
                  onChange: (e) => alterar('celular', formatarTelefoneInput(e.target.value)),
                })}
              </Grid>
              <Grid item xs={12} sm={6}>
                {campo('fone1', {
                  label: 'Outro telefone', type: 'tel',
                  inputProps: { inputMode: 'tel', maxLength: 15 },
                  onChange: (e) => alterar('fone1', formatarTelefoneInput(e.target.value)),
                })}
              </Grid>
              <Grid item xs={12}>
                {campo('e_mail', { label: 'E-mail', type: 'email', autoComplete: 'email', error: emailInvalido, helperText: emailInvalido ? 'Informe um e-mail válido.' : ' ' })}
              </Grid>
            </Grid>
          )}

          {etapa === 2 && (
            <Grid container spacing={1.5}>
              <Grid item xs={12}>{campo('endereco', { label: 'Endereço', autoComplete: 'street-address' })}</Grid>
              <Grid item xs={12} sm={6}>{campo('complemento', { label: 'Complemento' })}</Grid>
              <Grid item xs={12} sm={6}>{campo('bairro', { label: 'Bairro' })}</Grid>
              <Grid item xs={8}>{campo('cidade', { label: 'Cidade', autoComplete: 'address-level2' })}</Grid>
              <Grid item xs={4}>
                {campo('uf', {
                  label: 'UF', autoComplete: 'address-level1',
                  inputProps: { maxLength: 2, style: { textTransform: 'uppercase' } },
                  onChange: (e) => alterar('uf', e.target.value.toUpperCase()),
                })}
              </Grid>
              <Grid item xs={12} sm={5}>
                {campo('cep', {
                  label: 'CEP', autoComplete: 'postal-code',
                  inputProps: { inputMode: 'numeric', maxLength: 9 },
                  onChange: (e) => alterar('cep', formatarCepInput(e.target.value)),
                })}
              </Grid>
            </Grid>
          )}

          {etapa === 3 && (
            <Grid container spacing={1.5}>
              <Grid item xs={12}>{campo('igreja', { label: 'Igreja' })}</Grid>
              <Grid item xs={12}>{campo('nome_pastor', { label: 'Pastor' })}</Grid>
              <Grid item xs={12} sm={5}>
                {campo('membro_desde', {
                  label: 'Membro desde', type: 'date', InputLabelProps: { shrink: true },
                })}
              </Grid>
              <Grid item xs={12}>
                {campo('local_igreja', {
                  label: 'Endereço completo da igreja', multiline: true, minRows: 3,
                })}
              </Grid>
            </Grid>
          )}

          {etapa === 4 && (
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}>{campo('escolaridade', { label: 'Escolaridade' })}</Grid>
              <Grid item xs={12} sm={6}>{campo('est_civ', { label: 'Estado civil' })}</Grid>
              <Grid item xs={12}>
                {campo('cur_teologicos', {
                  label: 'Curso anterior de Teologia (onde?)', multiline: true, minRows: 2,
                })}
              </Grid>
              <Grid item xs={12}>{campo('nome_conjuge', { label: 'Nome do cônjuge participante' })}</Grid>
              <Grid item xs={12}>{campo('turma_interesse', { label: 'Turma de interesse' })}</Grid>
              <Grid item xs={12}>
                <TextField
                  select size="small" fullWidth label="Turma matriculada"
                  value={form.cod_tur ?? ''}
                  onChange={(e) => alterar('cod_tur', e.target.value || null)}
                >
                  <MenuItem value="">Nenhuma turma</MenuItem>
                  {turmas.map((t) => (
                    <MenuItem key={t.cod_tur} value={t.cod_tur}>{t.nome}</MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>
          )}

          {etapa === 5 && (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                Confira os dados. Você pode voltar a qualquer etapa antes de salvar.
              </Alert>
              {resumo('Identificação', 0, [
                ['Nome', form.nome],
                ['Nascimento', form.dat_nas],
                ['CPF', form.cpf],
                ['RG', form.rg],
                ['Status', STATUS_ALUNO[form.status] || form.status],
              ])}
              {resumo('Contato', 1, [
                ['Celular', form.celular],
                ['Telefone', form.fone1],
                ['E-mail', form.e_mail],
              ])}
              {resumo('Endereço', 2, [
                ['Endereço', form.endereco],
                ['Bairro', form.bairro],
                ['Cidade / UF', `${form.cidade || ''}${form.uf ? ` / ${form.uf}` : ''}`],
                ['CEP', form.cep],
              ])}
              {resumo('Igreja', 3, [
                ['Igreja', form.igreja],
                ['Pastor', form.nome_pastor],
                ['Membro desde', form.membro_desde],
              ])}
              {resumo('Acadêmico', 4, [
                ['Escolaridade', form.escolaridade],
                ['Turma de interesse', form.turma_interesse],
                ['Turma matriculada', turmas.find((t) => String(t.cod_tur) === String(form.cod_tur))?.nome],
              ])}
            </Box>
          )}
        </DialogContent>

        <DialogActions
          sx={{
            p: { xs: 2, sm: 3 }, pt: 1.5, gap: 1,
            borderTop: `1px solid ${TOV.divider}`,
          }}
        >
          <Button onClick={pedirFechar} disabled={salvando} sx={{ mr: 'auto' }}>Cancelar</Button>
          {etapa > 0 && (
            <Button variant="outlined" onClick={() => { setErro(''); setEtapa((atual) => atual - 1) }} disabled={salvando}>
              Voltar
            </Button>
          )}
          <Button
            variant="contained"
            onClick={ultimaEtapa ? salvar : continuar}
            disabled={salvando || emailInvalido || (etapa === 0 && form.nome.trim().length < 2)}
          >
            {salvando ? 'Salvando…' : ultimaEtapa ? 'Salvar aluno' : 'Continuar'}
          </Button>
        </DialogActions>
      </Dialog>

      <DialogoConfirmacao
        aberto={confirmarFechar}
        titulo="Descartar cadastro?"
        descricao="As informações preenchidas neste formulário serão perdidas."
        rotuloConfirmar="Descartar"
        processando={false}
        onConfirmar={() => { setConfirmarFechar(false); aoFechar() }}
        onFechar={() => setConfirmarFechar(false)}
      />
    </>
  )
}
