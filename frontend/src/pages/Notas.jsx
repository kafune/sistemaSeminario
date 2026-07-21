import { useCallback, useEffect, useState } from 'react'
import {
  Alert, Box, Button, MenuItem, Snackbar, Switch, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import SaveIcon from '@mui/icons-material/Save'
import { api, abrirArquivo } from '../api'
import { TOV } from '../theme'
import { CartaoLista, Regua, cardSx } from '../ui'

const ANO_ATUAL = String(new Date().getFullYear())

/** Rótulo de um seletor (uppercase caption) acima do campo. */
function RotuloCampo({ children }) {
  return (
    <Box sx={{ fontSize: 12, color: TOV.caption, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', mb: 1 }}>{children}</Box>
  )
}

export default function Notas() {
  const [turmas, setTurmas] = useState([])
  const [codTur, setCodTur] = useState('')
  const [materiasTurma, setMateriasTurma] = useState([])
  const [docSel, setDocSel] = useState(null) // entrada docturma escolhida
  const [ano, setAno] = useState(ANO_ATUAL)
  const [semestre, setSemestre] = useState('2')

  const [linhas, setLinhas] = useState([])
  const [profResponsavel, setProfResponsavel] = useState('')
  const [carregandoGrade, setCarregandoGrade] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const [msg, setMsg] = useState('')
  const [ehErro, setEhErro] = useState(true)
  const avisar = (texto, erro = true) => { setEhErro(erro); setMsg(texto) }

  useEffect(() => {
    api.get('/turmas').then(setTurmas).catch((e) => avisar(e.message))
  }, [])

  // Ao trocar a turma, carrega as matérias vinculadas.
  useEffect(() => {
    setDocSel(null); setLinhas([]); setMateriasTurma([]); setProfResponsavel('')
    if (!codTur) return
    api.get(`/turmas/${codTur}/materias`).then(setMateriasTurma).catch(() => setMateriasTurma([]))
  }, [codTur])

  const carregarGrade = useCallback((doc) => {
    if (!codTur || !doc) { setLinhas([]); return }
    setCarregandoGrade(true)
    api.get(`/notas/turma/${codTur}/materia/${doc.cod_mat}`)
      .then((r) => {
        setLinhas(r.alunos.map((a) => ({
          cod_alu: a.cod_alu,
          nome: a.nome,
          nota: a.nota != null ? String(a.nota) : '',
          falta: a.falta != null ? String(a.falta) : '',
          dispensa: a.dispensa ?? null,
          cursou: a.cursou == null ? true : a.cursou === 'S',
          ja_lancado: a.ja_lancado,
          _dirty: false,
        })))
      })
      .catch((e) => avisar(e.message))
      .finally(() => setCarregandoGrade(false))
  }, [codTur])

  function escolherMateria(id) {
    const doc = materiasTurma.find((m) => String(m.id) === String(id)) || null
    setDocSel(doc)
    setProfResponsavel(doc?.professor_nome || '')
    if (doc) {
      if (doc.Ano) setAno(doc.Ano)
      if (doc.semestre) setSemestre(doc.semestre)
      carregarGrade(doc)
    } else {
      setLinhas([])
    }
  }

  function editarLinha(cod_alu, campo, valor) {
    setLinhas((atual) => atual.map((l) => (l.cod_alu === cod_alu ? { ...l, [campo]: valor, _dirty: true } : l)))
  }

  const sujas = linhas.filter((l) => l._dirty)

  async function salvarGrade() {
    if (!docSel || sujas.length === 0) return
    setSalvando(true)
    try {
      await api.post('/notas/lancar', {
        cod_tur: Number(codTur),
        cod_mat: docSel.cod_mat,
        cod_pro: docSel.cod_pro ?? null,
        ano: ano || null,
        semestre: semestre || null,
        alunos: sujas.map((l) => ({
          cod_alu: l.cod_alu,
          nota: l.nota === '' ? null : Number(l.nota),
          falta: l.falta === '' ? null : Number(l.falta),
          dispensa: l.dispensa || null,
          cursou: l.cursou ? 'S' : 'N',
        })),
      })
      avisar(`Grade salva · ${sujas.length} ${sujas.length === 1 ? 'lançamento' : 'lançamentos'}`, false)
      carregarGrade(docSel)
    } catch (e) {
      avisar(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const celulaInput = (l, campo, props) => (
    <TextField
      type="number" size="small" value={l[campo]}
      onChange={(e) => editarLinha(l.cod_alu, campo, e.target.value)}
      inputProps={{ style: { textAlign: 'center', fontWeight: 700 }, ...props }}
      sx={{
        width: 88,
        '& .MuiOutlinedInput-root': { height: 42 },
        '& fieldset': { borderColor: l._dirty ? TOV.coral : TOV.border },
      }}
    />
  )

  return (
    <Box>
      <Regua sx={{ mb: 2 }} />
      <Typography variant="h1" sx={{ fontSize: { xs: 30, sm: 36, md: 44 }, mb: 2.75 }}>Notas e faltas</Typography>

      {/* Seletores */}
      <Box sx={{ ...cardSx, p: { xs: '18px', sm: '22px 26px' }, mb: 2.5, display: 'flex', gap: { xs: 1.75, sm: 2.25 }, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 230px' }, minWidth: 0, maxWidth: { sm: 320 } }}>
          <RotuloCampo>Turma</RotuloCampo>
          <TextField select size="small" fullWidth value={codTur} onChange={(e) => setCodTur(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { height: 48 } }} displayEmpty>
            <MenuItem value=""><em>Selecione a turma</em></MenuItem>
            {turmas.map((t) => <MenuItem key={t.cod_tur} value={t.cod_tur}>{t.nome}</MenuItem>)}
          </TextField>
        </Box>
        <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 230px' }, minWidth: 0, maxWidth: { sm: 320 } }}>
          <RotuloCampo>Matéria</RotuloCampo>
          <TextField select size="small" fullWidth value={docSel?.id ?? ''} onChange={(e) => escolherMateria(e.target.value)}
            disabled={!codTur} sx={{ '& .MuiOutlinedInput-root': { height: 48 } }} displayEmpty>
            <MenuItem value=""><em>{codTur ? (materiasTurma.length ? 'Selecione a matéria' : 'Sem matérias vinculadas') : 'Escolha a turma antes'}</em></MenuItem>
            {materiasTurma.map((m) => <MenuItem key={m.id} value={m.id}>{m.materia_nome?.trim()}</MenuItem>)}
          </TextField>
        </Box>
        <Box sx={{ flex: { xs: '1 1 40%', sm: '0 0 110px' } }}>
          <RotuloCampo>Ano</RotuloCampo>
          <TextField size="small" fullWidth value={ano} onChange={(e) => setAno(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { height: 48 } }} />
        </Box>
        <Box sx={{ flex: { xs: '1 1 40%', sm: '0 0 110px' } }}>
          <RotuloCampo>Semestre</RotuloCampo>
          <TextField select size="small" fullWidth value={semestre} onChange={(e) => setSemestre(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { height: 48 } }}>
            <MenuItem value="1">1º</MenuItem>
            <MenuItem value="2">2º</MenuItem>
          </TextField>
        </Box>
        <Box sx={{ ml: { md: 'auto' }, display: 'flex', gap: 1.25, flexWrap: 'wrap', width: { xs: '100%', md: 'auto' }, '& > *': { flexGrow: { xs: 1, md: 0 } } }}>
          <Button variant="outlined" startIcon={<PictureAsPdfIcon />} disabled={!docSel} sx={{ height: 48 }}
            onClick={() => abrirArquivo(`/relatorios/diario/${codTur}?cod_mat=${docSel.cod_mat}`).catch((e) => avisar(e.message))}>
            Diário (PDF)
          </Button>
          <Button variant="contained" startIcon={<SaveIcon />} disabled={!docSel || sujas.length === 0 || salvando} sx={{ height: 48 }}
            onClick={salvarGrade}>
            {salvando ? 'Salvando…' : `Salvar grade${sujas.length ? ` (${sujas.length})` : ''}`}
          </Button>
        </Box>
      </Box>

      {/* Grade */}
      {!docSel ? (
        <Box sx={{ ...cardSx, p: 6, textAlign: 'center', color: TOV.caption }}>
          Selecione uma turma e uma matéria para lançar as notas em grade.
        </Box>
      ) : (
        <>
          {/* Grade em cards — celular/tablet */}
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            <Box sx={{ ...cardSx, p: '16px 18px', mb: 1.25 }}>
              <Typography variant="h3" sx={{ fontSize: 18 }}>{linhas.length} {linhas.length === 1 ? 'aluno' : 'alunos'}</Typography>
              <Typography sx={{ fontSize: 13, color: TOV.caption, mt: 0.5 }}>
                {profResponsavel ? `Prof. responsável: ${profResponsavel} · ` : ''}alterações não salvas ficam em coral
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {carregandoGrade && (
                <CartaoLista sx={{ alignItems: 'center', color: TOV.caption, py: 4 }}>Carregando grade…</CartaoLista>
              )}
              {!carregandoGrade && linhas.length === 0 && (
                <CartaoLista sx={{ alignItems: 'center', color: TOV.caption, py: 4 }}>Nenhum aluno matriculado nesta turma.</CartaoLista>
              )}
              {!carregandoGrade && linhas.map((l, i) => (
                <CartaoLista key={l.cod_alu} sx={{ borderLeft: `4px solid ${l._dirty ? TOV.coral : 'transparent'}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                    <Box component="span" sx={{ color: TOV.caption, fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</Box>
                    <Box sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3, minWidth: 0, flexGrow: 1 }}>{l.nome}</Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      <Box component="span" sx={{ fontSize: 12, color: TOV.caption, fontWeight: 600 }}>Cursou</Box>
                      <Switch checked={l.cursou} onChange={(e) => editarLinha(l.cod_alu, 'cursou', e.target.checked)} />
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1.25 }}>
                    <TextField
                      type="number" size="small" fullWidth label="Nota (0–10)" value={l.nota}
                      onChange={(e) => editarLinha(l.cod_alu, 'nota', e.target.value)}
                      inputProps={{ min: 0, max: 10, step: 0.1, inputMode: 'decimal', style: { fontWeight: 700 } }}
                      sx={{ '& fieldset': { borderColor: l._dirty ? TOV.coral : TOV.border } }}
                    />
                    <TextField
                      type="number" size="small" fullWidth label="Faltas" value={l.falta}
                      onChange={(e) => editarLinha(l.cod_alu, 'falta', e.target.value)}
                      inputProps={{ min: 0, step: 1, inputMode: 'numeric', style: { fontWeight: 700 } }}
                      sx={{ '& fieldset': { borderColor: l._dirty ? TOV.coral : TOV.border } }}
                    />
                  </Box>
                </CartaoLista>
              ))}
            </Box>
          </Box>

          {/* Grade em tabela — desktop */}
          <TableContainer component={Box} sx={{ ...cardSx, overflowX: 'auto', display: { xs: 'none', md: 'block' } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', p: '18px 28px', borderBottom: `2px solid ${TOV.offwhite}` }}>
              <Typography variant="h3" sx={{ fontSize: 20 }}>{linhas.length} {linhas.length === 1 ? 'aluno' : 'alunos'}</Typography>
              <Typography sx={{ fontSize: 13, color: TOV.caption }}>
                {profResponsavel ? `Prof. responsável: ${profResponsavel} · ` : ''}edite direto na grade e salve tudo de uma vez
              </Typography>
            </Box>
            <Table sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 60 }}>#</TableCell>
                  <TableCell>Aluno</TableCell>
                  <TableCell sx={{ width: 120 }}>Nota (0–10)</TableCell>
                  <TableCell sx={{ width: 120 }}>Faltas</TableCell>
                  <TableCell sx={{ width: 110 }}>Cursou</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {carregandoGrade && (
                  <TableRow><TableCell colSpan={5} sx={{ py: 4, textAlign: 'center', color: TOV.caption }}>Carregando grade…</TableCell></TableRow>
                )}
                {!carregandoGrade && linhas.length === 0 && (
                  <TableRow><TableCell colSpan={5} sx={{ py: 4, textAlign: 'center', color: TOV.caption }}>Nenhum aluno matriculado nesta turma.</TableCell></TableRow>
                )}
                {!carregandoGrade && linhas.map((l, i) => (
                  <TableRow key={l.cod_alu} sx={{ bgcolor: l._dirty ? 'rgba(241,73,73,.05)' : 'transparent', '& td': { borderLeft: l._dirty ? `3px solid ${TOV.coral}` : '3px solid transparent' }, '& td:not(:first-of-type)': { borderLeft: 'none' } }}>
                    <TableCell sx={{ color: TOV.caption, fontWeight: 600 }}>{String(i + 1).padStart(2, '0')}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{l.nome}</TableCell>
                    <TableCell>{celulaInput(l, 'nota', { min: 0, max: 10, step: 0.1 })}</TableCell>
                    <TableCell>{celulaInput(l, 'falta', { min: 0, step: 1 })}</TableCell>
                    <TableCell>
                      <Switch checked={l.cursou} onChange={(e) => editarLinha(l.cod_alu, 'cursou', e.target.checked)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography sx={{ mt: 1.75, fontSize: 13, color: TOV.caption, display: { xs: 'none', md: 'block' } }}>
            Dica: use Tab para navegar célula a célula. Alterações não salvas ficam destacadas em coral.
          </Typography>
        </>
      )}

      <Snackbar open={!!msg} autoHideDuration={5000} onClose={() => setMsg('')}>
        <Alert severity={ehErro ? 'error' : 'success'} onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
