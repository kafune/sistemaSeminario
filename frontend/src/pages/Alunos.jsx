import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Box, Button, IconButton, Pagination, Paper, Snackbar, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import VisibilityIcon from '@mui/icons-material/Visibility'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import { api, abrirArquivo } from '../api'
import AlunoForm from './AlunoForm'

const POR_PAGINA = 25

export default function Alunos() {
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState('')
  const [dados, setDados] = useState({ total: 0, itens: [] })
  const [pagina, setPagina] = useState(1)
  const [formAberto, setFormAberto] = useState(false)
  const [erro, setErro] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api
      .get(`/alunos?busca=${encodeURIComponent(buscaAtiva)}&pagina=${pagina}&por_pagina=${POR_PAGINA}`)
      .then(setDados)
      .catch((e) => setErro(e.message))
  }, [buscaAtiva, pagina])

  function pesquisar(e) {
    e.preventDefault()
    setPagina(1)
    setBuscaAtiva(busca)
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Alunos</Typography>
        <Box component="form" onSubmit={pesquisar} sx={{ display: 'flex', gap: 1 }}>
          <TextField
            size="small" label="Buscar por nome ou matrícula" value={busca}
            onChange={(e) => setBusca(e.target.value)} sx={{ width: 300 }}
          />
          <Button type="submit" variant="outlined">Buscar</Button>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormAberto(true)}>
          Novo aluno
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Matrícula</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Telefone</TableCell>
              <TableCell>Celular</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {dados.itens.map((a) => (
              <TableRow key={a.cod_alu} hover>
                <TableCell>{a.cod_alu}</TableCell>
                <TableCell>{a.nome}</TableCell>
                <TableCell>{a.fone1}</TableCell>
                <TableCell>{a.celular}</TableCell>
                <TableCell>{a.status}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" title="Abrir cadastro" onClick={() => navigate(`/alunos/${a.cod_alu}`)}>
                    <VisibilityIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small" title="Boletim (PDF)"
                    onClick={() => abrirArquivo(`/relatorios/boletim/${a.cod_alu}`).catch((e) => setErro(e.message))}
                  >
                    <PictureAsPdfIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, alignItems: 'center' }}>
        <Typography variant="body2">{dados.total} alunos</Typography>
        <Pagination
          count={Math.max(1, Math.ceil(dados.total / POR_PAGINA))}
          page={pagina}
          onChange={(_, p) => setPagina(p)}
        />
      </Box>

      <AlunoForm
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
        aoSalvar={(novo) => {
          setFormAberto(false)
          navigate(`/alunos/${novo.cod_alu}`)
        }}
      />
      <Snackbar open={!!erro} autoHideDuration={6000} onClose={() => setErro('')}>
        <Alert severity="error" onClose={() => setErro('')}>{erro}</Alert>
      </Snackbar>
    </Box>
  )
}
