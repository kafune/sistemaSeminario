import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, InputAdornment, MenuItem, TextField, Typography,
} from '@mui/material'
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined'
import { TOV } from '../theme'
import { StatusBadge, useDialogoTelaCheia } from '../ui'
import { formatarDataBr, formatarMoeda } from '../formatters'

/** Vocabulário único de situação: mesma palavra e mesma cor em toda a área. */
export const SITUACOES = {
  ABERTA: { rotulo: 'Em aberto', tom: 'neutral' },
  PARCIAL: { rotulo: 'Parcial', tom: 'warning' },
  VENCIDA: { rotulo: 'Vencida', tom: 'error' },
  PAGA: { rotulo: 'Paga', tom: 'success' },
  CANCELADA: { rotulo: 'Cancelada', tom: 'muted' },
  ISENTA: { rotulo: 'Isenta', tom: 'info' },
  QUITADO: { rotulo: 'Quitado', tom: 'success' },
  EM_DIA: { rotulo: 'Em dia', tom: 'neutral' },
  SEM_COBRANCA: { rotulo: 'Sem cobrança', tom: 'muted' },
  PENDENTE: { rotulo: 'A conciliar', tom: 'warning' },
  CONCILIADA: { rotulo: 'Conciliada', tom: 'success' },
  IGNORADA: { rotulo: 'Ignorada', tom: 'muted' },
}

export const FORMAS = [
  { valor: 'PIX', rotulo: 'PIX' },
  { valor: 'BOLETO', rotulo: 'Boleto' },
  { valor: 'DINHEIRO', rotulo: 'Dinheiro' },
  { valor: 'CARTAO', rotulo: 'Cartão' },
  { valor: 'TRANSFERENCIA', rotulo: 'Transferência' },
]

export function rotuloForma(forma) {
  return FORMAS.find((item) => item.valor === forma)?.rotulo || forma || '—'
}

export function SeloSituacao({ situacao, sx }) {
  const info = SITUACOES[situacao] || { rotulo: situacao || '—', tom: 'muted' }
  return <StatusBadge tom={info.tom} dot sx={sx}>{info.rotulo}</StatusBadge>
}

export function hojeIso() {
  const agora = new Date()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${agora.getFullYear()}-${mes}-${dia}`
}

/** Valor digitado em pt-BR ("1.200,50") vira número para a API. */
export function numeroDoCampo(texto) {
  const limpo = String(texto ?? '').replace(/\./g, '').replace(',', '.').trim()
  if (!limpo) return null
  const numero = Number(limpo)
  return Number.isFinite(numero) ? numero : null
}

/** 10 vira "10"; 12.5 vira "12,5" — o "%" fica com quem exibe. */
export function textoPercentual(valor) {
  if (!valor) return ''
  return String(valor).replace('.', ',').replace(/,0+$/, '')
}

export function textoDoValor(numero) {
  if (numero == null || numero === '') return ''
  return Number(numero).toFixed(2).replace('.', ',')
}

/**
 * Baixa de um título. O padrão é quitar o saldo inteiro — é o caminho de
 * quase toda baixa; quem recebeu parcial ajusta o valor.
 */
export function DialogoPagamento({ cobranca, processando, onConfirmar, onFechar }) {
  const telaCheia = useDialogoTelaCheia()
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hojeIso())
  const [forma, setForma] = useState('PIX')
  const [observacao, setObservacao] = useState('')

  useEffect(() => {
    if (!cobranca) return
    setValor(textoDoValor(cobranca.saldo))
    setData(hojeIso())
    setForma('PIX')
    setObservacao('')
  }, [cobranca])

  const numero = numeroDoCampo(valor)
  const excedeSaldo = numero != null && cobranca && numero > Number(cobranca.saldo) + 0.001
  const dataFutura = data > hojeIso()
  const podeConfirmar = numero != null && numero > 0 && !excedeSaldo && !dataFutura && !processando

  function confirmar() {
    onConfirmar({
      valor: numero,
      data_pagamento: data || null,
      forma,
      observacao: observacao.trim() || null,
    })
  }

  return (
    <Dialog open={!!cobranca} onClose={processando ? undefined : onFechar} maxWidth="xs" fullWidth fullScreen={telaCheia}>
      <DialogTitle>Registrar pagamento</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
        {cobranca && (
          <Box sx={{ border: `1px solid ${TOV.divider}`, borderRadius: TOV.radiusSm, p: 2 }}>
            <Typography sx={{ fontWeight: 700, fontSize: TOV.type.body }}>{cobranca.aluno_nome || cobranca.descricao}</Typography>
            <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 0.5 }}>
              {cobranca.descricao} · vence {formatarDataBr(cobranca.vencimento)}
            </Typography>
            <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 0.5 }}>
              Saldo de {formatarMoeda(cobranca.saldo)} · código {cobranca.referencia || '—'}
            </Typography>
          </Box>
        )}
        <TextField
          label="Valor recebido" value={valor} autoFocus
          onChange={(e) => setValor(e.target.value)}
          error={excedeSaldo}
          helperText={excedeSaldo ? 'O valor não pode passar do saldo da cobrança.' : 'Deixe o valor cheio para quitar de uma vez.'}
          InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
          inputProps={{ inputMode: 'decimal' }}
        />
        <TextField
          label="Data do pagamento" type="date" value={data}
          onChange={(e) => setData(e.target.value)}
          error={dataFutura}
          helperText={dataFutura ? 'A data não pode ser futura.' : ' '}
          InputLabelProps={{ shrink: true }}
          inputProps={{ max: hojeIso() }}
        />
        <TextField select label="Forma" value={forma} onChange={(e) => setForma(e.target.value)}>
          {FORMAS.map((item) => <MenuItem key={item.valor} value={item.valor}>{item.rotulo}</MenuItem>)}
        </TextField>
        <TextField
          label="Observação (opcional)" value={observacao} multiline minRows={2}
          onChange={(e) => setObservacao(e.target.value)}
          inputProps={{ maxLength: 2000 }}
        />
        {cobranca?.situacao === 'VENCIDA' && (
          <Alert severity="warning">Esta cobrança venceu em {formatarDataBr(cobranca.vencimento)}.</Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button onClick={onFechar} disabled={processando}>Cancelar</Button>
        <Button
          variant="contained"
          startIcon={processando ? <CircularProgress size={16} color="inherit" /> : <PaidOutlinedIcon />}
          disabled={!podeConfirmar}
          onClick={confirmar}
        >
          {processando ? 'Lançando…' : 'Lançar pagamento'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
