import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert, Box, Button, CircularProgress, MenuItem, TextField, Typography,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import SchoolIcon from '@mui/icons-material/School'
import { getPublico, postPublico } from '../api'
import { TOV } from '../theme'
import { cardSx } from '../ui'

const VAZIO = {
  nome: '', e_mail: '', celular: '', fone1: '', dat_nas: '', sexo: '',
  rg: '', cpf: '', est_civ: '', nacionalidade: '', endereco: '',
  complemento: '', bairro: '', cidade: '', uf: '', cep: '',
  materias_atuacao: '',
}

export default function AutocadastroProfessor() {
  const { token } = useParams()
  const [form, setForm] = useState(VAZIO)
  const [validando, setValidando] = useState(true)
  const [conviteValido, setConviteValido] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [concluido, setConcluido] = useState(false)

  useEffect(() => {
    getPublico(`/cadastro-professor/${token}`)
      .then(() => setConviteValido(true))
      .catch((e) => setErro(e.message))
      .finally(() => setValidando(false))
  }, [token])

  function alterar(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
  }

  async function enviar(evento) {
    evento.preventDefault()
    setSalvando(true)
    setErro('')
    const dados = Object.fromEntries(
      Object.entries(form).map(([campo, valor]) => [
        campo,
        typeof valor === 'string' && !valor.trim() ? null : valor,
      ]),
    )
    try {
      await postPublico(`/cadastro-professor/${token}`, dados)
      setConcluido(true)
      window.scrollTo(0, 0)
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: TOV.offwhite }}>
      <Box component="header" sx={{ bgcolor: TOV.graphite, color: '#fff', px: 2, py: 2.25, borderTop: `3px solid ${TOV.coral}` }}>
        <Box sx={{ maxWidth: 900, mx: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <SchoolIcon />
          <Box>
            <Typography component="h1" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 23, lineHeight: 1.1 }}>
              Cadastro de professor
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'rgba(255,255,255,.64)' }}>Centro TOV de Formação Teológica</Typography>
          </Box>
        </Box>
      </Box>

      <Box component="main" sx={{ maxWidth: 900, mx: 'auto', px: { xs: 1.5, sm: 3 }, py: { xs: 2.5, md: 4 } }}>
        {validando && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
            <CircularProgress />
          </Box>
        )}

        {!validando && !conviteValido && erro && !concluido && (
          <Alert severity="error">{erro}</Alert>
        )}

        {!validando && concluido && (
          <Box sx={{ ...cardSx, p: { xs: 3, md: 5 }, textAlign: 'center' }}>
            <CheckCircleIcon sx={{ color: TOV.coral, fontSize: 58, mb: 1.5 }} />
            <Typography component="h2" variant="h1" sx={{ fontSize: { xs: 28, md: 36 }, mb: 1.5 }}>
              Cadastro enviado
            </Typography>
            <Typography sx={{ color: TOV.caption, maxWidth: 560, mx: 'auto' }}>
              Seus dados foram recebidos pelo Centro TOV. A secretaria fará posteriormente os vínculos com turmas e matérias.
            </Typography>
          </Box>
        )}

        {!validando && conviteValido && !concluido && (
          <Box component="form" onSubmit={enviar} sx={{ ...cardSx, p: { xs: 2, sm: 3, md: 4 } }}>
            <Typography component="h2" variant="h1" sx={{ fontSize: { xs: 27, md: 34 }, mb: 1 }}>
              Complete seus dados
            </Typography>
            <Typography sx={{ color: TOV.caption, mb: 3 }}>
              As matérias oficiais serão atribuídas depois pela secretaria.
            </Typography>

            <Typography variant="h3" sx={{ fontSize: 18, mb: 1.5 }}>Contato</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5, mb: 3 }}>
              <TextField required label="Nome completo" value={form.nome} onChange={(e) => alterar('nome', e.target.value)} sx={{ gridColumn: { sm: '1 / -1' } }} inputProps={{ maxLength: 100 }} />
              <TextField required type="email" label="E-mail" value={form.e_mail} onChange={(e) => alterar('e_mail', e.target.value)} inputProps={{ maxLength: 100 }} />
              <TextField required label="Celular / WhatsApp" value={form.celular} onChange={(e) => alterar('celular', e.target.value)} inputProps={{ maxLength: 20 }} />
              <TextField label="Outro telefone" value={form.fone1} onChange={(e) => alterar('fone1', e.target.value)} inputProps={{ maxLength: 20 }} />
            </Box>

            <Typography variant="h3" sx={{ fontSize: 18, mb: 1.5 }}>Áreas de atuação</Typography>
            <TextField
              required fullWidth multiline minRows={4}
              label="Quais matérias ou áreas você está apto(a) a lecionar?"
              placeholder="Escreva livremente. Ex.: Teologia Sistemática, História da Igreja, Grego Bíblico…"
              value={form.materias_atuacao}
              onChange={(e) => alterar('materias_atuacao', e.target.value)}
              helperText="Esta indicação não cria vínculos automaticamente; a secretaria fará a atribuição oficial."
              inputProps={{ maxLength: 1000 }}
              sx={{ mb: 3 }}
            />

            <Typography variant="h3" sx={{ fontSize: 18, mb: 1.5 }}>Dados pessoais</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5, mb: 3 }}>
              <TextField type="date" label="Data de nascimento" value={form.dat_nas} onChange={(e) => alterar('dat_nas', e.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField select label="Sexo" value={form.sexo} onChange={(e) => alterar('sexo', e.target.value)}>
                <MenuItem value="">Não informar</MenuItem>
                <MenuItem value="F">Feminino</MenuItem>
                <MenuItem value="M">Masculino</MenuItem>
              </TextField>
              <TextField label="Estado civil" value={form.est_civ} onChange={(e) => alterar('est_civ', e.target.value)} inputProps={{ maxLength: 30 }} />
              <TextField label="CPF" value={form.cpf} onChange={(e) => alterar('cpf', e.target.value)} inputProps={{ maxLength: 20 }} />
              <TextField label="RG" value={form.rg} onChange={(e) => alterar('rg', e.target.value)} inputProps={{ maxLength: 20 }} />
              <TextField label="Nacionalidade" value={form.nacionalidade} onChange={(e) => alterar('nacionalidade', e.target.value)} inputProps={{ maxLength: 30 }} />
            </Box>

            <Typography variant="h3" sx={{ fontSize: 18, mb: 1.5 }}>Endereço</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(6, 1fr)' }, gap: 1.5, mb: 3 }}>
              <TextField label="Endereço" value={form.endereco} onChange={(e) => alterar('endereco', e.target.value)} inputProps={{ maxLength: 100 }} sx={{ gridColumn: { sm: 'span 4' } }} />
              <TextField label="Complemento" value={form.complemento} onChange={(e) => alterar('complemento', e.target.value)} inputProps={{ maxLength: 60 }} sx={{ gridColumn: { sm: 'span 2' } }} />
              <TextField label="Bairro" value={form.bairro} onChange={(e) => alterar('bairro', e.target.value)} inputProps={{ maxLength: 60 }} sx={{ gridColumn: { sm: 'span 2' } }} />
              <TextField label="Cidade" value={form.cidade} onChange={(e) => alterar('cidade', e.target.value)} inputProps={{ maxLength: 60 }} sx={{ gridColumn: { sm: 'span 2' } }} />
              <TextField label="UF" value={form.uf} onChange={(e) => alterar('uf', e.target.value.toUpperCase())} inputProps={{ maxLength: 2 }} sx={{ gridColumn: { sm: 'span 1' } }} />
              <TextField label="CEP" value={form.cep} onChange={(e) => alterar('cep', e.target.value)} inputProps={{ maxLength: 10 }} sx={{ gridColumn: { sm: 'span 1' } }} />
            </Box>

            {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}
            <Button type="submit" variant="contained" size="large" disabled={salvando} sx={{ width: { xs: '100%', sm: 'auto' } }}>
              {salvando ? 'Enviando…' : 'Enviar cadastro'}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  )
}
