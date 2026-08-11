import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined'
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined'
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined'
import { api } from '../api'
import { TOV, focusRing } from '../theme'
import { CabecalhoPagina, CardMetrica, EstadoVazio, StatusBadge, cardSx } from '../ui'

function dataLonga(data) {
  if (!data) return '—'
  const texto = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
    .format(new Date(`${data}T12:00:00`))
    .replace('.', '')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function CartaoTurma({ turma, onAbrir }) {
  const periodo = turma.ano && turma.semestre ? `${turma.ano}/${turma.semestre}` : null
  const progresso = turma.total_alunos ? Math.round((turma.notas_lancadas / turma.total_alunos) * 100) : 0
  return (
    <Box component="article" sx={{ ...cardSx, p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box aria-hidden="true" sx={{ width: 46, height: 46, display: 'grid', placeItems: 'center', borderRadius: TOV.radiusSm, bgcolor: TOV.slateTint, color: TOV.graphite, flexShrink: 0 }}><MenuBookOutlinedIcon /></Box>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography component="h2" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.section, overflowWrap: 'anywhere' }}>{turma.materia_nome}</Typography>
          <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 0.5 }}>{[turma.turma_nome, periodo].filter(Boolean).join(' · ')}</Typography>
        </Box>
        {turma.notas_pendentes > 0
          ? <StatusBadge tom="warning">{turma.notas_pendentes} pendente(s)</StatusBadge>
          : <StatusBadge tom="success">Notas completas</StatusBadge>}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, py: 1.5, borderTop: `1px solid ${TOV.divider}`, borderBottom: `1px solid ${TOV.divider}` }}>
        {[['Alunos', turma.total_alunos], ['Aulas', turma.total_aulas], ['Materiais', turma.total_materiais]].map(([rotulo, valor]) => (
          <Box key={rotulo} sx={{ textAlign: 'center' }}><Typography sx={{ fontWeight: 700 }}>{valor}</Typography><Typography sx={{ color: TOV.caption, fontSize: TOV.type.overline }}>{rotulo}</Typography></Box>
        ))}
      </Box>
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', color: TOV.caption, fontSize: TOV.type.caption, mb: 1 }}><span>Notas lançadas</span><span>{progresso}%</span></Box>
        <Box sx={{ height: 8, bgcolor: TOV.slateTint, borderRadius: TOV.radiusFull, overflow: 'hidden' }}><Box sx={{ width: `${progresso}%`, height: '100%', bgcolor: progresso === 100 ? TOV.success : TOV.graphite, borderRadius: TOV.radiusFull }} /></Box>
      </Box>
      <Button variant="outlined" endIcon={<ArrowForwardRoundedIcon />} onClick={onAbrir} sx={{ mt: 'auto', alignSelf: 'flex-start' }}>Abrir turma</Button>
    </Box>
  )
}

export default function PortalProfessor({ somenteTurmas = false }) {
  const navigate = useNavigate()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api.get('/portal-professor/resumo').then(setDados).catch((e) => setErro(e.message))
  }, [])

  if (erro) return <Alert severity="error">{erro}</Alert>
  if (!dados) return <Box sx={{ minHeight: 320, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>

  return (
    <Box>
      <CabecalhoPagina
        titulo={somenteTurmas ? 'Minhas turmas' : `Olá, ${dados.professor.nome?.split(' ')[0] || 'professor'}`}
        descricao={somenteTurmas ? 'Acesse o espaço de trabalho de cada matéria e turma.' : 'Acompanhe suas próximas aulas e o que precisa de atenção.'}
      />

      {!somenteTurmas && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 3 }}>
            <CardMetrica rotulo="Turmas" valor={dados.metricas.turmas} nota={{ texto: `${dados.metricas.materias} matéria(s)` }} icone={<SchoolOutlinedIcon />} />
            <CardMetrica rotulo="Alunos" valor={dados.metricas.alunos} nota={{ texto: 'alunos nas suas turmas' }} icone={<GroupsOutlinedIcon />} />
            <CardMetrica rotulo="Aulas hoje" valor={dados.metricas.aulas_hoje} nota={{ texto: 'na agenda de hoje' }} destaque icone={<CalendarMonthOutlinedIcon />} />
            <CardMetrica rotulo="Notas pendentes" valor={dados.metricas.notas_pendentes} nota={{ texto: 'lançamentos restantes' }} icone={<PendingActionsOutlinedIcon />} />
          </Box>

          <Box sx={{ ...cardSx, p: { xs: 2, sm: 2.5 }, mb: 3 }}>
            <Typography variant="h2" sx={{ fontSize: TOV.type.titleSm, mb: 2 }}>Próximas aulas</Typography>
            {dados.proximas_aulas.length === 0 ? (
              <EstadoVazio compacto titulo="Nenhuma aula próxima" descricao="As aulas cadastradas no calendário aparecerão aqui." />
            ) : (
              <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 0.5 }}>
                {dados.proximas_aulas.map((aula) => (
                  <Box key={aula.id} component="button" type="button" onClick={() => navigate(`/professor/turmas/${aula.docturma_id}?aba=aulas`)} sx={{ appearance: 'none', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer', minWidth: { xs: 240, sm: 280 }, p: 2, border: `1px solid ${TOV.border}`, bgcolor: aula.data === new Date().toISOString().slice(0, 10) ? TOV.coralTint : TOV.surface, borderRadius: TOV.radiusSm, '&:hover': { borderColor: TOV.coral }, '&:focus-visible': focusRing }}>
                    <Typography sx={{ color: aula.data === new Date().toISOString().slice(0, 10) ? TOV.coral : TOV.caption, fontWeight: 700, fontSize: TOV.type.caption, textTransform: 'uppercase' }}>{dataLonga(aula.data)}{aula.hora_inicio ? ` · ${aula.hora_inicio}` : ''}</Typography>
                    <Typography sx={{ fontWeight: 700, mt: 1 }}>{aula.materia_nome}</Typography>
                    <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm }}>{aula.turma_nome}</Typography>
                    <Typography sx={{ color: TOV.slate, fontSize: TOV.type.bodySm, mt: 1 }}>{aula.tema || 'Tema ainda não informado'}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </>
      )}

      <Box sx={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 2, mb: 1.5 }}>
        <Box><Typography variant="h2" sx={{ fontSize: TOV.type.title }}>{somenteTurmas ? 'Turmas e matérias' : 'Minhas turmas'}</Typography>{!somenteTurmas && <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 0.5 }}>Entre em uma turma para trabalhar com aulas, notas e materiais.</Typography>}</Box>
        {!somenteTurmas && <Button onClick={() => navigate('/professor/turmas')}>Ver todas</Button>}
      </Box>
      {dados.turmas.length === 0 ? (
        <Box sx={cardSx}><EstadoVazio titulo="Nenhuma turma vinculada" descricao="Peça à secretaria para vincular seu cadastro a uma matéria e turma." /></Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
          {(somenteTurmas ? dados.turmas : dados.turmas.slice(0, 6)).map((turma) => <CartaoTurma key={turma.docturma_id} turma={turma} onAbrir={() => navigate(`/professor/turmas/${turma.docturma_id}`)} />)}
        </Box>
      )}
    </Box>
  )
}
