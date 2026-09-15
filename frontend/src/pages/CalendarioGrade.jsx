import { useMemo, useState } from 'react'
import { Box, Button, Typography } from '@mui/material'
import { TOV, focusRing } from '../theme'
import { GrupoSegmentado } from '../ui'

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Texto só para leitor de tela: a marca visual fica curta, o nome do estado não.
const VISUALMENTE_OCULTO = {
  position: 'absolute', width: '1px', height: '1px', overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
}

export function isoLocal(data) {
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export function intervaloGrade(mes) {
  const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1)
  inicio.setDate(inicio.getDate() - inicio.getDay())
  const fim = new Date(inicio)
  fim.setDate(fim.getDate() + 41)
  return { inicio: isoLocal(inicio), fim: isoLocal(fim) }
}

function corEvento(status) {
  if (status === 'CANCELADA') return { bg: TOV.captionTint, color: TOV.caption }
  if (status === 'REALIZADA') return { bg: TOV.graphiteTint, color: TOV.graphite }
  return { bg: TOV.infoTint, color: TOV.info }
}

const STATUS = {
  AGENDADA: 'Agendada',
  REALIZADA: 'Realizada',
  CANCELADA: 'Cancelada',
}

function dataLegivel(iso) {
  const texto = new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** Semanas do mês, começando no domingo — as mesmas faixas da grade. */
function semanasDoMes(mes) {
  const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1)
  const cursor = new Date(primeiro)
  cursor.setDate(cursor.getDate() - cursor.getDay())
  const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0)
  const semanas = []
  while (cursor <= ultimo) {
    const fim = new Date(cursor)
    fim.setDate(fim.getDate() + 6)
    semanas.push({ inicio: isoLocal(cursor), fim: isoLocal(fim) })
    cursor.setDate(cursor.getDate() + 7)
  }
  return semanas
}

function diaEMes(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

/**
 * Lista cronológica, pensada para leitura e toque no celular.
 *
 * O mês inteiro numa lista só dava 17.915px de página em 320px — 28 telas de
 * rolagem (AUDITORIA_VISUAL.md B6). O recorte padrão é a semana; quem quer o
 * mês inteiro pede.
 */
export function CalendarioAgenda({ mes, aulas, onSelecionar, onNovo }) {
  const [recorte, setRecorte] = useState('semana')
  const semanas = useMemo(() => semanasDoMes(mes), [mes])

  const doMes = [...aulas]
    .filter((aula) => {
      const data = new Date(`${aula.data}T12:00:00`)
      return data.getMonth() === mes.getMonth() && data.getFullYear() === mes.getFullYear()
    })
    .sort((a, b) => `${a.data} ${a.hora_inicio || ''}`.localeCompare(`${b.data} ${b.hora_inicio || ''}`))

  // A semana aberta é a de hoje quando o mês é o corrente; senão, a primeira
  // que tem aula — abrir numa semana vazia é uma tela vazia sem motivo.
  const semanaInicial = useMemo(() => {
    const hoje = isoLocal(new Date())
    const doHoje = semanas.findIndex((semana) => hoje >= semana.inicio && hoje <= semana.fim)
    if (doHoje >= 0) return doHoje
    const comAula = semanas.findIndex((semana) => doMes.some((aula) => aula.data >= semana.inicio && aula.data <= semana.fim))
    return comAula >= 0 ? comAula : 0
    // `mes` basta: as semanas e as aulas do mês mudam junto com ele.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, semanas.length])

  const [semanaIndice, setSemanaIndice] = useState(semanaInicial)
  const [mesDaSemana, setMesDaSemana] = useState(mes.getTime())
  if (mesDaSemana !== mes.getTime()) {
    setMesDaSemana(mes.getTime())
    setSemanaIndice(semanaInicial)
  }

  const semana = semanas[Math.min(semanaIndice, semanas.length - 1)]
  const visiveis = recorte === 'mes' || !semana
    ? doMes
    : doMes.filter((aula) => aula.data >= semana.inicio && aula.data <= semana.fim)

  const grupos = visiveis.reduce((mapa, aula) => {
    if (!mapa.has(aula.data)) mapa.set(aula.data, [])
    mapa.get(aula.data).push(aula)
    return mapa
  }, new Map())

  const controles = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
      <GrupoSegmentado
        rotulo="Recorte da agenda"
        opcoes={[{ valor: 'semana', rotulo: 'Semana' }, { valor: 'mes', rotulo: 'Mês inteiro' }]}
        valor={recorte}
        onChange={setRecorte}
      />
      {recorte === 'semana' && semana && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
          <Button
            size="small" disabled={semanaIndice <= 0}
            onClick={() => setSemanaIndice((atual) => Math.max(atual - 1, 0))}
            aria-label="Semana anterior"
          >
            ◀
          </Button>
          <Box sx={{ fontSize: TOV.type.bodySm, color: TOV.caption, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {diaEMes(semana.inicio)} – {diaEMes(semana.fim)}
          </Box>
          <Button
            size="small" disabled={semanaIndice >= semanas.length - 1}
            onClick={() => setSemanaIndice((atual) => Math.min(atual + 1, semanas.length - 1))}
            aria-label="Próxima semana"
          >
            ▶
          </Button>
        </Box>
      )}
    </Box>
  )

  if (!visiveis.length) {
    const vazioNoMes = !doMes.length
    return (
      <Box>
        {!vazioNoMes && controles}
        <Box sx={{ bgcolor: TOV.surface, border: `1px solid ${TOV.border}`, borderRadius: TOV.radiusMd, p: 3, textAlign: 'center' }}>
          <Typography variant="h3" sx={{ fontSize: TOV.type.section }}>
            {vazioNoMes ? 'Nenhuma aula neste mês' : 'Nenhuma aula nesta semana'}
          </Typography>
          <Typography sx={{ color: TOV.caption, fontSize: TOV.type.body, mt: 1 }}>
            {vazioNoMes
              ? (onNovo ? 'Adicione a primeira aula ou avance para outro mês.' : 'Avance para outro mês para consultar a agenda.')
              : 'Use as setas para ver outra semana, ou abra o mês inteiro.'}
          </Typography>
          {vazioNoMes && onNovo && <Button variant="contained" onClick={() => onNovo()} sx={{ mt: 2 }}>Adicionar aula</Button>}
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {controles}
      {[...grupos.entries()].map(([data, eventos]) => (
        <Box key={data} sx={{ bgcolor: TOV.surface, border: `1px solid ${TOV.border}`, borderRadius: TOV.radiusMd, overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 1.5, bgcolor: TOV.canvas, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="h3"
              sx={{ fontSize: TOV.type.body, flex: 1 }}
            >
              {dataLegivel(data)}
            </Typography>
            {onNovo && (
              <Button size="small" onClick={() => onNovo(data)} aria-label={`Adicionar aula em ${dataLegivel(data)}`}>
                + Aula
              </Button>
            )}
          </Box>
          <Box sx={{ p: 1 }}>
            {eventos.map((aula, indice) => {
              const cores = corEvento(aula.status)
              return (
                <Box
                  component="button"
                  type="button"
                  key={aula.id}
                  onClick={() => onSelecionar?.(aula)}
                  sx={{
                    appearance: 'none', border: 0, width: '100%', minHeight: 64,
                    borderTop: indice ? `1px solid ${TOV.divider}` : 0,
                    borderRadius: TOV.radiusSm, p: 1.5, bgcolor: 'transparent',
                    color: TOV.ink, font: 'inherit', textAlign: 'left', cursor: 'pointer',
                    display: 'flex', alignItems: 'flex-start', gap: 1.5,
                    '&:active': { bgcolor: TOV.canvas },
                    '&:focus-visible': focusRing,
                  }}
                >
                  <Box sx={{ minWidth: 52, color: cores.color, fontWeight: 700, fontSize: TOV.type.body, pt: 0.5 }}>
                    {aula.hora_inicio || '—'}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: TOV.type.body, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                      {aula.materia_nome}
                    </Typography>
                    <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 0.5, overflowWrap: 'anywhere' }}>
                      {[aula.turma_nome, aula.professor_nome, aula.local].filter(Boolean).join(' · ')}
                    </Typography>
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      flexShrink: 0, px: 1, py: 0.5, borderRadius: TOV.radiusFull,
                      bgcolor: cores.bg, color: cores.color, fontSize: TOV.type.caption, fontWeight: 700,
                    }}
                  >
                    {STATUS[aula.status] || aula.status}
                  </Box>
                </Box>
              )
            })}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

export default function CalendarioGrade({ mes, aulas, onSelecionar, onNovo }) {
  const { inicio } = intervaloGrade(mes)
  const primeiro = new Date(`${inicio}T12:00:00`)
  const dias = Array.from({ length: 42 }, (_, indice) => {
    const data = new Date(primeiro)
    data.setDate(primeiro.getDate() + indice)
    return data
  })

  return (
    <Box sx={{ minWidth: 760 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {DIAS.map((dia) => (
          <Box key={dia} sx={{ p: 1, textAlign: 'center', fontSize: TOV.type.caption, fontWeight: 700, color: TOV.caption, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${TOV.border}` }}>
            {dia}
          </Box>
        ))}
        {dias.map((data) => {
          const iso = isoLocal(data)
          const fora = data.getMonth() !== mes.getMonth()
          const eventos = aulas.filter((aula) => aula.data === iso)
          // Teclado e leitor de tela têm o mesmo atalho do duplo clique: a célula
          // é focável e Enter/Espaço abrem a aula nova naquele dia.
          const aoTeclar = onNovo ? (evento) => {
            if (evento.target !== evento.currentTarget) return
            if (evento.key !== 'Enter' && evento.key !== ' ') return
            evento.preventDefault()
            onNovo(iso)
          } : undefined
          return (
            <Box
              key={iso}
              onDoubleClick={() => onNovo?.(iso)}
              onKeyDown={aoTeclar}
              tabIndex={onNovo ? 0 : undefined}
              role={onNovo ? 'button' : undefined}
              aria-label={onNovo ? `Nova aula em ${dataLegivel(iso)}` : undefined}
              sx={{
                // 118px por célula davam ~40% da altura da grade a dias sem
                // nada. O piso agora cabe o número do dia e uma aula; a linha
                // cresce com o dia mais cheio (AUDITORIA_VISUAL.md H3).
                minHeight: 76, p: 1, borderRight: `1px solid ${TOV.border}`,
                borderBottom: `1px solid ${TOV.border}`, bgcolor: fora ? TOV.canvas : TOV.surfaceElevated,
                '&:focus-visible': focusRing,
              }}
            >
              <Box sx={{ fontSize: TOV.type.caption, fontWeight: 700, color: fora ? TOV.caption : TOV.ink, mb: 0.5 }}>{data.getDate()}</Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {eventos.map((aula) => {
                  const cores = corEvento(aula.status)
                  const cancelada = aula.status === 'CANCELADA'
                  const realizada = aula.status === 'REALIZADA'
                  return (
                    <Box
                      component="button"
                      type="button"
                      key={aula.id}
                      onClick={() => onSelecionar?.(aula)}
                      sx={{
                        appearance: 'none', border: 0, borderRadius: TOV.radiusSm, p: '4px 8px',
                        textAlign: 'left', cursor: onSelecionar ? 'pointer' : 'default',
                        bgcolor: cores.bg, color: cores.color, font: 'inherit', minWidth: 0,
                        '&:focus-visible': focusRing,
                      }}
                    >
                      {/* A matéria é o que distingue uma aula da outra: ganha o peso e
                          não trunca. Hora e turma vêm na linha de apoio. */}
                      <Box sx={{ fontSize: TOV.type.caption, fontWeight: 700, lineHeight: 1.25, overflowWrap: 'anywhere', textDecoration: cancelada ? 'line-through' : 'none' }}>
                        {aula.materia_nome}
                      </Box>
                      <Box sx={{ fontSize: TOV.type.overline, lineHeight: 1.2, display: 'flex', alignItems: 'baseline', gap: 0.5, minWidth: 0 }}>
                        <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: cancelada ? 'line-through' : 'none' }}>
                          {[aula.hora_inicio, aula.turma_nome].filter(Boolean).join(' ')}
                        </Box>
                        {/* Cor nunca é o único indicador: cancelada e realizada têm texto. */}
                        {cancelada && <Box component="span" sx={{ flexShrink: 0, fontWeight: 700 }}>Cancelada</Box>}
                        {realizada && (
                          <Box component="span" sx={{ flexShrink: 0, fontWeight: 700 }}>
                            <Box component="span" aria-hidden="true">✓</Box>
                            <Box component="span" sx={VISUALMENTE_OCULTO}>Realizada</Box>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  )
                })}
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
