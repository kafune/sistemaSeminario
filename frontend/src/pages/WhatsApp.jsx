import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  IconButton, LinearProgress, MenuItem, Snackbar, TextField, Typography,
} from '@mui/material'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import QrCode2Icon from '@mui/icons-material/QrCode2'
import RefreshIcon from '@mui/icons-material/Refresh'
import SendIcon from '@mui/icons-material/Send'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import SaveIcon from '@mui/icons-material/Save'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { api, enviarArquivoJson, getPerfil } from '../api'
import { TOV } from '../theme'
import {
  CabecalhoPagina, DialogoConfirmacao, Eyebrow, cardSx, useDialogoTelaCheia,
} from '../ui'

const STATUS_FINAL = new Set(['CONCLUIDO', 'CONCLUIDO_COM_FALHAS', 'FALHA', 'CANCELADO'])

const STATUS_LABEL = {
  CRIANDO: 'Criando',
  NA_FILA: 'Na fila',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  CONCLUIDO_COM_FALHAS: 'Concluído com falhas',
  FALHA: 'Falha',
  AGENDADO: 'Agendado',
  PAUSADO: 'Pausado',
  CANCELADO: 'Cancelado',
}

const TIPOS = [
  ['text', 'Texto'],
  ['image', 'Imagem'],
  ['document', 'Documento'],
  ['audio', 'Áudio'],
  ['button', 'Botões'],
  ['poll', 'Enquete'],
  ['carousel', 'Carrossel'],
]

function dataHora(iso) {
  if (!iso) return '—'
  return new Date(`${iso}${iso.endsWith('Z') ? '' : 'Z'}`).toLocaleString('pt-BR')
}

function valorDataLocal(iso) {
  if (!iso) return ''
  const data = new Date(`${iso}${iso.endsWith('Z') ? '' : 'Z'}`)
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
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
  instancia, carregando, podeAdministrar,
  onCriar, onConectar, onDesconectar, onAtualizar,
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
          {!podeAdministrar && !conectada && (
            <Typography sx={{ color: TOV.caption, fontSize: 12, mt: 0.5 }}>
              Solicite a um administrador para configurar ou reconectar a instância.
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
          {podeAdministrar && !configurada && (
            <Button variant="contained" onClick={onCriar}>Criar instância</Button>
          )}
          {podeAdministrar && configurada && !conectada && (
            <Button variant="contained" startIcon={<QrCode2Icon />} onClick={onConectar}>
              Conectar
            </Button>
          )}
          {podeAdministrar && conectada && (
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

function PreviewMensagem({ conteudo, texto }) {
  const tipo = conteudo?.tipo || 'text'
  return (
    <Box sx={{
      maxWidth: '92%', bgcolor: '#D8F7C8', borderRadius: '12px 2px 12px 12px',
      px: 1.5, py: 1.25, boxShadow: '0 2px 5px rgba(0,0,0,.12)',
      whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
    }}>
      {tipo === 'image' && conteudo.arquivo?.url && (
        <Box component="img" src={conteudo.arquivo.url} alt="" sx={{ width: '100%', maxHeight: 210, objectFit: 'cover', borderRadius: 1, mb: 1 }} />
      )}
      {tipo === 'document' && (
        <Box sx={{ bgcolor: 'rgba(255,255,255,.6)', p: 1.25, borderRadius: 1, mb: 1, fontSize: 13 }}>
          📄 {conteudo.nome_arquivo || conteudo.arquivo?.nome || 'Documento'}
        </Box>
      )}
      {tipo === 'audio' && conteudo.arquivo?.url && (
        <Box component="audio" controls src={conteudo.arquivo.url} sx={{ width: '100%', maxWidth: 280, mb: 1 }} />
      )}
      {tipo === 'carousel' && (
        <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', mb: 1, maxWidth: 330 }}>
          {conteudo.carousel?.map((cartao, indice) => (
            <Box key={indice} sx={{ flex: '0 0 190px', bgcolor: 'rgba(255,255,255,.62)', borderRadius: 1.5, overflow: 'hidden' }}>
              {cartao.arquivo?.url && <Box component="img" src={cartao.arquivo.url} alt="" sx={{ width: '100%', height: 105, objectFit: 'cover' }} />}
              <Typography sx={{ p: 1, fontSize: 12, whiteSpace: 'pre-wrap' }}>{cartao.texto}</Typography>
              {cartao.botoes?.map((botao, i) => (
                <Box key={i} sx={{ textAlign: 'center', borderTop: '1px solid rgba(0,0,0,.08)', py: 0.6, color: '#176B61', fontSize: 11, fontWeight: 700 }}>
                  {botao.texto}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      )}
      <Typography sx={{ fontSize: 14, lineHeight: 1.45 }}>
        {texto || (tipo === 'audio' ? '' : 'Sua mensagem aparecerá aqui.')}
      </Typography>
      {tipo === 'button' && conteudo.botoes?.map((botao, indice) => (
        <Box key={indice} sx={{ textAlign: 'center', borderTop: '1px solid rgba(0,0,0,.09)', pt: 0.75, mt: 0.75, color: '#176B61', fontSize: 12, fontWeight: 700 }}>
          {botao.texto}
        </Box>
      ))}
      {tipo === 'poll' && conteudo.enquete_opcoes?.map((opcao, indice) => (
        <Box key={indice} sx={{ display: 'flex', gap: 0.75, borderTop: '1px solid rgba(0,0,0,.08)', pt: 0.75, mt: 0.75, fontSize: 12 }}>
          ◯ {opcao}
        </Box>
      ))}
      <Typography sx={{ fontSize: 10, color: '#60806A', textAlign: 'right', mt: 0.5 }}>
        agora ✓✓
      </Typography>
    </Box>
  )
}

function PreviewSequencia({ conteudo, nome = 'Maria da Silva' }) {
  if (!conteudo) return null
  const itens = [conteudo, ...(conteudo.sequencia || [])]
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, width: '100%' }}>
      {itens.map((item, indice) => {
        const texto = (item.mensagem || '')
          .replace(/\{\{\s*primeiro_nome\s*\}\}/g, nome.split(/\s+/)[0])
          .replace(/\{\{\s*nome\s*\}\}/g, nome)
        return <PreviewMensagem key={indice} conteudo={item} texto={texto} />
      })}
      {itens.length > 1 && (
        <Typography sx={{ fontSize: 10, color: '#6A5C52' }}>
          Intervalo de {conteudo.intervalo_segundos || 8}s entre as mensagens
        </Typography>
      )}
    </Box>
  )
}

function EditorBotoes({ botoes, onChange }) {
  function atualizar(indice, campo, valor) {
    onChange(botoes.map((botao, i) => i === indice ? { ...botao, [campo]: valor } : botao))
  }
  return (
    <Box sx={{ mt: 2 }}>
      <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 1 }}>Botões</Typography>
      {botoes.map((botao, indice) => (
        <Box key={indice} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 130px 1fr auto' }, gap: 1, mb: 1 }}>
          <TextField size="small" label="Texto" value={botao.texto} onChange={(e) => atualizar(indice, 'texto', e.target.value)} />
          <TextField select size="small" label="Tipo" value={botao.tipo} onChange={(e) => atualizar(indice, 'tipo', e.target.value)}>
            <MenuItem value="REPLY">Resposta</MenuItem>
            <MenuItem value="URL">Link</MenuItem>
            <MenuItem value="COPY">Copiar</MenuItem>
            <MenuItem value="CALL">Ligar</MenuItem>
          </TextField>
          <TextField size="small" label={botao.tipo === 'URL' ? 'URL' : botao.tipo === 'CALL' ? 'Telefone' : 'Valor'} value={botao.valor} onChange={(e) => atualizar(indice, 'valor', e.target.value)} />
          <IconButton aria-label="Remover botão" onClick={() => onChange(botoes.filter((_, i) => i !== indice))}><DeleteIcon /></IconButton>
        </Box>
      ))}
      <Button
        size="small" startIcon={<AddIcon />}
        disabled={botoes.length >= 3}
        onClick={() => onChange([...botoes, { texto: '', tipo: 'REPLY', valor: '' }])}
      >
        Adicionar botão
      </Button>
    </Box>
  )
}

function Compositor({
  turmas, conectada, onPrevia, carregando, onAviso, alunoInicial, disparoEdicao,
}) {
  const perfil = getPerfil()
  const [etapa, setEtapa] = useState(1)
  const [tipo, setTipo] = useState(() => perfil === 'MARKETING' ? 'leads' : 'turma')
  const [codTur, setCodTur] = useState('')
  const [alunos, setAlunos] = useState([])
  const [opcoes, setOpcoes] = useState([])
  const [busca, setBusca] = useState('')
  const [segmentoLeads, setSegmentoLeads] = useState('todos')
  const [leads, setLeads] = useState([])
  const [opcoesLead, setOpcoesLead] = useState([])
  const [buscaLead, setBuscaLead] = useState('')
  const [filtrosLead, setFiltrosLead] = useState({ origens: [], campanhas: [], tags: [], status_funil: [] })
  const [valorSegmentoLead, setValorSegmentoLead] = useState('')
  const [tipoMensagem, setTipoMensagem] = useState('text')
  const [mensagem, setMensagem] = useState('')
  const [linkPreview, setLinkPreview] = useState(true)
  const [arquivo, setArquivo] = useState(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [botoes, setBotoes] = useState([{ texto: '', tipo: 'REPLY', valor: '' }])
  const [opcoesEnquete, setOpcoesEnquete] = useState(['', ''])
  const [selecionaveis, setSelecionaveis] = useState(1)
  const [cartoes, setCartoes] = useState([
    { texto: '', arquivo: null, botoes: [{ texto: '', tipo: 'REPLY', valor: '' }] },
    { texto: '', arquivo: null, botoes: [{ texto: '', tipo: 'REPLY', valor: '' }] },
  ])
  const [agendadoPara, setAgendadoPara] = useState('')
  const [templates, setTemplates] = useState([])
  const [templateId, setTemplateId] = useState('')
  const [templateAberto, setTemplateAberto] = useState(false)
  const [nomeTemplate, setNomeTemplate] = useState('')
  const [salvandoTemplate, setSalvandoTemplate] = useState(false)
  const [enviandoArquivo, setEnviandoArquivo] = useState(false)
  const [sequencia, setSequencia] = useState([])
  const [intervaloSequencia, setIntervaloSequencia] = useState(8)
  const [categoriaTemplate, setCategoriaTemplate] = useState('Geral')
  const [favoritoTemplate, setFavoritoTemplate] = useState(false)
  const [categoriaApi, setCategoriaApi] = useState('UTILIDADE')
  const [finalidade, setFinalidade] = useState('OPERACIONAL')
  const [confirmarTeste, setConfirmarTeste] = useState(false)
  const [testando, setTestando] = useState(false)

  useEffect(() => {
    if (!alunoInicial) return
    api.get(`/alunos/${alunoInicial}`)
      .then((aluno) => {
        setTipo('alunos')
        setAlunos([aluno])
        setOpcoes((atuais) => [aluno, ...atuais.filter((item) => item.cod_alu !== aluno.cod_alu)])
        setEtapa(2)
      })
      .catch((e) => onAviso(e.message))
  }, [alunoInicial])

  useEffect(() => {
    if (!disparoEdicao) return
    const itens = [disparoEdicao.conteudo, ...(disparoEdicao.conteudo?.sequencia || [])]
    setSequencia(itens.slice(0, -1))
    carregarNoEditor(itens.at(-1))
    setIntervaloSequencia(disparoEdicao.conteudo?.intervalo_segundos || 8)
    setAgendadoPara(valorDataLocal(disparoEdicao.agendado_para))
    if (disparoEdicao.tipo_publico === 'leads') {
      const selecionados = (disparoEdicao.destinatarios || [])
        .filter((item) => item.valido && item.lead_id)
        .map((item) => ({ id: item.lead_id, nome: item.nome, telefone: item.celular }))
      setTipo('leads')
      setSegmentoLeads('selecionados')
      setLeads(selecionados)
      setOpcoesLead(selecionados)
    } else if (disparoEdicao.tipo_publico === 'turma') {
      setTipo('turma')
      setCodTur(disparoEdicao.cod_tur || '')
    } else if (disparoEdicao.tipo_publico === 'todos') {
      setTipo('todos')
    } else {
      const selecionados = (disparoEdicao.destinatarios || [])
        .filter((item) => item.valido)
        .map((item) => ({ cod_alu: item.cod_alu, nome: item.nome, celular: item.celular }))
      setTipo('alunos')
      setAlunos(selecionados)
      setOpcoes(selecionados)
    }
    setCategoriaApi(disparoEdicao.categoria_api || 'UTILIDADE')
    setFinalidade(disparoEdicao.finalidade || 'OPERACIONAL')
    setEtapa(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [disparoEdicao?.id])

  useEffect(() => {
    if (tipo === 'leads' || busca.trim().length < 2) return undefined
    const timer = setTimeout(() => {
      api.get(`/alunos?busca=${encodeURIComponent(busca)}&status=A&por_pagina=30`)
        .then((resposta) => setOpcoes(resposta.itens))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [busca, tipo])

  useEffect(() => {
    if (tipo !== 'leads' || buscaLead.trim().length < 2) return undefined
    const timer = setTimeout(() => {
      api.get(`/leads?busca=${encodeURIComponent(buscaLead)}&por_pagina=30`)
        .then((resposta) => setOpcoesLead(resposta.itens))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [buscaLead, tipo])

  useEffect(() => {
    if (perfil === 'SECRETARIA') return
    api.get('/leads/opcoes').then(setFiltrosLead).catch(() => {})
  }, [perfil])

  useEffect(() => {
    if (tipo === 'leads') {
      setCategoriaApi('MARKETING')
      if (finalidade === 'OPERACIONAL') setFinalidade('NUTRICAO')
    }
  }, [tipo])

  function carregarTemplates() {
    api.get('/whatsapp/templates').then(setTemplates).catch(() => {})
  }
  useEffect(() => { carregarTemplates() }, [])

  function inserirVariavel(variavel) {
    setMensagem((atual) => `${atual}${atual && !atual.endsWith(' ') ? ' ' : ''}{{${variavel}}}`)
  }

  function conteudoAtual() {
    const conteudo = {
      tipo: tipoMensagem,
      mensagem,
      link_preview: linkPreview,
    }
    if (['image', 'document', 'audio'].includes(tipoMensagem)) {
      conteudo.arquivo_id = arquivo?.id || null
      conteudo.nome_arquivo = nomeArquivo || null
    }
    if (tipoMensagem === 'button') {
      conteudo.botoes = botoes.filter((b) => b.texto.trim() && b.valor.trim())
    }
    if (tipoMensagem === 'poll') {
      conteudo.enquete_opcoes = opcoesEnquete.filter((opcao) => opcao.trim())
      conteudo.enquete_selecionaveis = Number(selecionaveis) || 1
    }
    if (tipoMensagem === 'carousel') {
      conteudo.carousel = cartoes.map((cartao) => ({
        texto: cartao.texto,
        arquivo_id: cartao.arquivo?.id || null,
        botoes: cartao.botoes.filter((b) => b.texto.trim() && b.valor.trim()),
      }))
    }
    return conteudo
  }

  function conteudoPreviaAtual() {
    const conteudo = conteudoAtual()
    if (['image', 'document', 'audio'].includes(tipoMensagem)) {
      conteudo.arquivo = arquivo
    }
    if (tipoMensagem === 'carousel') {
      conteudo.carousel = cartoes.map((cartao) => ({
        ...cartao,
        arquivo_id: cartao.arquivo?.id || null,
      }))
    }
    return conteudo
  }

  function composicaoAtual(preview = false) {
    const atual = preview ? conteudoPreviaAtual() : conteudoAtual()
    const itens = [...sequencia, atual]
    return {
      ...itens[0],
      sequencia: itens.slice(1),
      intervalo_segundos: Number(intervaloSequencia) || 8,
    }
  }

  function limparEditor() {
    setTipoMensagem('text')
    setMensagem('')
    setLinkPreview(true)
    setArquivo(null)
    setNomeArquivo('')
    setBotoes([{ texto: '', tipo: 'REPLY', valor: '' }])
    setOpcoesEnquete(['', ''])
    setSelecionaveis(1)
    setCartoes([
      { texto: '', arquivo: null, botoes: [{ texto: '', tipo: 'REPLY', valor: '' }] },
      { texto: '', arquivo: null, botoes: [{ texto: '', tipo: 'REPLY', valor: '' }] },
    ])
  }

  function carregarNoEditor(c) {
    setTipoMensagem(c.tipo)
    setMensagem(c.mensagem || '')
    setLinkPreview(c.link_preview !== false)
    setArquivo(c.arquivo || null)
    setNomeArquivo(c.nome_arquivo || '')
    setBotoes(c.botoes?.length ? c.botoes : [{ texto: '', tipo: 'REPLY', valor: '' }])
    setOpcoesEnquete(c.enquete_opcoes?.length ? c.enquete_opcoes : ['', ''])
    setSelecionaveis(c.enquete_selecionaveis || 1)
    setCartoes(c.carousel?.length ? c.carousel.map((cartao) => ({
      texto: cartao.texto,
      arquivo: cartao.arquivo,
      botoes: cartao.botoes,
    })) : [
      { texto: '', arquivo: null, botoes: [{ texto: '', tipo: 'REPLY', valor: '' }] },
      { texto: '', arquivo: null, botoes: [{ texto: '', tipo: 'REPLY', valor: '' }] },
    ])
  }

  function preparar() {
    const filtroLead = {
      campanha: segmentoLeads === 'campanha' ? valorSegmentoLead : null,
      origem: segmentoLeads === 'origem' ? valorSegmentoLead : null,
      tag: segmentoLeads === 'tag' ? valorSegmentoLead : null,
      status_funil: segmentoLeads === 'status_funil' ? valorSegmentoLead : null,
    }
    onPrevia({
      publico: {
        tipo,
        aluno_ids: alunos.map((aluno) => aluno.cod_alu),
        cod_tur: tipo === 'turma' ? Number(codTur) : null,
        lead_ids: leads.map((lead) => lead.id),
        segmento_leads: tipo === 'leads' ? segmentoLeads : null,
        ...filtroLead,
      },
      conteudo: composicaoAtual(),
      categoria_api: categoriaApi,
      finalidade,
      agendado_para: agendadoPara ? new Date(agendadoPara).toISOString() : null,
      editar_id: disparoEdicao?.id || null,
    })
  }

  async function subirArquivo(file, aoConcluir) {
    if (!file) return
    setEnviandoArquivo(true)
    try {
      aoConcluir(await enviarArquivoJson('/whatsapp/arquivos', file))
    } catch (e) {
      onAviso(e.message)
    } finally {
      setEnviandoArquivo(false)
    }
  }

  function aplicarTemplate(id) {
    setTemplateId(id)
    const template = templates.find((item) => item.id === Number(id))
    if (!template) return
    const itens = [template.conteudo, ...(template.conteudo.sequencia || [])]
    setSequencia(itens.slice(0, -1))
    carregarNoEditor(itens.at(-1))
    setIntervaloSequencia(template.conteudo.intervalo_segundos || 8)
    setNomeTemplate(template.nome)
    setCategoriaTemplate(template.categoria || 'Geral')
    setCategoriaApi(template.categoria_api || 'UTILIDADE')
    setFinalidade(template.finalidade || 'OPERACIONAL')
    setFavoritoTemplate(!!template.favorito)
    onAviso(`Template “${template.nome}” carregado.`, false)
  }

  async function salvarTemplate() {
    setSalvandoTemplate(true)
    try {
      const novo = await api.post('/whatsapp/templates', {
        nome: nomeTemplate,
        categoria: categoriaTemplate,
        categoria_api: categoriaApi,
        finalidade,
        favorito: favoritoTemplate,
        conteudo: composicaoAtual(),
      })
      setTemplateAberto(false)
      setNomeTemplate('')
      await api.get('/whatsapp/templates').then((lista) => {
        setTemplates(lista)
        setTemplateId(novo.id)
      })
      onAviso('Template salvo para reutilização.', false)
    } catch (e) {
      onAviso(e.message)
    } finally {
      setSalvandoTemplate(false)
    }
  }

  async function atualizarTemplate() {
    if (!templateId) return
    setSalvandoTemplate(true)
    try {
      await api.put(`/whatsapp/templates/${templateId}`, {
        nome: nomeTemplate,
        categoria: categoriaTemplate,
        categoria_api: categoriaApi,
        finalidade,
        favorito: favoritoTemplate,
        conteudo: composicaoAtual(),
      })
      carregarTemplates()
      onAviso('Template atualizado e uma nova versão foi registrada.', false)
    } catch (e) {
      onAviso(e.message)
    } finally {
      setSalvandoTemplate(false)
    }
  }

  async function duplicarTemplate() {
    if (!templateId) return
    try {
      const copia = await api.post(`/whatsapp/templates/${templateId}/duplicar`, {})
      carregarTemplates()
      setTemplateId(copia.id)
      setNomeTemplate(copia.nome)
      onAviso('Template duplicado.', false)
    } catch (e) {
      onAviso(e.message)
    }
  }

  async function enviarTeste() {
    setTestando(true)
    try {
      const resposta = await api.post('/whatsapp/testar', composicaoAtual())
      setConfirmarTeste(false)
      onAviso(`${resposta.quantidade} mensagem(ns) de teste adicionada(s) à fila do número conectado.`, false)
    } catch (e) {
      onAviso(e.message)
    } finally {
      setTestando(false)
    }
  }

  async function excluirTemplate() {
    if (!templateId) return
    try {
      await api.del(`/whatsapp/templates/${templateId}`)
      setTemplateId('')
      carregarTemplates()
      onAviso('Template excluído.', false)
    } catch (e) {
      onAviso(e.message)
    }
  }

  const publicoValido = tipo === 'leads'
    ? (segmentoLeads === 'todos' || (segmentoLeads === 'selecionados' ? leads.length > 0 : !!valorSegmentoLead))
    : tipo === 'todos' || (tipo === 'turma' ? !!codTur : alunos.length > 0)
  const resumoPublico = tipo === 'leads'
    ? (segmentoLeads === 'todos'
      ? 'Todos os leads ativos com opt-in'
      : segmentoLeads === 'selecionados'
        ? `${leads.length} ${leads.length === 1 ? 'lead selecionado' : 'leads selecionados'}`
        : `${segmentoLeads.replace('_', ' ')}: ${valorSegmentoLead || 'selecione'}`)
    : tipo === 'todos'
    ? 'Todos os alunos ativos'
    : tipo === 'turma'
      ? (turmas.find((turma) => turma.cod_tur === Number(codTur))?.nome || 'Selecione uma turma')
      : `${alunos.length} ${alunos.length === 1 ? 'aluno selecionado' : 'alunos selecionados'}`
  const nomePrevia = (tipo === 'leads' ? leads[0]?.nome : alunos[0]?.nome) || 'Maria da Silva'
  const primeiroNomePrevia = nomePrevia.split(/\s+/)[0]
  const conteudoPrevia = composicaoAtual(true)
  const conteudoValido = tipoMensagem === 'text'
    ? !!mensagem.trim()
    : ['image', 'document', 'audio'].includes(tipoMensagem)
      ? !!arquivo
      : tipoMensagem === 'button'
        ? !!mensagem.trim() && botoes.some((b) => b.texto.trim() && b.valor.trim())
        : tipoMensagem === 'poll'
          ? !!mensagem.trim() && opcoesEnquete.filter((o) => o.trim()).length >= 2
          : !!mensagem.trim() && cartoes.length >= 2 && cartoes.every((c) => c.texto.trim() && c.arquivo && c.botoes.some((b) => b.texto.trim() && b.valor.trim()))

  return (
    <Box sx={{ ...cardSx, p: { xs: 2.5, md: '28px 30px' } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
        <Box>
          <Eyebrow sx={{ color: TOV.coral }}>{disparoEdicao ? `Editar agendamento #${disparoEdicao.id}` : 'Novo disparo'}</Eyebrow>
          <Typography variant="h2" sx={{ fontSize: 28, mt: 0.75 }}>
            {disparoEdicao ? 'Editar composição agendada' : 'Preparar mensagem'}
          </Typography>
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
      {disparoEdicao && (
        <Alert severity="info" sx={{ mb: 2.5 }}>
          Ao confirmar, a fila agendada anterior será substituída por esta nova composição.
        </Alert>
      )}
      {etapa === 1 && (
        <>
        <TextField
          select fullWidth size="small" label="Público" value={tipo}
          onChange={(evento) => setTipo(evento.target.value)} sx={{ mb: 2 }}
        >
          {perfil !== 'MARKETING' && <MenuItem value="alunos">Um ou vários alunos</MenuItem>}
          {perfil !== 'MARKETING' && <MenuItem value="turma">Uma turma inteira</MenuItem>}
          {perfil !== 'MARKETING' && <MenuItem value="todos">Todos os alunos ativos</MenuItem>}
          {perfil !== 'SECRETARIA' && <MenuItem value="leads">Leads / Base de Marketing</MenuItem>}
        </TextField>
        {tipo === 'leads' && (
          <>
            <TextField
              select fullWidth size="small" label="Segmentar leads" value={segmentoLeads}
              onChange={(evento) => {
                setSegmentoLeads(evento.target.value)
                setValorSegmentoLead('')
              }}
              sx={{ mb: 2 }}
            >
              <MenuItem value="todos">Todos os leads ativos com opt-in</MenuItem>
              <MenuItem value="selecionados">Selecionar contatos</MenuItem>
              <MenuItem value="campanha">Por campanha</MenuItem>
              <MenuItem value="origem">Por origem</MenuItem>
              <MenuItem value="tag">Por tag</MenuItem>
              <MenuItem value="status_funil">Por status no funil</MenuItem>
            </TextField>
            {segmentoLeads === 'selecionados' && (
              <Autocomplete
                multiple options={opcoesLead} value={leads}
                filterOptions={(itens) => itens}
                getOptionLabel={(lead) => `${lead.nome} — ${lead.telefone}`}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                onInputChange={(_, valor) => setBuscaLead(valor)}
                onChange={(_, valor) => setLeads(valor)}
                renderInput={(props) => <TextField {...props} size="small" label="Buscar e selecionar leads" />}
                noOptionsText={buscaLead.length < 2 ? 'Digite ao menos 2 letras' : 'Nenhum lead encontrado'}
                sx={{ mb: 2 }}
              />
            )}
            {!['todos', 'selecionados'].includes(segmentoLeads) && (
              <TextField
                select fullWidth size="small"
                label={{
                  campanha: 'Campanha',
                  origem: 'Origem',
                  tag: 'Tag',
                  status_funil: 'Status no funil',
                }[segmentoLeads]}
                value={valorSegmentoLead}
                onChange={(evento) => setValorSegmentoLead(evento.target.value)}
                sx={{ mb: 2 }}
              >
                {(segmentoLeads === 'campanha'
                  ? filtrosLead.campanhas
                  : segmentoLeads === 'origem'
                    ? filtrosLead.origens
                    : segmentoLeads === 'tag'
                      ? filtrosLead.tags
                      : filtrosLead.status_funil
                )?.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
              </TextField>
            )}
            <Alert severity="info" sx={{ mb: 2 }}>
              Somente leads ativos com opt-in confirmado serão enviados. O rodapé de
              saída será incluído automaticamente pelo sistema.
            </Alert>
          </>
        )}
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
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25, mb: 2 }}>
            <TextField
              select size="small" label="Categoria da API do WhatsApp"
              value={categoriaApi}
              disabled={tipo === 'leads'}
              onChange={(e) => setCategoriaApi(e.target.value)}
              helperText={tipo === 'leads' ? 'Obrigatoriamente Marketing para a base de leads.' : 'Classificação do conteúdo enviado.'}
            >
              <MenuItem value="MARKETING">Marketing</MenuItem>
              <MenuItem value="UTILIDADE">Utilidade</MenuItem>
              <MenuItem value="AUTENTICACAO">Autenticação</MenuItem>
            </TextField>
            <TextField
              select size="small" label="Finalidade"
              value={finalidade}
              onChange={(e) => setFinalidade(e.target.value)}
            >
              <MenuItem value="NUTRICAO">Educativa / nutrição</MenuItem>
              <MenuItem value="COMERCIAL">Comercial</MenuItem>
              {tipo !== 'leads' && <MenuItem value="OPERACIONAL">Operacional</MenuItem>}
            </TextField>
          </Box>
          <Alert severity="warning" sx={{ mb: 2 }}>
            A classificação é auditada pelo TOV. A integração UazAPI atual não
            substitui a aprovação de templates na API oficial da Meta.
          </Alert>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            <TextField
              select size="small" label="Usar template" value={templateId}
              onChange={(e) => aplicarTemplate(e.target.value)}
              sx={{ minWidth: { xs: '100%', sm: 260 } }}
            >
              <MenuItem value="">Nenhum template</MenuItem>
              {[...templates]
                .sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome))
                .map((template) => (
                  <MenuItem key={template.id} value={template.id}>
                    {template.favorito ? '★ ' : ''}{template.categoria_api || 'UTILIDADE'} · {template.categoria} · {template.nome} · v{template.versao}
                  </MenuItem>
                ))}
            </TextField>
            <Button variant="outlined" startIcon={<SaveIcon />} onClick={() => setTemplateAberto(true)}>
              Salvar como template
            </Button>
            {templateId && (
              <>
                <Button size="small" onClick={atualizarTemplate} disabled={salvandoTemplate}>Atualizar</Button>
                <Button size="small" onClick={duplicarTemplate}>Duplicar</Button>
                <IconButton color="error" aria-label="Excluir template" onClick={excluirTemplate}><DeleteIcon /></IconButton>
              </>
            )}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.15fr .85fr' }, gap: 2.5 }}>
            <Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                {TIPOS.map(([valor, label]) => (
                  <Chip
                    key={valor} clickable label={label} size="small"
                    color={tipoMensagem === valor ? 'primary' : 'default'}
                    variant={tipoMensagem === valor ? 'filled' : 'outlined'}
                    onClick={() => setTipoMensagem(valor)}
                    sx={{ fontWeight: tipoMensagem === valor ? 700 : 500 }}
                  />
                ))}
              </Box>
              {['image', 'document', 'audio'].includes(tipoMensagem) && (
                <Box sx={{ border: `2px dashed ${TOV.captionTint}`, borderRadius: 2, p: 2, mb: 2, textAlign: 'center' }}>
                  <Button component="label" startIcon={enviandoArquivo ? <CircularProgress size={16} /> : <UploadFileIcon />}>
                    {arquivo ? 'Trocar arquivo' : `Selecionar ${TIPOS.find(([v]) => v === tipoMensagem)?.[1].toLowerCase()}`}
                    <input
                      hidden type="file"
                      accept={tipoMensagem === 'image' ? 'image/jpeg,image/png,image/webp' : tipoMensagem === 'audio' ? 'audio/*' : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip'}
                      onChange={(e) => subirArquivo(e.target.files?.[0], (item) => { setArquivo(item); setNomeArquivo(item.nome) })}
                    />
                  </Button>
                  {arquivo && <Typography sx={{ fontSize: 12, color: TOV.caption, mt: 0.5 }}>{arquivo.nome} · {(arquivo.tamanho / 1024 / 1024).toFixed(1)} MB</Typography>}
                </Box>
              )}
              <TextField
                fullWidth multiline minRows={tipoMensagem === 'text' ? 8 : 4} maxRows={14}
                label={['image', 'document', 'audio'].includes(tipoMensagem) ? 'Legenda (opcional)' : tipoMensagem === 'poll' ? 'Pergunta' : 'Mensagem'}
                value={mensagem}
                placeholder="Olá {{primeiro_nome}}, temos um aviso para você…"
                onChange={(evento) => setMensagem(evento.target.value)}
                helperText={`${mensagem.length}/4096 caracteres`}
                inputProps={{ maxLength: 4096 }}
              />
              {tipoMensagem === 'document' && (
                <TextField fullWidth size="small" label="Nome exibido do documento" value={nomeArquivo} onChange={(e) => setNomeArquivo(e.target.value)} sx={{ mt: 1.5 }} />
              )}
              {tipoMensagem === 'button' && <EditorBotoes botoes={botoes} onChange={setBotoes} />}
              {tipoMensagem === 'poll' && (
                <Box sx={{ mt: 2 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 1 }}>Opções da enquete</Typography>
                  {opcoesEnquete.map((opcao, indice) => (
                    <Box key={indice} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                      <TextField fullWidth size="small" label={`Opção ${indice + 1}`} value={opcao} onChange={(e) => setOpcoesEnquete(opcoesEnquete.map((o, i) => i === indice ? e.target.value : o))} />
                      {opcoesEnquete.length > 2 && <IconButton onClick={() => setOpcoesEnquete(opcoesEnquete.filter((_, i) => i !== indice))}><DeleteIcon /></IconButton>}
                    </Box>
                  ))}
                  <Button size="small" startIcon={<AddIcon />} disabled={opcoesEnquete.length >= 12} onClick={() => setOpcoesEnquete([...opcoesEnquete, ''])}>Adicionar opção</Button>
                  <TextField
                    select size="small" label="Quantas opções podem ser marcadas?" value={selecionaveis}
                    onChange={(e) => setSelecionaveis(e.target.value)} sx={{ width: '100%', mt: 1.5 }}
                  >
                    {Array.from({ length: Math.max(1, opcoesEnquete.filter((o) => o.trim()).length) }, (_, i) => <MenuItem key={i + 1} value={i + 1}>{i + 1}</MenuItem>)}
                  </TextField>
                </Box>
              )}
              {tipoMensagem === 'carousel' && (
                <Box sx={{ mt: 2 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 1 }}>Cartões do carrossel</Typography>
                  {cartoes.map((cartao, indice) => (
                    <Box key={indice} sx={{ bgcolor: TOV.offwhite, borderRadius: 2, p: 2, mb: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography sx={{ fontWeight: 700 }}>Cartão {indice + 1}</Typography>
                        {cartoes.length > 2 && <IconButton size="small" onClick={() => setCartoes(cartoes.filter((_, i) => i !== indice))}><DeleteIcon fontSize="small" /></IconButton>}
                      </Box>
                      <Button component="label" size="small" startIcon={<UploadFileIcon />}>
                        {cartao.arquivo ? 'Trocar imagem' : 'Enviar imagem'}
                        <input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => subirArquivo(e.target.files?.[0], (item) => setCartoes(cartoes.map((c, i) => i === indice ? { ...c, arquivo: item } : c)))} />
                      </Button>
                      {cartao.arquivo && <Typography sx={{ display: 'inline', ml: 1, fontSize: 11, color: TOV.caption }}>{cartao.arquivo.nome}</Typography>}
                      <TextField fullWidth multiline minRows={2} size="small" label="Texto do cartão" value={cartao.texto} onChange={(e) => setCartoes(cartoes.map((c, i) => i === indice ? { ...c, texto: e.target.value } : c))} sx={{ mt: 1.5 }} />
                      <EditorBotoes botoes={cartao.botoes} onChange={(valor) => setCartoes(cartoes.map((c, i) => i === indice ? { ...c, botoes: valor } : c))} />
                    </Box>
                  ))}
                  <Button size="small" startIcon={<AddIcon />} disabled={cartoes.length >= 10} onClick={() => setCartoes([...cartoes, { texto: '', arquivo: null, botoes: [{ texto: '', tipo: 'REPLY', valor: '' }] }])}>
                    Adicionar cartão
                  </Button>
                </Box>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
                <Typography sx={{ fontSize: 13, color: TOV.caption }}>Personalizar:</Typography>
                <Chip size="small" clickable label="{{primeiro_nome}}" onClick={() => inserirVariavel('primeiro_nome')} />
                <Chip size="small" clickable label="{{nome}}" onClick={() => inserirVariavel('nome')} />
              </Box>
              <FormControlLabel
                sx={{ mt: 1.5, display: tipoMensagem === 'text' ? 'inline-flex' : 'none' }}
                control={<Checkbox checked={linkPreview} onChange={(e) => setLinkPreview(e.target.checked)} />}
                label="Mostrar preview quando a mensagem contiver um link"
              />
              {sequencia.length > 0 && (
                <Box sx={{ mt: 2, border: `1px solid ${TOV.captionTint}`, borderRadius: 2, p: 1.5 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 1 }}>
                    Sequência montada · {sequencia.length + 1} mensagens
                  </Typography>
                  {sequencia.map((item, indice) => (
                    <Box key={indice} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderTop: indice ? `1px solid ${TOV.offwhite}` : 0 }}>
                      <Chip size="small" label={indice + 1} />
                      <Typography sx={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {TIPOS.find(([valor]) => valor === item.tipo)?.[1]} · {item.mensagem || item.arquivo?.nome || 'Mídia'}
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label="Remover da sequência"
                        onClick={() => setSequencia(sequencia.filter((_, i) => i !== indice))}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                  <Typography sx={{ fontSize: 12, color: TOV.caption, mt: 0.75 }}>
                    A mensagem que está no editor será a etapa {sequencia.length + 1}.
                  </Typography>
                </Box>
              )}
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', mt: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  disabled={!conteudoValido || sequencia.length >= 9}
                  onClick={() => {
                    setSequencia([...sequencia, conteudoPreviaAtual()])
                    limparEditor()
                  }}
                >
                  Adicionar próxima mensagem
                </Button>
                {(sequencia.length > 0) && (
                  <TextField
                    type="number"
                    size="small"
                    label="Intervalo (segundos)"
                    value={intervaloSequencia}
                    onChange={(e) => setIntervaloSequencia(Math.max(1, Math.min(3600, Number(e.target.value) || 1)))}
                    inputProps={{ min: 1, max: 3600 }}
                    sx={{ width: 180 }}
                  />
                )}
              </Box>
              <TextField
                fullWidth type="datetime-local" size="small" label="Agendar para (opcional)"
                value={agendadoPara} onChange={(e) => setAgendadoPara(e.target.value)}
                InputLabelProps={{ shrink: true }} sx={{ mt: 2 }}
                helperText="Deixe vazio para enviar assim que confirmar."
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
                  <PreviewSequencia conteudo={conteudoPrevia} nome={nomePrevia} />
                </Box>
              </Box>
              <Typography sx={{ color: TOV.caption, fontSize: 11, mt: 1 }}>
                Exemplo com {nomePrevia}; cada contato receberá seu próprio nome.
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, mt: 2.5, flexWrap: 'wrap' }}>
            <Button variant="outlined" disabled={!!disparoEdicao} onClick={() => setEtapa(1)}>
              {disparoEdicao ? 'Público não pode ser alterado' : 'Voltar ao público'}
            </Button>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                disabled={!conectada || !conteudoValido || testando || enviandoArquivo}
                onClick={() => setConfirmarTeste(true)}
              >
                Enviar teste para mim
              </Button>
              <Button
                variant="contained" startIcon={carregando ? <CircularProgress size={17} color="inherit" /> : <SendIcon />}
                disabled={!conectada || !conteudoValido || carregando || enviandoArquivo}
                onClick={preparar}
              >
                {carregando ? 'Validando…' : 'Revisar disparo'}
              </Button>
            </Box>
          </Box>
        </>
      )}
      <Dialog open={templateAberto} onClose={() => setTemplateAberto(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Salvar template</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Nome do template" value={nomeTemplate} onChange={(e) => setNomeTemplate(e.target.value)} sx={{ mt: 1 }} />
          <TextField fullWidth label="Categoria" value={categoriaTemplate} onChange={(e) => setCategoriaTemplate(e.target.value)} sx={{ mt: 2 }} />
          <FormControlLabel
            sx={{ mt: 1 }}
            control={<Checkbox checked={favoritoTemplate} onChange={(e) => setFavoritoTemplate(e.target.checked)} />}
            label="Marcar como favorito"
          />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setTemplateAberto(false)}>Cancelar</Button>
          <Button variant="contained" disabled={nomeTemplate.trim().length < 2 || salvandoTemplate || !conteudoValido} onClick={salvarTemplate}>
            {salvandoTemplate ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={confirmarTeste} onClose={testando ? undefined : () => setConfirmarTeste(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Enviar teste para o número conectado?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: TOV.caption, fontSize: 14 }}>
            A composição completa será enviada somente para o WhatsApp da secretaria, sem entrar no histórico de disparos.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setConfirmarTeste(false)} disabled={testando}>Cancelar</Button>
          <Button variant="contained" onClick={enviarTeste} disabled={testando}>
            {testando ? 'Enviando…' : 'Enviar teste'}
          </Button>
        </DialogActions>
      </Dialog>
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
          const totalMensagens = item.total_mensagens || item.total_validos
          const progresso = totalMensagens ? Math.round((processados / totalMensagens) * 100) : 0
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
                Por {item.usuario} · {item.total_enviados} enviados · {item.total_entregues} entregues · {item.total_lidos} lidos
                {item.total_reproduzidos ? ` · ${item.total_reproduzidos} reproduzidos` : ''}
                {item.total_respostas ? ` · ${item.total_respostas} respostas` : ''}
                {item.total_optouts ? ` · ${item.total_optouts} opt-outs` : ''} · {item.total_falhos} falhos · {item.total_invalidos} ignorados
              </Typography>
              <Typography
                sx={{
                  fontSize: 13, color: TOV.slate, mt: 0.75, maxWidth: 760,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {TIPOS.find(([valor]) => valor === item.tipo_mensagem)?.[1] || 'Mensagem'}: {item.mensagem_modelo}
              </Typography>
              {item.agendado_para && (
                <Typography sx={{ fontSize: 12, color: TOV.coral, mt: 0.5 }}>
                  Agendado para {dataHora(item.agendado_para)}
                </Typography>
              )}
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
  const [searchParams] = useSearchParams()
  const podeAdministrar = getPerfil() === 'ADMIN'
  const alunoInicial = searchParams.get('aluno')
  const disparoInicial = searchParams.get('disparo')
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
  const [webhookAtivado, setWebhookAtivado] = useState(false)
  const [reagendamentoAberto, setReagendamentoAberto] = useState(false)
  const [novaData, setNovaData] = useState('')
  const [acaoConfirmar, setAcaoConfirmar] = useState(null)
  const [disparoEdicao, setDisparoEdicao] = useState(null)
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
    if (getPerfil() !== 'MARKETING') {
      api.get('/turmas').then(setTurmas).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (disparoInicial && Number.isInteger(Number(disparoInicial))) {
      abrirDetalhe(Number(disparoInicial))
    }
  }, [disparoInicial])

  useEffect(() => {
    if (!podeAdministrar || !instancia?.conectada || webhookAtivado) return
    setWebhookAtivado(true)
    api.post('/whatsapp/instancia/configurar-webhook', {})
      .catch(() => {})
  }, [instancia?.conectada, podeAdministrar, webhookAtivado])

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
    const timer = setInterval(() => sincronizar(detalhe.id, true), 1500)
    return () => clearInterval(timer)
  }, [detalhe?.id, detalhe?.status])

  useEffect(() => {
    if (!historico?.some((item) => !STATUS_FINAL.has(item.status))) return undefined
    let executando = false
    const atualizar = async () => {
      if (executando) return
      executando = true
      try {
        const resposta = await api.post('/whatsapp/disparos/sincronizar-ativos', {})
        setHistorico(resposta.itens)
        if (detalhe) {
          const resumo = resposta.itens.find((item) => item.id === detalhe.id)
          if (resumo) setDetalhe((atual) => ({ ...atual, ...resumo }))
        }
      } catch { /* mantém o último estado sem interromper o trabalho */ }
      finally { executando = false }
    }
    atualizar()
    const timer = setInterval(atualizar, 1500)
    return () => clearInterval(timer)
  }, [historico?.some((item) => !STATUS_FINAL.has(item.status)), detalhe?.id])

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
      const resposta = dados.editar_id
        ? await api.post(`/whatsapp/disparos/${dados.editar_id}/previsualizar-edicao`, dados.conteudo)
        : await api.post('/whatsapp/previsualizar', {
          publico: dados.publico,
          conteudo: dados.conteudo,
          categoria_api: dados.categoria_api,
          finalidade: dados.finalidade,
        })
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
      const resposta = dadosDisparo.editar_id
        ? await api.post(`/whatsapp/disparos/${dadosDisparo.editar_id}/editar-agendamento`, {
          conteudo: dadosDisparo.conteudo,
          agendado_para: dadosDisparo.agendado_para,
        })
        : await api.post('/whatsapp/disparos', {
          ...dadosDisparo,
          consentimento_confirmado: consentimento,
        })
      setPrevia(null)
      setConsentimento(false)
      setDisparoEdicao(null)
      notificar(
        dadosDisparo.editar_id
          ? `Agendamento #${resposta.id} atualizado com sucesso.`
          : resposta.status === 'AGENDADO'
          ? `Disparo #${resposta.id} agendado com sucesso.`
          : `Disparo #${resposta.id} adicionado à fila.`,
        false,
      )
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
      setDetalhe(await api.post(`/whatsapp/disparos/${id}/sincronizar`, {}))
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

  async function controlarDisparo(acao, corpo = {}) {
    if (!detalhe) return
    setSincronizando(true)
    try {
      const resposta = await api.post(`/whatsapp/disparos/${detalhe.id}/${acao}`, corpo)
      setDetalhe(resposta.destinatarios ? resposta : await api.get(`/whatsapp/disparos/${resposta.id || detalhe.id}`))
      setReagendamentoAberto(false)
      setAcaoConfirmar(null)
      carregarHistorico()
      const mensagens = {
        pausar: 'Campanha pausada.',
        retomar: 'Campanha retomada.',
        cancelar: 'Campanha cancelada.',
        reagendar: 'Campanha reagendada.',
        'reenviar-falhos': `Novo disparo #${resposta.id} criado somente com as falhas.`,
      }
      notificar(mensagens[acao] || 'Campanha atualizada.', false)
      if (acao === 'reenviar-falhos') abrirDetalhe(resposta.id)
    } catch (e) {
      notificar(e.message)
    } finally {
      setSincronizando(false)
    }
  }

  const progressoDetalhe = useMemo(() => {
    const total = detalhe?.total_mensagens || detalhe?.total_validos
    if (!total) return 0
    return Math.round(((detalhe.total_enviados + detalhe.total_falhos) / total) * 100)
  }, [detalhe])

  return (
    <Box>
      <CabecalhoPagina
        titulo="WhatsApp"
        subtitulo="Envie comunicados acadêmicos e nutra leads com públicos segregados."
      />
      <CardInstancia
        instancia={instancia}
        carregando={carregandoInstancia}
        podeAdministrar={podeAdministrar}
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
        onAviso={notificar}
        alunoInicial={alunoInicial}
        disparoEdicao={disparoEdicao}
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
              <Box sx={{ bgcolor: '#E8DDD4', borderRadius: 2, p: 2, mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <PreviewSequencia conteudo={previa.conteudo} />
              </Box>
              {dadosDisparo?.agendado_para && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  Este disparo será {dadosDisparo.editar_id ? 'reagendado' : 'agendado'} para <b>{dataHora(dadosDisparo.agendado_para)}</b>.
                </Alert>
              )}
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
            {salvando
              ? 'Enfileirando…'
              : `${dadosDisparo?.editar_id ? 'Salvar edição' : dadosDisparo?.agendado_para ? 'Agendar' : 'Enviar'} para ${previa?.validos || 0}`}
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
              {detalhe.agendado_para && (
                <Typography sx={{ color: TOV.coral, fontSize: 13, fontWeight: 700, mt: 0.5 }}>
                  Agendado para {dataHora(detalhe.agendado_para)}
                </Typography>
              )}
              <Box sx={{ bgcolor: '#E8DDD4', borderRadius: 2, p: 2, mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <PreviewSequencia conteudo={detalhe.conteudo} />
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(3,1fr)' }, gap: 1.5, my: 2.5 }}>
                {[
                  ['Enviados', detalhe.total_enviados],
                  ['Entregues', detalhe.total_entregues],
                  ['Lidos', detalhe.total_lidos],
                  ['Áudios ouvidos', detalhe.total_reproduzidos],
                  ['Respostas', detalhe.total_respostas],
                  ['Opt-outs', detalhe.total_optouts],
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
          {detalhe?.total_falhos > 0 && (
            <Button color="warning" disabled={sincronizando} onClick={() => controlarDisparo('reenviar-falhos')}>
              Reenviar falhas
            </Button>
          )}
          {detalhe && !STATUS_FINAL.has(detalhe.status) && detalhe.total_enviados === 0 && detalhe.total_falhos === 0 && (
            <>
              {detalhe.agendado_para && (
                <Button disabled={sincronizando} onClick={() => {
                  setDisparoEdicao(detalhe)
                  setDetalhe(null)
                }}>
                  Editar mensagem
                </Button>
              )}
              <Button disabled={sincronizando} onClick={() => {
                setNovaData(valorDataLocal(detalhe.agendado_para))
                setReagendamentoAberto(true)
              }}>
                Reagendar
              </Button>
            </>
          )}
          {detalhe?.status === 'PAUSADO' ? (
            <Button variant="outlined" disabled={sincronizando} onClick={() => controlarDisparo('retomar')}>Retomar</Button>
          ) : detalhe && !STATUS_FINAL.has(detalhe.status) ? (
            <Button variant="outlined" disabled={sincronizando} onClick={() => controlarDisparo('pausar')}>Pausar</Button>
          ) : null}
          {detalhe && !STATUS_FINAL.has(detalhe.status) && (
            <Button color="error" disabled={sincronizando} onClick={() => setAcaoConfirmar('cancelar')}>Cancelar campanha</Button>
          )}
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

      <Dialog open={reagendamentoAberto} onClose={() => setReagendamentoAberto(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reagendar campanha</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth type="datetime-local" label="Nova data e hora"
            value={novaData} onChange={(e) => setNovaData(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setReagendamentoAberto(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!novaData || sincronizando}
            onClick={() => controlarDisparo('reagendar', { agendado_para: new Date(novaData).toISOString() })}
          >
            Reagendar
          </Button>
        </DialogActions>
      </Dialog>

      <DialogoConfirmacao
        aberto={acaoConfirmar === 'cancelar'}
        titulo="Cancelar esta campanha?"
        descricao="As mensagens que ainda não foram enviadas serão removidas da fila. As já enviadas não podem ser desfeitas."
        rotuloConfirmar="Cancelar campanha"
        processando={sincronizando}
        onConfirmar={() => controlarDisparo('cancelar')}
        onFechar={() => setAcaoConfirmar(null)}
      />

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
