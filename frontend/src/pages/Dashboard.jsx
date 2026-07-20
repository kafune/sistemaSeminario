import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Skeleton, Snackbar, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { api } from '../api'
import { TOV } from '../theme'
import { CabecalhoPagina, Eyebrow } from '../ui'
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

/** Cartão de métrica. `escuro` inverte para o card preto de destaque. */
function CardMetrica({ rotulo, valor, nota, escuro }) {
  return (
    <Box sx={{ bgcolor: escuro ? TOV.ink : TOV.white, color: escuro ? '#fff' : TOV.ink, borderRadius: '16px', p: '24px 26px', boxShadow: TOV.shadowCard }}>
      <Eyebrow sx={{ color: escuro ? 'rgba(255,255,255,.55)' : TOV.caption }}>{rotulo}</Eyebrow>
      <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 46, mt: 1.25, lineHeight: 1 }}>{valor}</Typography>
      {nota && <Typography sx={{ mt: 0.75, fontSize: 13, fontWeight: nota.destaque ? 600 : 400, color: nota.destaque ? TOV.coral : (escuro ? 'rgba(255,255,255,.7)' : TOV.slate) }}>{nota.texto}</Typography>}
    </Box>
  )
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
        titulo={`${saudacao(agora.getHours())}, Secretaria`}
        subtitulo={`${dataPorExtenso(agora)} · Semestre ${semestreAtual(agora)}`}
        acoes={acoes}
      />

      {/* Métricas */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', lg: 'repeat(4,1fr)' }, gap: '18px', mb: '22px' }}>
        {!dados ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={132} sx={{ borderRadius: '16px' }} />)
        ) : (
          <>
            <CardMetrica rotulo="Alunos ativos" valor={dados.alunos_ativos} nota={{ texto: `${dados.alunos_total} no total`, destaque: true }} />
            <CardMetrica rotulo="Turmas ativas" valor={dados.turmas_total} nota={{ texto: `${dados.cursos_total} ${dados.cursos_total === 1 ? 'curso' : 'cursos'}` }} />
            <CardMetrica rotulo="Lançamentos" valor={dados.lancamentos_total.toLocaleString('pt-BR')} nota={{ texto: 'notas registradas' }} />
            <CardMetrica rotulo="Professores" valor={dados.professores_total} nota={{ texto: `${dados.professores_ativos} ativos`, destaque: true }} escuro />
          </>
        )}
      </Box>

      {/* Matrículas por curso + Atividade recente */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.55fr 1fr' }, gap: '18px' }}>
        <Box sx={{ bgcolor: TOV.white, borderRadius: '16px', p: '28px 30px', boxShadow: TOV.shadowCard }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.75 }}>
            <Typography variant="h3" sx={{ fontSize: 22 }}>Matrículas por curso</Typography>
            <Typography sx={{ fontSize: 13, color: TOV.caption }}>{semestreAtual(agora)}</Typography>
          </Box>
          {!dados ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} height={40} sx={{ mb: 1 }} />)
          ) : dados.matriculas_por_curso.length === 0 ? (
            <Typography sx={{ color: TOV.caption, fontSize: 14 }}>Nenhuma matrícula registrada ainda.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dados.matriculas_por_curso.map((c, i) => (
                <Box key={c.curso}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, mb: '7px' }}>
                    <Box component="span" sx={{ fontWeight: 600, color: TOV.slate }}>{c.curso}</Box>
                    <Box component="span" sx={{ fontWeight: 700 }}>{c.total}</Box>
                  </Box>
                  <Box sx={{ height: 12, bgcolor: TOV.offwhite, borderRadius: '6px', overflow: 'hidden' }}>
                    <Box sx={{ width: `${Math.round((c.total / maxCurso) * 100)}%`, height: '100%', bgcolor: i < 2 ? TOV.coral : TOV.slate, borderRadius: '6px' }} />
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box sx={{ bgcolor: TOV.white, borderRadius: '16px', p: '28px 30px', boxShadow: TOV.shadowCard }}>
          <Typography variant="h3" sx={{ fontSize: 22, mb: 2.5 }}>Atividade recente</Typography>
          {!dados ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} height={38} sx={{ mb: 1 }} />)
          ) : dados.recentes.length === 0 ? (
            <Typography sx={{ color: TOV.caption, fontSize: 14 }}>Sem atividade recente.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.25 }}>
              {dados.recentes.map((r, i) => (
                <Box
                  key={r.cod_alu}
                  onClick={() => navigate(`/alunos/${r.cod_alu}`)}
                  sx={{ display: 'flex', gap: 1.75, cursor: 'pointer', '&:hover .nome': { color: TOV.coral } }}
                >
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: i === 0 ? TOV.coral : TOV.slate, mt: '7px', flex: '0 0 8px' }} />
                  <Box>
                    <Box className="nome" sx={{ fontSize: 14, fontWeight: 600, transition: 'color .15s' }}>Aluno cadastrado — {r.nome}</Box>
                    <Box sx={{ fontSize: 13, color: TOV.caption }}>Matrícula {r.cod_alu} · {tempoRelativo(r.dat_cad)}</Box>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
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
