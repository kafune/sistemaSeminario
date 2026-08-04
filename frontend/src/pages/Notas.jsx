import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, Paper, Snackbar, Switch, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import SaveIcon from '@mui/icons-material/Save'
import TuneIcon from '@mui/icons-material/Tune'
import { api, abrirArquivo, getPerfil } from '../api'
import { TOV } from '../theme'
import {
  BarraFiltros, CabecalhoPagina, CartaoLista, EstadoVazio, StatusBadge,
  cardSx, useTelaDesktop,
} from '../ui'
import { useUnsavedChanges } from '../UnsavedChanges'

const TIPOS_ATIVIDADE = [
  { valor: 'LEITURA', rotulo: 'Leitura' },
  { valor: 'TRABALHO', rotulo: 'Trabalho' },
  { valor: 'PROVA', rotulo: 'Prova' },
]

const rotuloTipo = (tipo) => TIPOS_ATIVIDADE.find((item) => item.valor === tipo)?.rotulo || tipo
const formatarPontos = (valor) => Number(valor || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

/** Rótulo de um seletor (uppercase caption) acima do campo. */
function RotuloCampo({ children, htmlFor, id }) {
  return (
    <Box id={id} component="label" htmlFor={htmlFor} sx={{ display: 'block', fontSize: 12, color: TOV.caption, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', mb: 1 }}>{children}</Box>
  )
}

export default function Notas() {
  const [searchParams] = useSearchParams()
  const vinculoInicial = searchParams.get('vinculo')
  const [turmas, setTurmas] = useState([])
  const [vinculos, setVinculos] = useState([])
  const [codTur, setCodTur] = useState(searchParams.get('turma') || '')
  const [materiasTurma, setMateriasTurma] = useState([])
  const [docSel, setDocSel] = useState(null) // entrada docturma escolhida
  const [ano, setAno] = useState('')
  const [semestre, setSemestre] = useState('')

  const [linhas, setLinhas] = useState([])
  const [atividades, setAtividades] = useState([])
  const [atividadesEdicao, setAtividadesEdicao] = useState([])
  const [configuracaoAberta, setConfiguracaoAberta] = useState(false)
  const [configuracaoSuja, setConfiguracaoSuja] = useState(false)
  const [profResponsavel, setProfResponsavel] = useState('')
  const [carregandoGrade, setCarregandoGrade] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [salvandoConfiguracao, setSalvandoConfiguracao] = useState(false)

  const [msg, setMsg] = useState('')
  const [ehErro, setEhErro] = useState(true)
  const telaDesktop = useTelaDesktop()
  const avisar = (texto, erro = true) => { setEhErro(erro); setMsg(texto) }

  useEffect(() => {
    api.get('/notas/opcoes')
      .then((resposta) => {
        setTurmas(resposta.turmas)
        setVinculos(resposta.vinculos)
      })
      .catch((e) => avisar(e.message))
  }, [])

  // Ao trocar a turma, carrega as matérias vinculadas.
  useEffect(() => {
    setDocSel(null); setLinhas([]); setAtividades([]); setMateriasTurma([]); setProfResponsavel('')
    setConfiguracaoAberta(false); setConfiguracaoSuja(false)
    if (!codTur) return
    setMateriasTurma(vinculos.filter((item) => String(item.cod_tur) === String(codTur)))
  }, [codTur, vinculos])

  const carregarGrade = useCallback((doc) => {
    if (!codTur || !doc) { setLinhas([]); setAtividades([]); return }
    setCarregandoGrade(true)
    api.get(`/notas/vinculo/${doc.id}`)
      .then((r) => {
        setAtividades(r.atividades || [])
        setLinhas(r.alunos.map((a) => ({
          cod_alu: a.cod_alu,
          nome: a.nome,
          nota: a.nota != null ? String(a.nota) : '',
          falta: a.falta != null ? String(a.falta) : '',
          dispensa: a.dispensa ?? null,
          cursou: a.cursou == null ? true : a.cursou === 'S',
          ja_lancado: a.ja_lancado,
          notas_atividades: Object.fromEntries(
            (a.notas_atividades || []).map((item) => [String(item.atividade_id), String(item.nota)]),
          ),
          _notasAlteradas: false,
          _dirty: false,
        })))
      })
      .catch((e) => avisar(e.message))
      .finally(() => setCarregandoGrade(false))
  }, [codTur])

  function escolherMateria(id) {
    const doc = materiasTurma.find((m) => String(m.id) === String(id)) || null
    setDocSel(doc)
    setAtividades([])
    setConfiguracaoAberta(false)
    setConfiguracaoSuja(false)
    setProfResponsavel(doc?.professor_nome || '')
    if (doc) {
      setAno(doc.Ano || '')
      setSemestre(doc.semestre || '')
      carregarGrade(doc)
    } else {
      setLinhas([])
      setAtividades([])
    }
  }

  useEffect(() => {
    if (!vinculoInicial || docSel || materiasTurma.length === 0) return
    const doc = materiasTurma.find((item) => String(item.id) === String(vinculoInicial))
    if (!doc) return
    setDocSel(doc)
    setProfResponsavel(doc.professor_nome || '')
    setAno(doc.Ano || '')
    setSemestre(doc.semestre || '')
    carregarGrade(doc)
  }, [vinculoInicial, docSel, materiasTurma, carregarGrade])

  function editarLinha(cod_alu, campo, valor) {
    setLinhas((atual) => atual.map((l) => (l.cod_alu === cod_alu ? { ...l, [campo]: valor, _dirty: true } : l)))
  }

  function editarNotaAtividade(cod_alu, atividadeId, valor) {
    setLinhas((atual) => atual.map((linha) => (
      linha.cod_alu === cod_alu
        ? {
            ...linha,
            notas_atividades: { ...linha.notas_atividades, [String(atividadeId)]: valor },
            _notasAlteradas: true,
            _dirty: true,
          }
        : linha
    )))
  }

  const sujas = linhas.filter((l) => l._dirty)
  useUnsavedChanges(
    sujas.length > 0 || configuracaoSuja,
    configuracaoSuja
      ? 'Há alterações não salvas na composição da nota.'
      : sujas.length === 1
      ? 'Há 1 lançamento alterado que ainda não foi salvo.'
      : `Há ${sujas.length} lançamentos alterados que ainda não foram salvos.`,
  )

  const notaInvalida = (l) => atividades.length === 0 && l.nota !== '' && (Number.isNaN(Number(l.nota)) || Number(l.nota) < 0 || Number(l.nota) > 10)
  const notaAtividadeInvalida = (linha, atividade) => {
    const valor = linha.notas_atividades[String(atividade.id)] ?? ''
    return valor !== '' && (Number.isNaN(Number(valor)) || Number(valor) < 0 || Number(valor) > Number(atividade.valor_maximo))
  }
  const totalLinha = (linha) => {
    const preenchidas = atividades
      .map((atividade) => linha.notas_atividades[String(atividade.id)] ?? '')
      .filter((valor) => valor !== '')
    const numeros = preenchidas.map(Number)
    if (numeros.some(Number.isNaN)) return null
    if (numeros.length > 0) return numeros.reduce((soma, valor) => soma + valor, 0)
    if (!linha._notasAlteradas && linha.nota !== '') return Number(linha.nota)
    return null
  }
  const temInvalida = linhas.some((linha) => (
    notaInvalida(linha) || atividades.some((atividade) => notaAtividadeInvalida(linha, atividade))
  ))

  const somaAtividadesEdicao = atividadesEdicao.reduce((soma, item) => soma + (Number(item.valor_maximo) || 0), 0)
  const configuracaoInvalida = somaAtividadesEdicao > 10.000001 || atividadesEdicao.some((item) => (
    !item.nome.trim()
    || item.nome.trim().length > 100
    || item.valor_maximo === ''
    || !Number.isFinite(Number(item.valor_maximo))
    || Number(item.valor_maximo) <= 0
    || Number(item.valor_maximo) > 10
  ))

  function abrirConfiguracao() {
    if (sujas.length > 0) {
      avisar('Salve a grade antes de alterar a composição da nota.')
      return
    }
    setAtividadesEdicao(atividades.map((item) => ({
      id: item.id,
      tipo: item.tipo,
      nome: item.nome,
      valor_maximo: String(item.valor_maximo),
    })))
    setConfiguracaoSuja(false)
    setConfiguracaoAberta(true)
  }

  function fecharConfiguracao() {
    if (salvandoConfiguracao) return
    setConfiguracaoAberta(false)
    setConfiguracaoSuja(false)
  }

  function editarAtividade(indice, campo, valor) {
    setAtividadesEdicao((atual) => atual.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)))
    setConfiguracaoSuja(true)
  }

  function adicionarAtividade() {
    const quantidade = atividadesEdicao.filter((item) => item.tipo === 'LEITURA').length + 1
    const restante = Math.max(0, 10 - somaAtividadesEdicao)
    setAtividadesEdicao((atual) => [...atual, {
      _chave: `nova-${Date.now()}-${atual.length}`,
      tipo: 'LEITURA',
      nome: `Leitura ${quantidade}`,
      valor_maximo: restante > 0 ? String(restante) : '',
    }])
    setConfiguracaoSuja(true)
  }

  function removerAtividade(indice) {
    setAtividadesEdicao((atual) => atual.filter((_, i) => i !== indice))
    setConfiguracaoSuja(true)
  }

  async function salvarConfiguracao() {
    if (!docSel || configuracaoInvalida) return
    const idsMantidos = new Set(atividadesEdicao.map((item) => item.id).filter(Boolean))
    const removeAtividadeExistente = atividades.some((item) => !idsMantidos.has(item.id))
    if (removeAtividadeExistente && !window.confirm('Remover atividades também apaga as notas parciais ligadas a elas. Deseja continuar?')) return
    setSalvandoConfiguracao(true)
    try {
      const resposta = await api.put(`/notas/vinculo/${docSel.id}/atividades`, {
        atividades: atividadesEdicao.map((item) => ({
          id: item.id ?? null,
          tipo: item.tipo,
          nome: item.nome.trim(),
          valor_maximo: Number(item.valor_maximo),
        })),
      })
      setAtividades(resposta.atividades || [])
      setConfiguracaoAberta(false)
      setConfiguracaoSuja(false)
      avisar(`Composição salva · ${formatarPontos(resposta.total)} de 10 pontos`, false)
      carregarGrade(docSel)
    } catch (e) {
      avisar(e.message)
    } finally {
      setSalvandoConfiguracao(false)
    }
  }

  async function salvarGrade() {
    if (!docSel || sujas.length === 0) return
    if (temInvalida) {
      avisar(atividades.length > 0
        ? 'Há notas fora do valor máximo definido para a atividade.'
        : 'Há valores inválidos na grade: a nota deve ficar entre 0 e 10.')
      return
    }
    setSalvando(true)
    try {
      await api.post('/notas/lancar', {
        docturma_id: docSel.id,
        cod_tur: Number(codTur),
        cod_mat: docSel.cod_mat,
        cod_pro: docSel.cod_pro ?? null,
        ano: ano || null,
        semestre: semestre || null,
        alunos: sujas.map((l) => ({
          cod_alu: l.cod_alu,
          nota: l.nota === '' ? null : Number(l.nota),
          dispensa: l.dispensa || null,
          cursou: l.cursou ? 'S' : 'N',
          notas_atividades: atividades.length > 0 && l._notasAlteradas
            ? atividades.map((atividade) => {
                const valor = l.notas_atividades[String(atividade.id)] ?? ''
                return { atividade_id: atividade.id, nota: valor === '' ? null : Number(valor) }
              })
            : null,
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

  const celulaInput = (l, campo, props) => {
    const invalida = notaInvalida(l)
    return (
      <TextField
        type="number" size="small" value={l[campo]}
        error={invalida}
        onChange={(e) => editarLinha(l.cod_alu, campo, e.target.value)}
        inputProps={{ style: { textAlign: 'center', fontWeight: 700 }, 'aria-label': `Nota de ${l.nome}`, ...props }}
        sx={{
          width: 88,
          '& .MuiOutlinedInput-root': { height: 42 },
          ...(invalida ? {} : { '& fieldset': { borderColor: l._dirty ? TOV.coral : TOV.border } }),
        }}
      />
    )
  }

  const celulaAtividade = (linha, atividade, celular = false) => {
    const invalida = notaAtividadeInvalida(linha, atividade)
    return (
      <TextField
        type="number"
        size="small"
        fullWidth={celular}
        label={celular ? `${atividade.nome} (0–${formatarPontos(atividade.valor_maximo)})` : undefined}
        value={linha.notas_atividades[String(atividade.id)] ?? ''}
        error={invalida}
        onChange={(e) => editarNotaAtividade(linha.cod_alu, atividade.id, e.target.value)}
        inputProps={{
          min: 0,
          max: Number(atividade.valor_maximo),
          step: 0.1,
          inputMode: 'decimal',
          style: { textAlign: 'center', fontWeight: 700 },
          'aria-label': `${atividade.nome} de ${linha.nome}`,
        }}
        sx={{
          width: celular ? '100%' : 88,
          '& .MuiOutlinedInput-root': { height: 42 },
          ...(invalida ? {} : { '& fieldset': { borderColor: linha._dirty ? TOV.coral : TOV.border } }),
        }}
      />
    )
  }

  return (
    <Box>
      <CabecalhoPagina
        titulo="Notas e faltas"
        descricao="As notas são editadas na grade; as faltas vêm automaticamente das chamadas encerradas."
      />

      {/* Seletores */}
      <BarraFiltros sx={{ p: { xs: 2, sm: 2.5 }, mb: 2.5, gap: { xs: 1.75, sm: 2.25 }, alignItems: 'flex-end' }}>
        <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 230px' }, minWidth: 0, maxWidth: { sm: 320 } }}>
          <RotuloCampo id="notas-turma-label" htmlFor="notas-turma">Turma</RotuloCampo>
          <TextField id="notas-turma" select size="small" fullWidth value={codTur} onChange={(e) => setCodTur(e.target.value)}
            SelectProps={{ SelectDisplayProps: { 'aria-labelledby': 'notas-turma-label' } }}
            sx={{ '& .MuiOutlinedInput-root': { height: 48 } }} displayEmpty>
            <MenuItem value=""><em>Selecione a turma</em></MenuItem>
            {turmas.map((t) => <MenuItem key={t.cod_tur} value={t.cod_tur}>{t.nome}</MenuItem>)}
          </TextField>
        </Box>
        <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 230px' }, minWidth: 0, maxWidth: { sm: 320 } }}>
          <RotuloCampo id="notas-materia-label" htmlFor="notas-materia">Matéria</RotuloCampo>
          <TextField id="notas-materia" select size="small" fullWidth value={docSel?.id ?? ''} onChange={(e) => escolherMateria(e.target.value)}
            SelectProps={{ SelectDisplayProps: { 'aria-labelledby': 'notas-materia-label' } }}
            disabled={!codTur} sx={{ '& .MuiOutlinedInput-root': { height: 48 } }} displayEmpty>
            <MenuItem value=""><em>{codTur ? (materiasTurma.length ? 'Selecione a matéria' : 'Sem matérias vinculadas') : 'Escolha a turma antes'}</em></MenuItem>
            {materiasTurma.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {[m.materia_nome?.trim(), m.professor_nome, m.Ano && m.semestre ? `${m.Ano}/${m.semestre}` : null].filter(Boolean).join(' · ')}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <Box sx={{ flex: { xs: '1 1 40%', sm: '0 0 110px' } }}>
          <Box sx={{ fontSize: 12, color: TOV.caption, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', mb: 1 }}>Ano</Box>
          <Box sx={{ height: 48, px: 1.75, display: 'flex', alignItems: 'center', border: `1px solid ${TOV.border}`, borderRadius: `${TOV.radiusSm}px`, bgcolor: TOV.surface, fontWeight: 600 }}>
            {ano || '—'}
          </Box>
        </Box>
        <Box sx={{ flex: { xs: '1 1 40%', sm: '0 0 110px' } }}>
          <Box sx={{ fontSize: 12, color: TOV.caption, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', mb: 1 }}>Semestre</Box>
          <Box sx={{ height: 48, px: 1.75, display: 'flex', alignItems: 'center', border: `1px solid ${TOV.border}`, borderRadius: `${TOV.radiusSm}px`, bgcolor: TOV.surface, fontWeight: 600 }}>
            {semestre ? `${semestre}º` : '—'}
          </Box>
        </Box>
        <Box sx={{ ml: { md: 'auto' }, display: 'flex', gap: 1.25, flexWrap: 'wrap', width: { xs: '100%', md: 'auto' }, '& > *': { flexGrow: { xs: 1, md: 0 } } }}>
          {getPerfil() !== 'PROFESSOR' && <Button variant="outlined" startIcon={<PictureAsPdfIcon />} disabled={!docSel} sx={{ height: 48 }}
            onClick={() => abrirArquivo(`/relatorios/diario/${codTur}?docturma_id=${docSel.id}`).catch((e) => avisar(e.message))}>
            Diário (PDF)
          </Button>}
          <Button variant="contained" startIcon={<SaveIcon />} disabled={!docSel || sujas.length === 0 || salvando || temInvalida} sx={{ height: 48 }}
            onClick={salvarGrade}>
            {salvando ? 'Salvando…' : temInvalida ? 'Corrija os valores' : `Salvar grade${sujas.length ? ` (${sujas.length})` : ''}`}
          </Button>
        </Box>
      </BarraFiltros>

      {docSel && (
        <Box sx={{ ...cardSx, p: { xs: 2, sm: 2.5 }, mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="h3" sx={{ fontSize: 18 }}>Composição da nota</Typography>
              <Typography sx={{ color: TOV.caption, fontSize: 13, mt: 0.5 }}>
                {atividades.length > 0
                  ? `${atividades.length} ${atividades.length === 1 ? 'atividade' : 'atividades'} · ${formatarPontos(atividades.reduce((soma, item) => soma + Number(item.valor_maximo), 0))} de 10 pontos`
                  : 'Nota única de 0 a 10. Configure atividades para dividir o lançamento.'}
              </Typography>
            </Box>
            <Button variant="outlined" startIcon={<TuneIcon />} onClick={abrirConfiguracao}>
              {atividades.length > 0 ? 'Editar composição' : 'Dividir a nota'}
            </Button>
          </Box>
          {atividades.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
              {atividades.map((atividade) => (
                <Box key={atividade.id} sx={{ px: 1.5, py: 1, border: `1px solid ${TOV.border}`, borderRadius: `${TOV.radiusSm}px`, bgcolor: TOV.offwhite }}>
                  <Typography sx={{ fontSize: 11, color: TOV.caption, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{rotuloTipo(atividade.tipo)}</Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{atividade.nome} · {formatarPontos(atividade.valor_maximo)} pts</Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Grade */}
      {!docSel ? (
        <Box sx={cardSx}>
          <EstadoVazio
            titulo="Selecione uma turma e uma matéria"
            descricao="A grade de notas e faltas será carregada depois que o contexto acadêmico for definido."
          />
        </Box>
      ) : (
        <>
          {/* Grade em cards — celular/tablet */}
          {!telaDesktop && <Box>
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
                    <Box sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3, minWidth: 0, flexGrow: 1 }}>
                      {l.nome}
                      {l._dirty && <StatusBadge tom="warning" sx={{ ml: 1, verticalAlign: 'middle' }}>Não salvo</StatusBadge>}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      <Box component="span" sx={{ fontSize: 12, color: TOV.caption, fontWeight: 600 }}>Cursou</Box>
                      <Switch checked={l.cursou} inputProps={{ 'aria-label': `Marcar se ${l.nome} cursou a matéria` }} onChange={(e) => editarLinha(l.cod_alu, 'cursou', e.target.checked)} />
                    </Box>
                  </Box>
                  {atividades.length === 0 ? (
                    <Box sx={{ display: 'flex', gap: 1.25 }}>
                      <TextField
                        type="number" size="small" fullWidth label="Nota (0–10)" value={l.nota}
                        error={notaInvalida(l)}
                        onChange={(e) => editarLinha(l.cod_alu, 'nota', e.target.value)}
                        inputProps={{ min: 0, max: 10, step: 0.1, inputMode: 'decimal', style: { fontWeight: 700 } }}
                        sx={notaInvalida(l) ? {} : { '& fieldset': { borderColor: l._dirty ? TOV.coral : TOV.border } }}
                      />
                      <TextField size="small" fullWidth label="Faltas da chamada" value={l.falta} InputProps={{ readOnly: true }} />
                    </Box>
                  ) : (
                    <>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
                        {atividades.map((atividade) => (
                          <Box key={atividade.id}>{celulaAtividade(l, atividade, true)}</Box>
                        ))}
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, pt: 0.5, color: TOV.caption, fontSize: 13 }}>
                        <Box>Faltas: <Box component="span" sx={{ color: TOV.ink, fontWeight: 700 }}>{l.falta}</Box></Box>
                        <Box>Nota total: <Box component="span" sx={{ color: TOV.ink, fontWeight: 800 }}>{totalLinha(l) == null ? '—' : formatarPontos(totalLinha(l))}</Box></Box>
                      </Box>
                    </>
                  )}
                </CartaoLista>
              ))}
            </Box>
          </Box>}

          {/* Grade em tabela — desktop */}
          {telaDesktop && <TableContainer component={Box} sx={{ ...cardSx, overflowX: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', p: '18px 28px', borderBottom: `2px solid ${TOV.offwhite}` }}>
              <Typography variant="h3" sx={{ fontSize: 20 }}>{linhas.length} {linhas.length === 1 ? 'aluno' : 'alunos'}</Typography>
              <Typography sx={{ fontSize: 13, color: TOV.caption }}>
                {profResponsavel ? `Prof. responsável: ${profResponsavel} · ` : ''}edite direto na grade e salve tudo de uma vez
              </Typography>
            </Box>
            <Table sx={{ minWidth: atividades.length > 0 ? 520 + (atividades.length * 120) : 640 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 60 }}>#</TableCell>
                  <TableCell>Aluno</TableCell>
                  {atividades.length === 0 ? (
                    <TableCell sx={{ width: 120 }}>Nota (0–10)</TableCell>
                  ) : (
                    <>
                      {atividades.map((atividade) => (
                        <TableCell key={atividade.id} sx={{ width: 120 }}>
                          <Box sx={{ fontWeight: 700 }}>{atividade.nome}</Box>
                          <Box sx={{ color: TOV.caption, fontSize: 11, mt: 0.25 }}>{rotuloTipo(atividade.tipo)} · até {formatarPontos(atividade.valor_maximo)}</Box>
                        </TableCell>
                      ))}
                      <TableCell sx={{ width: 90 }}>Total</TableCell>
                    </>
                  )}
                  <TableCell sx={{ width: 120 }}>Faltas</TableCell>
                  <TableCell sx={{ width: 110 }}>Cursou</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {carregandoGrade && (
                  <TableRow><TableCell colSpan={atividades.length > 0 ? atividades.length + 5 : 5} sx={{ py: 4, textAlign: 'center', color: TOV.caption }}>Carregando grade…</TableCell></TableRow>
                )}
                {!carregandoGrade && linhas.length === 0 && (
                  <TableRow><TableCell colSpan={atividades.length > 0 ? atividades.length + 5 : 5} sx={{ py: 4, textAlign: 'center', color: TOV.caption }}>Nenhum aluno matriculado nesta turma.</TableCell></TableRow>
                )}
                {!carregandoGrade && linhas.map((l, i) => (
                  <TableRow key={l.cod_alu} sx={{ bgcolor: l._dirty ? 'rgba(241,73,73,.05)' : 'transparent', '& td': { borderLeft: l._dirty ? `3px solid ${TOV.coral}` : '3px solid transparent' }, '& td:not(:first-of-type)': { borderLeft: 'none' } }}>
                    <TableCell sx={{ color: TOV.caption, fontWeight: 600 }}>{String(i + 1).padStart(2, '0')}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      {l.nome}
                      {l._dirty && <StatusBadge tom="warning" sx={{ ml: 1 }}>Não salvo</StatusBadge>}
                    </TableCell>
                    {atividades.length === 0 ? (
                      <TableCell>{celulaInput(l, 'nota', { min: 0, max: 10, step: 0.1 })}</TableCell>
                    ) : (
                      <>
                        {atividades.map((atividade) => (
                          <TableCell key={atividade.id}>{celulaAtividade(l, atividade)}</TableCell>
                        ))}
                        <TableCell sx={{ fontWeight: 800, color: TOV.ink }}>{totalLinha(l) == null ? '—' : formatarPontos(totalLinha(l))}</TableCell>
                      </>
                    )}
                    <TableCell sx={{ fontWeight: 700, color: TOV.slate }}>{l.falta}</TableCell>
                    <TableCell>
                      <Switch checked={l.cursou} inputProps={{ 'aria-label': `Marcar se ${l.nome} cursou a matéria` }} onChange={(e) => editarLinha(l.cod_alu, 'cursou', e.target.checked)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>}
          {telaDesktop && <Typography sx={{ mt: 1.75, fontSize: 13, color: TOV.caption }}>
            Dica: use Tab para navegar célula a célula. Alterações não salvas ficam destacadas em coral.
          </Typography>}
        </>
      )}

      {sujas.length > 0 && (
        <>
          <Box sx={{ display: { xs: 'block', sm: 'none' }, height: 76 }} />
          <Paper
            elevation={10}
            sx={{
              display: { xs: 'block', sm: 'none' },
              position: 'fixed',
              left: 12,
              right: 12,
              bottom: 'calc(74px + env(safe-area-inset-bottom))',
              zIndex: (theme) => theme.zIndex.appBar + 1,
              p: 1,
              border: `1px solid ${TOV.divider}`,
            }}
          >
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              fullWidth
              disabled={salvando || temInvalida}
              onClick={salvarGrade}
            >
              {salvando ? 'Salvando…' : temInvalida ? 'Corrija os valores' : `Salvar ${sujas.length} ${sujas.length === 1 ? 'alteração' : 'alterações'}`}
            </Button>
          </Paper>
        </>
      )}

      <Dialog open={configuracaoAberta} onClose={fecharConfiguracao} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          Composição da nota
          <Typography sx={{ color: TOV.caption, fontSize: 14, mt: 0.75 }}>
            Adicione quantas leituras, trabalhos e provas precisar. A soma pode chegar a 10 pontos.
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {atividadesEdicao.length === 0 && (
            <Box sx={{ py: 2, textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 700 }}>Nenhuma atividade configurada</Typography>
              <Typography sx={{ color: TOV.caption, fontSize: 13, mt: 0.5 }}>Sem atividades, a grade usa uma única nota de 0 a 10.</Typography>
            </Box>
          )}
          {atividadesEdicao.map((atividade, indice) => (
            <Box
              key={atividade.id || atividade._chave}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 44px', sm: '150px minmax(180px, 1fr) 130px 44px' },
                gap: 1.25,
                alignItems: 'start',
                p: 1.5,
                border: `1px solid ${TOV.border}`,
                borderRadius: `${TOV.radiusSm}px`,
              }}
            >
              <TextField
                select size="small" label="Tipo" value={atividade.tipo}
                onChange={(e) => editarAtividade(indice, 'tipo', e.target.value)}
                sx={{ gridColumn: { xs: '1', sm: 'auto' } }}
              >
                {TIPOS_ATIVIDADE.map((tipo) => <MenuItem key={tipo.valor} value={tipo.valor}>{tipo.rotulo}</MenuItem>)}
              </TextField>
              <TextField
                size="small" label="Nome da atividade" value={atividade.nome}
                error={!atividade.nome.trim() || atividade.nome.trim().length > 100}
                onChange={(e) => editarAtividade(indice, 'nome', e.target.value)}
                inputProps={{ maxLength: 100 }}
                sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, gridRow: { xs: 2, sm: 'auto' } }}
              />
              <TextField
                type="number" size="small" label="Valor máximo" value={atividade.valor_maximo}
                error={atividade.valor_maximo === '' || !Number.isFinite(Number(atividade.valor_maximo)) || Number(atividade.valor_maximo) <= 0 || Number(atividade.valor_maximo) > 10}
                onChange={(e) => editarAtividade(indice, 'valor_maximo', e.target.value)}
                inputProps={{ min: 0.01, max: 10, step: 0.1, inputMode: 'decimal' }}
                sx={{ gridColumn: { xs: '1', sm: 'auto' }, gridRow: { xs: 3, sm: 'auto' } }}
              />
              <IconButton
                color="error"
                aria-label={`Remover ${atividade.nome || `atividade ${indice + 1}`}`}
                onClick={() => removerAtividade(indice)}
                sx={{ gridColumn: { xs: '2', sm: 'auto' }, gridRow: { xs: 1, sm: 'auto' } }}
              >
                <DeleteOutlineIcon />
              </IconButton>
            </Box>
          ))}
          <Button variant="outlined" startIcon={<AddIcon />} onClick={adicionarAtividade} sx={{ alignSelf: 'flex-start' }}>
            Adicionar atividade
          </Button>
          {somaAtividadesEdicao > 10.000001 && (
            <Alert severity="error">A soma ultrapassou 10 pontos. Reduza {formatarPontos(somaAtividadesEdicao - 10)} ponto(s).</Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5, gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ mr: 'auto', fontWeight: 800, color: somaAtividadesEdicao > 10.000001 ? TOV.danger : TOV.ink }}>
            Total: {formatarPontos(somaAtividadesEdicao)} / 10
          </Typography>
          <Button onClick={fecharConfiguracao} disabled={salvandoConfiguracao}>Cancelar</Button>
          <Button variant="contained" startIcon={<SaveIcon />} disabled={configuracaoInvalida || salvandoConfiguracao} onClick={salvarConfiguracao}>
            {salvandoConfiguracao ? 'Salvando…' : 'Salvar composição'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={5000} onClose={() => setMsg('')}>
        <Alert severity={ehErro ? 'error' : 'success'} onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
