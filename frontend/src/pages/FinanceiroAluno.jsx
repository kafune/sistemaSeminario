import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Box, Button, Snackbar, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import UndoIcon from '@mui/icons-material/Undo'
import { api, getPerfil } from '../api'
import { TOV } from '../theme'
import {
  CabecalhoPagina, CartaoLista, DialogoConfirmacao, EstadoErro, EstadoVazio,
  SkeletonCards, StatusBadge, Superficie, cardSx, resetBotao,
  useTelaDesktop,
} from '../ui'
import { formatarDataBr, formatarMoeda } from '../formatters'
import { DialogoPagamento, SeloSituacao, rotuloForma } from './FinanceiroComum'

export default function FinanceiroAluno() {
  const { codAlu } = useParams()
  const navigate = useNavigate()
  const telaDesktop = useTelaDesktop()
  // O perfil FINANCEIRO não alcança a secretaria: sem ficha cadastral.
  const veFichaDoAluno = getPerfil() !== 'FINANCEIRO'

  const [extrato, setExtrato] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [cobrancaPagando, setCobrancaPagando] = useState(null)
  const [pagamentoEstornar, setPagamentoEstornar] = useState(null)
  const [processando, setProcessando] = useState(false)
  const [msg, setMsg] = useState('')
  const [ehErro, setEhErro] = useState(true)
  const avisar = (texto, falhou = true) => { setEhErro(falhou); setMsg(texto) }

  const carregar = useCallback(() => {
    setCarregando(true)
    setErroCarga('')
    api.get(`/financeiro/alunos/${codAlu}`)
      .then(setExtrato)
      .catch((e) => setErroCarga(e.message))
      .finally(() => setCarregando(false))
  }, [codAlu])

  useEffect(() => { carregar() }, [carregar])

  const token = extrato?.acesso?.token
  const enderecoDoAluno = token ? `${window.location.origin}/minhas-financas/${token}` : ''

  async function lancarPagamento(dados) {
    setProcessando(true)
    try {
      await api.post(`/financeiro/cobrancas/${cobrancaPagando.id}/pagamentos`, dados)
      setCobrancaPagando(null)
      avisar('Pagamento lançado.', false)
      carregar()
    } catch (e) {
      avisar(e.message)
    } finally {
      setProcessando(false)
    }
  }

  async function estornar() {
    setProcessando(true)
    try {
      await api.del(`/financeiro/pagamentos/${pagamentoEstornar.id}`)
      setPagamentoEstornar(null)
      avisar('Pagamento estornado.', false)
      carregar()
    } catch (e) {
      avisar(e.message)
    } finally {
      setProcessando(false)
    }
  }

  async function gerarLink() {
    setProcessando(true)
    try {
      const resposta = await api.post(`/financeiro/alunos/${codAlu}/acesso`)
      const endereco = `${window.location.origin}/minhas-financas/${resposta.token}`
      try {
        await navigator.clipboard.writeText(endereco)
        avisar('Link gerado e copiado para a área de transferência.', false)
      } catch {
        avisar('Link gerado. Copie no cartão de consulta do aluno.', false)
      }
      carregar()
    } catch (e) {
      avisar(e.message)
    } finally {
      setProcessando(false)
    }
  }

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(enderecoDoAluno)
      avisar('Link copiado.', false)
    } catch {
      avisar('Não foi possível copiar automaticamente; selecione o endereço na tela.')
    }
  }

  async function revogarLink() {
    setProcessando(true)
    try {
      await api.del(`/financeiro/alunos/${codAlu}/acesso`)
      avisar('Link desativado.', false)
      carregar()
    } catch (e) {
      avisar(e.message)
    } finally {
      setProcessando(false)
    }
  }

  if (carregando && !extrato) return <SkeletonCards quantidade={3} altura={150} />
  if (erroCarga && !extrato) {
    return (
      <Box>
        <Box component="button" type="button" onClick={() => navigate('/financeiro')} sx={{ ...resetBotao, px: 0.5, color: TOV.caption, fontWeight: 600, mb: 1.5 }}>‹ Voltar para Financeiro</Box>
        <EstadoErro titulo="Não foi possível abrir este extrato" descricao={erroCarga} onTentarNovamente={carregar} />
      </Box>
    )
  }

  const { aluno, resumo, cobrancas } = extrato

  return (
    <Box>
      <Box
        component="button" type="button" onClick={() => navigate('/financeiro')}
        sx={{ ...resetBotao, minHeight: 44, px: 0.5, display: 'inline-flex', alignItems: 'center', fontSize: TOV.type.body, color: TOV.caption, fontWeight: 600, mb: 1.5, '&:hover': { color: TOV.coral } }}
      >
        ‹ Voltar para Financeiro
      </Box>

      <CabecalhoPagina
        eyebrow="Situação financeira"
        titulo={aluno.nome}
        descricao={aluno.turma_nome ? `Turma ${aluno.turma_nome}` : 'Sem turma vinculada'}
        metadados={`${cobrancas.length} cobrança(s) no histórico`}
        acoes={veFichaDoAluno && (
          <Button variant="outlined" startIcon={<PersonOutlineIcon />} onClick={() => navigate(`/alunos/${codAlu}`)}>
            Ficha do aluno
          </Button>
        )}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))', lg: 'repeat(4,minmax(0,1fr))' }, gap: 2, mb: 2.5 }}>
        {[
          ['Total do curso', formatarMoeda(resumo.total), 'Matrícula e mensalidades'],
          ['Já pago', formatarMoeda(resumo.pago), 'Baixas confirmadas'],
          ['Em aberto', formatarMoeda(resumo.em_aberto), 'Saldo devedor'],
          ['Vencido', formatarMoeda(resumo.vencido), resumo.em_dia ? 'Nada em atraso' : 'Precisa de cobrança'],
        ].map(([rotulo, valor, nota]) => (
          <Superficie key={rotulo} sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Box sx={{ fontSize: TOV.type.overline, textTransform: 'uppercase', letterSpacing: '.12em', color: TOV.caption, fontWeight: 700 }}>{rotulo}</Box>
            <Box sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.titleLg, mt: 1, fontVariantNumeric: 'tabular-nums' }}>{valor}</Box>
            <Box sx={{ fontSize: TOV.type.bodySm, color: TOV.caption, mt: 0.5 }}>{nota}</Box>
          </Superficie>
        ))}
      </Box>

      <Superficie sx={{ p: { xs: 2, sm: 2.5 }, mb: 2.5, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: TOV.type.bodyLg }}>Consulta do aluno</Typography>
          <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mt: 0.5, maxWidth: '68ch' }}>
            Link pessoal para o aluno acompanhar o que já pagou e o que vai vencer, sem senha.
            Quando o portal do aluno existir, a mesma tela passa a abrir pelo login dele.
          </Typography>
          {token && (
            <Box sx={{ mt: 1.5, p: 1.5, bgcolor: TOV.canvas, borderRadius: TOV.radiusSm, border: `1px solid ${TOV.divider}`, fontSize: TOV.type.bodySm, overflowWrap: 'anywhere', fontFamily: TOV.fontMono }}>
              {enderecoDoAluno}
            </Box>
          )}
          {extrato.acesso?.ultimo_acesso_em && (
            <Typography sx={{ color: TOV.caption, fontSize: TOV.type.caption, mt: 1 }}>
              Último acesso do aluno em {new Date(extrato.acesso.ultimo_acesso_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {token && <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={copiarLink}>Copiar link</Button>}
          <Button variant={token ? 'outlined' : 'contained'} disabled={processando} onClick={gerarLink}>
            {token ? 'Gerar novo link' : 'Gerar link'}
          </Button>
          {token && <Button color="error" startIcon={<LinkOffIcon />} disabled={processando} onClick={revogarLink}>Desativar</Button>}
        </Box>
      </Superficie>

      <Typography component="h2" variant="h3" sx={{ fontSize: TOV.type.titleSm, mb: 1.5 }}>Cobranças</Typography>

      {cobrancas.length === 0 && (
        <Box sx={cardSx}>
          <EstadoVazio
            titulo="Nenhuma cobrança para este aluno"
            descricao="Gere as cobranças pelo plano da turma ou crie uma cobrança avulsa."
            acao={<Button variant="outlined" onClick={() => navigate('/financeiro')}>Abrir financeiro</Button>}
          />
        </Box>
      )}

      {!telaDesktop && cobrancas.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {cobrancas.map((item) => (
            <CartaoLista key={item.id}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ fontWeight: 700, fontSize: TOV.type.body, overflowWrap: 'anywhere' }}>{item.descricao}</Box>
                  <Box sx={{ fontSize: TOV.type.caption, color: TOV.caption, mt: 0.5 }}>{item.tipo_rotulo} · {item.referencia}</Box>
                </Box>
                <SeloSituacao situacao={item.situacao} sx={{ flexShrink: 0 }} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, fontSize: TOV.type.body }}>
                <Box component="span" sx={{ color: TOV.caption }}>Vencimento</Box>
                <Box component="span" sx={{ fontWeight: 600 }}>{formatarDataBr(item.vencimento)}</Box>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, fontSize: TOV.type.body }}>
                <Box component="span" sx={{ color: TOV.caption }}>Valor · saldo</Box>
                <Box component="span" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatarMoeda(item.valor)} · {formatarMoeda(item.saldo)}
                </Box>
              </Box>
              {item.pagamentos?.map((pagamento) => (
                <Box key={pagamento.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, fontSize: TOV.type.bodySm, color: TOV.caption }}>
                  <Box component="span">{formatarDataBr(pagamento.data_pagamento)} · {rotuloForma(pagamento.forma)}</Box>
                  <Box component="span">{formatarMoeda(pagamento.valor)}</Box>
                </Box>
              ))}
              {item.saldo > 0 && (
                <Button size="small" variant="outlined" startIcon={<PaidOutlinedIcon />} onClick={() => setCobrancaPagando({ ...item, aluno_nome: aluno.nome })}>
                  Registrar pagamento
                </Button>
              )}
            </CartaoLista>
          ))}
        </Box>
      )}

      {telaDesktop && cobrancas.length > 0 && (
        <TableContainer component={Box} sx={{ ...cardSx, overflowX: 'auto' }}>
          <Table sx={{ minWidth: 880 }}>
            <TableHead>
              <TableRow>
                <TableCell>Cobrança</TableCell>
                <TableCell>Vencimento</TableCell>
                <TableCell align="right">Valor</TableCell>
                <TableCell align="right">Pago</TableCell>
                <TableCell align="right">Saldo</TableCell>
                <TableCell>Situação</TableCell>
                <TableCell align="right">Ação</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cobrancas.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <Box sx={{ fontWeight: 600 }}>{item.descricao}</Box>
                    <Box sx={{ fontSize: TOV.type.caption, color: TOV.caption }}>{item.tipo_rotulo} · {item.referencia}</Box>
                    {item.pagamentos?.map((pagamento) => (
                      <Box key={pagamento.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, fontSize: TOV.type.caption, color: TOV.caption }}>
                        <Box component="span">
                          Baixa de {formatarMoeda(pagamento.valor)} em {formatarDataBr(pagamento.data_pagamento)} · {rotuloForma(pagamento.forma)}
                        </Box>
                        <Box
                          component="button" type="button"
                          onClick={() => setPagamentoEstornar(pagamento)}
                          sx={{ ...resetBotao, minHeight: 0, display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: TOV.type.caption, fontWeight: 600, '&:hover': { color: TOV.danger } }}
                        >
                          <UndoIcon sx={{ fontSize: TOV.type.caption }} /> estornar
                        </Box>
                      </Box>
                    ))}
                  </TableCell>
                  <TableCell sx={{ color: TOV.graphite, whiteSpace: 'nowrap' }}>{formatarDataBr(item.vencimento)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatarMoeda(item.valor)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: TOV.graphite }}>{formatarMoeda(item.pago)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{formatarMoeda(item.saldo)}</TableCell>
                  <TableCell><SeloSituacao situacao={item.situacao} /></TableCell>
                  <TableCell align="right">
                    {item.saldo > 0 ? (
                      <Box
                        component="button" type="button"
                        onClick={() => setCobrancaPagando({ ...item, aluno_nome: aluno.nome })}
                        sx={{ ...resetBotao, fontSize: TOV.type.bodySm, fontWeight: 600, color: TOV.caption, '&:hover': { color: TOV.coral } }}
                      >
                        Registrar pagamento
                      </Box>
                    ) : (
                      <StatusBadge tom="success">Quitada</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <DialogoPagamento
        cobranca={cobrancaPagando}
        processando={processando}
        onConfirmar={lancarPagamento}
        onFechar={() => !processando && setCobrancaPagando(null)}
      />

      <DialogoConfirmacao
        aberto={!!pagamentoEstornar}
        titulo="Estornar pagamento?"
        descricao="A baixa é removida e a cobrança volta a ficar em aberto. Se o valor tinha vindo do banco, o recebimento retorna para a fila de conciliação."
        itens={pagamentoEstornar ? [
          { rotulo: 'Valor', detalhe: formatarMoeda(pagamentoEstornar.valor) },
          { rotulo: 'Data', detalhe: formatarDataBr(pagamentoEstornar.data_pagamento) },
          { rotulo: 'Forma', detalhe: rotuloForma(pagamentoEstornar.forma) },
        ] : []}
        rotuloConfirmar="Estornar"
        processando={processando}
        onConfirmar={estornar}
        onFechar={() => !processando && setPagamentoEstornar(null)}
      />

      <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg('')}>
        <Alert severity={ehErro ? 'error' : 'success'} onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
