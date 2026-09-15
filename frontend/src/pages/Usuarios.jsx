import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, Grid, Snackbar,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  MenuItem, Chip, Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { api, getUser } from '../api'
import { TOV } from '../theme'
import { formatarDataHora } from '../formatters'
import {
  CabecalhoPagina, CartaoLista, DialogoConfirmacao, EstadoErro, EstadoVazio,
  LinhasSkeleton, SkeletonCards, TituloDialogo, acaoTabelaSx, iniciais,
  useDialogoTelaCheia, useTelaDesktop
} from '../ui'
import { useDirtyForm } from '../UnsavedChanges'

const SENHA_MINIMA = 6

const ROTULO_ACAO = {
  CRIAR: 'Criou', EXCLUIR: 'Excluiu', ALTERAR_PERFIL: 'Alterou perfil', REDEFINIR_SENHA: 'Redefiniu senha',
  ESTORNAR: 'Estornou', ALTERAR_STATUS: 'Alterou situação', SALVAR_PLANO: 'Salvou plano',
}
const ROTULO_ENTIDADE = {
  usuario: 'usuário', aluno: 'aluno', professor: 'professor', materia: 'matéria', turma: 'turma',
  aula: 'aula', cobranca: 'cobrança', pagamento: 'pagamento',
}

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([])
  // Trilha de auditoria administrativa: quem criou, excluiu, mudou perfil ou senha.
  const [auditoria, setAuditoria] = useState({ total: 0, itens: [] })
  const [erroAuditoria, setErroAuditoria] = useState('')
  const carregarAuditoria = () => {
    setErroAuditoria('')
    api.get('/usuarios/auditoria?por_pagina=30')
      .then(setAuditoria)
      .catch((e) => setErroAuditoria(e.message))
  }
  useEffect(() => { carregarAuditoria() }, [])
  const [carregando, setCarregando] = useState(true)
  // Falha da própria lista: vira `EstadoErro` no corpo, não estado vazio.
  const [erroCarga, setErroCarga] = useState('')
  const [form, setForm] = useState(null) // null = fechado; { user, senha, confirmar, novo }
  const [confirmarFecharForm, setConfirmarFecharForm] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [paraExcluir, setParaExcluir] = useState(null)
  const [excluindo, setExcluindo] = useState(false)
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')
  const atual = getUser()
  const telaCheia = useDialogoTelaCheia()
  const telaDesktop = useTelaDesktop()
  const formAlterado = useDirtyForm(!!form, form, 'Há alterações de acesso que ainda não foram salvas.')

  function fecharForm() {
    if (formAlterado) setConfirmarFecharForm(true)
    else setForm(null)
  }

  function carregar() {
    setCarregando(true)
    setErroCarga('')
    api.get('/usuarios')
      .then(setUsuarios)
      .catch((e) => {
        setErroCarga(e.message)
        setUsuarios([])
      })
      .finally(() => setCarregando(false))
  }

  useEffect(carregar, []) // eslint-disable-line react-hooks/exhaustive-deps

  function novo() {
    setForm({ user: '', senha: '', confirmar: '', perfil: 'SECRETARIA', novo: true })
    setConfirmarFecharForm(false)
  }

  function redefinir(u) {
    setForm({ user: u.user, senha: '', confirmar: '', perfil: u.perfil || 'ADMIN', novo: false })
    setConfirmarFecharForm(false)
  }

  const senhaCurta = form && form.senha.length > 0 && form.senha.length < SENHA_MINIMA
  const naoConfere = form && form.confirmar.length > 0 && form.senha !== form.confirmar
  const podeSalvar =
    form &&
    (!form.novo || form.user.trim()) &&
    (form.novo ? form.senha.length >= SENHA_MINIMA : !form.senha || form.senha.length >= SENHA_MINIMA) &&
    form.senha === form.confirmar

  async function salvar() {
    setSalvando(true)
    try {
      if (form.novo) {
        await api.post('/usuarios', { user: form.user, senha: form.senha, perfil: form.perfil })
        setOk('Usuário criado.')
      } else {
        if (form.senha) {
          await api.put(`/usuarios/${encodeURIComponent(form.user)}/senha`, { senha: form.senha })
        }
        await api.put(`/usuarios/${encodeURIComponent(form.user)}/perfil`, { perfil: form.perfil })
        setOk('Acesso atualizado.')
      }
      setForm(null)
      carregar()
    } catch (e) {
      setMsg(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function excluir() {
    setExcluindo(true)
    try {
      await api.del(`/usuarios/${encodeURIComponent(paraExcluir.user)}`)
      setOk('Usuário excluído.')
      setParaExcluir(null)
      carregar()
    } catch (e) {
      setMsg(e.message)
      setParaExcluir(null)
    } finally {
      setExcluindo(false)
    }
  }

  const acoes = (
    <Button variant="contained" startIcon={<AddIcon />} onClick={novo}>
      Novo usuário
    </Button>
  )

  return (
    <Box>
      <CabecalhoPagina
        variante="operacional"
        titulo="Usuários"
        metadados={carregando || erroCarga ? ' ' : `${usuarios.length} ${usuarios.length === 1 ? 'usuário com acesso' : 'usuários com acesso'} ao sistema`}
        acoes={acoes}
      />

      {/* Lista em cards — celular/tablet */}
      {!telaDesktop && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {carregando && usuarios.length === 0 && (
          <SkeletonCards quantidade={4} altura={112} colunas="1fr" />
        )}
        {!carregando && erroCarga && (
          <EstadoErro titulo="Não foi possível carregar os usuários" descricao={erroCarga} onTentarNovamente={carregar} />
        )}
        {!carregando && !erroCarga && usuarios.length === 0 && (
          <CartaoLista><EstadoVazio compacto titulo="Nenhum usuário cadastrado" descricao="Crie um acesso para começar." /></CartaoLista>
        )}
        {usuarios.map((u) => {
          const euMesmo = u.user === atual
          return (
            <CartaoLista key={u.user}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '38px minmax(0,1fr)', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                <Box sx={{
                  width: 40, height: 40, flex: '0 0 40px', borderRadius: TOV.radiusSm,
                  bgcolor: TOV.graphite, color: TOV.onDark, fontFamily: TOV.fontHead, fontWeight: 700,
                  fontSize: TOV.type.body, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {iniciais(u.user)}
                </Box>
                <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Box component="span" sx={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', fontWeight: 700, fontSize: TOV.type.bodyLg }}>{u.user}</Box>
                  <Chip size="small" variant="outlined" label={u.perfil || 'ADMIN'} />
                  {euMesmo && (
                    <Box component="span" sx={{
                      px: 1.5, py: 0.5, borderRadius: TOV.radiusFull, bgcolor: TOV.graphiteTint,
                      color: TOV.graphite, fontSize: TOV.type.overline, fontWeight: 700,
                    }}>
                      você
                    </Box>
                  )}
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, pt: 1, borderTop: `1px solid ${TOV.divider}` }}>
                <Button size="small" variant="outlined" fullWidth onClick={() => redefinir(u)}>Gerenciar acesso</Button>
                <Button size="small" variant="outlined" color="error" fullWidth disabled={euMesmo} onClick={() => setParaExcluir(u)}>Excluir</Button>
              </Box>
            </CartaoLista>
          )
        })}
      </Box>}

      {/* Tabela — desktop */}
      {telaDesktop && <TableContainer component={Box} sx={{ overflowX: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Usuário</TableCell>
              <TableCell sx={{ width: 160 }}>Perfil</TableCell>
              <TableCell>Professor vinculado</TableCell>
              <TableCell align="right" sx={{ width: 220 }}>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {carregando && usuarios.length === 0 && (
              <LinhasSkeleton colunas={4} />
            )}
            {!carregando && erroCarga && (
              <TableRow><TableCell colSpan={4} sx={{ p: 2 }}><EstadoErro titulo="Não foi possível carregar os usuários" descricao={erroCarga} onTentarNovamente={carregar} /></TableCell></TableRow>
            )}
            {!carregando && !erroCarga && usuarios.length === 0 && (
              <TableRow><TableCell colSpan={4} sx={{ p: 0 }}><EstadoVazio titulo="Nenhum usuário cadastrado" descricao="Crie um acesso para começar." /></TableCell></TableRow>
            )}
            {usuarios.map((u) => {
              const euMesmo = u.user === atual
              return (
                <TableRow key={u.user} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{
                        width: 40, height: 40, flex: '0 0 40px', borderRadius: TOV.radiusSm,
                        bgcolor: TOV.graphite, color: TOV.onDark, fontFamily: TOV.fontHead, fontWeight: 700,
                        fontSize: TOV.type.body, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {iniciais(u.user)}
                      </Box>
                      <Box component="span" sx={{ fontWeight: 700 }}>{u.user}</Box>
                      {euMesmo && (
                        <Box component="span" sx={{
                          px: 1.5, py: 0.5, borderRadius: TOV.radiusFull, bgcolor: TOV.graphiteTint,
                          color: TOV.graphite, fontSize: TOV.type.overline, fontWeight: 700,
                        }}>
                          você
                        </Box>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell><Chip size="small" variant="outlined" label={u.perfil || 'ADMIN'} /></TableCell>
                  <TableCell sx={{ color: TOV.graphite }}>{u.professor_nome || '—'}</TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'inline-flex', gap: 1.5, alignItems: 'center', fontSize: TOV.type.bodySm, fontWeight: 600, color: TOV.caption }}>
                      <Box component="button" type="button" onClick={() => redefinir(u)} sx={acaoTabelaSx}>
                        Gerenciar acesso
                      </Box>
                      <Box component="span" aria-hidden="true" sx={{ color: TOV.caption }}>·</Box>
                      <Box
                        component="button" type="button"
                        disabled={euMesmo}
                        title={euMesmo ? 'Não é possível excluir o próprio usuário' : undefined}
                        onClick={() => setParaExcluir(u)}
                        sx={{ ...acaoTabelaSx, '&:hover': { color: TOV.danger, textDecorationStyle: 'solid' } }}
                      >
                        Excluir
                      </Box>
                    </Box>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>}

      <Box component="section" aria-labelledby="titulo-auditoria" sx={{ mt: 4 }}>
        <Typography id="titulo-auditoria" variant="h2" sx={{ fontSize: TOV.type.titleSm, mb: 0.5 }}>Registro de atividades</Typography>
        <Typography sx={{ color: TOV.caption, fontSize: TOV.type.bodySm, mb: 1.5 }}>
          Quem criou, excluiu ou alterou usuários, cadastros, aulas e lançamentos financeiros — os 30 registros mais recentes.
        </Typography>
        {erroAuditoria ? (
          <EstadoErro titulo="Não foi possível carregar o registro" descricao={erroAuditoria} onTentarNovamente={carregarAuditoria} />
        ) : auditoria.itens.length === 0 ? (
          <EstadoVazio compacto titulo="Nenhuma atividade registrada" descricao="As operações administrativas passam a aparecer aqui." />
        ) : (
          <TableContainer component={Box} sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label="Registro de atividades">
              <TableHead>
                <TableRow>
                  <TableCell>Quando</TableCell>
                  <TableCell>Quem</TableCell>
                  <TableCell>Ação</TableCell>
                  <TableCell>Registro</TableCell>
                  <TableCell>Detalhes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {auditoria.itens.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatarDataHora(item.criado_em)}</TableCell>
                    <TableCell>{item.usuario || '—'}</TableCell>
                    <TableCell>{ROTULO_ACAO[item.acao] || item.acao}</TableCell>
                    <TableCell>{ROTULO_ENTIDADE[item.entidade] || item.entidade}{item.entidade_id ? ` ${item.entidade_id}` : ''}</TableCell>
                    <TableCell sx={{ color: TOV.caption }}>{item.detalhes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <Dialog open={!!form} onClose={salvando ? undefined : fecharForm} maxWidth="xs" fullWidth fullScreen={telaCheia}>
        <TituloDialogo onFechar={salvando ? undefined : fecharForm}>{form?.novo ? 'Novo usuário' : `Gerenciar acesso — ${form?.user}`}</TituloDialogo>
        <DialogContent>
          {form && (
            <Grid container spacing={1.5} sx={{ mt: 0 }}>
              {form.novo && (
                <Grid item xs={12}>
                  <TextField
                    fullWidth required autoFocus label="Usuário"
                    value={form.user}
                    onChange={(e) => setForm({ ...form, user: e.target.value })}
                    helperText="O nome é gravado em maiúsculas."
                  />
                </Grid>
              )}
              <Grid item xs={12}>
                <TextField
                  select fullWidth label="Perfil de acesso"
                  value={form.perfil}
                  onChange={(e) => setForm({ ...form, perfil: e.target.value })}
                >
                  <MenuItem value="SECRETARIA">Secretaria</MenuItem>
                  <MenuItem value="MARKETING">Marketing</MenuItem>
                  <MenuItem value="FINANCEIRO">Financeiro (só a tesouraria)</MenuItem>
                  <MenuItem value="ADMIN">Administrador</MenuItem>
                  <MenuItem value="PROFESSOR" disabled={form.perfil !== 'PROFESSOR'}>Professor (criado por convite)</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth required type="password" label="Senha"
                  autoFocus={!form.novo}
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  error={senhaCurta}
                  helperText={senhaCurta ? `Mínimo de ${SENHA_MINIMA} caracteres.` : form.novo ? 'Obrigatória para novo usuário.' : 'Deixe em branco para manter a senha atual.'}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth required type="password" label="Confirmar senha"
                  value={form.confirmar}
                  onChange={(e) => setForm({ ...form, confirmar: e.target.value })}
                  error={naoConfere}
                  helperText={naoConfere ? 'As senhas não conferem.' : ' '}
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button variant="outlined" onClick={fecharForm} disabled={salvando}>Cancelar</Button>
          <Button variant="contained" onClick={salvar} disabled={!podeSalvar || salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>

      <DialogoConfirmacao
        aberto={confirmarFecharForm}
        titulo="Descartar alterações?"
        descricao="As alterações deste acesso serão perdidas."
        rotuloConfirmar="Descartar"
        processando={false}
        onConfirmar={() => { setConfirmarFecharForm(false); setForm(null) }}
        onFechar={() => setConfirmarFecharForm(false)}
      />

      <DialogoConfirmacao
        aberto={!!paraExcluir}
        titulo="Excluir usuário"
        descricao={`Excluir o usuário ${paraExcluir?.user}? Ele perderá o acesso ao sistema.`}
        processando={excluindo}
        onConfirmar={excluir}
        onFechar={() => setParaExcluir(null)}
      />

      <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg('')}>
        <Alert severity="error" onClose={() => setMsg('')}>{msg}</Alert>
      </Snackbar>
      <Snackbar open={!!ok} autoHideDuration={3000} onClose={() => setOk('')}>
        <Alert severity="success" onClose={() => setOk('')}>{ok}</Alert>
      </Snackbar>
    </Box>
  )
}
