import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Box, Button, CircularProgress, InputAdornment, Snackbar, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Typography,
} from '@mui/material'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined'
import { api } from '../api'
import { TOV } from '../theme'
import {
  CabecalhoPagina, CartaoLista, DialogoConfirmacao, EstadoErro, EstadoVazio,
  LinhasSkeleton, Metadado, SkeletonCards, Superficie, cardSx, resetBotao,
  useTelaDesktop,
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

export default function FinanceiroTurma() {
  const { codTur } = useParams()
  const navigate = useNavigate()
  const telaDesktop = useTelaDesktop()

  const [dados, setDados] = useState(null)
  const [form, setForm] = useState({ ...PLANO_VAZIO })
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [confirmarGeracao, setConfirmarGeracao] = useState(false)
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

  async function gerar(codAlu) {
    setGerando(true)
    try {
      const sufixo = codAlu ? `?cod_alu=${codAlu}` : ''
      const resultado = await api.post(`/financeiro/turmas/${codTur}/gerar${sufixo}`)
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
        descricao="A matrícula inicial e as mensalidades desta turma. Ao gerar, cada aluno matriculado recebe as parcelas que ainda não tem."
        metadados={`${dados.matriculados} aluno(s) matriculado(s)`}
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
            helperText="Define o mês da parcela 1."
          />
          <TextField
            select label="Dia do vencimento" value={form.dia_vencimento}
            onChange={(e) => setForm({ ...form, dia_vencimento: e.target.value })}
            SelectProps={{ native: true }}
            helperText="Vale para as parcelas seguintes."
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

      <Typography component="h2" variant="h3" sx={{ fontSize: TOV.type.titleSm, mb: 1.5 }}>
        Situação de cada aluno
        <Box component="span" sx={{ color: TOV.caption, fontSize: TOV.type.body, fontWeight: 600 }}> · {alunos.length} matriculado(s)</Box>
      </Typography>

      {!telaDesktop && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {alunos.length === 0 && (
            <CartaoLista><EstadoVazio compacto titulo="Nenhum aluno matriculado" descricao="Matricule alunos na turma para gerar as cobranças." /></CartaoLista>
          )}
          {alunos.map((aluno) => (
            <CartaoLista key={aluno.cod_alu} onClick={() => navigate(`/financeiro/alunos/${aluno.cod_alu}`)}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                <Box sx={{ minWidth: 0, fontWeight: 700, fontSize: TOV.type.body, overflowWrap: 'anywhere' }}>{aluno.nome}</Box>
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
            </CartaoLista>
          ))}
        </Box>
      )}

      {telaDesktop && (
        <TableContainer component={Box} sx={{ ...cardSx, overflowX: 'auto' }}>
          <Table sx={{ minWidth: 860 }}>
            <TableHead>
              <TableRow>
                <TableCell>Aluno</TableCell>
                <TableCell align="center">Matrícula</TableCell>
                <TableCell align="right">Cobranças</TableCell>
                <TableCell align="right">Pago</TableCell>
                <TableCell align="right">Em aberto</TableCell>
                <TableCell>Próximo vencimento</TableCell>
                <TableCell>Situação</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {carregando && alunos.length === 0 && <LinhasSkeleton colunas={7} />}
              {!carregando && alunos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} sx={{ p: 0 }}>
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
                  <TableCell align="right" sx={{ color: TOV.graphite }}>{aluno.cobrancas}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatarMoeda(aluno.pago)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{formatarMoeda(aluno.em_aberto)}</TableCell>
                  <TableCell sx={{ color: TOV.graphite, whiteSpace: 'nowrap' }}>
                    {aluno.proximo_vencimento ? formatarDataBr(aluno.proximo_vencimento) : '—'}
                  </TableCell>
                  <TableCell><SeloSituacao situacao={aluno.situacao} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <DialogoConfirmacao
        aberto={confirmarGeracao}
        titulo="Gerar cobranças da turma?"
        descricao="Cada aluno matriculado recebe a matrícula e as mensalidades que ainda não tem. Quem já foi cobrado não é duplicado."
        itens={[
          { rotulo: 'Alunos matriculados', detalhe: String(dados.matriculados) },
          { rotulo: 'Matrícula', detalhe: formatarMoeda(matricula) },
          { rotulo: 'Mensalidades', detalhe: parcelas ? `${parcelas}× ${formatarMoeda(mensalidade)}` : 'nenhuma' },
          { rotulo: 'Total por aluno', detalhe: formatarMoeda(totalPorAluno) },
        ]}
        rotuloConfirmar="Gerar cobranças"
        processando={gerando}
        onConfirmar={() => gerar(null)}
        onFechar={() => !gerando && setConfirmarGeracao(false)}
      />

      <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg('')}>
        <Alert severity={ehErro ? 'error' : 'success'} onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
