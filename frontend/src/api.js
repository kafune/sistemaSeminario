const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const GET_CACHE = new Map()
const GET_EM_ANDAMENTO = new Map()
let GERACAO_CACHE = 0

function limparCacheGet() {
  GERACAO_CACHE += 1
  GET_CACHE.clear()
  GET_EM_ANDAMENTO.clear()
}

export function getToken() {
  return localStorage.getItem('tov_token')
}

export function setSession(token, user, perfil = 'ADMIN') {
  limparCacheGet()
  localStorage.setItem('tov_token', token)
  localStorage.setItem('tov_user', user)
  localStorage.setItem('tov_perfil', perfil)
}

export function clearSession() {
  limparCacheGet()
  localStorage.removeItem('tov_token')
  localStorage.removeItem('tov_user')
  localStorage.removeItem('tov_perfil')
}

export function getUser() {
  return localStorage.getItem('tov_user')
}

export function getPerfil() {
  return localStorage.getItem('tov_perfil') || 'ADMIN'
}

async function request(method, path, body, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options.signal,
  })
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    clearSession()
    window.location.href = '/login'
    throw new Error('Sessão expirada')
  }
  if (!res.ok) {
    let msg = `Erro ${res.status}`
    try {
      const data = await res.json()
      if (typeof data.detail === 'string') msg = data.detail
      else if (data.detail) msg = JSON.stringify(data.detail)
    } catch { /* resposta sem corpo JSON */ }
    throw new Error(msg)
  }
  const resposta = await res.json()
  if (method !== 'GET') limparCacheGet()
  return resposta
}

async function getCached(path, { ttlMs = 5 * 60_000 } = {}) {
  const agora = Date.now()
  const geracao = GERACAO_CACHE
  const existente = GET_CACHE.get(path)
  if (existente && existente.expiraEm > agora) return existente.valor
  if (GET_EM_ANDAMENTO.has(path)) return GET_EM_ANDAMENTO.get(path)

  const requisicao = request('GET', path)
    .then((valor) => {
      if (geracao === GERACAO_CACHE) {
        GET_CACHE.set(path, { valor, expiraEm: Date.now() + ttlMs })
      }
      return valor
    })
    .finally(() => {
      if (GET_EM_ANDAMENTO.get(path) === requisicao) GET_EM_ANDAMENTO.delete(path)
    })
  GET_EM_ANDAMENTO.set(path, requisicao)
  return requisicao
}

export const api = {
  get: (path, options) => request('GET', path, undefined, options),
  getCached,
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
}

/** Envia um arquivo (FormData) e baixa a resposta (ZIP) no navegador. */
export async function enviarArquivoEBaixar(path, arquivo, nomeDownload) {
  const fd = new FormData()
  fd.append('arquivo', arquivo)
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: fd,
  })
  if (!res.ok) {
    let msg = `Erro ${res.status}`
    try { msg = (await res.json()).detail || msg } catch { /* ignora */ }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeDownload
  a.click()
  URL.revokeObjectURL(url)
}

/** Abre um PDF/ZIP autenticado em nova aba (baixa como blob para levar o token). */
export async function abrirArquivo(path) {
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) {
    let msg = `Erro ${res.status}`
    try { msg = (await res.json()).detail || msg } catch { /* ignora */ }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}

/** Baixa um arquivo autenticado preservando o nome sugerido pela API. */
export async function baixarArquivo(path, nomePadrao = 'arquivo') {
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) {
    let msg = `Erro ${res.status}`
    try { msg = (await res.json()).detail || msg } catch { /* ignora */ }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const disposicao = res.headers.get('Content-Disposition') || ''
  const nome = disposicao.match(/filename="?([^"]+)"?/i)?.[1] || nomePadrao
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

/** GET público: não exige sessão e nunca redireciona para o login. */
export async function getPublico(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) {
    let msg = `Erro ${res.status}`
    try { msg = (await res.json()).detail || msg } catch { /* ignora */ }
    throw new Error(msg)
  }
  return res.json()
}

/** POST público: usado por formulários acessados por convite. */
export async function postPublico(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = `Erro ${res.status}`
    try {
      const data = await res.json()
      if (typeof data.detail === 'string') msg = data.detail
      else if (data.detail) msg = JSON.stringify(data.detail)
    } catch { /* ignora */ }
    throw new Error(msg)
  }
  return res.json()
}

/** Envia um arquivo autenticado e devolve a resposta JSON. */
export async function enviarArquivoJson(path, arquivo) {
  const fd = new FormData()
  fd.append('arquivo', arquivo)
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: fd,
  })
  if (!res.ok) {
    let msg = `Erro ${res.status}`
    try { msg = (await res.json()).detail || msg } catch { /* ignora */ }
    throw new Error(msg)
  }
  return res.json()
}
