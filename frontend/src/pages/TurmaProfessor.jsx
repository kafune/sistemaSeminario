import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, MenuItem, Snackbar, Tab, Tabs, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined'
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined'
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined'
import FolderCopyOutlinedIcon from '@mui/icons-material/FolderCopyOutlined'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined'
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined'
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined'
import { api, baixarArquivo } from '../api'
import { TOV } from '../theme'
import {
  CabecalhoPagina, CardMetrica, DialogoConfirmacao, EstadoVazio, StatusBadge,
  cardSx, useDialogoTelaCheia, useTelaDesktop,
} from '../ui'

const ABAS = ['visao', 'aulas', 'notas', 'materiais']

function dataCurta(data) {
  return data ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${data}T12:00:00`)) : '—'
}

function dataHora(data) {
  return data ? new Date(data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

function tamanho(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function hojeLocal() {
  const partes = new Intl.DateTimeFormat('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' }).formatToParts(new Date())
  const parte = (tipo) => partes.find((item) => item.type === tipo)?.value
  return `${parte('year')}-${parte('month')}-${parte('day')}`
}

export default function TurmaProfessor() {
  const { docturmaId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const abaAtual = ABAS.includes(params.get('aba')) ? params.get('aba') : 'visao'
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [ehErro, setEhErro] = useState(true)
  const [aulaPlanejar, setAulaPlanejar] = useState(null)
  const [planejamento, setPlanejamento] = useState({ objetivos: '', conteudo: '', tarefa: '', anotacoes_privadas: '' })
  const [salvandoPlano, setSalvandoPlano] = useState(false)
  const [comunicadoAberto, setComunicadoAberto] = useState(false)
  const [comunicadoEditando, setComunicadoEditando] = useState(null)
  const [comunicadoForm, setComunicadoForm] = useState({ titulo: '', mensagem: '', status: 'RASCUNHO' })
  const [salvandoComunicado, setSalvandoComunicado] = useState(false)
  const [comunicadoExcluir, setComunicadoExcluir] = useState(null)
  const [baixandoId, setBaixandoId] = useState(null)
  const telaDesktop = useTelaDesktop()
  const dialogoTelaCheia = useDialogoTelaCheia()
  const avisar = (texto, erroMensagem = true) => { setEhErro(erroMensagem); setMsg(texto) }

  const carregar = useCallback(async () => {
    try {
      setDados(await api.get(`/portal-professor/turmas/${docturmaId}`))
      setErro('')
    } catch (e) {
      setErro(e.message)
    }
  }, [docturmaId])

  useEffect(() => { carregar() }, [carregar])

  function trocarAba(_, indice) {
    setParams(indice === 0 ? {} : { aba: ABAS[indice] }, { replace: true })
  }

  function abrirPlanejamento(aula) {
    setAulaPlanejar(aula)
    setPlanejamento({
      objetivos: aula.planejamento?.objetivos || '',
      conteudo: aula.planejamento?.conteudo || '',
      tarefa: aula.planejamento?.tarefa || '',
      anotacoes_privadas: aula.planejamento?.anotacoes_privadas || '',
    })
  }

  async function salvarPlanejamento() {
    setSalvandoPlano(true)
    try {
      await api.put(`/portal-professor/aulas/${aulaPlanejar.id}/planejamento`, planejamento)
      setAulaPlanejar(null)
      avisar('Planejamento da aula salvo.', false)
      await carregar()
    } catch (e) {
      avisar(e.message)
    } finally {
      setSalvandoPlano(false)
    }
  }

  function abrirComunicado(comunicado = null) {
    setComunicadoEditando(comunicado)
    setComunicadoForm(comunicado ? { titulo: comunicado.titulo, mensagem: comunicado.mensagem, status: comunicado.status } : { titulo: '', mensagem: '', status: 'RASCUNHO' })
    setComunicadoAberto(true)
  }

  async function salvarComunicado() {
    setSalvandoComunicado(true)
    try {
      if (comunicadoEditando) await api.put(`/portal-professor/comunicados/${comunicadoEditando.id}`, comunicadoForm)
      else await api.post(`/portal-professor/turmas/${docturmaId}/comunicados`, comunicadoForm)
      setComunicadoAberto(false)
      avisar(comunicadoForm.status === 'PUBLICADO' ? 'Comunicado publicado.' : 'Rascunho salvo.', false)
      await carregar()
    } catch (e) {
      avisar(e.message)
    } finally {
      setSalvandoComunicado(false)
    }
  }

  async function excluirComunicado() {
    try {
      await api.del(`/portal-professor/comunicados/${comunicadoExcluir.id}`)
      setComunicadoExcluir(null)
      avisar('Comunicado removido.', false)
      await carregar()
    } catch (e) {
      avisar(e.message)
    }
  }

  async function baixarMaterial(material) {
    setBaixandoId(material.id)
    try {
      await baixarArquivo(material.url, material.nome_arquivo)
    } catch (e) {
      avisar(e.message)
    } finally {
      setBaixandoId(null)
    }
  }

  if (erro) return <Box><Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate('/professor/turmas')} sx={{ mb: 2 }}>Voltar</Button><Alert severity="error">{erro}</Alert></Box>
  if (!dados) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>

  const { vinculo } = dados
  const periodo = vinculo.ano && vinculo.semestre ? `${vinculo.ano}/${vinculo.semestre}` : null
  const indiceAba = ABAS.indexOf(abaAtual)

  return (
    <Box>
      <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate('/professor/turmas')} sx={{ mb: 2 }}>Minhas turmas</Button>
      <CabecalhoPagina
        titulo={vinculo.materia_nome}
        descricao={[vinculo.turma_nome, vinculo.curso, periodo].filter(Boolean).join(' · ')}
        metadados={vinculo.horario || null}
      />

      <Box sx={{ ...cardSx, mb: 2.5, overflowX: 'auto' }}>
        <Tabs value={indiceAba} onChange={trocarAba} variant="scrollable" scrollButtons="auto" aria-label="Áreas da turma">
          <Tab icon={<MenuBookOutlinedIcon />} iconPosition="start" label="Visão geral" />
          <Tab icon={<EventNoteOutlinedIcon />} iconPosition="start" label="Aulas e chamada" />
          <Tab icon={<EditNoteOutlinedIcon />} iconPosition="start" label="Notas" />
          <Tab icon={<FolderCopyOutlinedIcon />} iconPosition="start" label="Materiais" />
        </Tabs>
      </Box>

      {abaAtual === 'visao' && (
        <Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 2.5 }}>
            <CardMetrica rotulo="Alunos" valor={dados.alunos.length} nota="matriculados" icone={<GroupsOutlinedIcon />} />
            <CardMetrica rotulo="Aulas" valor={dados.aulas.length} nota="no calendário" icone={<EventNoteOutlinedIcon />} />
            <CardMetrica rotulo="Materiais" valor={dados.materiais.length} nota="arquivos disponíveis" icone={<FolderCopyOutlinedIcon />} />
            <CardMetrica rotulo="Notas pendentes" valor={dados.notas_resumo.pendentes} nota="alunos sem nota" destaque={dados.notas_resumo.pendentes > 0} icone={<EditNoteOutlinedIcon />} />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.1fr) minmax(320px, .9fr)' }, gap: 2 }}>
            <Box sx={{ ...cardSx, overflow: 'hidden' }}>
              <Box sx={{ px: 2.5, py: 2, borderBottom: `1px solid ${TOV.divider}` }}><Typography variant="h3" sx={{ fontSize: TOV.type.section }}>Alunos da turma</Typography></Box>
              {dados.alunos.length === 0 ? <EstadoVazio compacto titulo="Nenhum aluno matriculado" /> : (
                <Box sx={{ maxHeight: 430, overflowY: 'auto' }}>
                  {dados.alunos.map((aluno, indice) => (
                    <Box key={aluno.cod_alu} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 1.5, borderBottom: indice < dados.alunos.length - 1 ? `1px solid ${TOV.divider}` : 0 }}>
                      <Box sx={{ color: TOV.caption, fontSize: TOV.type.caption, fontWeight: 700 }}>{String(indice + 1).padStart(2, '0')}</Box>
                      <Typography sx={{ flexGrow: 1, fontWeight: 700 }}>{aluno.nome}</Typography>
                      <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm }}>{aluno.faltas} falta(s)</Typography>
                      <StatusBadge tom={aluno.nota == null ? 'warning' : 'success'}>{aluno.nota == null ? 'Sem nota' : `Nota ${aluno.nota.toLocaleString('pt-BR')}`}</StatusBadge>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>

            <Box sx={{ ...cardSx, p: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2 }}>
                <Box><Typography variant="h3" sx={{ fontSize: TOV.type.section }}>Comunicados</Typography><Typography sx={{ color: TOV.caption, fontSize: TOV.type.caption, mt: 0.5 }}>Rascunhos e avisos preparados para os alunos.</Typography></Box>
                <Button size="small" startIcon={<CampaignOutlinedIcon />} onClick={() => abrirComunicado()}>Novo</Button>
              </Box>
              {dados.comunicados.length === 0 ? <EstadoVazio compacto titulo="Nenhum comunicado" descricao="Crie avisos que poderão aparecer no futuro portal do aluno." /> : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {dados.comunicados.map((comunicado) => (
                    <Box key={comunicado.id} sx={{ p: 1.5, border: `1px solid ${TOV.border}`, borderRadius: `${TOV.radiusSm}px` }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}><Typography sx={{ fontWeight: 700 }}>{comunicado.titulo}</Typography><StatusBadge tom={comunicado.status === 'PUBLICADO' ? 'success' : 'muted'}>{comunicado.status === 'PUBLICADO' ? 'Publicado' : 'Rascunho'}</StatusBadge></Box>
                      <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 1, whiteSpace: 'pre-wrap' }}>{comunicado.mensagem}</Typography>
                      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}><Button size="small" onClick={() => abrirComunicado(comunicado)}>Editar</Button><Button size="small" color="error" onClick={() => setComunicadoExcluir(comunicado)}>Remover</Button></Box>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      )}

      {abaAtual === 'aulas' && (
        <Box>
          {dados.aulas.length === 0 ? <Box sx={cardSx}><EstadoVazio titulo="Nenhuma aula cadastrada" descricao="Peça à secretaria para adicionar as aulas desta matéria ao calendário." /></Box> : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
              {dados.aulas.map((aula) => {
                const hoje = aula.data === hojeLocal()
                const planejada = aula.planejamento && Object.values(aula.planejamento).some(Boolean)
                return (
                  <Box key={aula.id} component="article" sx={{ ...cardSx, p: 2.5, borderColor: hoje ? TOV.coral : TOV.border }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                      <Box><Typography sx={{ color: hoje ? TOV.coral : TOV.caption, fontSize: TOV.type.caption, fontWeight: 700, textTransform: 'uppercase' }}>{hoje ? 'Hoje · ' : ''}{dataCurta(aula.data)}{aula.hora_inicio ? ` · ${aula.hora_inicio}` : ''}</Typography><Typography variant="h3" sx={{ fontSize: TOV.type.section, mt: 0.5 }}>{aula.tema || 'Tema ainda não informado'}</Typography></Box>
                      <StatusBadge tom={aula.status === 'REALIZADA' ? 'success' : aula.status === 'CANCELADA' ? 'error' : 'info'}>{aula.status}</StatusBadge>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}><StatusBadge tom={planejada ? 'success' : 'warning'}>{planejada ? 'Planejada' : 'Planejamento pendente'}</StatusBadge>{aula.total_materiais > 0 && <StatusBadge>{aula.total_materiais} material(is)</StatusBadge>}{aula.chamada && <StatusBadge tom={aula.chamada.status === 'ABERTA' ? 'success' : 'muted'}>Chamada {aula.chamada.status.toLowerCase()}</StatusBadge>}</Box>
                    {aula.planejamento?.objetivos && <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 1.5 }}><b style={{ color: TOV.ink }}>Objetivos:</b> {aula.planejamento.objetivos}</Typography>}
                    {aula.planejamento?.tarefa && <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 1 }}><b style={{ color: TOV.ink }}>Tarefa:</b> {aula.planejamento.tarefa}</Typography>}
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}><Button variant="outlined" size="small" startIcon={<NoteAddOutlinedIcon />} onClick={() => abrirPlanejamento(aula)}>{planejada ? 'Editar planejamento' : 'Planejar aula'}</Button>{(hoje || aula.chamada) && <Button variant={hoje ? 'contained' : 'text'} size="small" startIcon={<HowToRegOutlinedIcon />} onClick={() => navigate(`/turmas/${vinculo.cod_tur}/presencas?vinculo=${docturmaId}`)}>{aula.chamada ? 'Ver chamada' : 'Fazer chamada'}</Button>}</Box>
                  </Box>
                )
              })}
            </Box>
          )}
        </Box>
      )}

      {abaAtual === 'notas' && (
        <Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 2 }}>
            <CardMetrica rotulo="Lançadas" valor={dados.notas_resumo.lancadas} nota="alunos com nota" />
            <CardMetrica rotulo="Pendentes" valor={dados.notas_resumo.pendentes} nota="alunos sem nota" destaque={dados.notas_resumo.pendentes > 0} />
            <CardMetrica rotulo="Média" valor={dados.notas_resumo.media == null ? '—' : dados.notas_resumo.media.toLocaleString('pt-BR')} nota="média da turma" />
            <CardMetrica rotulo="Atividades" valor={dados.notas_resumo.atividades} nota="partes da nota" />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}><Button variant="contained" startIcon={<EditNoteOutlinedIcon />} onClick={() => navigate(`/notas?turma=${vinculo.cod_tur}&vinculo=${docturmaId}`)}>Abrir grade de notas</Button></Box>
          <TableContainer component={Box} sx={{ ...cardSx, overflowX: 'auto' }}>
            <Table>
              <TableHead><TableRow><TableCell>Aluno</TableCell><TableCell align="center">Nota</TableCell><TableCell align="center">Faltas</TableCell><TableCell>Situação</TableCell></TableRow></TableHead>
              <TableBody>{dados.alunos.map((aluno) => <TableRow key={aluno.cod_alu}><TableCell sx={{ fontWeight: 700 }}>{aluno.nome}</TableCell><TableCell align="center" sx={{ fontWeight: 700 }}>{aluno.nota == null ? '—' : aluno.nota.toLocaleString('pt-BR')}</TableCell><TableCell align="center">{aluno.faltas}</TableCell><TableCell><StatusBadge tom={aluno.nota == null ? 'warning' : 'success'}>{aluno.nota == null ? 'Pendente' : 'Lançada'}</StatusBadge></TableCell></TableRow>)}</TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {abaAtual === 'materiais' && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}><Button variant="contained" startIcon={<FolderCopyOutlinedIcon />} onClick={() => navigate(`/materiais?vinculo=${docturmaId}`)}>Gerenciar materiais</Button></Box>
          {dados.materiais.length === 0 ? <Box sx={cardSx}><EstadoVazio titulo="Nenhum material anexado" descricao="Adicione arquivos para toda a matéria ou para aulas específicas." /></Box> : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
              {dados.materiais.map((material) => <Box key={material.id} sx={{ ...cardSx, p: 2, display: 'flex', gap: 1.5, alignItems: 'center' }}><Box sx={{ width: 42, height: 42, display: 'grid', placeItems: 'center', bgcolor: TOV.slateTint, color: TOV.graphite, borderRadius: TOV.radiusSm, flexShrink: 0 }}><FolderCopyOutlinedIcon /></Box><Box sx={{ minWidth: 0, flexGrow: 1 }}><Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{material.titulo}</Typography><Typography sx={{ color: TOV.caption, fontSize: TOV.type.caption, overflowWrap: 'anywhere' }}>{material.nome_arquivo} · {tamanho(material.tamanho)} · {dataHora(material.criado_em)}</Typography></Box><Button size="small" startIcon={baixandoId === material.id ? <CircularProgress size={14} /> : <CloudDownloadOutlinedIcon />} disabled={baixandoId === material.id} onClick={() => baixarMaterial(material)}>{telaDesktop ? 'Baixar' : ''}</Button></Box>)}
            </Box>
          )}
        </Box>
      )}

      <Dialog open={!!aulaPlanejar} onClose={salvandoPlano ? undefined : () => setAulaPlanejar(null)} maxWidth="md" fullWidth fullScreen={dialogoTelaCheia}>
        <DialogTitle>Planejamento da aula · {aulaPlanejar ? dataCurta(aulaPlanejar.data) : ''}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, pt: '12px !important' }}>
          <TextField multiline minRows={4} label="Objetivos da aula" value={planejamento.objetivos} onChange={(e) => setPlanejamento({ ...planejamento, objetivos: e.target.value })} />
          <TextField multiline minRows={4} label="Conteúdo previsto" value={planejamento.conteudo} onChange={(e) => setPlanejamento({ ...planejamento, conteudo: e.target.value })} />
          <TextField multiline minRows={4} label="Tarefa ou leitura" value={planejamento.tarefa} onChange={(e) => setPlanejamento({ ...planejamento, tarefa: e.target.value })} />
          <TextField multiline minRows={4} label="Anotações privadas" helperText="Visíveis somente para você." value={planejamento.anotacoes_privadas} onChange={(e) => setPlanejamento({ ...planejamento, anotacoes_privadas: e.target.value })} />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}><Button onClick={() => setAulaPlanejar(null)} disabled={salvandoPlano}>Cancelar</Button><Button variant="contained" disabled={salvandoPlano} onClick={salvarPlanejamento}>{salvandoPlano ? 'Salvando…' : 'Salvar planejamento'}</Button></DialogActions>
      </Dialog>

      <Dialog open={comunicadoAberto} onClose={salvandoComunicado ? undefined : () => setComunicadoAberto(false)} maxWidth="sm" fullWidth fullScreen={dialogoTelaCheia}>
        <DialogTitle>{comunicadoEditando ? 'Editar comunicado' : 'Novo comunicado'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <TextField label="Título" value={comunicadoForm.titulo} onChange={(e) => setComunicadoForm({ ...comunicadoForm, titulo: e.target.value })} inputProps={{ maxLength: 150 }} />
          <TextField multiline minRows={5} label="Mensagem" value={comunicadoForm.mensagem} onChange={(e) => setComunicadoForm({ ...comunicadoForm, mensagem: e.target.value })} inputProps={{ maxLength: 5000 }} />
          <TextField select label="Situação" value={comunicadoForm.status} onChange={(e) => setComunicadoForm({ ...comunicadoForm, status: e.target.value })}><MenuItem value="RASCUNHO">Salvar como rascunho</MenuItem><MenuItem value="PUBLICADO">Publicado</MenuItem></TextField>
          <Alert severity="info">Os comunicados publicados já ficam preparados para aparecer no futuro portal do aluno.</Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}><Button onClick={() => setComunicadoAberto(false)} disabled={salvandoComunicado}>Cancelar</Button><Button variant="contained" disabled={salvandoComunicado || !comunicadoForm.titulo.trim() || !comunicadoForm.mensagem.trim()} onClick={salvarComunicado}>{salvandoComunicado ? 'Salvando…' : comunicadoForm.status === 'PUBLICADO' ? 'Publicar' : 'Salvar rascunho'}</Button></DialogActions>
      </Dialog>

      <DialogoConfirmacao aberto={!!comunicadoExcluir} titulo="Remover comunicado?" descricao={`O comunicado ${comunicadoExcluir?.titulo || ''} será excluído.`} rotuloConfirmar="Remover" processando={false} onConfirmar={excluirComunicado} onFechar={() => setComunicadoExcluir(null)} />
      <Snackbar open={!!msg} autoHideDuration={4500} onClose={() => setMsg('')}><Alert severity={ehErro ? 'error' : 'success'} onClose={() => setMsg('')}>{msg}</Alert></Snackbar>
    </Box>
  )
}
