import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle,
  MenuItem, TextField, Typography,
} from '@mui/material'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import FilterListIcon from '@mui/icons-material/FilterList'
import { getPublico } from '../api'
import { TOV } from '../theme'
import { cardSx, useDialogoTelaCheia, useTelaDesktop } from '../ui'
import CalendarioGrade, { CalendarioAgenda, intervaloGrade } from './CalendarioGrade'

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function unicos(aulas, campo, campoNome) {
  const mapa = new Map()
  aulas.forEach((aula) => {
    const valor = aula[campo]
    const nome = aula[campoNome]
    if (valor != null && nome) mapa.set(String(valor), nome)
  })
  return [...mapa].map(([valor, nome]) => ({ valor, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome))
}

function textoData(data) {
  const texto = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  }).format(new Date(`${data}T12:00:00`))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export default function CalendarioPublico() {
  const { token } = useParams()
  const [mes, setMes] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [aulas, setAulas] = useState([])
  const [filtros, setFiltros] = useState({ cod_tur: '', cod_mat: '', cod_pro: '' })
  const [selecionada, setSelecionada] = useState(null)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const telaCheia = useDialogoTelaCheia()
  const telaDesktop = useTelaDesktop()

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    const periodo = intervaloGrade(mes)
    const query = new URLSearchParams(periodo)
    try {
      const resposta = await getPublico(`/calendario-publico/${token}?${query}`)
      setAulas(resposta.aulas)
      setFiltros((atuais) => ({
        cod_tur: resposta.aulas.some((aula) => String(aula.cod_tur) === atuais.cod_tur) ? atuais.cod_tur : '',
        cod_mat: resposta.aulas.some((aula) => String(aula.cod_mat) === atuais.cod_mat) ? atuais.cod_mat : '',
        cod_pro: resposta.aulas.some((aula) => String(aula.cod_pro) === atuais.cod_pro) ? atuais.cod_pro : '',
      }))
    } catch (e) {
      setErro(e.message)
      setAulas([])
    } finally {
      setCarregando(false)
    }
  }, [mes, token])

  useEffect(() => { carregar() }, [carregar])

  const turmas = useMemo(() => unicos(aulas, 'cod_tur', 'turma_nome'), [aulas])
  const materias = useMemo(() => unicos(aulas, 'cod_mat', 'materia_nome'), [aulas])
  const professores = useMemo(() => unicos(aulas, 'cod_pro', 'professor_nome'), [aulas])
  const filtradas = aulas.filter((aula) =>
    (!filtros.cod_tur || String(aula.cod_tur) === filtros.cod_tur)
    && (!filtros.cod_mat || String(aula.cod_mat) === filtros.cod_mat)
    && (!filtros.cod_pro || String(aula.cod_pro) === filtros.cod_pro))

  const tituloMes = `${MESES[mes.getMonth()][0].toUpperCase()}${MESES[mes.getMonth()].slice(1)} de ${mes.getFullYear()}`
  const mudarMes = (delta) => setMes(new Date(mes.getFullYear(), mes.getMonth() + delta, 1))

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: TOV.offwhite }}>
      <Box component="header" sx={{ bgcolor: TOV.graphite, color: '#fff', px: { xs: 2, md: 5 }, py: 2.25, borderTop: `3px solid ${TOV.coral}` }}>
        <Box sx={{ maxWidth: 1240, mx: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CalendarMonthIcon />
          <Box>
            <Typography component="h1" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 23, lineHeight: 1.1 }}>
              Calendário de aulas
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'rgba(255,255,255,.64)' }}>Centro TOV de Formação Teológica</Typography>
          </Box>
        </Box>
      </Box>

      <Box component="main" sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 1.5, md: 3 }, py: { xs: 2.5, md: 4 } }}>
        {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}

        {!erro && (
          <>
            <Box sx={{ ...cardSx, p: 2, mb: 2 }}>
              <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  variant="outlined"
                  startIcon={<FilterListIcon />}
                  onClick={() => setFiltrosAbertos((aberto) => !aberto)}
                  aria-expanded={filtrosAbertos}
                  sx={{ display: { xs: 'flex', sm: 'none' }, width: '100%' }}
                >
                  {filtrosAbertos ? 'Ocultar filtros' : 'Filtrar agenda'}
                </Button>
                <TextField select size="small" label="Turma" value={filtros.cod_tur} onChange={(e) => setFiltros({ ...filtros, cod_tur: e.target.value })} sx={{ display: { xs: filtrosAbertos ? 'flex' : 'none', sm: 'flex' }, width: { xs: '100%', sm: 'auto' }, minWidth: 170 }}>
                  <MenuItem value="">Todas</MenuItem>
                  {turmas.map((item) => <MenuItem key={item.valor} value={item.valor}>{item.nome}</MenuItem>)}
                </TextField>
                <TextField select size="small" label="Matéria" value={filtros.cod_mat} onChange={(e) => setFiltros({ ...filtros, cod_mat: e.target.value })} sx={{ display: { xs: filtrosAbertos ? 'flex' : 'none', sm: 'flex' }, width: { xs: '100%', sm: 'auto' }, minWidth: 190 }}>
                  <MenuItem value="">Todas</MenuItem>
                  {materias.map((item) => <MenuItem key={item.valor} value={item.valor}>{item.nome}</MenuItem>)}
                </TextField>
                <TextField select size="small" label="Professor" value={filtros.cod_pro} onChange={(e) => setFiltros({ ...filtros, cod_pro: e.target.value })} sx={{ display: { xs: filtrosAbertos ? 'flex' : 'none', sm: 'flex' }, width: { xs: '100%', sm: 'auto' }, minWidth: 180 }}>
                  <MenuItem value="">Todos</MenuItem>
                  {professores.map((item) => <MenuItem key={item.valor} value={item.valor}>{item.nome}</MenuItem>)}
                </TextField>
                <Box sx={{ ml: { md: 'auto' }, display: 'flex', alignItems: 'center', gap: 1, width: { xs: '100%', md: 'auto' } }}>
                  <Button variant="outlined" onClick={() => mudarMes(-1)} aria-label="Mês anterior" sx={{ minWidth: 44, px: 1 }}>‹</Button>
                  <Typography sx={{ minWidth: 0, flex: 1, textAlign: 'center', fontWeight: 700 }}>{tituloMes}</Typography>
                  <Button variant="outlined" onClick={() => mudarMes(1)} aria-label="Próximo mês" sx={{ minWidth: 44, px: 1 }}>›</Button>
                </Box>
              </Box>
            </Box>

            {!telaDesktop && <Box sx={{ position: 'relative', minHeight: 220 }}>
              {carregando && (
                <Box sx={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,.72)', borderRadius: '16px' }}>
                  <CircularProgress size={34} />
                </Box>
              )}
              <CalendarioAgenda mes={mes} aulas={filtradas} onSelecionar={setSelecionada} />
            </Box>}
            {telaDesktop && <Box sx={{ ...cardSx, overflowX: 'auto', position: 'relative', minHeight: 300 }}>
              {carregando && (
                <Box sx={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,.72)' }}>
                  <CircularProgress size={34} />
                </Box>
              )}
              <CalendarioGrade mes={mes} aulas={filtradas} onSelecionar={setSelecionada} />
            </Box>}
            <Typography sx={{ color: TOV.caption, fontSize: 13, mt: 1.5 }}>
              Toque ou clique em uma aula para ver professor, horário, local e conteúdo.
            </Typography>
          </>
        )}
      </Box>

      <Dialog open={!!selecionada} onClose={() => setSelecionada(null)} maxWidth="sm" fullWidth fullScreen={telaCheia}>
        {selecionada && (
          <>
            <DialogTitle>{selecionada.materia_nome}</DialogTitle>
            <DialogContent>
              <Box sx={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 1, pb: 1 }}>
                <Typography color="text.secondary">Data</Typography>
                <Typography>{textoData(selecionada.data)}</Typography>
                <Typography color="text.secondary">Turma</Typography>
                <Typography>{selecionada.turma_nome}</Typography>
                <Typography color="text.secondary">Professor(a)</Typography>
                <Typography>{selecionada.professor_nome || 'A definir'}</Typography>
                <Typography color="text.secondary">Horário</Typography>
                <Typography>{selecionada.hora_inicio || 'A definir'}{selecionada.hora_fim ? `–${selecionada.hora_fim}` : ''}</Typography>
                <Typography color="text.secondary">Local</Typography>
                <Typography>{selecionada.local || 'A definir'}</Typography>
                <Typography color="text.secondary">Conteúdo</Typography>
                <Typography>{selecionada.tema || 'A definir'}</Typography>
                {selecionada.status === 'CANCELADA' && (
                  <>
                    <Typography color="text.secondary">Situação</Typography>
                    <Typography color="error" sx={{ fontWeight: 700 }}>Aula cancelada</Typography>
                  </>
                )}
              </Box>
            </DialogContent>
          </>
        )}
      </Dialog>
    </Box>
  )
}
