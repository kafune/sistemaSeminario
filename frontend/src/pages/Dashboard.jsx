import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Skeleton, Snackbar, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { api, getUser } from '../api'
import { TOV } from '../theme'
import {
  CabecalhoPagina, CardMetrica, EstadoVazio, SkeletonCards, Superficie, resetBotao,
} from '../ui'
import AlunoForm from './AlunoForm'
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

function saudacao(h) {
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function dataPorExtenso(d) {
  return `${DIAS[d.getDay()][0].toUpperCase()}${DIAS[d.getDay()].slice(1)}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

function semestreAtual(d) {
  return `${d.getFullYear()}.${d.getMonth() < 6 ? 1 : 2}`
}

function tempoRelativo(iso) {
  if (!iso) return 'sem data'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('pt-BR')
}

export default function Dashboard() {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [formAberto, setFormAberto] = useState(false)
  const agora = new Date()
  const usuario = getUser() || 'Secretaria'
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/dashboard').then(setDados).catch((e) => setErro(e.message))
  }, [])

  const maxCurso = dados ? Math.max(1, ...dados.matriculas_por_curso.map((c) => c.total)) : 1

  const acoes = (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormAberto(true)} sx={{ height: 46 }}>
      Novo aluno
    </Button>
  )

  return (
    <Box>
      <CabecalhoPagina
        titulo={`${saudacao(agora.getHours())}, ${usuario}`}
        subtitulo={`${dataPorExtenso(agora)} · Semestre ${semestreAtual(agora)}`}
        acoes={acoes}
      />

      {/* Métricas */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))', lg: 'repeat(4,1fr)' }, gap: { xs: 1.5, sm: 2 }, mb: 2.5 }}>
        {!dados ? (
          <SkeletonCards quantidade={4} altura={142} colunas="subgrid" sx={{ display: 'contents' }} />
        ) : (
          <>
            <CardMetrica rotulo="Alunos ativos" valor={dados.alunos_ativos} nota={{ texto: `${dados.alunos_total} no total`, destaque: true }} />
            <CardMetrica rotulo="Turmas ativas" valor={dados.turmas_total} nota={{ texto: `${dados.cursos_total} ${dados.cursos_total === 1 ? 'curso' : 'cursos'}` }} />
            <CardMetrica rotulo="Lançamentos" valor={dados.lancamentos_total.toLocaleString('pt-BR')} nota={{ texto: 'notas registradas' }} />
            <CardMetrica rotulo="Professores" valor={dados.professores_total} nota={{ texto: `${dados.professores_ativos} ativos`, destaque: true }} destaque />
          </>
        )}
      </Box>

      {/* Matrículas por curso + Atividade recente */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.55fr 1fr' }, gap: '18px' }}>
        <Superficie sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.75 }}>
            <Typography variant="h3" sx={{ fontSize: 22 }}>Matrículas por curso</Typography>
            <Typography sx={{ fontSize: 13, color: TOV.caption }}>{semestreAtual(agora)}</Typography>
          </Box>
          {!dados ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} height={40} sx={{ mb: 1 }} />)
          ) : dados.matriculas_por_curso.length === 0 ? (
            <EstadoVazio compacto titulo="Sem matrículas" descricao="As matrículas por curso aparecerão aqui." />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dados.matriculas_por_curso.map((c, i) => (
                <Box key={c.curso}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, mb: '7px' }}>
                    <Box component="span" sx={{ fontWeight: 600, color: TOV.slate }}>{c.curso}</Box>
                    <Box component="span" sx={{ fontWeight: 700 }}>{c.total}</Box>
                  </Box>
                  <Box sx={{ height: 8, bgcolor: TOV.surfaceMuted, borderRadius: 99, overflow: 'hidden' }}>
                    <Box sx={{ width: `${Math.round((c.total / maxCurso) * 100)}%`, height: '100%', bgcolor: i < 2 ? TOV.coral : TOV.graphite, borderRadius: 99, transition: `width ${TOV.durationBase} ${TOV.ease}` }} />
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Superficie>

        <Superficie sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Typography variant="h3" sx={{ fontSize: 22, mb: 2.5 }}>Atividade recente</Typography>
          {!dados ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} height={38} sx={{ mb: 1 }} />)
          ) : dados.recentes.length === 0 ? (
            <EstadoVazio compacto titulo="Sem atividade recente" descricao="Novos cadastros aparecerão nesta linha do tempo." />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.25 }}>
              {dados.recentes.map((r, i) => (
                <Box
                  component="button"
                  type="button"
                  key={r.cod_alu}
                  onClick={() => navigate(`/alunos/${r.cod_alu}`)}
                  sx={{ ...resetBotao, display: 'flex', gap: 1.75, width: '100%', '&:hover .nome': { color: TOV.coral } }}
                >
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: i === 0 ? TOV.coral : TOV.graphite, mt: '7px', flex: '0 0 8px' }} />
                  <Box>
                    <Box className="nome" sx={{ fontSize: 14, fontWeight: 600, transition: 'color .15s' }}>Aluno cadastrado — {r.nome}</Box>
                    <Box sx={{ fontSize: 13, color: TOV.caption }}>Matrícula {r.cod_alu} · {tempoRelativo(r.dat_cad)}</Box>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Superficie>
      </Box>

      <AlunoForm
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
        aoSalvar={(novo) => { setFormAberto(false); navigate(`/alunos/${novo.cod_alu}`) }}
      />
      <Snackbar open={!!erro} autoHideDuration={6000} onClose={() => setErro('')}>
        <Alert severity="error" onClose={() => setErro('')}>{erro}</Alert>
      </Snackbar>
    </Box>
  )
}
