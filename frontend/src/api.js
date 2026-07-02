const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function getToken() {
  return localStorage.getItem('stg_token')
}

export function setSession(token, user) {
  localStorage.setItem('stg_token', token)
  localStorage.setItem('stg_user', user)
}

export function clearSession() {
  localStorage.removeItem('stg_token')
  localStorage.removeItem('stg_user')
}

export function getUser() {
  return localStorage.getItem('stg_user')
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
  return res.json()
}

export const api = {
  get: (path) => request('GET', path),
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
