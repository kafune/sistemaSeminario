import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, InputAdornment, MenuItem, Snackbar, Switch,
  TextField, Typography,
} from '@mui/material'
import AddCardOutlinedIcon from '@mui/icons-material/AddCardOutlined'
import PixIcon from '@mui/icons-material/Pix'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined'
import { api } from '../api'
import { TOV } from '../theme'
import {
  BarraFiltros, CabecalhoPagina, EstadoVazio, GrupoSegmentado, SkeletonCards,
  StatusBadge, Superficie, cardSx, resetBotao, useDialogoTelaCheia,
} from '../ui'
import { formatarDataBr, formatarMoeda } from '../formatters'
import { SeloSituacao, hojeIso, numeroDoCampo } from './FinanceiroComum'

const FILTROS = [
  { valor: 'PENDENTE', rotulo: 'A conciliar' },
  { valor: 'CONCILIADA', rotulo: 'Conciliadas' },
  { valor: 'IGNORADA', rotulo: 'Ignoradas' },
  { valor: 'TODOS', rotulo: 'Todas' },
]

const MANUAL_VAZIO = {
  identificador: '',
  meio: 'PIX',
  valor: '',
  data: hojeIso(),
  pagador_nome: '',
  pagador_documento: '',
  referencia: '',
  descricao: '',
}

export default function FinanceiroConciliacao() {
  const navigate = useNavigate()
  const telaCheia = useDialogoTelaCheia()

  const [filtro, setFiltro] = useState('PENDENTE')
  const [dados, setDados] = useState({ transacoes: [], pendentes: 0 })
  const [config, setConfig] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [salvandoConfig, setSalvandoConfig] = useState(false)
  const [processando, setProcessando] = useState(null)
  const [manualAberto, setManualAberto] = useState(false)
  const [manual, setManual] = useState({ ...MANUAL_VAZIO })
  const [msg, setMsg] = useState('')
  const [ehErro, setEhErro] = useState(true)
  const avisar = (texto, falhou = true) => { setEhErro(falhou); setMsg(texto) }

  const carregar = useCallback(() => {
    setCarregando(true)
    api.get(`/financeiro/conciliacao?status=${filtro}`)
      .then(setDados)
      .catch((e) => avisar(e.message))
      .finally(() => setCarregando(false))
  }, [filtro])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    api.get('/financeiro/configuracao').then(setConfig).catch(() => setConfig(null))
  }, [])

  async function salvarConfiguracao() {
    setSalvandoConfig(true)
    try {
      const resposta = await api.put('/financeiro/configuracao', {
        beneficiario: config.beneficiario || null,
        chave_pix: config.chave_pix || null,
        instrucoes: config.instrucoes || null,
        conciliacao_automatica: !!config.conciliacao_automatica,
        tolerancia_dias: Number(config.tolerancia_dias || 0),
      })
      setConfig(resposta)
      avisar('Dados de recebimento salvos.', false)
    } catch (e) {
      avisar(e.message)
    } finally {
      setSalvandoConfig(false)
    }
  }

  async function executar(id, acao, corpo) {
    setProcessando(id)
    try {
      await api.post(`/financeiro/conciliacao/${id}/${acao}`, corpo)
      avisar(
        acao === 'vincular' ? 'Recebimento conciliado e cobrança quitada.'
          : acao === 'ignorar' ? 'Recebimento marcado como não pertinente.'
            : 'Recebimento devolvido para a fila.',
        false,
      )
      carregar()
    } catch (e) {
      avisar(e.message)
    } finally {
      setProcessando(null)
    }
  }

  async function registrarManual() {
    setProcessando('manual')
    try {
      const resposta = await api.post('/financeiro/conciliacao/manual', {
        identificador: manual.identificador.trim(),
        meio: manual.meio,
        valor: numeroDoCampo(manual.valor),
        data: manual.data || null,
        pagador_nome: manual.pagador_nome.trim() || null,
        pagador_documento: manual.pagador_documento.trim() || null,
        referencia: manual.referencia.trim().toUpperCase() || null,
        descricao: manual.descricao.trim() || null,
      })
      setManualAberto(false)
      avisar(
        resposta.status === 'CONCILIADA'
          ? 'Recebimento lançado e cobrança quitada automaticamente.'
          : `Recebimento na fila: ${resposta.motivo || 'aguardando conciliação'}.`,
        false,
      )
      carregar()
    } catch (e) {
      avisar(e.message)
    } finally {
      setProcessando(null)
    }
  }

  const transacoes = dados.transacoes || []
  const manualValido = manual.identificador.trim().length >= 6 && numeroDoCampo(manual.valor) > 0

  return (
    <Box>
      <Box
        component="button" type="button" onClick={() => navigate('/financeiro')}
        sx={{ ...resetBotao, minHeight: 44, px: 0.5, display: 'inline-flex', alignItems: 'center', fontSize: TOV.type.body, color: TOV.caption, fontWeight: 600, mb: 1.5, '&:hover': { color: TOV.coral } }}
      >
        ‹ Voltar para Financeiro
      </Box>

      <CabecalhoPagina
        variante="operacional"
        titulo="Conciliação bancária"
        descricao="PIX e boletos que o banco informou. O que o sistema identifica sozinho já entra como pago; o resto espera alguém apontar o título."
        metadados={carregando ? ' ' : `${dados.pendentes} aguardando conciliação`}
        acoes={(
          <Button variant="contained" startIcon={<AddCardOutlinedIcon />} onClick={() => { setManual({ ...MANUAL_VAZIO }); setManualAberto(true) }}>
            Lançar recebimento
          </Button>
        )}
      />

      {config && !config.webhook_configurado && (
        <Alert severity="info" sx={{ mb: 2 }}>
          O banco ainda não está conectado. Defina <strong>TOV_BANCO_WEBHOOK_SECRET</strong> no servidor e aponte o
          provedor para <strong>{config.webhook_url}</strong>. Até lá, use “Lançar recebimento” para trazer o que
          aparecer no extrato.
        </Alert>
      )}

      {config && (
        <Superficie sx={{ p: { xs: 2, sm: 2.5 }, mb: 2.5 }}>
          <Typography component="h2" variant="h3" sx={{ fontSize: TOV.type.titleSm, mb: 0.5 }}>Dados de recebimento</Typography>
          <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mb: 2, maxWidth: '72ch' }}>
            É o que o aluno vê na consulta dele. Peça que informe o código da cobrança (TOV000123) na mensagem do PIX —
            é assim que o pagamento se identifica sozinho.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2,minmax(0,1fr))' }, gap: 2 }}>
            <TextField
              label="Beneficiário" value={config.beneficiario || ''}
              onChange={(e) => setConfig({ ...config, beneficiario: e.target.value })}
              inputProps={{ maxLength: 120 }}
            />
            <TextField
              label="Chave PIX" value={config.chave_pix || ''}
              onChange={(e) => setConfig({ ...config, chave_pix: e.target.value })}
              inputProps={{ maxLength: 140 }}
            />
          </Box>
          <TextField
            fullWidth multiline minRows={2} label="Instruções para o aluno" value={config.instrucoes || ''}
            onChange={(e) => setConfig({ ...config, instrucoes: e.target.value })}
            inputProps={{ maxLength: 2000 }}
            sx={{ mt: 2 }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap', mt: 2 }}>
            <FormControlLabel
              control={(
                <Switch
                  checked={!!config.conciliacao_automatica}
                  onChange={(e) => setConfig({ ...config, conciliacao_automatica: e.target.checked })}
                />
              )}
              label="Dar baixa automática quando o pagamento for identificado"
            />
            <TextField
              label="Tolerância de dias" type="number" value={config.tolerancia_dias ?? 5}
              onChange={(e) => setConfig({ ...config, tolerancia_dias: e.target.value })}
              inputProps={{ min: 0, max: 30 }}
              helperText="Distância aceita entre crédito e vencimento."
              sx={{ maxWidth: 220 }}
            />
            <Button
              variant="contained"
              startIcon={salvandoConfig ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />}
              disabled={salvandoConfig}
              onClick={salvarConfiguracao}
              sx={{ ml: { md: 'auto' } }}
            >
              Salvar
            </Button>
          </Box>
        </Superficie>
      )}

      <BarraFiltros>
        <GrupoSegmentado rotulo="Situação do recebimento" opcoes={FILTROS} valor={filtro} onChange={setFiltro} />
        <Typography sx={{ ml: { sm: 'auto' }, color: TOV.caption, fontSize: TOV.type.bodySm }}>
          {transacoes.length} recebimento(s)
        </Typography>
      </BarraFiltros>

      {carregando && transacoes.length === 0 && <SkeletonCards quantidade={3} altura={180} colunas="1fr" />}

      {!carregando && transacoes.length === 0 && (
        <Box sx={cardSx}>
          <EstadoVazio
            titulo={filtro === 'PENDENTE' ? 'Nada esperando conciliação' : 'Nenhum recebimento neste recorte'}
            descricao={filtro === 'PENDENTE'
              ? 'Todo pagamento informado pelo banco já foi identificado ou tratado.'
              : 'Troque o recorte para ver os demais recebimentos.'}
          />
        </Box>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {transacoes.map((item) => (
          <Box key={item.id} component="article" sx={{ ...cardSx, p: { xs: 2, sm: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
              <Box aria-hidden="true" sx={{ width: 46, height: 46, borderRadius: TOV.radiusSm, bgcolor: TOV.graphiteTint, color: TOV.graphite, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                {item.meio === 'BOLETO' ? <ReceiptLongOutlinedIcon /> : <PixIcon />}
              </Box>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Typography component="h2" sx={{ fontWeight: 700, fontSize: TOV.type.bodyLg, fontVariantNumeric: 'tabular-nums' }}>
                    {formatarMoeda(item.valor)}
                  </Typography>
                  <StatusBadge tom="neutral">{item.meio === 'BOLETO' ? 'Boleto' : 'PIX'}</StatusBadge>
                  <SeloSituacao situacao={item.status} />
                </Box>
                <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 0.5, overflowWrap: 'anywhere' }}>
                  {formatarDataBr(item.data)} · {item.pagador_nome || 'Pagador não informado'}
                  {item.pagador_documento ? ` · ${item.pagador_documento}` : ''}
                </Typography>
                <Typography sx={{ color: TOV.caption, fontSize: TOV.type.caption, mt: 0.5, overflowWrap: 'anywhere', fontFamily: TOV.fontMono }}>
                  {item.identificador}{item.descricao ? ` · ${item.descricao}` : ''}
                </Typography>
                {item.motivo && (
                  <Typography sx={{ color: TOV.graphite, fontSize: TOV.type.bodySm, mt: 1 }}>{item.motivo}</Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {item.status === 'PENDENTE' && (
                  <Button size="small" color="error" disabled={processando === item.id} onClick={() => executar(item.id, 'ignorar')}>
                    Ignorar
                  </Button>
                )}
                {item.status === 'IGNORADA' && (
                  <Button size="small" variant="outlined" disabled={processando === item.id} onClick={() => executar(item.id, 'reabrir')}>
                    Devolver para a fila
                  </Button>
                )}
                {item.status === 'CONCILIADA' && item.cobranca_id && (
                  <Button size="small" variant="outlined" onClick={() => navigate('/financeiro')}>
                    Ver cobranças
                  </Button>
                )}
              </Box>
            </Box>

            {item.status === 'PENDENTE' && (
              <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${TOV.divider}` }}>
                <Typography sx={{ fontSize: TOV.type.bodySm, fontWeight: 700, mb: 1 }}>
                  {item.sugestoes.length ? 'A qual cobrança este valor pertence?' : 'Nenhuma cobrança compatível encontrada'}
                </Typography>
                {item.sugestoes.length === 0 && (
                  <Typography sx={{ fontSize: TOV.type.bodySm, color: TOV.caption }}>
                    Localize o título pela lista de cobranças e lance a baixa por lá, ou marque este recebimento como
                    não pertinente.
                  </Typography>
                )}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {item.sugestoes.map((sugestao) => (
                    <Box
                      key={sugestao.id}
                      sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 1.5, flexWrap: 'wrap',
                        p: 1.5, borderRadius: TOV.radiusSm, border: `1px solid ${TOV.divider}`, bgcolor: TOV.canvas,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ fontWeight: 700, fontSize: TOV.type.bodySm, overflowWrap: 'anywhere' }}>{sugestao.aluno_nome}</Box>
                        <Box sx={{ fontSize: TOV.type.caption, color: TOV.caption, overflowWrap: 'anywhere' }}>
                          {sugestao.descricao} · vence {formatarDataBr(sugestao.vencimento)} · saldo {formatarMoeda(sugestao.saldo)} · {sugestao.referencia}
                        </Box>
                      </Box>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={processando === item.id}
                        onClick={() => executar(item.id, 'vincular', { cobranca_id: sugestao.id })}
                      >
                        Dar baixa
                      </Button>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      <Dialog open={manualAberto} onClose={processando ? undefined : () => setManualAberto(false)} maxWidth="sm" fullWidth fullScreen={telaCheia}>
        <DialogTitle>Lançar recebimento do extrato</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <Alert severity="info">
            Passa pela mesma identificação automática do banco: com o código da cobrança ou o CPF do pagador, a baixa
            sai na hora.
          </Alert>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' }, gap: 2 }}>
            <TextField
              label="Identificador no extrato" value={manual.identificador}
              onChange={(e) => setManual({ ...manual, identificador: e.target.value })}
              helperText="E2E do PIX ou nosso número do boleto."
              inputProps={{ maxLength: 80 }}
            />
            <TextField select label="Meio" value={manual.meio} onChange={(e) => setManual({ ...manual, meio: e.target.value })}>
              <MenuItem value="PIX">PIX</MenuItem>
              <MenuItem value="BOLETO">Boleto</MenuItem>
            </TextField>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField
              label="Valor" value={manual.valor}
              onChange={(e) => setManual({ ...manual, valor: e.target.value })}
              InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
              inputProps={{ inputMode: 'decimal' }}
            />
            <TextField
              label="Data do crédito" type="date" value={manual.data}
              onChange={(e) => setManual({ ...manual, data: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField
              label="Nome do pagador" value={manual.pagador_nome}
              onChange={(e) => setManual({ ...manual, pagador_nome: e.target.value })}
              inputProps={{ maxLength: 120 }}
            />
            <TextField
              label="CPF do pagador" value={manual.pagador_documento}
              onChange={(e) => setManual({ ...manual, pagador_documento: e.target.value })}
              inputProps={{ maxLength: 20 }}
            />
          </Box>
          <TextField
            label="Código da cobrança (opcional)" value={manual.referencia}
            onChange={(e) => setManual({ ...manual, referencia: e.target.value })}
            helperText="Ex.: TOV000123 — dispensa qualquer outra pista."
            inputProps={{ maxLength: 20 }}
          />
          <TextField
            label="Descrição do lançamento" value={manual.descricao}
            onChange={(e) => setManual({ ...manual, descricao: e.target.value })}
            inputProps={{ maxLength: 255 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setManualAberto(false)} disabled={processando === 'manual'}>Cancelar</Button>
          <Button variant="contained" disabled={!manualValido || processando === 'manual'} onClick={registrarManual}>
            {processando === 'manual' ? 'Lançando…' : 'Lançar recebimento'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg('')}>
        <Alert severity={ehErro ? 'error' : 'success'} onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
