import { Box, Button, Typography } from '@mui/material'
import { TOV } from '../theme'

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

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
  if (status === 'REALIZADA') return { bg: TOV.slateTint, color: TOV.slate }
  return { bg: TOV.coralTint, color: TOV.coral }
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

/** Lista cronológica, pensada para leitura e toque no celular. */
export function CalendarioAgenda({ mes, aulas, onSelecionar, onNovo }) {
  const doMes = [...aulas]
    .filter((aula) => {
      const data = new Date(`${aula.data}T12:00:00`)
      return data.getMonth() === mes.getMonth() && data.getFullYear() === mes.getFullYear()
    })
    .sort((a, b) => `${a.data} ${a.hora_inicio || ''}`.localeCompare(`${b.data} ${b.hora_inicio || ''}`))

  const grupos = doMes.reduce((mapa, aula) => {
    if (!mapa.has(aula.data)) mapa.set(aula.data, [])
    mapa.get(aula.data).push(aula)
    return mapa
  }, new Map())

  if (!doMes.length) {
    return (
      <Box sx={{ bgcolor: '#fff', borderRadius: '16px', p: 3, textAlign: 'center' }}>
        <Typography variant="h3" sx={{ fontSize: 19 }}>Nenhuma aula neste mês</Typography>
        <Typography sx={{ color: TOV.caption, fontSize: 14, mt: 1 }}>
          {onNovo ? 'Adicione a primeira aula ou avance para outro mês.' : 'Avance para outro mês para consultar a agenda.'}
        </Typography>
        {onNovo && <Button variant="contained" onClick={() => onNovo()} sx={{ mt: 2 }}>Adicionar aula</Button>}
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {[...grupos.entries()].map(([data, eventos]) => (
        <Box key={data} sx={{ bgcolor: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: TOV.shadowCard }}>
          <Box sx={{ px: 2, py: 1.5, bgcolor: TOV.offwhite, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="h3"
              sx={{ fontSize: 15, flex: 1 }}
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
                    borderRadius: '10px', p: 1.25, bgcolor: 'transparent',
                    color: TOV.ink, font: 'inherit', textAlign: 'left', cursor: 'pointer',
                    display: 'flex', alignItems: 'flex-start', gap: 1.25,
                    '&:active': { bgcolor: TOV.offwhite },
                    '&:focus-visible': { outline: `2px solid ${TOV.coral}`, outlineOffset: 1 },
                  }}
                >
                  <Box sx={{ minWidth: 52, color: cores.color, fontWeight: 800, fontSize: 14, pt: '2px' }}>
                    {aula.hora_inicio || '—'}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>
                      {aula.materia_nome}
                    </Typography>
                    <Typography sx={{ color: TOV.caption, fontSize: 13, mt: '3px' }}>
                      {[aula.turma_nome, aula.professor_nome, aula.local].filter(Boolean).join(' · ')}
                    </Typography>
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      flexShrink: 0, px: 1, py: '4px', borderRadius: 999,
                      bgcolor: cores.bg, color: cores.color, fontSize: 12, fontWeight: 800,
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
          <Box key={dia} sx={{ p: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: TOV.caption, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: `1px solid ${TOV.border}` }}>
            {dia}
          </Box>
        ))}
        {dias.map((data) => {
          const iso = isoLocal(data)
          const fora = data.getMonth() !== mes.getMonth()
          const eventos = aulas.filter((aula) => aula.data === iso)
          return (
            <Box
              key={iso}
              onDoubleClick={() => onNovo?.(iso)}
              sx={{
                minHeight: 118, p: 0.75, borderRight: `1px solid ${TOV.border}`,
                borderBottom: `1px solid ${TOV.border}`, bgcolor: fora ? TOV.offwhite : '#fff',
              }}
            >
              <Box sx={{ fontSize: 12, fontWeight: 700, color: fora ? TOV.caption : TOV.ink, mb: 0.5 }}>{data.getDate()}</Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {eventos.map((aula) => {
                  const cores = corEvento(aula.status)
                  return (
                    <Box
                      component="button"
                      type="button"
                      key={aula.id}
                      onClick={() => onSelecionar?.(aula)}
                      sx={{
                        appearance: 'none', border: 0, borderRadius: '6px', p: '5px 6px',
                        textAlign: 'left', cursor: onSelecionar ? 'pointer' : 'default',
                        bgcolor: cores.bg, color: cores.color, font: 'inherit', minWidth: 0,
                      }}
                    >
                      <Box sx={{ fontSize: 11, fontWeight: 800, lineHeight: 1.2 }}>
                        {aula.hora_inicio || ''} {aula.turma_nome}
                      </Box>
                      <Box sx={{ fontSize: 11, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {aula.materia_nome}
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
