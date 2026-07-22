import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, Grid, IconButton, MenuItem, Snackbar, Tab, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import { api, abrirArquivo } from '../api'
import { TOV } from '../theme'
import { CartaoLista, DialogoConfirmacao, LinhaCartao, Regua, cardSx, resetBotao, useDialogoTelaCheia } from '../ui'

function mesAno(iso) {
  if (!iso) return null
  const [ano, mes] = iso.split('-')
  return mes ? `${mes}/${ano}` : ano
}

export default function TurmaDetalhe() {
  const { codTur } = useParams()
  const [turma, setTurma] = useState(null)
  const [aba, setAba] = useState(0)
  const [alunos, setAlunos] = useState([])
  const [materias, setMaterias] = useState([])
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState(true)
  const navigate = useNavigate()
  const telaCheia = useDialogoTelaCheia()

  // diálogo de matrícula
  const [buscaAluno, setBuscaAluno] = useState('')
  const [opcoesAluno, setOpcoesAluno] = useState([])
  const [alunoSel, setAlunoSel] = useState(null)
  const [dlgMatricula, setDlgMatricula] = useState(false)

  // diálogo de matéria
  const [dlgMateria, setDlgMateria] = useState(false)
  const [todasMaterias, setTodasMaterias] = useState([])
  const [professores, setProfessores] = useState([])
  const [formMateria, setFormMateria] = useState({})

  const avisar = (texto, ehErro = true) => { setErro(ehErro); setMsg(texto) }

  const carregar = useCallback(() => {
    api.get(`/turmas/${codTur}`).then(setTurma).catch((e) => avisar(e.message))
    api.get(`/turmas/${codTur}/alunos`).then(setAlunos).catch(() => {})
    api.get(`/turmas/${codTur}/materias`).then(setMaterias).catch(() => {})
  }, [codTur])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (buscaAluno.length < 2) return
    const t = setTimeout(() => {
      api.get(`/alunos?busca=${encodeURIComponent(buscaAluno)}&por_pagina=20`)
        .then((r) => setOpcoesAluno(r.itens))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [buscaAluno])

  const [salvandoDlg, setSalvandoDlg] = useState(false)

  async function matricular() {
    setSalvandoDlg(true)
    try {
      await api.post(`/turmas/${codTur}/alunos/${alunoSel.cod_alu}`)
      setDlgMatricula(false)
      setAlunoSel(null)
      setBuscaAluno('')
      carregar()
      avisar('Aluno matriculado', false)
    } catch (e) {
      avisar(e.message)
    } finally {
      setSalvandoDlg(false)
    }
  }

  // confirmação de remoção (aluno ou matéria)
  const [paraRemover, setParaRemover] = useState(null) // { tipo: 'aluno'|'materia', item }
  const [removendo, setRemovendo] = useState(false)

  async function confirmarRemocao() {
    setRemovendo(true)
    try {
      if (paraRemover.tipo === 'aluno') await api.del(`/turmas/${codTur}/alunos/${paraRemover.item.cod_alu}`)
      else await api.del(`/turmas/${codTur}/materias/${paraRemover.item.id}`)
      setParaRemover(null)
      carregar()
    } catch (e) {
      avisar(e.message)
      setParaRemover(null)
    } finally {
      setRemovendo(false)
    }
  }

  async function abrirDlgMateria() {
    setFormMateria({ Ano: String(new Date().getFullYear()), semestre: '1' })
    setDlgMateria(true)
    if (!todasMaterias.length) {
      api.get('/materias').then(setTodasMaterias).catch(() => {})
      api.get('/professores').then(setProfessores).catch(() => {})
    }
  }

  async function salvarMateria() {
    setSalvandoDlg(true)
    try {
      await api.post(`/turmas/${codTur}/materias`, formMateria)
      setDlgMateria(false)
      carregar()
    } catch (e) {
      avisar(e.message)
    } finally {
      setSalvandoDlg(false)
    }
  }


  if (!turma) return <Typography sx={{ color: TOV.caption }}>Carregando…</Typography>

  const subtitulo = [
    turma.curso,
    turma.horario,
    `${turma.qtd_alunos} alunos`,
    mesAno(turma.dat_ini) && `início ${mesAno(turma.dat_ini)}`,
  ].filter(Boolean).join(' · ')

  return (
    <Box>
      <Box component="button" type="button" onClick={() => navigate('/turmas')} sx={{ ...resetBotao, fontSize: 14, color: TOV.caption, fontWeight: 600, mb: 2.25, display: 'inline-block', '&:hover': { color: TOV.coral } }}>
        ‹ Voltar para Turmas
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 1.75 }}>
        <Box>
          <Regua sx={{ mb: 1.75 }} />
          <Typography variant="h1" sx={{ fontSize: { xs: 30, md: 40 } }}>{turma.nome}</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', width: { xs: '100%', md: 'auto' }, '& > *': { flexGrow: { xs: 1, sm: 0 } } }}>
          <Button variant="outlined" startIcon={<PictureAsPdfIcon />} sx={{ height: 44 }}
            onClick={() => abrirArquivo(`/relatorios/lista-turma/${codTur}`).catch((e) => avisar(e.message))}>
            Lista de alunos
          </Button>
          <Button variant="contained" startIcon={<PictureAsPdfIcon />} sx={{ height: 44 }}
            onClick={() => abrirArquivo(`/relatorios/boletim-turma/${codTur}`).catch((e) => avisar(e.message))}>
            Boletins (ZIP)
          </Button>
        </Box>
      </Box>
      <Typography sx={{ fontSize: 15, color: TOV.caption, mb: 3 }}>{subtitulo}</Typography>

      <Tabs value={aba} onChange={(_, v) => setAba(v)} textColor="primary" indicatorColor="primary"
        variant="scrollable" allowScrollButtonsMobile
        sx={{ mb: 2.75, borderBottom: `2px solid ${TOV.divider}`, minHeight: 0, '& .MuiTab-root': { color: TOV.caption, px: { xs: 1.5, sm: 2.5 }, py: 1.5, fontSize: { xs: 14, sm: 15 } }, '& .Mui-selected': { color: TOV.coral } }}>
        <Tab label={`Alunos (${alunos.length})`} />
        <Tab label={`Matérias e professores (${materias.length})`} />
      </Tabs>

      {aba === 0 && (
        <Box>
          <Button startIcon={<AddIcon />} variant="contained" sx={{ mb: 2, height: 44, width: { xs: '100%', sm: 'auto' } }} onClick={() => setDlgMatricula(true)}>
            Matricular aluno
          </Button>

          {/* Lista em cards — celular/tablet */}
          <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1.25 }}>
            {alunos.length === 0 && (
              <CartaoLista sx={{ alignItems: 'center', color: TOV.caption, py: 4 }}>Nenhum aluno matriculado.</CartaoLista>
            )}
            {alunos.map((a) => (
              <CartaoLista key={a.cod_alu} onClick={() => navigate(`/alunos/${a.cod_alu}`)}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.3 }}>{a.nome}</Box>
                    <Box sx={{ fontSize: 13, color: TOV.caption, fontWeight: 600, mt: '2px' }}>Matrícula {a.cod_alu}</Box>
                  </Box>
                  <IconButton size="small" color="error" title="Remover da turma"
                    onClick={(e) => { e.stopPropagation(); setParaRemover({ tipo: 'aluno', item: a }) }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
                <LinhaCartao rotulo="Celular" valor={a.celular} />
                <LinhaCartao rotulo="E-mail" valor={a.e_mail} />
              </CartaoLista>
            ))}
          </Box>

          {/* Tabela — desktop */}
          <TableContainer component={Box} sx={{ ...cardSx, overflow: 'hidden', display: { xs: 'none', md: 'block' } }}>
            <Table sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Matrícula</TableCell>
                  <TableCell>Nome</TableCell>
                  <TableCell>Celular</TableCell>
                  <TableCell>E-mail</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {alunos.length === 0 && (
                  <TableRow><TableCell colSpan={5} sx={{ py: 4, textAlign: 'center', color: TOV.caption }}>Nenhum aluno matriculado.</TableCell></TableRow>
                )}
                {alunos.map((a) => (
                  <TableRow key={a.cod_alu} hover>
                    <TableCell sx={{ color: TOV.caption, fontWeight: 600 }}>{a.cod_alu}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: TOV.coral, cursor: 'pointer' }} onClick={() => navigate(`/alunos/${a.cod_alu}`)}>{a.nome}</TableCell>
                    <TableCell sx={{ color: TOV.slate }}>{a.celular || '—'}</TableCell>
                    <TableCell sx={{ color: TOV.slate }}>{a.e_mail || '—'}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" color="error" title="Remover da turma" onClick={() => setParaRemover({ tipo: 'aluno', item: a })}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {aba === 1 && (
        <Box>
          <Button startIcon={<AddIcon />} variant="contained" sx={{ mb: 2, height: 44, width: { xs: '100%', sm: 'auto' } }} onClick={abrirDlgMateria}>
            Adicionar matéria
          </Button>

          {/* Lista em cards — celular/tablet */}
          <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1.25 }}>
            {materias.length === 0 && (
              <CartaoLista sx={{ alignItems: 'center', color: TOV.caption, py: 4 }}>Nenhuma matéria vinculada.</CartaoLista>
            )}
            {materias.map((m) => (
              <CartaoLista key={m.id}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.3 }}>{m.materia_nome?.trim()}</Box>
                    <Box sx={{ fontSize: 13, color: TOV.caption, fontWeight: 600, mt: '2px' }}>
                      {m.Ano || '—'}{m.semestre ? ` · ${m.semestre}º semestre` : ''}
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', flexShrink: 0 }}>
                    <IconButton size="small" title="Diário de classe (PDF)"
                      onClick={() => abrirArquivo(`/relatorios/diario/${codTur}?cod_mat=${m.cod_mat}`).catch((e) => avisar(e.message))}>
                      <PictureAsPdfIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" title="Remover da turma" aria-label="Remover matéria da turma" onClick={() => setParaRemover({ tipo: 'materia', item: m })}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
                <LinhaCartao rotulo="Professor" valor={m.professor_nome} />
              </CartaoLista>
            ))}
          </Box>

          {/* Tabela — desktop */}
          <TableContainer component={Box} sx={{ ...cardSx, overflow: 'hidden', display: { xs: 'none', md: 'block' } }}>
            <Table sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Matéria</TableCell>
                  <TableCell>Professor</TableCell>
                  <TableCell>Ano</TableCell>
                  <TableCell>Semestre</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {materias.length === 0 && (
                  <TableRow><TableCell colSpan={5} sx={{ py: 4, textAlign: 'center', color: TOV.caption }}>Nenhuma matéria vinculada.</TableCell></TableRow>
                )}
                {materias.map((m) => (
                  <TableRow key={m.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{m.materia_nome?.trim()}</TableCell>
                    <TableCell sx={{ color: TOV.slate }}>{m.professor_nome || '—'}</TableCell>
                    <TableCell sx={{ color: TOV.slate }}>{m.Ano || '—'}</TableCell>
                    <TableCell sx={{ color: TOV.slate }}>{m.semestre ? `${m.semestre}º` : '—'}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" title="Diário de classe (PDF)"
                        onClick={() => abrirArquivo(`/relatorios/diario/${codTur}?cod_mat=${m.cod_mat}`).catch((e) => avisar(e.message))}>
                        <PictureAsPdfIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" title="Remover da turma" aria-label="Remover matéria da turma" onClick={() => setParaRemover({ tipo: 'materia', item: m })}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      <Dialog open={dlgMatricula} onClose={() => setDlgMatricula(false)} maxWidth="sm" fullWidth fullScreen={telaCheia}>
        <DialogTitle>Matricular aluno</DialogTitle>
        <DialogContent>
          <Autocomplete
            sx={{ mt: 1 }} options={opcoesAluno} value={alunoSel}
            getOptionLabel={(a) => `${a.cod_alu} - ${a.nome}`}
            isOptionEqualToValue={(a, b) => a.cod_alu === b.cod_alu}
            onInputChange={(_, v) => setBuscaAluno(v)}
            onChange={(_, v) => setAlunoSel(v)}
            renderInput={(p) => <TextField {...p} label="Digite o nome do aluno" autoFocus />}
            noOptionsText="Digite ao menos 2 letras"
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button onClick={() => setDlgMatricula(false)} variant="outlined" disabled={salvandoDlg}>Cancelar</Button>
          <Button variant="contained" onClick={matricular} disabled={!alunoSel || salvandoDlg}>
            {salvandoDlg ? 'Matriculando…' : 'Matricular'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dlgMateria} onClose={() => setDlgMateria(false)} maxWidth="sm" fullWidth fullScreen={telaCheia}>
        <DialogTitle>Adicionar matéria à turma</DialogTitle>
        <DialogContent>
          <Grid container spacing={1.5} sx={{ mt: 0 }}>
            <Grid item xs={12}>
              <Autocomplete
                size="small" options={todasMaterias}
                getOptionLabel={(m) => (m.NOME || '').trim()}
                onChange={(_, v) => setFormMateria({ ...formMateria, cod_mat: v?.cod_mat })}
                renderInput={(p) => <TextField {...p} label="Matéria" />}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                size="small" options={professores}
                getOptionLabel={(p) => p.nome || ''}
                onChange={(_, v) => setFormMateria({ ...formMateria, cod_pro: v?.cod_pro })}
                renderInput={(p) => <TextField {...p} label="Professor" />}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField size="small" fullWidth label="Ano" value={formMateria.Ano ?? ''}
                onChange={(e) => setFormMateria({ ...formMateria, Ano: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField select size="small" fullWidth label="Semestre" value={formMateria.semestre ?? '1'}
                onChange={(e) => setFormMateria({ ...formMateria, semestre: e.target.value })}>
                <MenuItem value="1">1º</MenuItem>
                <MenuItem value="2">2º</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button onClick={() => setDlgMateria(false)} variant="outlined" disabled={salvandoDlg}>Cancelar</Button>
          <Button variant="contained" onClick={salvarMateria} disabled={!formMateria.cod_mat || salvandoDlg}>
            {salvandoDlg ? 'Adicionando…' : 'Adicionar'}
          </Button>
        </DialogActions>
      </Dialog>

      <DialogoConfirmacao
        aberto={!!paraRemover}
        titulo={paraRemover?.tipo === 'aluno' ? 'Remover aluno da turma' : 'Remover matéria da turma'}
        descricao={
          paraRemover?.tipo === 'aluno'
            ? `Remover ${paraRemover?.item?.nome} desta turma? O cadastro do aluno não será apagado.`
            : `Remover ${paraRemover?.item?.materia_nome?.trim()} desta turma?`
        }
        rotuloConfirmar="Remover"
        processando={removendo}
        onConfirmar={confirmarRemocao}
        onFechar={() => setParaRemover(null)}
      />

      <Snackbar open={!!msg} autoHideDuration={5000} onClose={() => setMsg('')}>
        <Alert severity={erro ? 'error' : 'success'} onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
