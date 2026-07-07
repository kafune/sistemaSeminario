import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Box, Button, Chip, Grid, Paper, Snackbar, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { api, abrirArquivo } from '../api'
import AlunoForm from './AlunoForm'

function Campo({ rotulo, valor }) {
  return (
    <Grid item xs={12} sm={4}>
      <Typography variant="caption" color="text.secondary">{rotulo}</Typography>
      <Typography variant="body2">{valor || '—'}</Typography>
    </Grid>
  )
}

export default function AlunoDetalhe() {
  const { codAlu } = useParams()
  const [aluno, setAluno] = useState(null)
  const [notas, setNotas] = useState([])
  const [editando, setEditando] = useState(false)
  const [msg, setMsg] = useState('')
  const navigate = useNavigate()

  const carregar = useCallback(() => {
    api.get(`/alunos/${codAlu}`).then(setAluno).catch((e) => setMsg(e.message))
    api.get(`/notas/aluno/${codAlu}`).then((r) => setNotas(r.notas)).catch(() => setNotas([]))
  }, [codAlu])

  useEffect(() => { carregar() }, [carregar])

  async function excluir() {
    if (!window.confirm(`Excluir o aluno ${aluno.nome}? Esta ação não pode ser desfeita.`)) return
    try {
      await api.del(`/alunos/${codAlu}`)
      navigate('/alunos')
    } catch (e) {
      setMsg(e.message)
    }
  }

  if (!aluno) return <Typography>Carregando...</Typography>

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/alunos')}>Voltar</Button>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          {aluno.nome} <Chip size="small" label={`matrícula ${aluno.cod_alu}`} sx={{ ml: 1 }} />
        </Typography>
        <Button startIcon={<EditIcon />} variant="outlined" onClick={() => setEditando(true)}>Editar</Button>
        <Button
          startIcon={<PictureAsPdfIcon />} variant="outlined"
          onClick={() => abrirArquivo(`/relatorios/boletim/${codAlu}`).catch((e) => setMsg(e.message))}
        >
          Boletim
        </Button>
        <Button
          startIcon={<PictureAsPdfIcon />} variant="outlined"
          onClick={() => abrirArquivo(`/relatorios/historico/${codAlu}`).catch((e) => setMsg(e.message))}
        >
          Histórico
        </Button>
        <Button
          startIcon={<PictureAsPdfIcon />} variant="outlined"
          onClick={() => abrirArquivo(`/relatorios/ficha-aluno/${codAlu}`).catch((e) => setMsg(e.message))}
        >
          Ficha
        </Button>
        <Button startIcon={<DeleteIcon />} color="error" onClick={excluir}>Excluir</Button>
      </Box>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={1.5}>
          <Campo rotulo="Nascimento" valor={aluno.dat_nas} />
          <Campo rotulo="RG" valor={aluno.rg} />
          <Campo rotulo="CPF" valor={aluno.cpf} />
          <Campo rotulo="Endereço" valor={`${aluno.endereco || ''} ${aluno.bairro || ''}`.trim()} />
          <Campo rotulo="Cidade" valor={`${aluno.cidade || ''}${aluno.uf ? ' - ' + aluno.uf : ''}`.trim()} />
          <Campo rotulo="CEP" valor={aluno.cep} />
          <Campo rotulo="Telefone" valor={aluno.fone1} />
          <Campo rotulo="Celular" valor={aluno.celular} />
          <Campo rotulo="E-mail" valor={aluno.e_mail} />
          <Campo rotulo="Igreja" valor={aluno.igreja} />
          <Campo rotulo="Pastor" valor={aluno.nome_pastor} />
          <Campo rotulo="Profissão" valor={aluno.profissao} />
          <Campo rotulo="Turma" valor={aluno.turma_nome} />
          <Campo rotulo="Status" valor={aluno.status} />
        </Grid>
      </Paper>

      <Typography variant="h6" gutterBottom>Notas ({notas.length})</Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Matéria</TableCell>
              <TableCell>Nota</TableCell>
              <TableCell>Faltas</TableCell>
              <TableCell>Cursou</TableCell>
              <TableCell>Ano</TableCell>
              <TableCell>Semestre</TableCell>
              <TableCell>Professor</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {notas.map((n) => (
              <TableRow key={n.id} hover>
                <TableCell>{n.materia_nome}</TableCell>
                <TableCell>{n.nota ?? 'N/C'}</TableCell>
                <TableCell>{n.falta ?? '—'}</TableCell>
                <TableCell>{n.cursou}</TableCell>
                <TableCell>{n.ano}</TableCell>
                <TableCell>{n.semestre}</TableCell>
                <TableCell>{n.professor_nome}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <AlunoForm
        aberto={editando}
        aluno={aluno}
        aoFechar={() => setEditando(false)}
        aoSalvar={() => { setEditando(false); carregar() }}
      />
      <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg('')}>
        <Alert severity="error" onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
