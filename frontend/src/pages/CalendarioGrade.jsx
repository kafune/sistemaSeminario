import { Box } from '@mui/material'
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
