import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Alert, Box, Button, MenuItem, Snackbar, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined'
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined'
import { api, baixarArquivo, getPerfil } from '../api'
import { TOV } from '../theme'
import {
  BarraFiltros, CabecalhoPagina, CardMetrica, EstadoErro, EstadoVazio,
  SkeletonTabela, cardSx, resetBotao,
} from '../ui'

const TODO_O_PERIODO = 'tudo'

function dataColuna(data) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
    .format(new Date(`${data}T12:00:00`))
}

function dataLonga(data) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    .format(new Date(`${data}T12:00:00`))
}

function mesLongo(mes) {
  const texto = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(`${mes}-01T12:00:00`))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function hojeLocal() {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo',
  }).formatToParts(new Date())
  const valor = (tipo) => partes.find((parte) => parte.type === tipo)?.value
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

const ESTADOS_CELULA = {
  P: { rotulo: 'P', descricao: 'presente', cor: TOV.success, fundo: TOV.successTint },
  F: { rotulo: 'F', descricao: 'falta', cor: TOV.danger, fundo: TOV.dangerTint },
}

const VAZIO = { rotulo: '·', descricao: 'sem registro', cor: TOV.caption, fundo: 'transparent' }

/** Fundo opaco por linha: as colunas fixas precisam cobrir o que passa por baixo. */
function fundoLinha(indice) {
  return indice % 2 ? TOV.surfaceHover : TOV.surface
}

const colunaFixa = (lado, indice) => ({
  position: 'sticky',
  [lado]: 0,
  zIndex: 1,
  bgcolor: fundoLinha(indice),
  [lado === 'left' ? 'borderRight' : 'borderLeft']: `1px solid ${TOV.border}`,
})

const cabecalhoFixo = (lado) => ({
  position: 'sticky',
  [lado]: 0,
  zIndex: 3,
  bgcolor: TOV.surfaceMuted,
  [lado === 'left' ? 'borderRight' : 'borderLeft']: `1px solid ${TOV.border}`,
})

export default function DiarioClasse() {
  const { codTur } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const vinculoId = params.get('vinculo') || ''
  const mesFiltro = params.get('mes') || TODO_O_PERIODO
  const ehProfessor = getPerfil() === 'PROFESSOR'
  const hoje = hojeLocal()

  const [vinculos, setVinculos] = useState(null)
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [baixando, setBaixando] = useState(false)
  const [emVoo, setEmVoo] = useState(() => new Set())
  const emVooRef = useRef(new Set())

  const definirParam = useCallback((chave, valor) => {
    setParams((atuais) => {
      const proximos = new URLSearchParams(atuais)
      if (valor) proximos.set(chave, valor)
      else proximos.delete(chave)
      return proximos
    }, { replace: true })
  }, [setParams])

  useEffect(() => {
    let ativo = true
    api.get(`/turmas/${codTur}/diario/vinculos`)
      .then((lista) => {
        if (!ativo) return
        setVinculos(lista)
        if (!vinculoId && lista.length > 0) definirParam('vinculo', String(lista[0].docturma_id))
        if (lista.length === 0) setCarregando(false)
      })
      .catch((e) => { if (ativo) { setErro(e.message); setCarregando(false) } })
    return () => { ativo = false }
    // A lista de matérias não muda com o vínculo selecionado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codTur])

  const carregar = useCallback(async () => {
    if (!vinculoId) return
    setCarregando(true)
    setDados(null)
    try {
      setDados(await api.get(`/turmas/${codTur}/diario?docturma_id=${vinculoId}`))
      setErro('')
    } catch (e) {
      setErro(e.message)
      setDados(null)
    } finally {
      setCarregando(false)
    }
  }, [codTur, vinculoId])

  useEffect(() => { carregar() }, [carregar])

  const meses = useMemo(() => {
    const unicos = new Set((dados?.aulas || []).map((aula) => aula.data.slice(0, 7)))
    return [...unicos].sort()
  }, [dados])

  const aulas = useMemo(() => {
    const todas = dados?.aulas || []
    if (mesFiltro === TODO_O_PERIODO) return todas
    return todas.filter((aula) => aula.data.startsWith(mesFiltro))
  }, [dados, mesFiltro])

  const metricas = useMemo(() => {
    const alunos = dados?.alunos || []
    const ids = new Set(aulas.map((aula) => aula.id))
    let presentes = 0
    let registros = 0
    let faltas = 0
    alunos.forEach((aluno) => {
      Object.entries(aluno.celulas).forEach(([aulaId, valor]) => {
        if (!ids.has(Number(aulaId))) return
        registros += 1
        if (valor === 'P') presentes += 1
      })
      faltas += aluno.faltas
    })
    return {
      alunos: alunos.length,
      aulasRegistradas: aulas.filter((aula) => aula.chamada_status === 'ENCERRADA').length,
      faltas,
      presenca: registros ? Math.round((presentes / registros) * 100) : null,
    }
  }, [aulas, dados])

  async function alternarCelula(aluno, aula) {
    const chave = `${aluno.cod_alu}:${aula.id}`
    if (emVooRef.current.has(chave)) return
    const anterior = aluno.celulas[String(aula.id)]
    const presente = anterior !== 'P'

    emVooRef.current.add(chave)
    setEmVoo(new Set(emVooRef.current))
    setDados((atual) => aplicarCelula(atual, aluno.cod_alu, aula.id, presente ? 'P' : 'F'))
    try {
      const resposta = await api.put(
        `/turmas/${codTur}/diario/aulas/${aula.id}/presencas/${aluno.cod_alu}`,
        { presente },
      )
      setDados((atual) => aplicarResposta(atual, resposta))
    } catch (e) {
      setDados((atual) => aplicarCelula(atual, aluno.cod_alu, aula.id, anterior))
      setMensagem(e.message)
    } finally {
      emVooRef.current.delete(chave)
      setEmVoo(new Set(emVooRef.current))
    }
  }

  async function baixarXlsx() {
    setBaixando(true)
    try {
      await baixarArquivo(`/turmas/${codTur}/diario.xlsx?docturma_id=${vinculoId}`, 'diario.xlsx')
    } catch (e) {
      setMensagem(e.message)
    } finally {
      setBaixando(false)
    }
  }

  const vinculo = dados?.vinculo
  const voltar = () => navigate(
    ehProfessor && vinculoId ? `/professor/turmas/${vinculoId}?aba=aulas` : `/turmas/${codTur}`,
  )

  return (
    <Box>
      <Box
        component="button"
        type="button"
        onClick={voltar}
        sx={{ ...resetBotao, px: 0.5, display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: TOV.type.body, color: TOV.caption, fontWeight: 700, mb: 1.5, '&:hover': { color: TOV.coral } }}
      >
        <ArrowBackRoundedIcon sx={{ fontSize: TOV.type.section }} /> Voltar para a turma
      </Box>

      <CabecalhoPagina
        eyebrow="Diário de classe"
        titulo={vinculo?.materia_nome || 'Diário de classe'}
        descricao={[vinculo?.turma_nome, vinculo?.professor_nome].filter(Boolean).join(' · ') || 'Presenças aula a aula, como no diário de papel.'}
        metadados={vinculo?.ano && vinculo?.semestre ? `${vinculo.ano}/${vinculo.semestre}` : null}
        acoes={(
          <>
            <Button variant="outlined" startIcon={<CloudDownloadOutlinedIcon />} disabled={!vinculoId || baixando} onClick={baixarXlsx}>
              {baixando ? 'Gerando…' : 'Baixar XLSX'}
            </Button>
            <Button variant="contained" startIcon={<HowToRegOutlinedIcon />} onClick={() => navigate(`/turmas/${codTur}/presencas${vinculoId ? `?vinculo=${vinculoId}` : ''}`)}>
              Fazer chamada
            </Button>
          </>
        )}
      />

      <BarraFiltros>
        <TextField
          select size="small" label="Matéria"
          value={vinculos && vinculoId ? vinculoId : ''}
          onChange={(evento) => definirParam('vinculo', evento.target.value)}
          disabled={!vinculos || vinculos.length === 0}
          sx={{ minWidth: { sm: 260 } }}
        >
          {(vinculos || []).map((item) => (
            <MenuItem key={item.docturma_id} value={String(item.docturma_id)}>
              {[item.materia_nome, item.professor_nome].filter(Boolean).join(' · ')}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select size="small" label="Período"
          value={meses.includes(mesFiltro) ? mesFiltro : TODO_O_PERIODO}
          onChange={(evento) => definirParam('mes', evento.target.value === TODO_O_PERIODO ? '' : evento.target.value)}
          disabled={meses.length === 0}
        >
          <MenuItem value={TODO_O_PERIODO}>Todo o período</MenuItem>
          {meses.map((mes) => <MenuItem key={mes} value={mes}>{mesLongo(mes)}</MenuItem>)}
        </TextField>
        <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, ml: { sm: 'auto' } }}>
          Toque numa célula para corrigir a presença.
        </Typography>
      </BarraFiltros>

      {erro && <EstadoErro descricao={erro} onTentarNovamente={carregar} sx={{ mb: 2 }} />}

      {vinculos?.length === 0 && !erro && (
        <Box sx={cardSx}>
          <EstadoVazio
            titulo="Nenhuma matéria vinculada a esta turma"
            descricao="Cadastre o vínculo entre turma, matéria e professor antes de usar o diário."
          />
        </Box>
      )}

      {dados && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 2 }}>
          <CardMetrica rotulo="Alunos" valor={metricas.alunos} nota="matriculados" />
          <CardMetrica rotulo="Aulas registradas" valor={metricas.aulasRegistradas} nota={`de ${aulas.length} no período`} />
          <CardMetrica rotulo="Faltas" valor={metricas.faltas} nota="somando toda a matéria" destaque={metricas.faltas > 0} />
          <CardMetrica rotulo="Presença" valor={metricas.presenca == null ? '—' : `${metricas.presenca}%`} nota="das chamadas registradas" />
        </Box>
      )}

      {carregando && !dados && <Box sx={cardSx}><SkeletonTabela linhas={8} /></Box>}

      {dados && aulas.length === 0 && (
        <Box sx={cardSx}>
          <EstadoVazio
            titulo="Nenhuma aula no período"
            descricao="Peça à secretaria para adicionar as aulas desta matéria ao calendário."
          />
        </Box>
      )}

      {dados && aulas.length > 0 && (
        <>
          <TableContainer component={Box} sx={{ ...cardSx, overflow: 'auto', maxHeight: { xs: '65vh', md: '72vh' } }}>
            <Table
              size="small"
              aria-label={`Diário de ${vinculo?.materia_nome || 'classe'}`}
              sx={{ '& .MuiTableRow-root:nth-of-type(even)': { bgcolor: 'transparent' } }}
            >
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...cabecalhoFixo('left'), minWidth: { xs: 168, md: 260 } }}>Aluno</TableCell>
                  {aulas.map((aula) => (
                    <TableCell
                      key={aula.id}
                      align="center"
                      title={[dataLonga(aula.data), aula.hora_inicio, aula.tema].filter(Boolean).join(' · ')}
                      sx={{
                        px: 0.5,
                        minWidth: { xs: 44, md: 56 },
                        color: aula.data === hoje ? TOV.coral : TOV.caption,
                        borderBottom: `2px solid ${aula.data === hoje ? TOV.coral : TOV.border}`,
                      }}
                    >
                      <Box sx={{ fontSize: TOV.type.overline, letterSpacing: 0 }}>{dataColuna(aula.data)}</Box>
                      {aula.hora_inicio && (
                        <Box sx={{ fontSize: TOV.type.micro, fontWeight: 400, letterSpacing: 0 }}>{aula.hora_inicio}</Box>
                      )}
                    </TableCell>
                  ))}
                  <TableCell align="center" sx={{ ...cabecalhoFixo('right'), minWidth: 64 }}>Faltas</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {dados.alunos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={aulas.length + 2} sx={{ p: 0 }}>
                      <EstadoVazio titulo="Nenhum aluno matriculado" descricao="Matricule alunos na turma para montar o diário." />
                    </TableCell>
                  </TableRow>
                )}
                {dados.alunos.map((aluno, indice) => (
                  <TableRow key={aluno.cod_alu} sx={{ bgcolor: fundoLinha(indice) }}>
                    <TableCell sx={{ ...colunaFixa('left', indice), fontWeight: 700 }}>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Box component="span" sx={{ color: TOV.caption, fontSize: TOV.type.caption, fontVariantNumeric: 'tabular-nums' }}>
                          {String(indice + 1).padStart(2, '0')}
                        </Box>
                        <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{aluno.nome}</Box>
                      </Box>
                    </TableCell>
                    {aulas.map((aula) => {
                      const valor = aluno.celulas[String(aula.id)]
                      const estado = ESTADOS_CELULA[valor] || VAZIO
                      const futura = aula.data > hoje
                      const salvando = emVoo.has(`${aluno.cod_alu}:${aula.id}`)
                      return (
                        <TableCell key={aula.id} align="center" sx={{ p: 0 }}>
                          <Box
                            component="button"
                            type="button"
                            disabled={futura || salvando}
                            onClick={() => alternarCelula(aluno, aula)}
                            aria-label={`${aluno.nome} · ${dataLonga(aula.data)} · ${estado.descricao}`}
                            sx={{
                              ...resetBotao,
                              width: '100%',
                              minHeight: 44,
                              display: 'grid',
                              placeItems: 'center',
                              fontFamily: TOV.fontHead,
                              fontWeight: 700,
                              fontSize: TOV.type.body,
                              color: estado.cor,
                              bgcolor: estado.fundo,
                              opacity: salvando ? 0.45 : 1,
                              cursor: futura ? 'not-allowed' : 'pointer',
                              transition: `background-color ${TOV.durationFast} ${TOV.ease}`,
                              '&:hover:not(:disabled)': { bgcolor: TOV.slateTint },
                            }}
                          >
                            {estado.rotulo}
                          </Box>
                        </TableCell>
                      )
                    })}
                    <TableCell
                      align="center"
                      sx={{ ...colunaFixa('right', indice), fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: aluno.faltas > 0 ? TOV.danger : TOV.caption }}
                    >
                      {aluno.faltas}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mt: 1.5 }}>
            <Legenda cor={TOV.success} fundo={TOV.successTint} rotulo="P — presente" />
            <Legenda cor={TOV.danger} fundo={TOV.dangerTint} rotulo="F — falta" />
            <Legenda cor={TOV.caption} fundo="transparent" rotulo="· — sem chamada registrada" />
            <Typography sx={{ color: TOV.caption, fontSize: TOV.type.caption, maxWidth: '72ch' }}>
              O total de faltas conta apenas as chamadas encerradas; aulas sem chamada aparecem vazias.
            </Typography>
          </Box>
        </>
      )}

      <Snackbar open={!!mensagem} autoHideDuration={5000} onClose={() => setMensagem('')}>
        <Alert severity="error" onClose={() => setMensagem('')}>{mensagem}</Alert>
      </Snackbar>
    </Box>
  )
}

function Legenda({ cor, fundo, rotulo }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: TOV.caption, fontSize: TOV.type.caption }}>
      <Box
        aria-hidden="true"
        sx={{ width: 24, height: 24, display: 'grid', placeItems: 'center', borderRadius: TOV.radiusXs, border: `1px solid ${TOV.border}`, bgcolor: fundo, color: cor, fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.caption }}
      >
        {rotulo.charAt(0)}
      </Box>
      {rotulo}
    </Box>
  )
}

/** Troca o valor de uma célula preservando a identidade das demais linhas. */
function aplicarCelula(dados, codAlu, aulaId, valor) {
  if (!dados) return dados
  return {
    ...dados,
    alunos: dados.alunos.map((aluno) => {
      if (aluno.cod_alu !== codAlu) return aluno
      const celulas = { ...aluno.celulas }
      if (valor) celulas[String(aulaId)] = valor
      else delete celulas[String(aulaId)]
      return { ...aluno, celulas }
    }),
  }
}

/** O servidor devolve o total de faltas e o status já consolidados. */
function aplicarResposta(dados, resposta) {
  if (!dados) return dados
  return {
    ...dados,
    aulas: dados.aulas.map((aula) => (
      aula.id === resposta.aula_id
        ? { ...aula, status: resposta.aula_status, chamada_status: resposta.chamada_status }
        : aula
    )),
    alunos: dados.alunos.map((aluno) => (
      aluno.cod_alu === resposta.cod_alu ? { ...aluno, faltas: resposta.faltas } : aluno
    )),
  }
}
