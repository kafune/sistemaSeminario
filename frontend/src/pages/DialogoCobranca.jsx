import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  InputAdornment, TextField, Typography,
} from '@mui/material'
import { api } from '../api'
import { TOV } from '../theme'
import {
  DialogoConfirmacao, GrupoSegmentado, TituloDialogo, acaoTabelaSx,
  useDialogoTelaCheia,
} from '../ui'
import { formatarDataBr, formatarDataHora, formatarMoeda } from '../formatters'
import { SeloSituacao, numeroDoCampo, rotuloForma, textoDoValor } from './FinanceiroComum'

const ABAS = [
  { valor: 'dados', rotulo: 'Dados' },
  { valor: 'baixas', rotulo: 'Baixas' },
  { valor: 'situacao', rotulo: 'Situação' },
]

const SITUACOES_MANUAIS = [
  {
    valor: 'CANCELADA',
    rotulo: 'Cancelar',
    descricao: 'O título deixa de ser cobrado e some do que está a receber. Use quando a cobrança não deveria existir.',
  },
  {
    valor: 'ISENTA',
    rotulo: 'Isentar',
    descricao: 'O título continua no histórico do aluno, marcado como perdoado. Use para bolsa integral ou acordo.',
  },
  {
    valor: 'ABERTA',
    rotulo: 'Reabrir',
    descricao: 'Devolve o título para a régua de cobrança, com o mesmo valor e vencimento.',
  },
]

/**
 * Gestão de um título: corrigir, ver as baixas, cancelar/isentar/reabrir e
 * excluir. Quatro endpoints que existiam e testados desde sempre, sem nenhuma
 * tela — corrigir o vencimento de uma cobrança só era possível no banco
 * (AUDITORIA.md G1).
 */
export default function DialogoCobranca({ cobranca, onFechar, onAlterado }) {
  const telaCheia = useDialogoTelaCheia()
  const [aba, setAba] = useState('dados')
  const [form, setForm] = useState({ descricao: '', valor: '', vencimento: '', observacao: '' })
  const [pagamentos, setPagamentos] = useState(null)
  const [carregandoPagamentos, setCarregandoPagamentos] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  const [excluindo, setExcluindo] = useState(false)

  useEffect(() => {
    if (!cobranca) return
    setAba('dados')
    setErro('')
    setPagamentos(null)
    setForm({
      descricao: cobranca.descricao || '',
      valor: textoDoValor(cobranca.valor),
      vencimento: cobranca.vencimento || '',
      observacao: cobranca.observacao || '',
    })
  }, [cobranca])

  useEffect(() => {
    if (!cobranca || aba !== 'baixas' || pagamentos) return
    setCarregandoPagamentos(true)
    api.get(`/financeiro/cobrancas/${cobranca.id}/pagamentos`)
      .then(setPagamentos)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregandoPagamentos(false))
  }, [cobranca, aba, pagamentos])

  if (!cobranca) return null

  // `saldo` vem zerado em título cancelado/isento, então o baixado sai do
  // campo `pago` da API, não da diferença.
  const pago = Number(cobranca.pago || 0)
  const temBaixa = pago > 0.001
  const novoValor = numeroDoCampo(form.valor)
  const valorAbaixoDoPago = novoValor != null && novoValor + 0.001 < pago
  const podeSalvar = Boolean(form.descricao.trim()) && novoValor > 0 && form.vencimento
    && !valorAbaixoDoPago && !processando

  async function executar(acao, mensagem) {
    setProcessando(true)
    setErro('')
    try {
      await acao()
      onAlterado(mensagem)
      onFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setProcessando(false)
    }
  }

  const salvar = () => executar(
    () => api.put(`/financeiro/cobrancas/${cobranca.id}`, {
      descricao: form.descricao.trim(),
      valor: novoValor,
      vencimento: form.vencimento,
      observacao: form.observacao.trim() || null,
    }),
    'Cobrança atualizada.',
  )

  const alterarSituacao = (status, rotulo) => executar(
    () => api.put(`/financeiro/cobrancas/${cobranca.id}/status`, { status }),
    `Cobrança ${rotulo}.`,
  )

  const excluir = () => executar(
    () => api.del(`/financeiro/cobrancas/${cobranca.id}`),
    'Cobrança excluída.',
  )

  return (
    <>
      <Dialog
        open
        onClose={processando ? undefined : onFechar}
        maxWidth="sm"
        fullWidth
        fullScreen={telaCheia}
      >
        <TituloDialogo onFechar={processando ? undefined : onFechar}>Gerenciar cobrança</TituloDialogo>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <Box sx={{ border: `1px solid ${TOV.divider}`, borderRadius: TOV.radiusSm, p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
              <Typography sx={{ fontWeight: 700, fontSize: TOV.type.body, minWidth: 0, overflowWrap: 'anywhere' }}>
                {cobranca.aluno_nome || cobranca.descricao}
              </Typography>
              <SeloSituacao situacao={cobranca.situacao} sx={{ flexShrink: 0 }} />
            </Box>
            <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 0.5 }}>
              {cobranca.descricao} · vence {formatarDataBr(cobranca.vencimento)} · código {cobranca.referencia || '—'}
            </Typography>
            <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 0.5 }}>
              {formatarMoeda(cobranca.valor)} · {formatarMoeda(pago)} baixado · saldo de {formatarMoeda(cobranca.saldo)}
            </Typography>
          </Box>

          <GrupoSegmentado rotulo="Seção" opcoes={ABAS} valor={aba} onChange={setAba} />

          {erro && <Alert severity="error" onClose={() => setErro('')}>{erro}</Alert>}

          {aba === 'dados' && (
            <>
              <TextField
                label="Descrição" value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                inputProps={{ maxLength: 120 }}
              />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <TextField
                  label="Valor" value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  error={valorAbaixoDoPago}
                  helperText={valorAbaixoDoPago
                    ? `Já foram baixados ${formatarMoeda(pago)} nesta cobrança.`
                    : ' '}
                  InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
                  inputProps={{ inputMode: 'decimal' }}
                />
                <TextField
                  label="Vencimento" type="date" value={form.vencimento}
                  onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
                  helperText="Mudar o vencimento move a competência junto."
                  InputLabelProps={{ shrink: true }}
                />
              </Box>
              <TextField
                label="Observação (opcional)" value={form.observacao} multiline minRows={2}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                inputProps={{ maxLength: 2000 }}
              />
            </>
          )}

          {aba === 'baixas' && (
            <>
              {carregandoPagamentos && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: TOV.caption, fontSize: TOV.type.bodySm }}>
                  <CircularProgress size={16} /> Carregando as baixas…
                </Box>
              )}
              {pagamentos?.length === 0 && (
                <Typography sx={{ color: TOV.caption, fontSize: TOV.type.body }}>
                  Nenhum pagamento lançado nesta cobrança.
                </Typography>
              )}
              {pagamentos?.length > 0 && (
                <Box sx={{ border: `1px solid ${TOV.divider}`, borderRadius: TOV.radiusSm, overflow: 'hidden' }}>
                  {pagamentos.map((pagamento, indice) => (
                    <Box
                      key={pagamento.id}
                      sx={{
                        p: 2, borderTop: indice > 0 ? `1px solid ${TOV.divider}` : 0,
                        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ fontWeight: 700, fontSize: TOV.type.body, fontVariantNumeric: 'tabular-nums' }}>
                          {formatarMoeda(pagamento.valor)}
                        </Box>
                        <Box sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 0.5 }}>
                          {formatarDataBr(pagamento.data_pagamento)} · {rotuloForma(pagamento.forma)}
                          {pagamento.transacao_id ? ' · conciliado com o banco' : ''}
                        </Box>
                        <Box sx={{ color: TOV.caption, fontSize: TOV.type.caption, mt: 0.5, overflowWrap: 'anywhere' }}>
                          {[
                            pagamento.registrado_por ? `por ${pagamento.registrado_por}` : null,
                            pagamento.registrado_em ? formatarDataHora(pagamento.registrado_em) : null,
                            pagamento.observacao,
                          ].filter(Boolean).join(' · ') || '—'}
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </>
          )}

          {aba === 'situacao' && (
            <>
              {temBaixa && (
                <Alert severity="warning">
                  Esta cobrança tem {formatarMoeda(pago)} baixados. Estorne o pagamento no extrato do
                  aluno antes de cancelar, isentar ou excluir.
                </Alert>
              )}
              {SITUACOES_MANUAIS
                .filter((item) => item.valor !== cobranca.status)
                .map((item) => (
                  <Box
                    key={item.valor}
                    sx={{ border: `1px solid ${TOV.divider}`, borderRadius: TOV.radiusSm, p: 2 }}
                  >
                    <Typography sx={{ fontWeight: 700, fontSize: TOV.type.body }}>{item.rotulo}</Typography>
                    <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 0.5 }}>
                      {item.descricao}
                    </Typography>
                    <Button
                      size="small" variant="outlined" sx={{ mt: 1.5 }}
                      disabled={processando || (temBaixa && item.valor !== 'ABERTA')}
                      onClick={() => alterarSituacao(item.valor, item.valor === 'ABERTA' ? 'reaberta' : `${item.rotulo.toLowerCase()}da`)}
                    >
                      {item.rotulo}
                    </Button>
                  </Box>
                ))}
              <Box sx={{ borderTop: `1px solid ${TOV.divider}`, pt: 2 }}>
                <Typography sx={{ fontWeight: 700, fontSize: TOV.type.body }}>Excluir de vez</Typography>
                <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 0.5 }}>
                  Apaga o título do histórico. Cancelar preserva o registro; excluir, não.
                </Typography>
                <Box
                  component="button"
                  type="button"
                  disabled={processando || temBaixa}
                  onClick={() => setExcluindo(true)}
                  sx={{ ...acaoTabelaSx, mt: 1, color: TOV.danger, '&:hover': { color: TOV.danger, textDecorationStyle: 'solid' } }}
                >
                  Excluir cobrança
                </Box>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button variant="outlined" onClick={onFechar} disabled={processando}>Fechar</Button>
          {aba === 'dados' && (
            <Button variant="contained" disabled={!podeSalvar} onClick={salvar}>
              {processando ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <DialogoConfirmacao
        aberto={excluindo}
        titulo="Excluir esta cobrança?"
        descricao="O título sai do histórico do aluno e do que está a receber. Não há como desfazer."
        itens={[{ rotulo: cobranca.descricao, detalhe: formatarMoeda(cobranca.valor) }]}
        rotuloConfirmar="Excluir cobrança"
        processando={processando}
        onConfirmar={() => { setExcluindo(false); excluir() }}
        onFechar={() => setExcluindo(false)}
      />
    </>
  )
}
