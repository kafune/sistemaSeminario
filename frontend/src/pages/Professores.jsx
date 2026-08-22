import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
  InputAdornment, MenuItem, Paper, Snackbar, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import LinkIcon from '@mui/icons-material/Link'
import SearchIcon from '@mui/icons-material/Search'
import { api } from '../api'
import { TOV } from '../theme'
import { emailValido, formatarCepInput, formatarCpfInput, formatarTelefoneInput } from '../formatters'
import { useDirtyForm } from '../UnsavedChanges'
import {
  CabecalhoPagina, CartaoLista, DialogoConfirmacao, EstadoVazio, LinhaCartao,
  LinhasSkeleton, PilulaStatus, SkeletonCards, resetBotao,
  useDialogoTelaCheia, useTelaDesktop,
} from '../ui'

const VAZIO = {
  nome: '', e_mail: '', fone1: '', celular: '', sigla: '',
  status: 'A', materias_atuacao: '',
}

export default function Professores() {
  const [professores, setProfessores] = useState([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState(null)
  const [confirmarFecharForm, setConfirmarFecharForm] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [paraExcluir, setParaExcluir] = useState(null)
  const [excluindo, setExcluindo] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgTipo, setMsgTipo] = useState('error')
  const [convite, setConvite] = useState(null)
  const [criandoConvite, setCriandoConvite] = useState(false)
  const telaCheia = useDialogoTelaCheia()
  const telaDesktop = useTelaDesktop()
  const formAlterado = useDirtyForm(!!form, form, 'Há dados do professor que ainda não foram salvos.')
  const emailInvalido = !!form && !emailValido(form.e_mail)

  function abrirForm(dados) {
    setForm({ ...dados })
    setConfirmarFecharForm(false)
  }

  function fecharForm() {
    if (formAlterado) setConfirmarFecharForm(true)
    else setForm(null)
  }

  function carregar() {
    setCarregando(true)
    api.get(`/professores?busca=${encodeURIComponent(busca)}`)
      .then(setProfessores)
      .catch((e) => { setMsgTipo('error'); setMsg(e.message) })
      .finally(() => setCarregando(false))
  }

  useEffect(carregar, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    setSalvando(true)
    try {
      const dados = Object.fromEntries(
        Object.entries(form).map(([campo, valor]) => [
          campo,
          typeof valor === 'string' && !valor.trim() ? null : valor,
        ]),
      )
      if (form.cod_pro) await api.put(`/professores/${form.cod_pro}`, dados)
      else await api.post('/professores', dados)
      setForm(null)
      carregar()
    } catch (e) {
      setMsgTipo('error')
      setMsg(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function excluir() {
    setExcluindo(true)
    try {
      await api.del(`/professores/${paraExcluir.cod_pro}`)
      setParaExcluir(null)
      carregar()
    } catch (e) {
      setMsgTipo('error')
      setMsg(e.message)
      setParaExcluir(null)
    } finally {
      setExcluindo(false)
    }
  }

  async function criarConvite() {
    setCriandoConvite(true)
    try {
      const resposta = await api.post('/professores/convites', {})
      setConvite({
        tipo: 'cadastro',
        url: `${window.location.origin}/cadastro-professor/${resposta.token}`,
        expira_em: resposta.expira_em,
      })
    } catch (e) {
      setMsgTipo('error')
      setMsg(e.message)
    } finally {
      setCriandoConvite(false)
    }
  }

  async function criarConviteAcesso(professor) {
    setCriandoConvite(true)
    try {
      const resposta = await api.post(`/professores/${professor.cod_pro}/convite-acesso`, {})
      setConvite({
        tipo: 'acesso',
        professor_nome: resposta.professor_nome,
        url: `${window.location.origin}/acesso-professor/${resposta.token}`,
        expira_em: resposta.expira_em,
      })
    } catch (e) {
      setMsgTipo('error')
      setMsg(e.message)
    } finally {
      setCriandoConvite(false)
    }
  }

  async function copiarConvite() {
    try {
      await navigator.clipboard.writeText(convite.url)
      setMsgTipo('success')
      setMsg(convite.tipo === 'acesso' ? 'Link de acesso copiado.' : 'Link de autocadastro copiado.')
    } catch {
      setMsgTipo('error')
      setMsg('Não foi possível copiar automaticamente. Selecione o link no campo.')
    }
  }

  const ativos = professores.filter((p) => p.status === 'A').length
  const acoes = (
    <>
      <Box component="form" onSubmit={(e) => { e.preventDefault(); carregar() }}>
        <TextField
          size="small" placeholder="Buscar professor" value={busca}
          onChange={(e) => setBusca(e.target.value)}
          sx={{ minWidth: { xs: '100%', sm: 240 } }}
          inputProps={{ enterKeyHint: 'search', 'aria-label': 'Buscar professor' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: TOV.caption, fontSize: TOV.type.titleSm }} />
              </InputAdornment>
            ),
          }}
        />
      </Box>
      <Button variant="outlined" startIcon={<LinkIcon />} onClick={criarConvite} disabled={criandoConvite}>
        {criandoConvite ? 'Gerando…' : 'Link de autocadastro'}
      </Button>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => abrirForm(VAZIO)}>
        Novo professor
      </Button>
    </>
  )

  return (
    <Box>
      <CabecalhoPagina
        variante="operacional"
        titulo="Professores"
        metadados={carregando ? ' ' : `${professores.length} ${professores.length === 1 ? 'professor' : 'professores'} · ${ativos} ativos`}
        acoes={acoes}
      />

      {/* Lista em cards — celular/tablet */}
      {!telaDesktop && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {carregando && professores.length === 0 && (
          <SkeletonCards quantidade={4} altura={112} colunas="1fr" />
        )}
        {!carregando && professores.length === 0 && (
          <CartaoLista><EstadoVazio compacto titulo="Nenhum professor encontrado" descricao="Revise a busca ou cadastre um novo professor." /></CartaoLista>
        )}
        {professores.map((p) => (
          <CartaoLista key={p.cod_pro}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ fontWeight: 700, fontSize: TOV.type.bodyLg, lineHeight: 1.3 }}>{p.nome}</Box>
                <Box sx={{ fontSize: TOV.type.bodySm, color: TOV.caption, fontWeight: 600, mt: 0.5 }}>
                  Código {String(p.cod_pro).padStart(2, '0')}{p.sigla ? ` · ${p.sigla}` : ''}
                </Box>
              </Box>
              <PilulaStatus status={p.status} sx={{ flexShrink: 0 }} />
            </Box>
            <LinhaCartao rotulo="Telefone" valor={p.fone1 || p.celular} />
            <LinhaCartao rotulo="E-mail" valor={p.e_mail} />
            <LinhaCartao rotulo="Acesso" valor={p.usuario_acesso || 'Ainda não criado'} />
            <LinhaCartao rotulo="Áreas indicadas" valor={p.materias_atuacao} />
            <Box sx={{ display: 'flex', gap: 1, pt: 1, borderTop: `1px solid ${TOV.divider}` }}>
              <Button size="small" variant="outlined" fullWidth disabled={!!p.usuario_acesso || criandoConvite} onClick={() => criarConviteAcesso(p)}>{p.usuario_acesso ? 'Acesso criado' : 'Criar acesso'}</Button>
              <Button size="small" variant="outlined" fullWidth onClick={() => abrirForm(p)}>Editar</Button>
              <Button size="small" variant="outlined" color="error" fullWidth onClick={() => setParaExcluir(p)}>Excluir</Button>
            </Box>
          </CartaoLista>
        ))}
      </Box>}

      {/* Tabela — desktop */}
      {telaDesktop && <TableContainer component={Box} sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 920 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 90 }}>Código</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell sx={{ width: 90 }}>Sigla</TableCell>
              <TableCell>Telefone</TableCell>
              <TableCell>E-mail</TableCell>
              <TableCell>Acesso</TableCell>
              <TableCell>Áreas indicadas</TableCell>
              <TableCell sx={{ width: 110 }}>Status</TableCell>
              <TableCell align="right" sx={{ width: 190 }}>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {carregando && professores.length === 0 && (
              <LinhasSkeleton colunas={9} />
            )}
            {!carregando && professores.length === 0 && (
              <TableRow><TableCell colSpan={9} sx={{ p: 0 }}><EstadoVazio titulo="Nenhum professor encontrado" descricao="Revise a busca ou cadastre um novo professor." /></TableCell></TableRow>
            )}
            {professores.map((p) => (
              <TableRow key={p.cod_pro} hover>
                <TableCell sx={{ color: TOV.caption, fontWeight: 600 }}>{String(p.cod_pro).padStart(2, '0')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{p.nome}</TableCell>
                <TableCell sx={{ color: TOV.graphite }}>{p.sigla || '—'}</TableCell>
                <TableCell sx={{ color: TOV.graphite }}>{p.fone1 || p.celular || '—'}</TableCell>
                <TableCell sx={{ color: TOV.graphite }}>{p.e_mail || '—'}</TableCell>
                <TableCell sx={{ color: TOV.graphite }}>{p.usuario_acesso || '—'}</TableCell>
                <TableCell sx={{ color: TOV.graphite, maxWidth: 260 }}>
                  <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.materias_atuacao || ''}>
                    {p.materias_atuacao || '—'}
                  </Box>
                </TableCell>
                <TableCell><PilulaStatus status={p.status} /></TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'inline-flex', gap: 1.5, alignItems: 'center', fontSize: TOV.type.bodySm, fontWeight: 600, color: TOV.caption }}>
                    {!p.usuario_acesso && <>
                      <Box component="button" type="button" onClick={() => criarConviteAcesso(p)} disabled={criandoConvite}
                        sx={{ ...resetBotao, '&:hover': { color: TOV.coral } }}>
                        Criar acesso
                      </Box>
                      <Box component="span" sx={{ color: TOV.border }}>·</Box>
                    </>}
                    <Box component="button" type="button" onClick={() => abrirForm(p)}
                      sx={{ ...resetBotao, '&:hover': { color: TOV.coral } }}>
                      Editar
                    </Box>
                    <Box component="span" sx={{ color: TOV.border }}>·</Box>
                    <Box component="button" type="button" onClick={() => setParaExcluir(p)}
                      sx={{ ...resetBotao, '&:hover': { color: TOV.danger } }}>
                      Excluir
                    </Box>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>}

      <Dialog open={!!form} onClose={salvando ? undefined : fecharForm} maxWidth="md" fullWidth fullScreen={telaCheia}>
        <DialogTitle>{form?.cod_pro ? 'Editar professor' : 'Novo professor'}</DialogTitle>
        <DialogContent>
          {form && (
            <Grid container spacing={1.5} sx={{ mt: 0 }}>
              <Grid item xs={12} sm={9}>
                <TextField fullWidth required label="Nome" value={form.nome ?? ''}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField fullWidth label="Sigla" value={form.sigla ?? ''}
                  onChange={(e) => setForm({ ...form, sigla: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth type="tel" label="Telefone" value={form.fone1 ?? ''}
                  onChange={(e) => setForm({ ...form, fone1: formatarTelefoneInput(e.target.value) })} inputProps={{ inputMode: 'tel', maxLength: 15 }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth type="tel" label="Celular" value={form.celular ?? ''}
                  onChange={(e) => setForm({ ...form, celular: formatarTelefoneInput(e.target.value) })} inputProps={{ inputMode: 'tel', maxLength: 15 }} />
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextField fullWidth type="email" label="E-mail" value={form.e_mail ?? ''}
                  onChange={(e) => setForm({ ...form, e_mail: e.target.value })} error={emailInvalido} helperText={emailInvalido ? 'Informe um e-mail válido.' : ' '} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField select fullWidth label="Status" value={form.status ?? 'A'}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <MenuItem value="A">Ativo</MenuItem>
                  <MenuItem value="I">Inativo</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth multiline minRows={3}
                  label="Matérias ou áreas indicadas pelo professor"
                  value={form.materias_atuacao ?? ''}
                  onChange={(e) => setForm({ ...form, materias_atuacao: e.target.value })}
                  helperText="Texto informativo; os vínculos oficiais continuam sendo feitos nas turmas."
                  inputProps={{ maxLength: 1000 }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth type="date" label="Data de nascimento" value={form.dat_nas ?? ''}
                  onChange={(e) => setForm({ ...form, dat_nas: e.target.value })} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField select fullWidth label="Sexo" value={form.sexo ?? ''}
                  onChange={(e) => setForm({ ...form, sexo: e.target.value })}>
                  <MenuItem value="">Não informado</MenuItem>
                  <MenuItem value="F">Feminino</MenuItem>
                  <MenuItem value="M">Masculino</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth label="Estado civil" value={form.est_civ ?? ''}
                  onChange={(e) => setForm({ ...form, est_civ: e.target.value })} inputProps={{ maxLength: 30 }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth label="CPF" value={form.cpf ?? ''}
                  onChange={(e) => setForm({ ...form, cpf: formatarCpfInput(e.target.value) })} inputProps={{ inputMode: 'numeric', maxLength: 14 }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth label="RG" value={form.rg ?? ''}
                  onChange={(e) => setForm({ ...form, rg: e.target.value })} inputProps={{ maxLength: 20 }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth label="Nacionalidade" value={form.nacionalidade ?? ''}
                  onChange={(e) => setForm({ ...form, nacionalidade: e.target.value })} inputProps={{ maxLength: 30 }} />
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextField fullWidth label="Endereço" value={form.endereco ?? ''}
                  onChange={(e) => setForm({ ...form, endereco: e.target.value })} inputProps={{ maxLength: 100 }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth label="Complemento" value={form.complemento ?? ''}
                  onChange={(e) => setForm({ ...form, complemento: e.target.value })} inputProps={{ maxLength: 60 }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth label="Bairro" value={form.bairro ?? ''}
                  onChange={(e) => setForm({ ...form, bairro: e.target.value })} inputProps={{ maxLength: 60 }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth label="Cidade" value={form.cidade ?? ''}
                  onChange={(e) => setForm({ ...form, cidade: e.target.value })} inputProps={{ maxLength: 60 }} />
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField fullWidth label="UF" value={form.uf ?? ''}
                  onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} inputProps={{ maxLength: 2 }} />
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField fullWidth label="CEP" value={form.cep ?? ''}
                  onChange={(e) => setForm({ ...form, cep: formatarCepInput(e.target.value) })} inputProps={{ inputMode: 'numeric', maxLength: 9 }} />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button variant="outlined" onClick={fecharForm} disabled={salvando}>Cancelar</Button>
          <Button variant="contained" onClick={salvar} disabled={!form?.nome?.trim() || emailInvalido || salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>

      <DialogoConfirmacao
        aberto={confirmarFecharForm}
        titulo="Descartar alterações?"
        descricao="As informações preenchidas sobre o professor serão perdidas."
        rotuloConfirmar="Descartar"
        processando={false}
        onConfirmar={() => { setConfirmarFecharForm(false); setForm(null) }}
        onFechar={() => setConfirmarFecharForm(false)}
      />

      <Dialog open={!!convite} onClose={() => setConvite(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{convite?.tipo === 'acesso' ? 'Link de acesso às notas' : 'Link de autocadastro'}</DialogTitle>
        <DialogContent>
          <Box sx={{ color: TOV.graphite, fontSize: TOV.type.body, mb: 2 }}>
            {convite?.tipo === 'acesso'
              ? `Envie este link a ${convite.professor_nome}. Ele poderá criar a senha e acessar somente as próprias turmas. O link expira em 7 dias.`
              : 'Envie este link a um professor. Ele é individual, expira em 30 dias e deixa de funcionar após o primeiro cadastro.'}
          </Box>
          <TextField
            fullWidth value={convite?.url || ''}
            InputProps={{ readOnly: true }}
            helperText={convite?.expira_em ? `Válido até ${new Date(convite.expira_em).toLocaleDateString('pt-BR')}` : ''}
            onFocus={(e) => e.target.select()}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button variant="outlined" onClick={() => setConvite(null)}>Fechar</Button>
          <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={copiarConvite}>Copiar link</Button>
        </DialogActions>
      </Dialog>

      <DialogoConfirmacao
        aberto={!!paraExcluir}
        titulo="Excluir professor"
        descricao={`Excluir o professor ${paraExcluir?.nome}? Esta ação não pode ser desfeita.`}
        processando={excluindo}
        onConfirmar={excluir}
        onFechar={() => setParaExcluir(null)}
      />

      <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg('')}>
        <Alert severity={msgTipo} onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
    </Box>
  )
}
