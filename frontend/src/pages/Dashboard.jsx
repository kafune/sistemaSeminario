import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Box, Card, CardContent, Grid, List, ListItemButton, ListItemText,
  Paper, Snackbar, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Typography,
} from '@mui/material'
import SchoolIcon from '@mui/icons-material/School'
import PersonIcon from '@mui/icons-material/Person'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import GroupsIcon from '@mui/icons-material/Groups'
import CakeIcon from '@mui/icons-material/Cake'
import { api } from '../api'

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function CartaoNumero({ icone, rotulo, valor, aoClicar }) {
  return (
    <Card sx={{ cursor: aoClicar ? 'pointer' : 'default' }} onClick={aoClicar}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ color: 'primary.main' }}>{icone}</Box>
        <Box>
          <Typography variant="h4">{valor ?? '—'}</Typography>
          <Typography variant="body2" color="text.secondary">{rotulo}</Typography>
        </Box>
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/dashboard').then(setDados).catch((e) => setErro(e.message))
  }, [])

  const formatarData = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Visão geral</Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} sm={3}>
          <CartaoNumero
            icone={<SchoolIcon fontSize="large" />} rotulo="Alunos ativos"
            valor={dados?.alunos_ativos} aoClicar={() => navigate('/alunos')}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <CartaoNumero
            icone={<GroupsIcon fontSize="large" />} rotulo="Turmas"
            valor={dados?.turmas} aoClicar={() => navigate('/turmas')}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <CartaoNumero
            icone={<PersonIcon fontSize="large" />} rotulo="Professores"
            valor={dados?.professores} aoClicar={() => navigate('/professores')}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <CartaoNumero
            icone={<MenuBookIcon fontSize="large" />} rotulo="Matérias"
            valor={dados?.materias} aoClicar={() => navigate('/materias')}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={5}>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Turma</TableCell>
                  <TableCell align="right">Alunos</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(dados?.alunos_por_turma ?? []).map((t) => (
                  <TableRow
                    key={t.cod_tur} hover sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/turmas/${t.cod_tur}`)}
                  >
                    <TableCell>{t.nome}</TableCell>
                    <TableCell align="right">{t.qtd_alunos}</TableCell>
                  </TableRow>
                ))}
                {dados && dados.alunos_por_turma.length === 0 && (
                  <TableRow><TableCell colSpan={2}>Nenhuma turma cadastrada.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ pb: 0 }}>
              <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CakeIcon color="primary" />
                Aniversariantes de {dados ? MESES[dados.mes - 1] : '...'}
              </Typography>
            </CardContent>
            <List dense>
              {(dados?.aniversariantes_mes ?? []).map((a) => (
                <ListItemButton key={a.cod_alu} onClick={() => navigate(`/alunos/${a.cod_alu}`)}>
                  <ListItemText
                    primary={`Dia ${a.dia} — ${a.nome}`}
                    secondary={a.celular || null}
                  />
                </ListItemButton>
              ))}
              {dados && dados.aniversariantes_mes.length === 0 && (
                <ListItemButton disabled>
                  <ListItemText primary="Nenhum aniversariante este mês." />
                </ListItemButton>
              )}
            </List>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent sx={{ pb: 0 }}>
              <Typography variant="h6">Últimos cadastros</Typography>
            </CardContent>
            <List dense>
              {(dados?.ultimos_cadastros ?? []).map((a) => (
                <ListItemButton key={a.cod_alu} onClick={() => navigate(`/alunos/${a.cod_alu}`)}>
                  <ListItemText primary={a.nome} secondary={formatarData(a.dat_cad)} />
                </ListItemButton>
              ))}
              {dados && dados.ultimos_cadastros.length === 0 && (
                <ListItemButton disabled>
                  <ListItemText primary="Nenhum aluno cadastrado ainda." />
                </ListItemButton>
              )}
            </List>
          </Card>
        </Grid>
      </Grid>

      <Snackbar open={!!erro} autoHideDuration={6000} onClose={() => setErro('')}>
        <Alert severity="error" onClose={() => setErro('')}>{erro}</Alert>
      </Snackbar>
    </Box>
  )
}
