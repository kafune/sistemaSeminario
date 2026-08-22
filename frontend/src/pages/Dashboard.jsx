import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Skeleton, Snackbar, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { api, getUser } from '../api'
import { TOV } from '../theme'
import {
  CabecalhoPagina, CardMetrica, EstadoErro, EstadoVazio, SkeletonCards, Superficie, resetBotao,
} from '../ui'
import AlunoForm from './AlunoForm'
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

// Onde cada fila de trabalho aterrissa. Pendência que não abre a lista
// correspondente vira número decorativo.
const DESTINO_PENDENCIA = {
  chamadas_abertas: '/turmas',
  pre_cadastros: '/alunos?status=P',
  notas_em_aberto: '/notas',
  alunos_sem_turma: '/alunos?sem_turma=1',
}

// Com as chamadas abertas concentradas numa turma só, o painel abre a chamada
// em vez de devolver o usuário à lista para procurar qual é. Com mais de uma
// turma envolvida a lista é o destino certo — lá elas vêm marcadas.
function destino(pendencia) {
  if (pendencia.chave === 'chamadas_abertas' && pendencia.cod_tur) {
    return `/turmas/${pendencia.cod_tur}/presencas`
  }
  return DESTINO_PENDENCIA[pendencia.chave]
}

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

  const carregar = useCallback(() => {
    setErro('')
    api.get('/dashboard').then(setDados).catch((e) => setErro(e.message))
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const maxCurso = dados ? Math.max(1, ...dados.matriculas_por_curso.map((c) => c.total)) : 1

  // O censo é contexto, não decisão: vive numa linha de metadado, não em
  // quatro cartões de 40px.
  const censo = dados ? [
    `${dados.alunos_ativos} ${dados.alunos_ativos === 1 ? 'aluno ativo' : 'alunos ativos'}`,
    `${dados.turmas_total} ${dados.turmas_total === 1 ? 'turma' : 'turmas'}`,
    `${dados.professores_ativos} ${dados.professores_ativos === 1 ? 'professor' : 'professores'}`,
    `${dados.lancamentos_total.toLocaleString('pt-BR')} notas lançadas`,
  ].join(' · ') : null

  const pendencias = dados?.pendencias ?? []
  // A superfície invertida marca a fila mais urgente que realmente tem fila —
  // não a mais bonita do conjunto.
  const chaveUrgente = pendencias.find((p) => p.total > 0)?.chave
  const tudoEmDia = dados && pendencias.every((p) => p.total === 0)

  const acoes = (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormAberto(true)}>
      Novo aluno
    </Button>
  )

  return (
    <Box>
      <CabecalhoPagina
        titulo={`${saudacao(agora.getHours())}, ${usuario}`}
        subtitulo={`${dataPorExtenso(agora)} · Semestre ${semestreAtual(agora)}`}
        metadados={dados ? censo : null}
        acoes={acoes}
      />

      {erro && !dados && (
        <EstadoErro titulo="Não foi possível carregar o painel" descricao={erro} onTentarNovamente={carregar} sx={{ mb: 2.5 }} />
      )}

      {/* Filas de trabalho */}
      {!erro && <Box component="section" aria-labelledby="painel-pendencias" sx={{ mb: 2.5 }}>
        <Typography component="h2" id="painel-pendencias" variant="h3" sx={{ fontSize: TOV.type.titleSm, mb: 1.5 }}>
          Precisa de atenção
        </Typography>
        {tudoEmDia ? (
          <Superficie sx={{ p: { xs: 2.5, md: 3 } }}>
            <EstadoVazio
              compacto
              titulo="Nada pendente"
              descricao="Chamadas encerradas, pré-cadastros triados e notas do semestre lançadas."
            />
          </Superficie>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))', lg: 'repeat(4,1fr)' }, gap: { xs: 1.5, sm: 2 } }}>
            {!dados ? (
              <SkeletonCards quantidade={4} altura={142} colunas="subgrid" sx={{ display: 'contents' }} />
            ) : (
              pendencias.map((p) => (
                <CardMetrica
                  key={p.chave}
                  rotulo={p.rotulo}
                  valor={p.total}
                  nota={p.nota}
                  destaque={p.chave === chaveUrgente}
                  onClick={() => navigate(destino(p))}
                />
              ))
            )}
          </Box>
        )}
      </Box>}

      {/* Matrículas por curso + Atividade recente */}
      {!erro && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.55fr 1fr' }, gap: 2.5 }}>
        <Superficie sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Typography variant="h3" sx={{ fontSize: TOV.type.titleSm }}>Matrículas por curso</Typography>
            <Typography sx={{ fontSize: TOV.type.bodySm, color: TOV.caption }}>{semestreAtual(agora)}</Typography>
          </Box>
          {!dados ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} height={40} sx={{ mb: 1 }} />)
          ) : dados.matriculas_por_curso.length === 0 ? (
            <EstadoVazio compacto titulo="Sem matrículas" descricao="As matrículas por curso aparecerão aqui." />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dados.matriculas_por_curso.map((c, i) => (
                <Box key={c.curso}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: TOV.type.body, mb: 1 }}>
                    <Box component="span" sx={{ fontWeight: 600, color: TOV.graphite }}>{c.curso}</Box>
                    <Box component="span" sx={{ fontWeight: 700 }}>{c.total}</Box>
                  </Box>
                  <Box sx={{ height: 8, bgcolor: TOV.surfaceMuted, borderRadius: TOV.radiusFull, overflow: 'hidden' }}>
                    <Box sx={{ width: `${Math.round((c.total / maxCurso) * 100)}%`, height: '100%', bgcolor: i < 2 ? TOV.graphite : TOV.caption, borderRadius: TOV.radiusFull, transition: `width ${TOV.transitionBase}` }} />
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Superficie>

        <Superficie sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Typography variant="h3" sx={{ fontSize: TOV.type.titleSm, mb: 2.5 }}>Atividade recente</Typography>
          {!dados ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} height={38} sx={{ mb: 1 }} />)
          ) : dados.recentes.length === 0 ? (
            <EstadoVazio compacto titulo="Sem atividade recente" descricao="Novos cadastros aparecerão nesta linha do tempo." />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {dados.recentes.map((r, i) => (
                <Box
                  component="button"
                  type="button"
                  key={r.cod_alu}
                  onClick={() => navigate(`/alunos/${r.cod_alu}`)}
                  sx={{ ...resetBotao, display: 'flex', gap: 2, width: '100%', '&:hover .nome': { color: TOV.coral } }}
                >
                  <Box sx={{ width: 8, height: 8, borderRadius: TOV.radiusFull, bgcolor: TOV.graphite, mt: 1, flex: '0 0 8px' }} />
                  <Box>
                    <Box className="nome" sx={{ fontSize: TOV.type.body, fontWeight: 600, transition: `color ${TOV.transitionFast}` }}>Aluno cadastrado — {r.nome}</Box>
                    <Box sx={{ fontSize: TOV.type.bodySm, color: TOV.caption }}>Matrícula {r.cod_alu} · {tempoRelativo(r.dat_cad)}</Box>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Superficie>
      </Box>}

      <AlunoForm
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
        aoSalvar={(novo) => { setFormAberto(false); navigate(`/alunos/${novo.cod_alu}`) }}
      />
      <Snackbar open={!!erro && !!dados} autoHideDuration={6000} onClose={() => setErro('')}>
        <Alert severity="error" onClose={() => setErro('')}>{erro}</Alert>
      </Snackbar>
    </Box>
  )
}
