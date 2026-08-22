import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Box, Button, Menu, MenuItem, Snackbar, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import DescriptionIcon from '@mui/icons-material/Description'
import EditIcon from '@mui/icons-material/Edit'
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import { api, abrirArquivo } from '../api'
import { TOV } from '../theme'
import {
  AvatarIniciais, CartaoLista, DialogoConfirmacao, LinhaCartao, PilulaStatus,
  EstadoErro, Regua, SkeletonCards, Superficie, cardSx, resetBotao, useTelaDesktop,
} from '../ui'
import AlunoForm from './AlunoForm'

function Campo({ rotulo, valor }) {
  return (
    <Box>
      <Box sx={{ fontSize: TOV.type.caption, color: TOV.caption, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', mb: 0.5 }}>{rotulo}</Box>
      <Box sx={{ fontSize: TOV.type.body, fontWeight: 600, overflowWrap: 'anywhere' }}>{valor || '—'}</Box>
    </Box>
  )
}

function CardResumo({ rotulo, valor, escuro, offwhite, corValor }) {
  return (
    <Superficie variante={escuro ? 'inverse' : 'base'} sx={{ bgcolor: offwhite ? TOV.canvas : undefined, p: '24px' }}>
      <Box sx={{ fontSize: TOV.type.overline, textTransform: 'uppercase', letterSpacing: '.2em', color: escuro ? TOV.onDarkMuted : TOV.caption, fontFamily: TOV.fontHead, fontWeight: 600 }}>{rotulo}</Box>
      <Box sx={{ fontFamily: escuro ? TOV.fontHead : TOV.fontBody, fontWeight: 700, fontSize: escuro ? 44 : 17, mt: 1, color: corValor }}>{valor}</Box>
    </Superficie>
  )
}

function numeroWhatsApp(celular) {
  let numero = String(celular || '').replace(/\D/g, '')
  if (numero.length === 10 || numero.length === 11) numero = `55${numero}`
  return numero.startsWith('55') && numero.length >= 12 ? numero : null
}

function formatarTelefone(valor) {
  const digitos = String(valor || '').replace(/\D/g, '')
  if (digitos.length === 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
  if (digitos.length === 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`
  return valor
}

export default function AlunoDetalhe() {
  const { codAlu } = useParams()
  const [aluno, setAluno] = useState(null)
  const [notas, setNotas] = useState([])
  const [editando, setEditando] = useState(false)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [documentosAnchor, setDocumentosAnchor] = useState(null)
  const [msg, setMsg] = useState('')
  const [erroCarga, setErroCarga] = useState('')
  const [carregando, setCarregando] = useState(true)
  const navigate = useNavigate()
  const telaDesktop = useTelaDesktop()

  const carregar = useCallback(() => {
    setCarregando(true)
    setErroCarga('')
    api.get(`/alunos/${codAlu}`)
      .then(setAluno)
      .catch((e) => setErroCarga(e.message))
      .finally(() => setCarregando(false))
    api.get(`/notas/aluno/${codAlu}`).then((r) => setNotas(r.notas)).catch(() => setNotas([]))
  }, [codAlu])

  useEffect(() => { carregar() }, [carregar])

  const { media, faltas } = useMemo(() => {
    const comNota = notas.filter((n) => n.nota != null)
    const soma = comNota.reduce((s, n) => s + Number(n.nota), 0)
    const totalFaltas = notas.reduce((s, n) => s + (n.falta || 0), 0)
    return {
      media: comNota.length ? (soma / comNota.length) : null,
      faltas: totalFaltas,
    }
  }, [notas])

  async function excluir() {
    setExcluindo(true)
    try {
      await api.del(`/alunos/${codAlu}`)
      navigate('/alunos')
    } catch (e) {
      setMsg(e.message)
      setConfirmarExclusao(false)
    } finally {
      setExcluindo(false)
    }
  }

  if (carregando && !aluno) return <SkeletonCards quantidade={3} altura={150} />
  if (erroCarga && !aluno) return (
    <Box>
      <Box component="button" type="button" onClick={() => navigate('/alunos')} sx={{ ...resetBotao, px: 0.5, color: TOV.caption, fontWeight: 600, mb: 1.5 }}>‹ Voltar para Alunos</Box>
      <EstadoErro titulo="Não foi possível abrir este aluno" descricao={erroCarga} onTentarNovamente={carregar} />
    </Box>
  )

  const situacao = { P: 'Pré-cadastro', A: 'Em curso', I: 'Inativo', F: 'Formado', T: 'Trancado' }[aluno.status] || '—'
  const whatsapp = numeroWhatsApp(aluno.celular)
  const abrirDocumento = (path) => {
    setDocumentosAnchor(null)
    abrirArquivo(path).catch((e) => setMsg(e.message))
  }

  return (
    <Box>
      <Box component="button" type="button" onClick={() => navigate('/alunos')} sx={{ ...resetBotao, minHeight: 44, px: 0.5, display: 'inline-flex', alignItems: 'center', fontSize: TOV.type.body, color: TOV.caption, fontWeight: 600, mb: 1.5, '&:hover': { color: TOV.coral } }}>
        ‹ Voltar para Alunos
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 3.5 }}>
        <Box sx={{ display: 'flex', gap: { xs: 2, md: 3 }, alignItems: 'center', minWidth: 0 }}>
          <AvatarIniciais
            nome={aluno.nome}
            sx={{
              width: { xs: 56, md: 76 }, height: { xs: 56, md: 76 },
              flex: { xs: '0 0 56px', md: '0 0 76px' }, fontSize: { xs: TOV.type.titleSm, md: TOV.type.displaySm },
              borderRadius: { xs: TOV.radiusMd, md: TOV.radiusXl },
            }}
          />
          <Box>
            <Regua sx={{ mb: 1.5 }} />
            <Typography variant="h1" sx={{ fontSize: { xs: TOV.type.title, sm: TOV.type.displaySm, md: TOV.type.display }, overflowWrap: 'anywhere' }}>{aluno.nome}</Typography>
            <Box sx={{ mt: 1.5, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
              <Box component="span" sx={{ px: 2, py: 0.5, bgcolor: TOV.ink, color: TOV.onDark, borderRadius: TOV.radiusFull, fontSize: TOV.type.bodySm, fontWeight: 600 }}>Matrícula {aluno.cod_alu}</Box>
              <PilulaStatus status={aluno.status} sx={{ fontSize: TOV.type.bodySm }} />
              {aluno.turma_nome && <Typography component="span" sx={{ fontSize: TOV.type.body, color: TOV.caption }}>{aluno.turma_nome}</Typography>}
            </Box>
          </Box>
        </Box>
        <Box
          sx={{
            display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: 'flex-end',
            width: { xs: '100%', md: 'auto' },
            '& > button': { flex: { xs: '1 1 42%', sm: '0 0 auto' } },
          }}
        >
          <Button
            variant="contained"
            disabled={!whatsapp}
            startIcon={<WhatsAppIcon />}
            onClick={() => navigate(`/whatsapp?aluno=${aluno.cod_alu}`)}
          >
            Enviar mensagem
          </Button>
          <Button
            variant="outlined"
            disabled={!whatsapp}
            startIcon={<WhatsAppIcon />}
            onClick={() => window.open(`https://wa.me/${whatsapp}`, '_blank', 'noopener,noreferrer')}
            sx={{ color: TOV.success, borderColor: TOV.success }}
          >
            WhatsApp
          </Button>
          <Button
            variant="outlined"
            startIcon={<PaidOutlinedIcon />}
            onClick={() => navigate(`/financeiro/alunos/${aluno.cod_alu}`)}
          >
            Financeiro
          </Button>
          <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setEditando(true)}>Editar</Button>
          <Button
            variant="outlined"
            startIcon={<DescriptionIcon />}
            onClick={(e) => setDocumentosAnchor(e.currentTarget)}
            aria-haspopup="menu"
            aria-expanded={documentosAnchor ? 'true' : undefined}
          >
            Documentos
          </Button>
          <Menu anchorEl={documentosAnchor} open={!!documentosAnchor} onClose={() => setDocumentosAnchor(null)}>
            <MenuItem onClick={() => abrirDocumento(`/relatorios/boletim/${codAlu}`)}>Boletim</MenuItem>
            <MenuItem onClick={() => abrirDocumento(`/relatorios/historico/${codAlu}`)}>Histórico escolar</MenuItem>
            <MenuItem onClick={() => abrirDocumento(`/relatorios/ficha-aluno/${codAlu}`)}>Ficha cadastral</MenuItem>
          </Menu>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 300px' }, gap: 2.5, mb: 2.5 }}>
      <Box sx={{ ...cardSx, p: { xs: '20px', md: '28px 32px' } }}>
          <Typography variant="h3" sx={{ fontSize: TOV.type.titleSm, mb: 3 }}>Dados cadastrais</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3,1fr)' }, gap: { xs: '16px', md: '24px' } }}>
            <Campo rotulo="Nascimento" valor={aluno.dat_nas} />
            <Campo rotulo="CPF" valor={aluno.cpf} />
            <Campo rotulo="RG" valor={aluno.rg} />
            <Campo rotulo="E-mail" valor={aluno.e_mail} />
            <Campo rotulo="Celular" valor={formatarTelefone(aluno.celular)} />
            <Campo rotulo="Telefone" valor={formatarTelefone(aluno.fone1)} />
            <Campo rotulo="Cidade" valor={`${aluno.cidade || ''}${aluno.uf ? ' — ' + aluno.uf : ''}`.trim()} />
            <Campo rotulo="Endereço" valor={`${aluno.endereco || ''}${aluno.bairro ? ' · ' + aluno.bairro : ''}`.trim()} />
            <Campo rotulo="CEP" valor={aluno.cep} />
            <Campo rotulo="Igreja" valor={aluno.igreja} />
            <Campo rotulo="Endereço da igreja" valor={aluno.local_igreja} />
            <Campo rotulo="Pastor" valor={aluno.nome_pastor} />
            <Campo rotulo="Profissão" valor={aluno.profissao} />
            <Campo rotulo="Escolaridade" valor={aluno.escolaridade} />
            <Campo rotulo="Turma de interesse" valor={aluno.turma_interesse} />
            <Campo rotulo="Curso anterior de Teologia" valor={aluno.cur_teologicos} />
            <Campo rotulo="Cônjuge participante" valor={aluno.nome_conjuge} />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <CardResumo escuro rotulo="Média geral" valor={media != null ? media.toFixed(1).replace('.', ',') : '—'} />
          <CardResumo rotulo="Faltas acumuladas" valor={faltas} />
          <CardResumo offwhite rotulo="Situação" valor={situacao} corValor={TOV.graphite} />
        </Box>
      </Box>

      {/* Notas em cards — celular/tablet */}
      {!telaDesktop && <Box>
        <Typography variant="h3" sx={{ fontSize: TOV.type.titleSm, mb: 1.5 }}>
          Notas <Box component="span" sx={{ color: TOV.caption, fontSize: TOV.type.body, fontWeight: 600 }}>· {notas.length} lançamentos</Box>
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {notas.length === 0 && (
            <CartaoLista sx={{ alignItems: 'center', color: TOV.caption, py: 4 }}>Nenhuma nota lançada.</CartaoLista>
          )}
          {notas.map((n) => (
            <CartaoLista key={n.id}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ fontWeight: 700, fontSize: TOV.type.body, lineHeight: 1.3 }}>{n.materia_nome}</Box>
                  <Box sx={{ fontSize: TOV.type.bodySm, color: TOV.caption, fontWeight: 600, mt: 0.5 }}>
                    {n.ano || '—'}{n.semestre ? ` · ${n.semestre}º semestre` : ''}
                  </Box>
                </Box>
                <Box sx={{ textAlign: 'center', flexShrink: 0 }}>
                  <Box sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.title, color: n.nota != null ? TOV.ink : TOV.caption }}>
                    {n.nota != null ? String(n.nota).replace('.', ',') : 'N/C'}
                  </Box>
                  <Box sx={{ fontSize: TOV.type.overline, color: TOV.caption, textTransform: 'uppercase', letterSpacing: '.08em' }}>nota</Box>
                </Box>
              </Box>
              <LinhaCartao rotulo="Faltas" valor={n.falta != null ? String(n.falta) : '—'} />
              <LinhaCartao rotulo="Cursou" valor={n.cursou === 'S' ? 'Sim' : n.cursou === 'N' ? 'Não' : (n.cursou || '—')} />
              <LinhaCartao rotulo="Professor" valor={n.professor_nome} />
            </CartaoLista>
          ))}
        </Box>
      </Box>}

      {/* Tabela — desktop */}
      {telaDesktop && <TableContainer component={Box} sx={{ overflowX: 'auto' }}>
        <Box sx={{ p: '24px 28px 4px' }}>
          <Typography variant="h3" sx={{ fontSize: TOV.type.titleSm }}>
            Notas <Box component="span" sx={{ color: TOV.caption, fontSize: TOV.type.body, fontWeight: 600 }}>· {notas.length} lançamentos</Box>
          </Typography>
        </Box>
        <Table sx={{ mt: 1, minWidth: 760 }}>
          <TableHead>
            <TableRow>
              <TableCell>Matéria</TableCell>
              <TableCell>Nota</TableCell>
              <TableCell>Faltas</TableCell>
              <TableCell>Período</TableCell>
              <TableCell>Cursou</TableCell>
              <TableCell>Professor</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {notas.length === 0 && (
              <TableRow><TableCell colSpan={6} sx={{ py: 4, textAlign: 'center', color: TOV.caption }}>Nenhuma nota lançada.</TableCell></TableRow>
            )}
            {notas.map((n) => (
              <TableRow key={n.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{n.materia_nome}</TableCell>
                <TableCell><Box component="span" sx={{ fontWeight: 700, color: n.nota != null ? TOV.ink : TOV.caption }}>{n.nota != null ? String(n.nota).replace('.', ',') : 'N/C'}</Box></TableCell>
                <TableCell sx={{ color: TOV.graphite }}>{n.falta ?? '—'}</TableCell>
                <TableCell sx={{ color: TOV.graphite }}>{n.ano || '—'}{n.semestre ? ` · ${n.semestre}º` : ''}</TableCell>
                <TableCell sx={{ color: TOV.graphite }}>{n.cursou === 'S' ? 'Sim' : n.cursou === 'N' ? 'Não' : (n.cursou || '—')}</TableCell>
                <TableCell sx={{ color: TOV.graphite }}>{n.professor_nome || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button startIcon={<DeleteIcon />} color="error" onClick={() => setConfirmarExclusao(true)} sx={{ color: TOV.caption, '&:hover': { color: TOV.danger, bgcolor: 'transparent' } }}>
          Excluir aluno
        </Button>
      </Box>

      <DialogoConfirmacao
        aberto={confirmarExclusao}
        titulo="Excluir aluno"
        descricao={`Excluir o aluno ${aluno.nome}? Todas as notas e matrículas dele serão perdidas. Esta ação não pode ser desfeita.`}
        processando={excluindo}
        onConfirmar={excluir}
        onFechar={() => setConfirmarExclusao(false)}
      />

      <AlunoForm
        aberto={editando}
        aluno={aluno}
        aoFechar={() => setEditando(false)}
        aoSalvar={() => { setEditando(false); carregar() }}
      />
      <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg('')}>
        <Alert severity="error" onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
