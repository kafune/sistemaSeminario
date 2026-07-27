import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  LinearProgress, MenuItem, Snackbar, TextField, Typography,
} from '@mui/material'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import QrCode2Icon from '@mui/icons-material/QrCode2'
import RefreshIcon from '@mui/icons-material/Refresh'
import SendIcon from '@mui/icons-material/Send'
import { api } from '../api'
import { TOV } from '../theme'
import {
  CabecalhoPagina, DialogoConfirmacao, Eyebrow, cardSx, useDialogoTelaCheia,
} from '../ui'

const STATUS_FINAL = new Set(['CONCLUIDO', 'CONCLUIDO_COM_FALHAS', 'FALHA'])

const STATUS_LABEL = {
  CRIANDO: 'Criando',
  NA_FILA: 'Na fila',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  CONCLUIDO_COM_FALHAS: 'Concluído com falhas',
  FALHA: 'Falha',
}

function dataHora(iso) {
  if (!iso) return '—'
  return new Date(`${iso}${iso.endsWith('Z') ? '' : 'Z'}`).toLocaleString('pt-BR')
}

function qrSrc(qrcode) {
  if (!qrcode) return ''
  return qrcode.startsWith('data:') ? qrcode : `data:image/png;base64,${qrcode}`
}

function PilulaDisparo({ status }) {
  const falha = status === 'FALHA' || status === 'CONCLUIDO_COM_FALHAS'
  const concluido = status === 'CONCLUIDO'
  return (
    <Chip
      size="small"
      label={STATUS_LABEL[status] || status}
      sx={{
        fontWeight: 700,
        bgcolor: falha ? '#FFF0E8' : concluido ? TOV.coralTint : TOV.slateTint,
        color: falha ? '#A34716' : concluido ? TOV.coral : TOV.slate,
      }}
    />
  )
}

function CardInstancia({
  instancia, carregando, onCriar, onConectar, onDesconectar, onAtualizar,
}) {
  const conectada = instancia?.conectada
  const configurada = instancia?.configurada
  return (
    <Box sx={{ ...cardSx, p: { xs: 2.5, md: '26px 30px' }, mb: '18px' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{
          width: 48, height: 48, borderRadius: '14px', flexShrink: 0,
          bgcolor: conectada ? '#E8F7EE' : TOV.captionTint,
          color: conectada ? '#247A49' : TOV.caption,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <WhatsAppIcon />
        </Box>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Eyebrow>Instância UazAPI</Eyebrow>
          <Typography variant="h3" sx={{ fontSize: 22, mt: 0.5 }}>
            {configurada ? (instancia.nome || 'WhatsApp TOV') : 'Nenhuma instância criada'}
          </Typography>
          <Typography sx={{ color: TOV.caption, fontSize: 14, mt: 0.75 }}>
            {carregando ? 'Consultando conexão…' : conectada
              ? `${instancia.perfil_nome || 'WhatsApp conectado'}${instancia.numero ? ` · +${instancia.numero}` : ''}`
              : configurada ? 'Desconectada — leia um QR Code para enviar mensagens.'
                : 'Crie a instância que será usada nos disparos do sistema.'}
          </Typography>
          {instancia?.motivo_desconexao && !conectada && (
            <Typography sx={{ color: TOV.caption, fontSize: 12, mt: 0.5 }}>
              Última desconexão: {instancia.motivo_desconexao}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', width: { xs: '100%', sm: 'auto' } }}>
          <Button
            variant="outlined" startIcon={<RefreshIcon />} disabled={carregando}
            onClick={onAtualizar}
          >
            Atualizar
          </Button>
          {!configurada && (
            <Button variant="contained" onClick={onCriar}>Criar instância</Button>
          )}
          {configurada && !conectada && (
            <Button variant="contained" startIcon={<QrCode2Icon />} onClick={onConectar}>
              Conectar
            </Button>
          )}
          {conectada && (
            <Button variant="outlined" color="error" onClick={onDesconectar}>
              Desconectar
            </Button>
          )}
        </Box>
      </Box>
      {configurada && (
        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            label={conectada ? 'Conectada' : instancia.estado === 'connecting' ? 'Conectando' : 'Desconectada'}
            sx={{ fontWeight: 700, bgcolor: conectada ? '#E8F7EE' : TOV.captionTint, color: conectada ? '#247A49' : TOV.caption }}
          />
          {instancia.business != null && (
            <Chip size="small" variant="outlined" label={instancia.business ? 'WhatsApp Business' : 'WhatsApp pessoal'} />
          )}
        </Box>
      )}
    </Box>
  )
}

function Compositor({ turmas, conectada, onPrevia, carregando }) {
  const [etapa, setEtapa] = useState(1)
  const [tipo, setTipo] = useState('turma')
  const [codTur, setCodTur] = useState('')
  const [alunos, setAlunos] = useState([])
  const [opcoes, setOpcoes] = useState([])
  const [busca, setBusca] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [linkPreview, setLinkPreview] = useState(true)

  useEffect(() => {
    if (busca.trim().length < 2) return undefined
    const timer = setTimeout(() => {
      api.get(`/alunos?busca=${encodeURIComponent(busca)}&status=A&por_pagina=30`)
        .then((resposta) => setOpcoes(resposta.itens))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [busca])

  function inserirVariavel(variavel) {
    setMensagem((atual) => `${atual}${atual && !atual.endsWith(' ') ? ' ' : ''}{{${variavel}}}`)
  }

  function preparar() {
    onPrevia({
      tipo,
      aluno_ids: alunos.map((aluno) => aluno.cod_alu),
      cod_tur: tipo === 'turma' ? Number(codTur) : null,
      mensagem,
      link_preview: linkPreview,
    })
  }

  const publicoValido = tipo === 'todos' || (tipo === 'turma' ? !!codTur : alunos.length > 0)
  const resumoPublico = tipo === 'todos'
    ? 'Todos os alunos ativos'
    : tipo === 'turma'
      ? (turmas.find((turma) => turma.cod_tur === Number(codTur))?.nome || 'Selecione uma turma')
      : `${alunos.length} ${alunos.length === 1 ? 'aluno selecionado' : 'alunos selecionados'}`
  const nomePrevia = alunos[0]?.nome || 'Maria da Silva'
  const primeiroNomePrevia = nomePrevia.split(/\s+/)[0]
  const textoPrevia = mensagem
    .replace(/\{\{\s*primeiro_nome\s*\}\}/g, primeiroNomePrevia)
    .replace(/\{\{\s*nome\s*\}\}/g, nomePrevia)

  return (
    <Box sx={{ ...cardSx, p: { xs: 2.5, md: '28px 30px' } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
        <Box>
          <Eyebrow sx={{ color: TOV.coral }}>Novo disparo</Eyebrow>
          <Typography variant="h2" sx={{ fontSize: 28, mt: 0.75 }}>Preparar mensagem</Typography>
        </Box>
        <Typography sx={{ fontSize: 13, color: TOV.caption }}>{resumoPublico}</Typography>
      </Box>
      <Box sx={{
        display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1,
        bgcolor: TOV.offwhite, borderRadius: '12px', p: 0.75, mb: 2.5,
      }}>
        {[
          [1, 'Público'],
          [2, 'Mensagem'],
          [3, 'Revisar'],
        ].map(([numero, rotulo]) => {
          const ativo = etapa === numero
          const concluido = etapa > numero
          return (
            <Box
              key={numero}
              sx={{
                py: 1, px: 1.5, borderRadius: '9px', textAlign: 'center',
                bgcolor: ativo ? '#fff' : 'transparent',
                color: ativo || concluido ? TOV.coral : TOV.caption,
                fontWeight: ativo ? 700 : 600, fontSize: 13,
                boxShadow: ativo ? '0 3px 12px rgba(22,24,26,.07)' : 'none',
              }}
            >
              <Box component="span" sx={{
                display: 'inline-flex', width: 22, height: 22, borderRadius: '50%',
                alignItems: 'center', justifyContent: 'center', mr: 0.75,
                bgcolor: ativo || concluido ? TOV.coral : TOV.captionTint,
                color: ativo || concluido ? '#fff' : TOV.caption, fontSize: 11,
              }}>
                {concluido ? '✓' : numero}
              </Box>
              {rotulo}
            </Box>
          )
        })}
      </Box>
      {!conectada && (
        <Alert severity="warning" sx={{ mb: 2.5 }}>
          Conecte a instância pelo QR Code antes de fazer um disparo.
        </Alert>
      )}
      {etapa === 1 && (
        <>
        <TextField
          select fullWidth size="small" label="Público" value={tipo}
          onChange={(evento) => setTipo(evento.target.value)} sx={{ mb: 2 }}
        >
          <MenuItem value="alunos">Um ou vários alunos</MenuItem>
          <MenuItem value="turma">Uma turma inteira</MenuItem>
          <MenuItem value="todos">Todos os alunos ativos</MenuItem>
        </TextField>
        {tipo === 'turma' && (
          <TextField
            select fullWidth size="small" label="Turma" value={codTur}
            onChange={(evento) => setCodTur(evento.target.value)} sx={{ mb: 2 }}
          >
            {turmas.map((turma) => (
              <MenuItem key={turma.cod_tur} value={turma.cod_tur}>
                {turma.nome} ({turma.qtd_alunos || 0} alunos)
              </MenuItem>
            ))}
          </TextField>
        )}
        {tipo === 'alunos' && (
          <Autocomplete
            multiple options={opcoes} value={alunos}
            filterOptions={(itens) => itens}
            getOptionLabel={(aluno) => `${aluno.cod_alu} — ${aluno.nome}`}
            isOptionEqualToValue={(a, b) => a.cod_alu === b.cod_alu}
            onInputChange={(_, valor) => setBusca(valor)}
            onChange={(_, valor) => setAlunos(valor)}
            renderInput={(props) => (
              <TextField {...props} size="small" label="Buscar e selecionar alunos" />
            )}
            noOptionsText={busca.length < 2 ? 'Digite ao menos 2 letras' : 'Nenhum aluno encontrado'}
            sx={{ mb: 2 }}
          />
        )}
        {tipo === 'todos' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Serão considerados todos os alunos ativos; celulares ausentes, inválidos ou duplicados serão removidos na revisão.
          </Alert>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="contained" disabled={!publicoValido} onClick={() => setEtapa(2)}>
            Continuar para mensagem
          </Button>
        </Box>
        </>
      )}
      {etapa === 2 && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.15fr .85fr' }, gap: 2.5 }}>
            <Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                <Chip label="Texto" color="primary" size="small" sx={{ fontWeight: 700 }} />
                <Chip label="Imagem · em breve" variant="outlined" size="small" />
                <Chip label="Documento · em breve" variant="outlined" size="small" />
                <Chip label="Áudio · em breve" variant="outlined" size="small" />
              </Box>
              <TextField
                fullWidth multiline minRows={8} maxRows={14}
                label="Mensagem" value={mensagem}
                placeholder="Olá {{primeiro_nome}}, temos um aviso para você…"
                onChange={(evento) => setMensagem(evento.target.value)}
                helperText={`${mensagem.length}/4096 caracteres`}
                inputProps={{ maxLength: 4096 }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
                <Typography sx={{ fontSize: 13, color: TOV.caption }}>Personalizar:</Typography>
                <Chip size="small" clickable label="{{primeiro_nome}}" onClick={() => inserirVariavel('primeiro_nome')} />
                <Chip size="small" clickable label="{{nome}}" onClick={() => inserirVariavel('nome')} />
              </Box>
              <FormControlLabel
                sx={{ mt: 1.5 }}
                control={<Checkbox checked={linkPreview} onChange={(e) => setLinkPreview(e.target.checked)} />}
                label="Mostrar preview quando a mensagem contiver um link"
              />
            </Box>
            <Box>
              <Eyebrow sx={{ mb: 1 }}>Prévia</Eyebrow>
              <Box sx={{
                minHeight: 300, borderRadius: '16px', overflow: 'hidden',
                border: '1px solid #D8CEC6', bgcolor: '#E8DDD4',
                backgroundImage: 'radial-gradient(rgba(95,74,61,.08) 1px, transparent 1px)',
                backgroundSize: '16px 16px',
              }}>
                <Box sx={{ bgcolor: '#176B61', color: '#fff', px: 2, py: 1.5 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Centro TOV</Typography>
                  <Typography sx={{ opacity: 0.78, fontSize: 11 }}>WhatsApp Business</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 2.25 }}>
                  <Box sx={{
                    maxWidth: '88%', bgcolor: '#D8F7C8', borderRadius: '12px 2px 12px 12px',
                    px: 1.75, py: 1.25, boxShadow: '0 2px 5px rgba(0,0,0,.12)',
                    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                  }}>
                    <Typography sx={{ fontSize: 14, lineHeight: 1.45 }}>
                      {textoPrevia || 'Sua mensagem aparecerá aqui.'}
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: '#60806A', textAlign: 'right', mt: 0.5 }}>
                      agora ✓✓
                    </Typography>
                  </Box>
                </Box>
              </Box>
              <Typography sx={{ color: TOV.caption, fontSize: 11, mt: 1 }}>
                Exemplo com {nomePrevia}; cada aluno receberá seu próprio nome.
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, mt: 2.5 }}>
            <Button variant="outlined" onClick={() => setEtapa(1)}>Voltar ao público</Button>
            <Button
              variant="contained" startIcon={carregando ? <CircularProgress size={17} color="inherit" /> : <SendIcon />}
              disabled={!conectada || !mensagem.trim() || carregando}
              onClick={preparar}
            >
              {carregando ? 'Validando…' : 'Revisar disparo'}
            </Button>
          </Box>
        </>
      )}
    </Box>
  )
}

function Historico({ itens, onAbrir }) {
  return (
    <Box sx={{ ...cardSx, p: { xs: 2.5, md: '28px 30px' }, mt: '18px' }}>
      <Typography variant="h2" sx={{ fontSize: 26, mb: 2.5 }}>Histórico de disparos</Typography>
      {!itens && <LinearProgress />}
      {itens?.length === 0 && (
        <Typography sx={{ color: TOV.caption, fontSize: 14 }}>Nenhum disparo realizado ainda.</Typography>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {itens?.map((item, indice) => {
          const processados = item.total_enviados + item.total_falhos
          const progresso = item.total_validos ? Math.round((processados / item.total_validos) * 100) : 0
          return (
            <Box
              key={item.id}
              component="button"
              type="button"
              onClick={() => onAbrir(item.id)}
              sx={{
                appearance: 'none', border: 0, bgcolor: 'transparent', color: 'inherit',
                font: 'inherit', textAlign: 'left', cursor: 'pointer', p: '18px 0',
                borderTop: indice ? `1px solid ${TOV.offwhite}` : 0,
                '&:hover h3': { color: TOV.coral },
                '&:focus-visible': { outline: `2px solid ${TOV.coral}`, outlineOffset: 2 },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <Typography component="h3" sx={{ fontWeight: 700, fontSize: 16, transition: 'color .15s' }}>
                  #{item.id} · {item.publico_descricao}
                </Typography>
                <PilulaDisparo status={item.status} />
                <Typography sx={{ ml: { sm: 'auto' }, fontSize: 12, color: TOV.caption }}>
                  {dataHora(item.criado_em)}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 13, color: TOV.caption, mt: 0.75 }}>
                Por {item.usuario} · {item.total_enviados} enviados · {item.total_falhos} falhos · {item.total_invalidos} ignorados
              </Typography>
              {!STATUS_FINAL.has(item.status) && (
                <LinearProgress variant="determinate" value={progresso} sx={{ mt: 1.5, height: 6, borderRadius: 3 }} />
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

export default function WhatsApp() {
  const [instancia, setInstancia] = useState(null)
  const [carregandoInstancia, setCarregandoInstancia] = useState(true)
  const [turmas, setTurmas] = useState([])
  const [historico, setHistorico] = useState(null)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState(true)
  const [criacaoAberta, setCriacaoAberta] = useState(false)
  const [nomeInstancia, setNomeInstancia] = useState('Centro TOV')
  const [salvando, setSalvando] = useState(false)
  const [qrAberto, setQrAberto] = useState(false)
  const [desconectarAberto, setDesconectarAberto] = useState(false)
  const [previa, setPrevia] = useState(null)
  const [dadosDisparo, setDadosDisparo] = useState(null)
  const [consentimento, setConsentimento] = useState(false)
  const [validando, setValidando] = useState(false)
  const [detalhe, setDetalhe] = useState(null)
  const [sincronizando, setSincronizando] = useState(false)
  const telaCheia = useDialogoTelaCheia()

  function notificar(texto, ehErro = true) {
    setErro(ehErro)
    setMsg(texto)
  }

  async function carregarInstancia(silencioso = false) {
    if (!silencioso) setCarregandoInstancia(true)
    try {
      const resposta = await api.get('/whatsapp/instancia')
      setInstancia(resposta)
      return resposta
    } catch (e) {
      if (!silencioso) notificar(e.message)
      return null
    } finally {
      if (!silencioso) setCarregandoInstancia(false)
    }
  }

  function carregarHistorico() {
    api.get('/whatsapp/disparos?por_pagina=30')
      .then((resposta) => setHistorico(resposta.itens))
      .catch((e) => notificar(e.message))
  }

  useEffect(() => {
    carregarInstancia()
    carregarHistorico()
    api.get('/turmas').then(setTurmas).catch(() => {})
  }, [])

  useEffect(() => {
    if (!qrAberto || instancia?.conectada) return undefined
    const inicio = Date.now()
    const timer = setInterval(async () => {
      const atual = await carregarInstancia(true)
      if (atual?.conectada) {
        notificar('WhatsApp conectado com sucesso.', false)
        setQrAberto(false)
      } else if (Date.now() - inicio > 120000) {
        clearInterval(timer)
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [qrAberto, instancia?.conectada])

  useEffect(() => {
    if (!detalhe || STATUS_FINAL.has(detalhe.status)) return undefined
    const timer = setInterval(() => sincronizar(detalhe.id, true), 10000)
    return () => clearInterval(timer)
  }, [detalhe?.id, detalhe?.status])

  async function criarInstancia() {
    setSalvando(true)
    try {
      const resposta = await api.post('/whatsapp/instancia', { nome: nomeInstancia })
      setInstancia(resposta)
      setCriacaoAberta(false)
      notificar('Instância criada. Agora conecte o WhatsApp pelo QR Code.', false)
    } catch (e) {
      notificar(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function conectar() {
    setCarregandoInstancia(true)
    try {
      const resposta = await api.post('/whatsapp/instancia/conectar', {})
      setInstancia(resposta)
      setQrAberto(true)
    } catch (e) {
      notificar(e.message)
    } finally {
      setCarregandoInstancia(false)
    }
  }

  async function desconectar() {
    setSalvando(true)
    try {
      const resposta = await api.post('/whatsapp/instancia/desconectar', {})
      setInstancia(resposta)
      setDesconectarAberto(false)
      notificar('Instância desconectada.', false)
    } catch (e) {
      notificar(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function revisar(dados) {
    setValidando(true)
    try {
      const resposta = await api.post('/whatsapp/previsualizar', dados)
      setDadosDisparo(dados)
      setPrevia(resposta)
      setConsentimento(false)
    } catch (e) {
      notificar(e.message)
    } finally {
      setValidando(false)
    }
  }

  async function enviar() {
    setSalvando(true)
    try {
      const resposta = await api.post('/whatsapp/disparos', {
        ...dadosDisparo,
        consentimento_confirmado: consentimento,
      })
      setPrevia(null)
      setConsentimento(false)
      notificar(`Disparo #${resposta.id} adicionado à fila.`, false)
      carregarHistorico()
      abrirDetalhe(resposta.id)
    } catch (e) {
      notificar(e.message)
      carregarHistorico()
    } finally {
      setSalvando(false)
    }
  }

  async function abrirDetalhe(id) {
    try {
      setDetalhe(await api.get(`/whatsapp/disparos/${id}`))
    } catch (e) {
      notificar(e.message)
    }
  }

  async function sincronizar(id, silencioso = false) {
    if (!silencioso) setSincronizando(true)
    try {
      const resposta = await api.post(`/whatsapp/disparos/${id}/sincronizar`, {})
      setDetalhe(resposta)
      carregarHistorico()
    } catch (e) {
      if (!silencioso) notificar(e.message)
    } finally {
      if (!silencioso) setSincronizando(false)
    }
  }

  const progressoDetalhe = useMemo(() => {
    if (!detalhe?.total_validos) return 0
    return Math.round(((detalhe.total_enviados + detalhe.total_falhos) / detalhe.total_validos) * 100)
  }, [detalhe])

  return (
    <Box>
      <CabecalhoPagina
        titulo="WhatsApp"
        subtitulo="Conecte a conta e envie comunicados personalizados aos alunos."
      />
      <CardInstancia
        instancia={instancia}
        carregando={carregandoInstancia}
        onCriar={() => setCriacaoAberta(true)}
        onConectar={conectar}
        onDesconectar={() => setDesconectarAberto(true)}
        onAtualizar={() => carregarInstancia()}
      />
      <Compositor
        turmas={turmas}
        conectada={!!instancia?.conectada}
        onPrevia={revisar}
        carregando={validando}
      />
      <Historico itens={historico} onAbrir={abrirDetalhe} />

      <Dialog open={criacaoAberta} onClose={() => setCriacaoAberta(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Criar instância do WhatsApp</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: TOV.caption, fontSize: 14, mb: 2 }}>
            Será criada uma única instância na UazAPI para o Centro TOV.
          </Typography>
          <TextField
            autoFocus fullWidth label="Nome da instância" value={nomeInstancia}
            onChange={(e) => setNomeInstancia(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button variant="outlined" onClick={() => setCriacaoAberta(false)} disabled={salvando}>Cancelar</Button>
          <Button variant="contained" onClick={criarInstancia} disabled={nomeInstancia.trim().length < 2 || salvando}>
            {salvando ? 'Criando…' : 'Criar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={qrAberto} onClose={() => setQrAberto(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Conectar WhatsApp</DialogTitle>
        <DialogContent sx={{ textAlign: 'center' }}>
          <Typography sx={{ color: TOV.caption, fontSize: 14, mb: 2 }}>
            No celular, abra WhatsApp → Aparelhos conectados → Conectar um aparelho.
          </Typography>
          {instancia?.qrcode ? (
            <Box
              component="img" src={qrSrc(instancia.qrcode)} alt="QR Code para conectar o WhatsApp"
              sx={{ width: '100%', maxWidth: 300, aspectRatio: '1', objectFit: 'contain', bgcolor: '#fff' }}
            />
          ) : (
            <Box sx={{ py: 7 }}>
              <CircularProgress />
              <Typography sx={{ mt: 2, color: TOV.caption }}>Aguardando QR Code…</Typography>
            </Box>
          )}
          <Typography sx={{ color: TOV.caption, fontSize: 12, mt: 2 }}>
            O código é atualizado automaticamente e expira em cerca de 2 minutos.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button onClick={() => setQrAberto(false)}>Fechar</Button>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={conectar}>Gerar novo</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!previa} onClose={salvando ? undefined : () => setPrevia(null)} maxWidth="md" fullWidth fullScreen={telaCheia}>
        <DialogTitle>Revisar disparo</DialogTitle>
        <DialogContent>
          {previa && (
            <>
              <Alert severity={previa.validos ? 'info' : 'warning'} sx={{ mb: 2 }}>
                <b>{previa.publico_descricao}</b>: {previa.validos} aptos para envio e {previa.invalidos} ignorados.
              </Alert>
              <Box sx={{ maxHeight: 310, overflowY: 'auto', border: `1px solid ${TOV.offwhite}`, borderRadius: 2 }}>
                {previa.itens.map((item, indice) => (
                  <Box key={`${item.cod_alu}-${indice}`} sx={{ p: 1.5, borderTop: indice ? `1px solid ${TOV.offwhite}` : 0, display: 'flex', gap: 2 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{item.nome}</Typography>
                      <Typography sx={{ color: TOV.caption, fontSize: 12 }}>{item.celular || 'Sem celular'}</Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={item.valido ? 'Será enviado' : item.motivo}
                      color={item.valido ? 'success' : 'default'}
                    />
                  </Box>
                ))}
              </Box>
              <FormControlLabel
                sx={{ mt: 2 }}
                control={<Checkbox checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} />}
                label="Confirmo que os destinatários autorizaram o contato pelo WhatsApp."
              />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button variant="outlined" onClick={() => setPrevia(null)} disabled={salvando}>Voltar</Button>
          <Button
            variant="contained" onClick={enviar}
            disabled={!previa?.validos || !consentimento || salvando}
          >
            {salvando ? 'Enfileirando…' : `Enviar para ${previa?.validos || 0}`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!detalhe} onClose={() => setDetalhe(null)} maxWidth="md" fullWidth fullScreen={telaCheia}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          Disparo #{detalhe?.id} {detalhe && <PilulaDisparo status={detalhe.status} />}
        </DialogTitle>
        <DialogContent>
          {detalhe && (
            <>
              <Typography sx={{ fontWeight: 700 }}>{detalhe.publico_descricao}</Typography>
              <Typography sx={{ color: TOV.caption, fontSize: 13, mt: 0.5 }}>
                Criado por {detalhe.usuario} em {dataHora(detalhe.criado_em)}
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1.5, my: 2.5 }}>
                {[
                  ['Enviados', detalhe.total_enviados],
                  ['Falhos', detalhe.total_falhos],
                  ['Ignorados', detalhe.total_invalidos],
                ].map(([rotulo, valor]) => (
                  <Box key={rotulo} sx={{ bgcolor: TOV.offwhite, borderRadius: 2, p: 1.5, textAlign: 'center' }}>
                    <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: 25 }}>{valor}</Typography>
                    <Typography sx={{ color: TOV.caption, fontSize: 12 }}>{rotulo}</Typography>
                  </Box>
                ))}
              </Box>
              {!STATUS_FINAL.has(detalhe.status) && (
                <LinearProgress variant="determinate" value={progressoDetalhe} sx={{ mb: 2.5, height: 7, borderRadius: 4 }} />
              )}
              {detalhe.erro && <Alert severity="error" sx={{ mb: 2 }}>{detalhe.erro}</Alert>}
              <Divider />
              <Box sx={{ maxHeight: 330, overflowY: 'auto' }}>
                {detalhe.destinatarios.map((item, indice) => (
                  <Box key={item.id} sx={{ py: 1.5, borderTop: indice ? `1px solid ${TOV.offwhite}` : 0, display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{item.nome}</Typography>
                      <Typography sx={{ color: TOV.caption, fontSize: 12 }}>{item.celular || item.motivo}</Typography>
                    </Box>
                    <Chip size="small" label={item.status} />
                  </Box>
                ))}
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button onClick={() => setDetalhe(null)}>Fechar</Button>
          {detalhe && !STATUS_FINAL.has(detalhe.status) && (
            <Button
              variant="outlined" startIcon={<RefreshIcon />} disabled={sincronizando}
              onClick={() => sincronizar(detalhe.id)}
            >
              {sincronizando ? 'Atualizando…' : 'Atualizar agora'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <DialogoConfirmacao
        aberto={desconectarAberto}
        titulo="Desconectar o WhatsApp?"
        descricao="A sessão será encerrada. Para usar novamente, será necessário ler um novo QR Code."
        rotuloConfirmar="Desconectar"
        processando={salvando}
        onConfirmar={desconectar}
        onFechar={() => setDesconectarAberto(false)}
      />

      <Snackbar open={!!msg} autoHideDuration={8000} onClose={() => setMsg('')}>
        <Alert severity={erro ? 'error' : 'success'} onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
