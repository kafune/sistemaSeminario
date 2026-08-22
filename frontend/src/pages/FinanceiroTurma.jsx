import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, InputAdornment, Snackbar, Switch, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Typography,
} from '@mui/material'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined'
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined'
import { api } from '../api'
import { TOV } from '../theme'
import {
  CabecalhoPagina, CartaoLista, DialogoConfirmacao, EstadoErro, EstadoVazio,
  GrupoSegmentado, LinhasSkeleton, Metadado, SkeletonCards, StatusBadge,
  Superficie, cardSx, resetBotao, useDialogoTelaCheia, useTelaDesktop,
} from '../ui'
import { formatarDataBr, formatarMoeda } from '../formatters'
import { SeloSituacao, numeroDoCampo, textoDoValor } from './FinanceiroComum'

const PLANO_VAZIO = {
  valor_matricula: '',
  valor_mensalidade: '',
  parcelas: '',
  dia_vencimento: '10',
  primeira_mensalidade: '',
  vencimento_matricula: '',
  observacao: '',
}

const CONDICAO_VAZIA = {
  tipo: 'REGULAR',
  parcelas: '',
  primeira_mensalidade: '',
  valor_mensalidade: '',
  cobra_matricula: true,
  observacao: '',
}

const TIPOS_CONDICAO = [
  { valor: 'REGULAR', rotulo: 'Plano da turma' },
  { valor: 'TRANSFERENCIA', rotulo: 'Transferência' },
]

function planoParaFormulario(plano) {
  if (!plano) return { ...PLANO_VAZIO }
  return {
    valor_matricula: textoDoValor(plano.valor_matricula),
    valor_mensalidade: textoDoValor(plano.valor_mensalidade),
    parcelas: plano.parcelas ? String(plano.parcelas) : '',
    dia_vencimento: String(plano.dia_vencimento || 10),
    primeira_mensalidade: plano.primeira_mensalidade || '',
    vencimento_matricula: plano.vencimento_matricula || '',
    observacao: plano.observacao || '',
  }
}

function condicaoParaFormulario(condicao) {
  if (!condicao) return { ...CONDICAO_VAZIA }
  return {
    tipo: condicao.tipo || 'TRANSFERENCIA',
    parcelas: condicao.parcelas != null ? String(condicao.parcelas) : '',
    primeira_mensalidade: condicao.primeira_mensalidade || '',
    valor_mensalidade: condicao.valor_mensalidade != null ? textoDoValor(condicao.valor_mensalidade) : '',
    cobra_matricula: condicao.cobra_matricula !== false,
    observacao: condicao.observacao || '',
  }
}

/** Frase do ajuste: o que a condição mexeu nas cobranças já existentes. */
function resumoDoAjuste(ajuste) {
  const partes = []
  if (ajuste.criadas) partes.push(`${ajuste.criadas} criada(s)`)
  if (ajuste.atualizadas) partes.push(`${ajuste.atualizadas} atualizada(s)`)
  if (ajuste.removidas) partes.push(`${ajuste.removidas} removida(s)`)
  if (ajuste.preservadas) partes.push(`${ajuste.preservadas} preservada(s) por já ter pagamento`)
  return partes.length ? `Cobranças: ${partes.join(', ')}.` : 'Nenhuma cobrança precisou mudar.'
}

export default function FinanceiroTurma() {
  const { codTur } = useParams()
  const navigate = useNavigate()
  const telaDesktop = useTelaDesktop()
  const telaCheia = useDialogoTelaCheia()

  const [dados, setDados] = useState(null)
  const [form, setForm] = useState({ ...PLANO_VAZIO })
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [confirmarGeracao, setConfirmarGeracao] = useState(false)
  const [alunoCondicao, setAlunoCondicao] = useState(null)
  const [formCondicao, setFormCondicao] = useState({ ...CONDICAO_VAZIA })
  const [salvandoCondicao, setSalvandoCondicao] = useState(false)
  const [msg, setMsg] = useState('')
  const [ehErro, setEhErro] = useState(true)
  const avisar = (texto, falhou = true) => { setEhErro(falhou); setMsg(texto) }

  const carregar = useCallback(() => {
    setCarregando(true)
    setErroCarga('')
    api.get(`/financeiro/turmas/${codTur}`)
      .then((resposta) => {
        setDados(resposta)
        setForm(planoParaFormulario(resposta.plano))
      })
      .catch((e) => setErroCarga(e.message))
      .finally(() => setCarregando(false))
  }, [codTur])

  useEffect(() => { carregar() }, [carregar])

  const parcelas = Number(form.parcelas || 0)
  const mensalidade = numeroDoCampo(form.valor_mensalidade) || 0
  const matricula = numeroDoCampo(form.valor_matricula) || 0
  const totalPorAluno = matricula + mensalidade * parcelas

  async function salvarPlano() {
    setSalvando(true)
    try {
      const resposta = await api.put(`/financeiro/turmas/${codTur}/plano`, {
        valor_matricula: matricula,
        valor_mensalidade: mensalidade,
        parcelas,
        dia_vencimento: Number(form.dia_vencimento || 10),
        primeira_mensalidade: form.primeira_mensalidade || null,
        vencimento_matricula: form.vencimento_matricula || null,
        observacao: form.observacao.trim() || null,
      })
      setDados((atual) => ({ ...atual, plano: resposta }))
      avisar('Plano salvo. Gere as cobranças para aplicá-lo aos alunos.', false)
    } catch (e) {
      avisar(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function gerar() {
    setGerando(true)
    try {
      const resultado = await api.post(`/financeiro/turmas/${codTur}/gerar`)
      setConfirmarGeracao(false)
      avisar(
        resultado.criadas
          ? `${resultado.criadas} cobrança(s) criada(s) para ${resultado.alunos} aluno(s).`
          : 'Nenhuma cobrança nova: todos os alunos já tinham as parcelas do plano.',
        false,
      )
      carregar()
    } catch (e) {
      avisar(e.message)
    } finally {
      setGerando(false)
    }
  }

  function abrirCondicao(aluno) {
    setFormCondicao(condicaoParaFormulario(aluno.condicao))
    setAlunoCondicao(aluno)
  }

  async function salvarCondicao() {
    setSalvandoCondicao(true)
    try {
      if (formCondicao.tipo === 'REGULAR') {
        if (!alunoCondicao.condicao) {
          setAlunoCondicao(null)
          return
        }
        const resposta = await api.del(`/financeiro/turmas/${codTur}/alunos/${alunoCondicao.cod_alu}/condicao`)
        avisar(`${alunoCondicao.nome} voltou ao plano da turma. ${resumoDoAjuste(resposta.ajuste)}`, false)
      } else {
        const resposta = await api.put(`/financeiro/turmas/${codTur}/alunos/${alunoCondicao.cod_alu}/condicao`, {
          tipo: 'TRANSFERENCIA',
          parcelas: formCondicao.parcelas === '' ? null : Number(formCondicao.parcelas),
          primeira_mensalidade: formCondicao.primeira_mensalidade || null,
          valor_mensalidade: formCondicao.valor_mensalidade === '' ? null : numeroDoCampo(formCondicao.valor_mensalidade),
          cobra_matricula: formCondicao.cobra_matricula,
          observacao: formCondicao.observacao.trim() || null,
          aplicar: true,
        })
        avisar(`Condição de ${alunoCondicao.nome} salva. ${resumoDoAjuste(resposta.ajuste)}`, false)
      }
      setAlunoCondicao(null)
      carregar()
    } catch (e) {
      avisar(e.message)
    } finally {
      setSalvandoCondicao(false)
    }
  }

  if (carregando && !dados) return <SkeletonCards quantidade={3} altura={160} />
  if (erroCarga && !dados) {
    return (
      <Box>
        <Box component="button" type="button" onClick={() => navigate('/financeiro')} sx={{ ...resetBotao, px: 0.5, color: TOV.caption, fontWeight: 600, mb: 1.5 }}>‹ Voltar para Financeiro</Box>
        <EstadoErro titulo="Não foi possível abrir esta turma" descricao={erroCarga} onTentarNovamente={carregar} />
      </Box>
    )
  }

  const alunos = dados.alunos || []
  const semPlano = !dados.plano
  const condicaoValida = formCondicao.tipo === 'REGULAR'
    || formCondicao.parcelas !== ''
    || formCondicao.primeira_mensalidade !== ''

  return (
    <Box>
      <Box
        component="button" type="button" onClick={() => navigate('/financeiro')}
        sx={{ ...resetBotao, minHeight: 44, px: 0.5, display: 'inline-flex', alignItems: 'center', fontSize: TOV.type.body, color: TOV.caption, fontWeight: 600, mb: 1.5, '&:hover': { color: TOV.coral } }}
      >
        ‹ Voltar para Financeiro
      </Box>

      <CabecalhoPagina
        eyebrow="Plano financeiro da turma"
        titulo={dados.turma.nome}
        descricao="A matrícula inicial e as mensalidades desta turma. Ao gerar, cada aluno matriculado recebe as parcelas que ainda não tem — quem veio de transferência recebe as dele."
        metadados={`${dados.matriculados} aluno(s) matriculado(s)${dados.transferencias ? ` · ${dados.transferencias} de transferência` : ''}`}
        acoes={(
          <Button
            variant="contained"
            startIcon={gerando ? <CircularProgress size={16} color="inherit" /> : <AutorenewIcon />}
            disabled={semPlano || gerando}
            onClick={() => setConfirmarGeracao(true)}
          >
            Gerar cobranças
          </Button>
        )}
      />

      {semPlano && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Esta turma ainda não tem plano. Informe os valores abaixo e salve antes de gerar as cobranças.
        </Alert>
      )}

      <Superficie sx={{ p: { xs: 2, sm: 3 }, mb: 2.5 }}>
        <Typography component="h2" variant="h3" sx={{ fontSize: TOV.type.titleSm, mb: 2 }}>Valores da turma</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))', lg: 'repeat(3,minmax(0,1fr))' }, gap: 2 }}>
          <TextField
            label="Matrícula inicial" value={form.valor_matricula}
            onChange={(e) => setForm({ ...form, valor_matricula: e.target.value })}
            InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
            inputProps={{ inputMode: 'decimal' }}
            helperText="Deixe zerado se a turma não cobra matrícula."
          />
          <TextField
            label="Vencimento da matrícula" type="date" value={form.vencimento_matricula}
            onChange={(e) => setForm({ ...form, vencimento_matricula: e.target.value })}
            InputLabelProps={{ shrink: true }}
            helperText="Sem data, vence no dia da geração."
          />
          <TextField
            label="Valor da mensalidade" value={form.valor_mensalidade}
            onChange={(e) => setForm({ ...form, valor_mensalidade: e.target.value })}
            InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
            inputProps={{ inputMode: 'decimal' }}
            helperText=" "
          />
          <TextField
            label="Quantidade de mensalidades" value={form.parcelas}
            onChange={(e) => setForm({ ...form, parcelas: e.target.value.replace(/\D/g, '').slice(0, 2) })}
            inputProps={{ inputMode: 'numeric' }}
            helperText="Uma cobrança por mês, a partir da primeira."
          />
          <TextField
            label="Primeira mensalidade" type="date" value={form.primeira_mensalidade}
            onChange={(e) => setForm({ ...form, primeira_mensalidade: e.target.value })}
            InputLabelProps={{ shrink: true }}
            helperText="Vence exatamente nesta data."
          />
          <TextField
            select label="Dia do vencimento" value={form.dia_vencimento}
            onChange={(e) => setForm({ ...form, dia_vencimento: e.target.value })}
            SelectProps={{ native: true }}
            helperText="Vale da segunda parcela em diante."
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((dia) => (
              <option key={dia} value={String(dia)}>Dia {dia}</option>
            ))}
          </TextField>
        </Box>
        <TextField
          fullWidth multiline minRows={2} label="Observação (opcional)" value={form.observacao}
          onChange={(e) => setForm({ ...form, observacao: e.target.value })}
          inputProps={{ maxLength: 2000 }}
          sx={{ mt: 2 }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mt: 2.5, pt: 2.5, borderTop: `1px solid ${TOV.divider}` }}>
          <Metadado
            rotulo="Total por aluno"
            valor={formatarMoeda(totalPorAluno)}
            nota={parcelas ? `${formatarMoeda(matricula)} de matrícula + ${parcelas}× ${formatarMoeda(mensalidade)}` : 'Só a matrícula'}
          />
          {dados.plano?.atualizado_em && (
            <Metadado
              rotulo="Última alteração"
              valor={new Date(dados.plano.atualizado_em).toLocaleDateString('pt-BR')}
              nota={dados.plano.atualizado_por ? `por ${dados.plano.atualizado_por}` : undefined}
            />
          )}
          <Button
            variant="contained"
            startIcon={salvando ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />}
            disabled={salvando}
            onClick={salvarPlano}
            sx={{ ml: { sm: 'auto' } }}
          >
            {salvando ? 'Salvando…' : 'Salvar plano'}
          </Button>
        </Box>
      </Superficie>

      <Typography component="h2" variant="h3" sx={{ fontSize: TOV.type.titleSm, mb: 0.5 }}>
        Situação de cada aluno
        <Box component="span" sx={{ color: TOV.caption, fontSize: TOV.type.body, fontWeight: 600 }}> · {alunos.length} matriculado(s)</Box>
      </Typography>
      <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mb: 1.5, maxWidth: '72ch' }}>
        Quem entrou com o curso andando e vai cursar só alguns módulos recebe uma condição própria: paga menos meses
        que a turma, a partir do mês em que entrou.
      </Typography>

      {!telaDesktop && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {alunos.length === 0 && (
            <CartaoLista><EstadoVazio compacto titulo="Nenhum aluno matriculado" descricao="Matricule alunos na turma para gerar as cobranças." /></CartaoLista>
          )}
          {alunos.map((aluno) => (
            <CartaoLista key={aluno.cod_alu}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Box
                    component="button" type="button"
                    onClick={() => navigate(`/financeiro/alunos/${aluno.cod_alu}`)}
                    sx={{ ...resetBotao, fontWeight: 700, fontSize: TOV.type.body, textAlign: 'left', overflowWrap: 'anywhere', '&:hover': { color: TOV.coral } }}
                  >
                    {aluno.nome}
                  </Box>
                  {aluno.transferencia && (
                    <StatusBadge tom="info" sx={{ mt: 0.5 }}>
                      Transferência · {aluno.mensalidades_previstas} mês(es)
                    </StatusBadge>
                  )}
                </Box>
                <SeloSituacao situacao={aluno.situacao} sx={{ flexShrink: 0 }} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, fontSize: TOV.type.body }}>
                <Box component="span" sx={{ color: TOV.caption }}>Matrícula</Box>
                <Box component="span" sx={{ fontWeight: 600 }}>
                  {aluno.matricula_paga == null ? 'Sem cobrança' : aluno.matricula_paga ? 'Paga' : 'Em aberto'}
                </Box>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, fontSize: TOV.type.body }}>
                <Box component="span" sx={{ color: TOV.caption }}>Pago · em aberto</Box>
                <Box component="span" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatarMoeda(aluno.pago)} · {formatarMoeda(aluno.em_aberto)}
                </Box>
              </Box>
              <Button size="small" variant="outlined" startIcon={<SwapHorizOutlinedIcon />} onClick={() => abrirCondicao(aluno)}>
                Condição de pagamento
              </Button>
            </CartaoLista>
          ))}
        </Box>
      )}

      {telaDesktop && (
        <TableContainer component={Box} sx={{ ...cardSx, overflowX: 'auto' }}>
          <Table sx={{ minWidth: 980 }}>
            <TableHead>
              <TableRow>
                <TableCell>Aluno</TableCell>
                <TableCell>Condição</TableCell>
                <TableCell align="center">Matrícula</TableCell>
                <TableCell align="right">Pago</TableCell>
                <TableCell align="right">Em aberto</TableCell>
                <TableCell>Próximo vencimento</TableCell>
                <TableCell>Situação</TableCell>
                <TableCell align="right">Ação</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {carregando && alunos.length === 0 && <LinhasSkeleton colunas={8} />}
              {!carregando && alunos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} sx={{ p: 0 }}>
                    <EstadoVazio titulo="Nenhum aluno matriculado" descricao="Matricule alunos na turma para gerar as cobranças." />
                  </TableCell>
                </TableRow>
              )}
              {alunos.map((aluno) => (
                <TableRow key={aluno.cod_alu} hover>
                  <TableCell>
                    <Box
                      component="button" type="button"
                      onClick={() => navigate(`/financeiro/alunos/${aluno.cod_alu}`)}
                      sx={{ ...resetBotao, fontWeight: 600, textAlign: 'left', '&:hover': { color: TOV.coral } }}
                    >
                      {aluno.nome}
                    </Box>
                    <Box sx={{ fontSize: TOV.type.caption, color: TOV.caption }}>{aluno.cobrancas} cobrança(s)</Box>
                  </TableCell>
                  <TableCell>
                    {aluno.transferencia ? (
                      <StatusBadge tom="info">Transferência · {aluno.mensalidades_previstas} mês(es)</StatusBadge>
                    ) : (
                      <Box component="span" sx={{ fontSize: TOV.type.bodySm, color: TOV.caption }}>
                        Plano da turma{aluno.mensalidades_previstas ? ` · ${aluno.mensalidades_previstas} mês(es)` : ''}
                      </Box>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {aluno.matricula_paga == null ? (
                      <Box component="span" sx={{ fontSize: TOV.type.bodySm, color: TOV.caption }}>—</Box>
                    ) : aluno.matricula_paga ? (
                      <CheckCircleOutlineIcon aria-label="Matrícula paga" sx={{ color: TOV.success, fontSize: TOV.type.titleSm, verticalAlign: 'middle' }} />
                    ) : (
                      <RadioButtonUncheckedIcon aria-label="Matrícula em aberto" sx={{ color: TOV.caption, fontSize: TOV.type.titleSm, verticalAlign: 'middle' }} />
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatarMoeda(aluno.pago)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{formatarMoeda(aluno.em_aberto)}</TableCell>
                  <TableCell sx={{ color: TOV.graphite, whiteSpace: 'nowrap' }}>
                    {aluno.proximo_vencimento ? formatarDataBr(aluno.proximo_vencimento) : '—'}
                  </TableCell>
                  <TableCell><SeloSituacao situacao={aluno.situacao} /></TableCell>
                  <TableCell align="right">
                    <Box
                      component="button" type="button"
                      onClick={() => abrirCondicao(aluno)}
                      sx={{ ...resetBotao, fontSize: TOV.type.bodySm, fontWeight: 600, color: TOV.caption, '&:hover': { color: TOV.coral } }}
                    >
                      Condição
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={!!alunoCondicao}
        onClose={salvandoCondicao ? undefined : () => setAlunoCondicao(null)}
        maxWidth="sm" fullWidth fullScreen={telaCheia}
      >
        <DialogTitle>Condição de pagamento — {alunoCondicao?.nome}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <GrupoSegmentado
            rotulo="Condição do aluno"
            opcoes={TIPOS_CONDICAO}
            valor={formCondicao.tipo}
            onChange={(valor) => setFormCondicao({ ...formCondicao, tipo: valor })}
            sx={{ alignSelf: 'flex-start' }}
          />

          {formCondicao.tipo === 'REGULAR' ? (
            <Alert severity="info">
              O aluno paga a matrícula e as {dados.plano?.parcelas || 0} mensalidade(s) da turma, como todo mundo.
              {alunoCondicao?.condicao && ' Salvar devolve as parcelas que tinham sido cortadas.'}
            </Alert>
          ) : (
            <>
              <Alert severity="info">
                Aluno que entra com o curso andando: informe quantos meses ele ainda vai cursar e a partir de quando.
                O que ficar em branco segue o plano da turma.
              </Alert>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <TextField
                  label="Mensalidades a pagar" value={formCondicao.parcelas}
                  onChange={(e) => setFormCondicao({ ...formCondicao, parcelas: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                  inputProps={{ inputMode: 'numeric' }}
                  helperText={`A turma tem ${dados.plano?.parcelas || 0}.`}
                />
                <TextField
                  label="Primeira mensalidade" type="date" value={formCondicao.primeira_mensalidade}
                  onChange={(e) => setFormCondicao({ ...formCondicao, primeira_mensalidade: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  helperText="O mês em que ele entrou."
                />
              </Box>
              <TextField
                label="Mensalidade própria (opcional)" value={formCondicao.valor_mensalidade}
                onChange={(e) => setFormCondicao({ ...formCondicao, valor_mensalidade: e.target.value })}
                InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
                inputProps={{ inputMode: 'decimal' }}
                helperText={`Em branco usa a da turma (${formatarMoeda(dados.plano?.valor_mensalidade || 0)}).`}
              />
              <FormControlLabel
                control={(
                  <Switch
                    checked={formCondicao.cobra_matricula}
                    onChange={(e) => setFormCondicao({ ...formCondicao, cobra_matricula: e.target.checked })}
                  />
                )}
                label="Cobrar a matrícula inicial deste aluno"
              />
              <TextField
                label="Observação (opcional)" value={formCondicao.observacao} multiline minRows={2}
                onChange={(e) => setFormCondicao({ ...formCondicao, observacao: e.target.value })}
                inputProps={{ maxLength: 2000 }}
              />
              {!condicaoValida && (
                <Alert severity="warning">Informe quantas mensalidades ele vai pagar ou a partir de qual mês.</Alert>
              )}
            </>
          )}

          <Alert severity="warning" icon={false}>
            As cobranças já geradas são ajustadas na hora: as que sobrarem do novo plano são removidas e as demais
            ganham o valor e o vencimento certos. Parcela que já tem pagamento nunca é apagada.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setAlunoCondicao(null)} disabled={salvandoCondicao}>Cancelar</Button>
          <Button
            variant="contained"
            startIcon={salvandoCondicao ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />}
            disabled={!condicaoValida || salvandoCondicao}
            onClick={salvarCondicao}
          >
            {salvandoCondicao ? 'Aplicando…' : 'Salvar condição'}
          </Button>
        </DialogActions>
      </Dialog>

      <DialogoConfirmacao
        aberto={confirmarGeracao}
        titulo="Gerar cobranças da turma?"
        descricao="Cada aluno matriculado recebe a matrícula e as mensalidades que ainda não tem. Quem já foi cobrado não é duplicado e quem tem condição própria recebe as parcelas dele."
        itens={[
          { rotulo: 'Alunos matriculados', detalhe: String(dados.matriculados) },
          { rotulo: 'Alunos de transferência', detalhe: String(dados.transferencias || 0) },
          { rotulo: 'Matrícula', detalhe: formatarMoeda(matricula) },
          { rotulo: 'Mensalidades', detalhe: parcelas ? `${parcelas}× ${formatarMoeda(mensalidade)}` : 'nenhuma' },
          { rotulo: 'Total por aluno regular', detalhe: formatarMoeda(totalPorAluno) },
        ]}
        rotuloConfirmar="Gerar cobranças"
        processando={gerando}
        onConfirmar={gerar}
        onFechar={() => !gerando && setConfirmarGeracao(false)}
      />

      <Snackbar open={!!msg} autoHideDuration={8000} onClose={() => setMsg('')}>
        <Alert severity={ehErro ? 'error' : 'success'} onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
