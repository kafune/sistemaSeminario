import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined'
import { getPublico } from '../api'
import { TOV } from '../theme'
import { EstadoVazio, StatusBadge, cardSx } from '../ui'
import { formatarDataBr, formatarMoeda } from '../formatters'
import { SeloSituacao, rotuloForma } from './FinanceiroComum'

function Resumo({ rotulo, valor, nota, destaque }) {
  return (
    <Box
      sx={{
        ...cardSx,
        p: { xs: 2, sm: 2.5 },
        ...(destaque ? { bgcolor: TOV.graphite, color: TOV.onDark, border: `1px solid ${TOV.onDarkBorder}` } : {}),
      }}
    >
      <Box sx={{ fontSize: TOV.type.overline, textTransform: 'uppercase', letterSpacing: '.12em', fontWeight: 700, color: destaque ? TOV.onDarkMuted : TOV.caption }}>
        {rotulo}
      </Box>
      <Box sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.titleLg, mt: 1, fontVariantNumeric: 'tabular-nums' }}>{valor}</Box>
      {nota && <Box sx={{ fontSize: TOV.type.bodySm, mt: 0.5, color: destaque ? TOV.onDarkMuted : TOV.caption }}>{nota}</Box>}
    </Box>
  )
}

export default function MinhasFinancas() {
  const { token } = useParams()
  const [extrato, setExtrato] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)

  const carregar = useCallback(() => {
    setCarregando(true)
    setErro('')
    getPublico(`/financeiro-aluno/${token}`)
      .then(setExtrato)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [token])

  useEffect(() => { carregar() }, [carregar])

  async function copiarChave() {
    try {
      await navigator.clipboard.writeText(extrato.pagamento.chave_pix)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 3000)
    } catch {
      setCopiado(false)
    }
  }

  const proximo = extrato?.resumo?.proximo_vencimento
  const emAberto = (extrato?.cobrancas || []).filter((item) => item.saldo > 0)
  const quitadas = (extrato?.cobrancas || []).filter((item) => item.saldo <= 0)

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: TOV.canvas }}>
      <Box component="header" sx={{ bgcolor: TOV.graphite, color: TOV.onDark, px: { xs: 2, md: 5 }, py: 2.5, borderTop: `4px solid ${TOV.ink}` }}>
        <Box sx={{ maxWidth: 1080, mx: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: TOV.radiusMd, bgcolor: TOV.onDarkSurface, border: `1px solid ${TOV.onDarkBorder}` }}>
            <PaidOutlinedIcon sx={{ fontSize: TOV.type.titleSm }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.title, lineHeight: 1.1 }}>
              Minha situação financeira
            </Typography>
            <Typography sx={{ fontSize: TOV.type.bodySm, color: TOV.onDarkMuted }}>Centro TOV de Formação Teológica</Typography>
          </Box>
        </Box>
      </Box>

      <Box component="main" sx={{ maxWidth: 1080, mx: 'auto', px: { xs: 2, md: 3 }, py: { xs: 2.5, md: 4 } }}>
        {carregando && (
          <Box sx={{ ...cardSx, p: 5, textAlign: 'center' }}><CircularProgress size={30} /></Box>
        )}

        {!carregando && erro && (
          <Alert severity="error" action={<Button onClick={carregar}>Tentar novamente</Button>}>
            {erro === 'Erro 404' ? 'Este link não está mais válido. Peça um novo à secretaria.' : erro}
          </Alert>
        )}

        {!carregando && !erro && extrato && (
          <>
            <Box component="section" sx={{ ...cardSx, p: { xs: 2, sm: 2.5 }, mb: 2 }}>
              <Typography variant="overline" sx={{ display: 'block', color: TOV.caption }}>Aluno</Typography>
              <Typography component="h2" variant="h2" sx={{ fontSize: { xs: TOV.type.title, sm: TOV.type.titleLg }, overflowWrap: 'anywhere' }}>
                {extrato.aluno.nome}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mt: 1.5 }}>
                {extrato.aluno.turma_nome && (
                  <Typography sx={{ fontSize: TOV.type.body, color: TOV.caption }}>{extrato.aluno.turma_nome}</Typography>
                )}
                <StatusBadge tom={extrato.resumo.em_dia ? 'success' : 'error'} dot>
                  {extrato.resumo.em_dia ? 'Em dia' : 'Há parcela vencida'}
                </StatusBadge>
              </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))', md: 'repeat(4,minmax(0,1fr))' }, gap: 2, mb: 2 }}>
              <Resumo
                destaque
                rotulo="A pagar"
                valor={formatarMoeda(extrato.resumo.em_aberto)}
                nota={proximo ? `Próximo: ${formatarDataBr(proximo.vencimento)}` : 'Nada em aberto'}
              />
              <Resumo rotulo="Já pago" valor={formatarMoeda(extrato.resumo.pago)} nota="Pagamentos confirmados" />
              <Resumo rotulo="Vencido" valor={formatarMoeda(extrato.resumo.vencido)} nota={extrato.resumo.em_dia ? 'Nenhuma parcela atrasada' : 'Procure a secretaria'} />
              <Resumo rotulo="Total do curso" valor={formatarMoeda(extrato.resumo.total)} nota="Matrícula e mensalidades" />
            </Box>

            {(extrato.pagamento.chave_pix || extrato.pagamento.instrucoes) && (
              <Box component="section" sx={{ ...cardSx, p: { xs: 2, sm: 2.5 }, mb: 2 }}>
                <Typography component="h2" sx={{ fontWeight: 700, fontSize: TOV.type.bodyLg }}>Como pagar</Typography>
                {extrato.pagamento.beneficiario && (
                  <Typography sx={{ fontSize: TOV.type.bodySm, color: TOV.caption, mt: 0.5 }}>
                    Beneficiário: {extrato.pagamento.beneficiario}
                  </Typography>
                )}
                {extrato.pagamento.chave_pix && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mt: 1.5 }}>
                    <Box sx={{ p: 1.5, bgcolor: TOV.canvas, borderRadius: TOV.radiusSm, border: `1px solid ${TOV.divider}`, fontFamily: TOV.fontMono, fontSize: TOV.type.bodySm, overflowWrap: 'anywhere', minWidth: 0 }}>
                      {extrato.pagamento.chave_pix}
                    </Box>
                    <Button variant="outlined" size="small" startIcon={<ContentCopyIcon />} onClick={copiarChave}>
                      {copiado ? 'Chave copiada' : 'Copiar chave PIX'}
                    </Button>
                  </Box>
                )}
                <Typography sx={{ fontSize: TOV.type.bodySm, color: TOV.graphite, mt: 1.5, whiteSpace: 'pre-wrap' }}>
                  {extrato.pagamento.instrucoes
                    || 'Informe o código da parcela (ex.: TOV000123) na mensagem do PIX para o pagamento ser identificado automaticamente.'}
                </Typography>
              </Box>
            )}

            <Typography component="h2" variant="h3" sx={{ fontSize: TOV.type.titleSm, mb: 1.5 }}>A vencer e em aberto</Typography>
            {emAberto.length === 0 ? (
              <Box sx={{ ...cardSx, mb: 2 }}>
                <EstadoVazio compacto titulo="Nada em aberto" descricao="Todas as suas parcelas estão quitadas." />
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
                {emAberto.map((item) => (
                  <Box key={item.id} component="article" sx={{ ...cardSx, p: { xs: 2, sm: 2.5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: TOV.type.body, overflowWrap: 'anywhere' }}>{item.descricao}</Typography>
                        <Typography sx={{ fontSize: TOV.type.bodySm, color: TOV.caption, mt: 0.5 }}>
                          Vence em {formatarDataBr(item.vencimento)} · código {item.referencia}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.titleSm, fontVariantNumeric: 'tabular-nums' }}>
                          {formatarMoeda(item.saldo)}
                        </Typography>
                        <SeloSituacao situacao={item.situacao} />
                      </Box>
                    </Box>
                    {item.pago > 0 && (
                      <Typography sx={{ fontSize: TOV.type.bodySm, color: TOV.caption, mt: 1 }}>
                        Já recebemos {formatarMoeda(item.pago)} de {formatarMoeda(item.valor)}.
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            )}

            {quitadas.length > 0 && (
              <>
                <Typography component="h2" variant="h3" sx={{ fontSize: TOV.type.titleSm, mb: 1.5 }}>Histórico de pagamentos</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {quitadas.map((item) => (
                    <Box key={item.id} component="article" sx={{ ...cardSx, p: { xs: 2, sm: 2.5 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: TOV.type.body, overflowWrap: 'anywhere' }}>{item.descricao}</Typography>
                          {item.pagamentos?.map((pagamento) => (
                            <Typography key={pagamento.id} sx={{ fontSize: TOV.type.bodySm, color: TOV.caption, mt: 0.5 }}>
                              {formatarMoeda(pagamento.valor)} em {formatarDataBr(pagamento.data_pagamento)} · {rotuloForma(pagamento.forma)}
                            </Typography>
                          ))}
                        </Box>
                        <SeloSituacao situacao={item.situacao} sx={{ flexShrink: 0 }} />
                      </Box>
                    </Box>
                  ))}
                </Box>
              </>
            )}

            <Typography sx={{ fontSize: TOV.type.caption, color: TOV.caption, mt: 3, textAlign: 'center' }}>
              Consulta gerada em {new Date(extrato.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.
              Dúvidas sobre valores devem ser tratadas com a secretaria.
            </Typography>
          </>
        )}
      </Box>
    </Box>
  )
}
