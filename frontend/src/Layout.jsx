import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, useLocation, useNavigate } from 'react-router-dom'
import {
  Alert, AppBar, BottomNavigation, BottomNavigationAction, Box, Button, Dialog,
  DialogActions, DialogContent, Drawer, ListItemIcon, ListItemText, Menu,
  MenuItem, Paper, TextField, Toolbar, Typography
} from '@mui/material'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import SpaceDashboardIcon from '@mui/icons-material/SpaceDashboard'
import SchoolIcon from '@mui/icons-material/School'
import PersonIcon from '@mui/icons-material/Person'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import GroupsIcon from '@mui/icons-material/Groups'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import EditNoteIcon from '@mui/icons-material/EditNote'
import FolderCopyOutlinedIcon from '@mui/icons-material/FolderCopyOutlined'
import DescriptionIcon from '@mui/icons-material/Description'
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import CampaignIcon from '@mui/icons-material/Campaign'
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import CheckIcon from '@mui/icons-material/Check'
import HistoryEduIcon from '@mui/icons-material/HistoryEdu'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import { api, clearSession, getPerfil, getToken, getUser, setSession } from './api'
import { TOV, focusRingOnDark } from './theme'
import {
  DialogoConfirmacao, TituloDialogo, iniciais, resetBotao, useDialogoTelaCheia
} from './ui'
import { SeloTov, SimboloTov } from './Marca'
import NotificationCenter, { BotaoInstalarPwa, BotaoNotificacoes, useNotificacoes } from './NotificationCenter'
import { UnsavedChangesContext } from './UnsavedChanges'

const STG_URL = (import.meta.env.VITE_STG_URL?.trim() || 'https://stg.kafune.xyz').replace(/\/+$/, '')

const MENU = [
  { rotulo: 'Dashboard', curto: 'Início', rota: '/', icone: SpaceDashboardIcon, exato: true, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Início', curto: 'Início', rota: '/professor', icone: SpaceDashboardIcon, exato: true, perfis: ['PROFESSOR'] },
  { rotulo: 'Minhas turmas', curto: 'Turmas', rota: '/professor/turmas', icone: SchoolIcon, perfis: ['PROFESSOR'] },
  { rotulo: 'Alunos', curto: 'Alunos', rota: '/alunos', icone: SchoolIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Professores', curto: 'Profs.', rota: '/professores', icone: PersonIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Matérias', curto: 'Matérias', rota: '/materias', icone: MenuBookIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Turmas', curto: 'Turmas', rota: '/turmas', icone: GroupsIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Calendário', curto: 'Agenda', rota: '/calendario', icone: CalendarMonthIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Notas e Faltas', curto: 'Notas', rota: '/notas', icone: EditNoteIcon, perfis: ['ADMIN', 'SECRETARIA', 'PROFESSOR'] },
  { rotulo: 'Materiais', curto: 'Material', rota: '/materiais', icone: FolderCopyOutlinedIcon, perfis: ['ADMIN', 'SECRETARIA', 'PROFESSOR'] },
  { rotulo: 'Relatórios', curto: 'Relatos', rota: '/relatorios', icone: DescriptionIcon, perfis: ['ADMIN', 'SECRETARIA'] },
  { rotulo: 'Financeiro', curto: 'Financ.', rota: '/financeiro', icone: PaidOutlinedIcon, perfis: ['ADMIN', 'SECRETARIA', 'FINANCEIRO'] },
  { rotulo: 'Leads', curto: 'Leads', rota: '/leads', icone: CampaignIcon, perfis: ['ADMIN', 'MARKETING'] },
  { rotulo: 'WhatsApp', curto: 'Whats', rota: '/whatsapp', icone: WhatsAppIcon, perfis: ['ADMIN', 'SECRETARIA', 'MARKETING'] },
  { rotulo: 'Usuários', curto: 'Usuários', rota: '/usuarios', icone: ManageAccountsIcon, perfis: ['ADMIN'] },
]

/** Rotas da trilha do tablet, por perfil: o trabalho do dia em um toque. */
const TRILHA = {
  PROFESSOR: ['/professor', '/professor/turmas', '/notas', '/materiais'],
  MARKETING: ['/leads', '/whatsapp'],
  FINANCEIRO: ['/financeiro'],
  padrao: ['/', '/alunos', '/turmas', '/notas', '/calendario'],
}

/** Item da trilha vertical do tablet: ícone, rótulo curto e filete no ativo. */
function ItemTrilha({ icone: Icone, rotulo, ativo, onClick, rotuloAcessivel }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-current={ativo ? 'page' : undefined}
      aria-label={rotuloAcessivel}
      sx={{
        ...resetBotao,
        position: 'relative',
        width: 56, minHeight: 56, px: 0.5, py: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
        borderRadius: TOV.radiusSm,
        color: ativo ? TOV.ink : TOV.onDarkMuted,
        bgcolor: ativo ? TOV.surface : 'transparent',
        transition: `background-color ${TOV.durationFast} ${TOV.ease}, color ${TOV.durationFast} ${TOV.ease}`,
        '&::before': ativo ? {
          content: '""', position: 'absolute', left: 0, top: 8, bottom: 8,
          width: 4, borderRadius: TOV.radiusXs, bgcolor: TOV.coral,
        } : undefined,
        '&:hover': ativo ? {} : { bgcolor: TOV.onDarkSurface, color: TOV.onDark },
        '&:focus-visible': focusRingOnDark,
        '& .MuiSvgIcon-root': { color: ativo ? TOV.coral : 'inherit' },
      }}
    >
      <Icone sx={{ fontSize: TOV.type.titleSm }} />
      <Box component="span" sx={{ fontSize: TOV.type.micro, fontWeight: 700, letterSpacing: '.04em', lineHeight: 1.2 }}>
        {rotulo}
      </Box>
    </Box>
  )
}

function ItemNav({ item, ativo, onClick }) {
  const Icone = item.icone
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-current={ativo ? 'page' : undefined}
      sx={{
        ...resetBotao,
        display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, width: '100%',
        minHeight: 48, borderRadius: TOV.radiusSm, fontSize: TOV.type.body, userSelect: 'none',
        fontWeight: ativo ? 700 : 600,
        bgcolor: ativo ? TOV.surface : 'transparent',
        color: ativo ? TOV.ink : TOV.onDarkBody,
        position: 'relative',
        transition: `background-color ${TOV.durationFast} ${TOV.ease}, color ${TOV.durationFast} ${TOV.ease}`,
        '&::before': ativo ? {
          content: '""', position: 'absolute', left: 4, top: 10, bottom: 10,
          width: 4, borderRadius: TOV.radiusXs, bgcolor: TOV.coral,
        } : undefined,
        '&:hover': ativo ? {} : { bgcolor: TOV.onDarkSurface, color: TOV.onDark },
        '&:focus-visible': focusRingOnDark,
        '& .MuiSvgIcon-root': { color: ativo ? TOV.coral : TOV.onDarkMuted },
      }}
    >
      <Icone sx={{ fontSize: TOV.type.titleSm }} />
      {item.rotulo}
    </Box>
  )
}

function SeletorSistema({ onTrocar }) {
  const [ancora, setAncora] = useState(null)
  const aberto = Boolean(ancora)

  function fechar() {
    setAncora(null)
  }

  function selecionarSTG() {
    fechar()
    onTrocar(STG_URL)
  }

  return (
    <>
      <Box
        component="button"
        type="button"
        aria-label="Trocar sistema. Sistema atual: TOV Acadêmico"
        aria-haspopup="menu"
        aria-expanded={aberto ? 'true' : undefined}
        onClick={(event) => setAncora(event.currentTarget)}
        sx={{
          ...resetBotao,
          display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', mb: 2.5,
          p: 1.5, minHeight: 60, border: `1px solid ${TOV.onDarkBorder}`, borderRadius: TOV.radiusMd,
          bgcolor: TOV.onDarkSurface, color: TOV.onDark, textAlign: 'left',
          transition: `background-color ${TOV.durationFast} ${TOV.ease}, border-color ${TOV.durationFast} ${TOV.ease}`,
          '&:hover': { bgcolor: TOV.onDarkSurfaceHover, borderColor: TOV.onDarkBorderHover },
          '&:focus-visible': focusRingOnDark,
        }}
      >
        <SeloTov tamanho={36} />
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Box sx={{ fontSize: TOV.type.micro, lineHeight: 1.2, opacity: 0.72, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Sistema atual
          </Box>
          <Box sx={{ mt: 0.5, fontSize: TOV.type.body, lineHeight: 1.25, fontWeight: 700 }}>
            TOV Acadêmico
          </Box>
        </Box>
        <KeyboardArrowDownIcon
          sx={{ fontSize: TOV.type.titleSm, flexShrink: 0, transform: aberto ? 'rotate(180deg)' : 'none', transition: `transform ${TOV.transitionFast}` }}
        />
      </Box>

      <Menu
        anchorEl={ancora}
        open={aberto}
        onClose={fechar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{
          elevation: 8,
          sx: { mt: 1, width: 300, maxWidth: 'calc(100vw - 32px)', borderRadius: TOV.radiusMd },
        }}
        MenuListProps={{ 'aria-label': 'Selecionar sistema', sx: { p: 1 } }}
      >
        <MenuItem selected onClick={fechar} sx={{ borderRadius: TOV.radiusSm, py: 1 }}>
          <ListItemIcon><SimboloTov altura={20} reforco={12} /></ListItemIcon>
          <ListItemText primary="TOV Acadêmico" secondary="Sistema atual" />
          <CheckIcon color="primary" fontSize="small" />
        </MenuItem>
        <MenuItem onClick={selecionarSTG} sx={{ borderRadius: TOV.radiusSm, py: 1 }}>
          <ListItemIcon><HistoryEduIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="STG Legado" secondary="Seminário Teológico de Guarulhos" />
        </MenuItem>
      </Menu>
    </>
  )
}

/**
 * Verdadeiro quando o `h1` da página saiu da tela.
 *
 * Enquanto ele está visível, repetir a seção na barra superior é a terceira
 * vez que a mesma tela diz a mesma palavra — a navegação já marca o item
 * ativo e o `h1` já nomeia a página.
 */
function useTituloForaDaTela(caminho) {
  const [fora, setFora] = useState(false)

  useEffect(() => {
    const titulo = document.querySelector('main h1')
    // Sem `h1` na tela não há duplicação a evitar: a barra nomeia a seção.
    setFora(!titulo)
    if (!titulo || typeof IntersectionObserver !== 'function') return undefined
    const observador = new IntersectionObserver(
      ([entrada]) => setFora(!entrada.isIntersecting),
      // Desconta a própria barra fixa, senão o título "some" atrás dela.
      { rootMargin: '-64px 0px 0px 0px' },
    )
    observador.observe(titulo)
    return () => observador.disconnect()
  }, [caminho])

  return fora
}

/**
 * Troca de senha pelo próprio usuário. A API existia (`POST /auth/trocar-senha`)
 * e não tinha tela: só o administrador redefinia a senha dos outros.
 */
function DialogoTrocarSenha({ aberto, onFechar }) {
  const telaCheia = useDialogoTelaCheia()
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setAtual('')
    setNova('')
    setConfirmacao('')
    setErro('')
    setSucesso(false)
  }, [aberto])

  const curta = nova.length > 0 && nova.length < 8
  const diferente = confirmacao.length > 0 && confirmacao !== nova
  const podeSalvar = atual && nova.length >= 8 && confirmacao === nova && !salvando

  async function salvar() {
    setSalvando(true)
    setErro('')
    try {
      await api.post('/auth/trocar-senha', { senha_atual: atual, senha_nova: nova })
      setSucesso(true)
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onClose={salvando ? undefined : onFechar} maxWidth="xs" fullWidth fullScreen={telaCheia}>
      <TituloDialogo onFechar={salvando ? undefined : onFechar}>Alterar minha senha</TituloDialogo>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        {sucesso ? (
          <Alert severity="success">Senha alterada. Use a nova senha no próximo acesso.</Alert>
        ) : (
          <>
            {erro && <Alert severity="error">{erro}</Alert>}
            <TextField label="Senha atual" type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} autoFocus />
            <TextField label="Nova senha" type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} error={curta} helperText={curta ? 'Use ao menos 8 caracteres.' : 'Ao menos 8 caracteres.'} />
            <TextField label="Confirmar nova senha" type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} error={diferente} helperText={diferente ? 'As senhas não conferem.' : ' '} />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 3, pt: 1 }}>
        <Button variant="outlined" onClick={onFechar} disabled={salvando}>{sucesso ? 'Fechar' : 'Cancelar'}</Button>
        {!sucesso && <Button variant="contained" onClick={salvar} disabled={!podeSalvar}>{salvando ? 'Salvando…' : 'Salvar nova senha'}</Button>}
      </DialogActions>
    </Dialog>
  )
}

export default function Layout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const usuario = getUser() || 'Usuário'
  const perfil = getPerfil()
  // O perfil guardado no login pode ter mudado (o administrador rebaixou ou
  // promoveu a conta). O backend é a autoridade; a tela só reconcilia.
  useEffect(() => {
    let ativo = true
    api.get('/auth/me')
      .then((sessao) => {
        if (!ativo || !sessao?.perfil) return
        if (sessao.perfil !== getPerfil() || sessao.user !== getUser()) {
          setSession(getToken(), sessao.user, sessao.perfil)
          window.location.reload()
        }
      })
      .catch(() => {})
    return () => { ativo = false }
  }, [])
  const menuVisivel = MENU.filter((item) => !item.perfis || item.perfis.includes(perfil))
  const itensTrilha = (TRILHA[perfil] || TRILHA.padrao)
    .map((rota) => menuVisivel.find((item) => item.rota === rota))
    .filter(Boolean)
  const [menuAberto, setMenuAberto] = useState(false)
  const [trocarSenhaAberto, setTrocarSenhaAberto] = useState(false)
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false)
  const [alteracoesPendentes, setAlteracoesPendentes] = useState(null)
  const alteracoesPendentesRef = useRef(null)
  const [destinoPendente, setDestinoPendente] = useState(null)
  const acaoAposFecharMenu = useRef(null)
  const conteudoPrincipalRef = useRef(null)
  const estadoNotificacoes = useNotificacoes()
  const registrarAlteracoesPendentes = useCallback((mensagem) => {
    alteracoesPendentesRef.current = mensagem
    setAlteracoesPendentes(mensagem)
  }, [])
  const bloqueador = useBlocker(({ currentLocation, nextLocation }) => (
    Boolean(alteracoesPendentesRef.current)
    && `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}` !== `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`
  ))

  useEffect(() => {
    if (bloqueador.state === 'blocked') setDestinoPendente({ tipo: 'rota-bloqueada' })
  }, [bloqueador.state])

  function executarComMenuFechado(acao) {
    if (!menuAberto) {
      acao()
      return
    }
    acaoAposFecharMenu.current = acao
    setMenuAberto(false)
  }

  function concluirFechamentoMenu() {
    const acao = acaoAposFecharMenu.current
    acaoAposFecharMenu.current = null
    acao?.()
  }

  function fecharMenu() {
    acaoAposFecharMenu.current = null
    setMenuAberto(false)
  }

  async function executarSaida() {
    try {
      const registro = await navigator.serviceWorker?.ready
      const inscricao = await registro?.pushManager?.getSubscription?.()
      if (inscricao) {
        await api.post('/notificacoes/push/desinscrever', { endpoint: inscricao.endpoint })
        await inscricao.unsubscribe()
      }
    } catch {
      // Sair não depende da rede; a inscrição local será removida quando possível.
    }
    clearSession()
    navigate('/login')
  }

  function sair() {
    executarComMenuFechado(() => {
      if (alteracoesPendentes) {
        setDestinoPendente({ tipo: 'sair' })
        return
      }
      executarSaida()
    })
  }

  function irPara(rota) {
    executarComMenuFechado(() => {
      if (rota === location.pathname) return
      navigate(rota)
    })
  }

  function trocarSistema(url) {
    executarComMenuFechado(() => {
      if (alteracoesPendentes) {
        setDestinoPendente({ tipo: 'sistema', url })
        return
      }
      window.location.assign(url)
    })
  }

  function confirmarNavegacao() {
    const destino = destinoPendente
    setDestinoPendente(null)
    registrarAlteracoesPendentes(null)
    if (destino?.tipo === 'rota-bloqueada' && bloqueador.state === 'blocked') bloqueador.proceed()
    else if (destino?.tipo === 'sair') executarSaida()
    else if (destino?.tipo === 'sistema' && destino.url) window.location.assign(destino.url)
    else if (destino?.rota) navigate(destino.rota)
  }

  function cancelarNavegacao() {
    if (bloqueador.state === 'blocked') bloqueador.reset()
    setDestinoPendente(null)
  }

  const estaAtivo = (item) =>
    item.exato ? location.pathname === item.rota : location.pathname.startsWith(item.rota)

  const tituloAtual = menuVisivel.find(estaAtivo)?.rotulo || 'TOV'
  const tituloForaDaTela = useTituloForaDaTela(location.pathname)
  const acoesInferiores = (
    perfil === 'PROFESSOR' ? [
      <BottomNavigationAction key="/professor" label="Início" value="/professor" icon={<SpaceDashboardIcon />} />,
      <BottomNavigationAction key="/professor/turmas" label="Turmas" value="/professor/turmas" icon={<SchoolIcon />} />,
      <BottomNavigationAction key="/notas" label="Notas" value="/notas" icon={<EditNoteIcon />} />,
      <BottomNavigationAction key="/materiais" label="Materiais" value="/materiais" icon={<FolderCopyOutlinedIcon />} />,
    ] : perfil === 'FINANCEIRO' ? [
      <BottomNavigationAction key="/financeiro" label="Financeiro" value="/financeiro" icon={<PaidOutlinedIcon />} />,
    ] : perfil === 'MARKETING' ? [
      <BottomNavigationAction key="/leads" label="Leads" value="/leads" icon={<CampaignIcon />} />,
      <BottomNavigationAction key="/whatsapp" label="WhatsApp" value="/whatsapp" icon={<WhatsAppIcon />} />,
    ] : [
      <BottomNavigationAction key="/" label="Início" value="/" icon={<SpaceDashboardIcon />} />,
      <BottomNavigationAction key="/alunos" label="Alunos" value="/alunos" icon={<SchoolIcon />} />,
      <BottomNavigationAction key="/turmas" label="Turmas" value="/turmas" icon={<GroupsIcon />} />,
    ]
  )

  // Rota atual reduzida ao item da barra que a representa. Só valores que a
  // barra deste perfil realmente exibe; qualquer outra rota vive em "Mais".
  const rotaResumida = location.pathname === '/'
    ? '/'
    : location.pathname === '/professor'
      ? '/professor'
    : location.pathname.startsWith('/professor/turmas')
      ? '/professor/turmas'
    : location.pathname.startsWith('/materiais')
      ? '/materiais'
    : location.pathname.startsWith('/notas')
      ? '/notas'
    : location.pathname.startsWith('/financeiro')
      ? '/financeiro'
    : location.pathname.startsWith('/alunos')
      ? '/alunos'
        : location.pathname.startsWith('/turmas')
          ? '/turmas'
          : location.pathname.startsWith('/leads')
            ? '/leads'
            : location.pathname.startsWith('/whatsapp')
              ? '/whatsapp'
          : 'mais'
  const valoresDaBarra = acoesInferiores.map((acao) => acao.props.value)
  const valorNavegacao = valoresDaBarra.includes(rotaResumida) ? rotaResumida : 'mais'

  // Título da aba acompanha a seção e o scroll volta ao topo a cada rota.
  useEffect(() => {
    document.title = `${tituloAtual} · TOV Acadêmico`
    window.scrollTo(0, 0)
    const quadro = window.requestAnimationFrame(() => {
      conteudoPrincipalRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(quadro)
  }, [location.pathname, tituloAtual])

  const conteudoMenu = (
    <>
      {/* Só esta região rola. O rodapé (sino, usuário, sair) fica sempre à
          vista: num painel mais alto que a janela, `mt: 'auto'` não empurrava
          o rodapé para a base visível — só para depois do conteúdo, fora da tela. */}
      <Box sx={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5, mx: -0.5, px: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, px: 1, mb: 2 }}>
        <Typography component="span" sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.titleLg, letterSpacing: '-.035em' }}>
          TOV
        </Typography>
        <Typography component="span" sx={{ fontSize: TOV.type.overline, color: TOV.onDarkMuted }}>acadêmico</Typography>
      </Box>

      {!['PROFESSOR', 'FINANCEIRO'].includes(perfil) && <SeletorSistema onTrocar={trocarSistema} />}

      <Box sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.micro, letterSpacing: '.16em', textTransform: 'uppercase', color: TOV.onDarkMuted, px: 1.5, mb: 1 }}>
        {perfil === 'MARKETING' ? 'Marketing'
          : perfil === 'PROFESSOR' ? 'Portal do professor'
            : perfil === 'FINANCEIRO' ? 'Tesouraria'
              : 'Secretaria'}
      </Box>

      <Box component="nav" aria-label="Navegação principal" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {menuVisivel.map((item) => (
          <ItemNav key={item.rota} item={item} ativo={estaAtivo(item)} onClick={() => irPara(item.rota)} />
        ))}
      </Box>

      <Box sx={{ mt: 1, px: 1, pb: 1 }}>
        <BotaoInstalarPwa sx={{ color: TOV.onDarkBody, borderColor: TOV.onDarkBorder, bgcolor: 'transparent', '&:hover': { color: TOV.onDark, borderColor: TOV.onDarkBorderHover, bgcolor: TOV.onDarkSurface } }} />
      </Box>
      </Box>

      <Box
        sx={{
          flex: '0 0 auto', display: 'grid', gridTemplateColumns: '44px 36px minmax(0,1fr) 44px',
          alignItems: 'center', gap: 1, pt: 2, px: 0.5,
          borderTop: `1px solid ${TOV.onDarkBorder}`,
        }}
      >
        <BotaoNotificacoes naoLidas={estadoNotificacoes.naoLidas} onClick={() => setNotificacoesAbertas(true)} />
        <Box sx={{ width: 36, height: 36, borderRadius: TOV.radiusSm, bgcolor: TOV.onDarkSurface, border: `1px solid ${TOV.onDarkBorder}`, color: TOV.onDark, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: TOV.type.bodySm, flexShrink: 0 }}>
          {iniciais(usuario)}
        </Box>
        <Box
          component="button"
          type="button"
          onClick={() => { setMenuAberto(false); setTrocarSenhaAberto(true) }}
          title="Alterar minha senha"
          aria-label={`${usuario}: alterar minha senha`}
          sx={{ ...resetBotao, lineHeight: 1.2, overflow: 'hidden', textAlign: 'left', minHeight: 44, px: 0.5, mx: -0.5, borderRadius: TOV.radiusSm, color: 'inherit', '&:hover': { bgcolor: TOV.onDarkSurface }, '&:focus-visible': focusRingOnDark }}
        >
          <Box sx={{ fontWeight: 700, fontSize: TOV.type.body, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{usuario}</Box>
          <Box sx={{ fontSize: TOV.type.overline, color: TOV.onDarkMuted }}>
            {perfil === 'ADMIN' ? 'Administrador'
              : perfil === 'MARKETING' ? 'Marketing'
                : perfil === 'PROFESSOR' ? 'Professor'
                  : perfil === 'FINANCEIRO' ? 'Financeiro'
                    : 'Secretaria'}
          </Box>
        </Box>
        <Box
          component="button"
          type="button"
          onClick={sair}
          title="Sair"
          aria-label="Sair do sistema"
          sx={{ ...resetBotao, width: 44, height: 44, display: 'grid', placeItems: 'center', color: TOV.onDarkMuted, '&:hover': { color: TOV.onDark, bgcolor: TOV.onDarkSurface }, '&:focus-visible': focusRingOnDark }}
        >
          <LogoutIcon sx={{ fontSize: TOV.type.section }} />
        </Box>
      </Box>
    </>
  )

  const estiloPainel = {
    bgcolor: TOV.graphite, color: TOV.onDark, p: '24px 16px',
    borderRight: `1px solid ${TOV.darkHairline}`,
    display: 'flex', flexDirection: 'column', gap: 0.5, overflow: 'hidden',
  }

  return (
    <UnsavedChangesContext.Provider value={registrarAlteracoesPendentes}>
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: TOV.canvas }}>
      <Box
        component="a"
        href="#conteudo-principal"
        sx={{
          position: 'fixed', zIndex: (theme) => theme.zIndex.tooltip + 1,
          top: 8, left: 8, px: 2, py: 1.5, borderRadius: TOV.radiusSm,
          bgcolor: TOV.ink, color: TOV.onDark, textDecoration: 'none',
          transform: 'translateY(-160%)', transition: `transform ${TOV.transitionFast}`,
          '&:focus': { transform: 'translateY(0)' },
        }}
      >
        Ir para o conteúdo
      </Box>
      {/* Barra superior — só no mobile/tablet */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          display: { xs: 'flex', lg: 'none' }, bgcolor: TOV.surface,
          color: TOV.ink, borderBottom: `1px solid ${TOV.border}`,
          pt: 'env(safe-area-inset-top)',
          left: { xs: 0, sm: `${TOV.railW}px` },
          width: { xs: '100%', sm: `calc(100% - ${TOV.railW}px)` },
        }}
      >
        <Toolbar sx={{ gap: 1, minHeight: { xs: 60 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
            <SeloTov tamanho={28} />
            <Typography sx={{ fontFamily: TOV.fontHead, fontWeight: 700, fontSize: TOV.type.titleSm, letterSpacing: '-.025em' }}>TOV</Typography>
            {tituloForaDaTela && (
              <Typography noWrap sx={{ fontSize: TOV.type.caption, color: TOV.caption }}>{tituloAtual}</Typography>
            )}
          </Box>
          <Box sx={{ ml: 'auto' }}>
            <BotaoNotificacoes naoLidas={estadoNotificacoes.naoLidas} onClick={() => setNotificacoesAbertas(true)} />
          </Box>
        </Toolbar>
      </AppBar>

      {/* Menu gaveta — mobile/tablet */}
      <Drawer
        variant="temporary"
        open={menuAberto}
        onClose={fecharMenu}
        ModalProps={{
          keepMounted: true,
          closeAfterTransition: true,
          onTransitionExited: concluirFechamentoMenu,
        }}
        sx={{
          display: { xs: 'block', lg: 'none' },
          '& .MuiDrawer-paper': {
            ...estiloPainel, width: 292, maxWidth: '88vw', border: 0, height: '100%',
            pt: 'calc(24px + env(safe-area-inset-top))',
            pb: 'calc(32px + env(safe-area-inset-bottom))',
          },
        }}
      >
        {conteudoMenu}
      </Drawer>

      {/* Trilha de navegação — tablet e notebook pequeno (600–1200px).
          A sidebar completa só entra em lg: em md ela tomava 272px de uma
          janela de 900px e a tabela cabia menos do que em 899px. */}
      <Box
        component="nav"
        aria-label="Navegação principal"
        sx={{
          display: { xs: 'none', sm: 'flex', lg: 'none' },
          flexDirection: 'column', alignItems: 'center',
          width: TOV.railW, flex: `0 0 ${TOV.railW}px`,
          position: 'sticky', top: 0, height: '100vh', alignSelf: 'flex-start',
          bgcolor: TOV.graphite, color: TOV.onDark,
          borderRight: `1px solid ${TOV.darkHairline}`,
          pt: 'calc(68px + env(safe-area-inset-top))',
          pb: 'calc(8px + env(safe-area-inset-bottom))',
          overflow: 'hidden',
        }}
      >
        {/* Os itens rolam; "Mais" fica preso na base — é a única porta para o
            resto do produto e sumia em celular na horizontal. */}
        <Box sx={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: '100%' }}>
          {itensTrilha.map((item) => (
            <ItemTrilha
              key={item.rota}
              icone={item.icone}
              rotulo={item.curto || item.rotulo}
              rotuloAcessivel={item.rotulo}
              ativo={estaAtivo(item)}
              onClick={() => irPara(item.rota)}
            />
          ))}
        </Box>
        <Box sx={{ flex: '0 0 auto', pt: 0.5, borderTop: `1px solid ${TOV.onDarkBorder}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          <ItemTrilha
            icone={MoreHorizIcon}
            rotulo="Mais"
            rotuloAcessivel="Abrir menu completo"
            ativo={false}
            onClick={() => setMenuAberto(true)}
          />
          {/* Sair direto da trilha: no tablet, antes, exigia descobrir que
              "Mais" abre um menu que tem um rodapé que rola. */}
          <ItemTrilha
            icone={LogoutIcon}
            rotulo="Sair"
            rotuloAcessivel={`Sair do sistema (${usuario})`}
            ativo={false}
            onClick={sair}
          />
        </Box>
      </Box>

      {/* Sidebar fixa — desktop */}
      <Box
        component="aside"
        aria-label="Navegação lateral"
        sx={{
          ...estiloPainel,
          display: { xs: 'none', lg: 'flex' },
          width: TOV.sidebarW, flex: `0 0 ${TOV.sidebarW}px`,
          position: 'sticky', top: 0, height: '100vh', alignSelf: 'flex-start',
        }}
      >
        {conteudoMenu}
      </Box>

      <Box
        component="main"
        id="conteudo-principal"
        tabIndex={-1}
        ref={conteudoPrincipalRef}
        sx={{
          flexGrow: 1, minWidth: 0, bgcolor: TOV.canvas,
          pt: { xs: 'calc(84px + env(safe-area-inset-top))', sm: 'calc(88px + env(safe-area-inset-top))', lg: '40px' },
          px: { xs: '16px', sm: '28px', lg: 'clamp(36px,4vw,64px)' },
          pb: { xs: 'calc(96px + env(safe-area-inset-bottom))', sm: '44px', lg: '52px' },
          '& > *': { width: '100%', maxWidth: 1500, mx: 'auto' },
          '&:focus': { outline: 'none' },
        }}
      >
        {children}
      </Box>
      <NotificationCenter
        aberto={notificacoesAbertas}
        onFechar={() => setNotificacoesAbertas(false)}
        onNavigate={irPara}
        estado={estadoNotificacoes}
      />

      {/* Atalhos de uso frequente — somente em celulares. */}
      <Paper
        elevation={0}
        sx={{
          display: { xs: 'block', sm: 'none' }, position: 'fixed', inset: 'auto 0 0',
          zIndex: (theme) => theme.zIndex.appBar,
          pb: 'env(safe-area-inset-bottom)', borderRadius: TOV.radiusNone,
          borderTop: `1px solid ${TOV.border}`,
          boxShadow: TOV.shadowTop,
        }}
      >
        <BottomNavigation
          showLabels
          value={valorNavegacao}
          onChange={(_, valor) => {
            if (valor === 'mais') setMenuAberto(true)
            else irPara(valor)
          }}
          sx={{
            height: 66,
            '& .MuiBottomNavigationAction-root': {
              minWidth: 64, minHeight: 60, color: TOV.caption, position: 'relative',
              '&::before': { content: '""', position: 'absolute', top: 0, width: 28, height: 4, borderRadius: `0 0 ${TOV.radiusXs} ${TOV.radiusXs}`, bgcolor: 'transparent' },
            },
            '& .Mui-selected': { color: TOV.coral, '&::before': { bgcolor: TOV.coral } },
            '& .MuiBottomNavigationAction-label': { fontSize: TOV.type.overline, fontWeight: 700 },
          }}
        >
          {/* Filhos diretos, sem fragmento: o BottomNavigation distribui
              `showLabel`, `selected` e `value` só sobre os filhos imediatos —
              dentro de <>…</> as ações nunca recebiam rótulo nem estado ativo. */}
          {acoesInferiores}
          <BottomNavigationAction label="Mais" value="mais" icon={<MoreHorizIcon />} />
        </BottomNavigation>
      </Paper>
    </Box>
    <DialogoTrocarSenha aberto={trocarSenhaAberto} onFechar={() => setTrocarSenhaAberto(false)} />
    <DialogoConfirmacao
      aberto={!!destinoPendente}
      titulo="Descartar alterações?"
      descricao={alteracoesPendentes || 'Há alterações que ainda não foram salvas.'}
      rotuloConfirmar="Descartar e continuar"
      processando={false}
      onConfirmar={confirmarNavegacao}
      onFechar={cancelarNavegacao}
    />
    </UnsavedChangesContext.Provider>
  )
}
