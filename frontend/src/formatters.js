/**
 * Fuso da instituição para exibir horários de chamada e datas de aula.
 * Acompanha `TOV_TIMEZONE` do backend via `VITE_TIMEZONE` no build; sem isso
 * as duas pontas podiam divergir.
 */
export const FUSO_INSTITUICAO = import.meta.env.VITE_TIMEZONE || 'America/Sao_Paulo'

export function somenteDigitos(valor, limite) {
  return String(valor || '').replace(/\D/g, '').slice(0, limite)
}

export function formatarTelefoneInput(valor) {
  const digitos = somenteDigitos(valor, 11)
  if (digitos.length <= 2) return digitos ? `(${digitos}` : ''
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`
  if (digitos.length <= 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
}

export function formatarCpfInput(valor) {
  const digitos = somenteDigitos(valor, 11)
  return digitos
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

export function formatarCepInput(valor) {
  const digitos = somenteDigitos(valor, 8)
  return digitos.replace(/^(\d{5})(\d)/, '$1-$2')
}

export function emailValido(valor) {
  if (!String(valor || '').trim()) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(valor).trim())
}

export function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Carimbo vindo da API (UTC ingênuo, sem "Z") vira Date correto.
 * O backend grava tudo em UTC sem offset; sem o "Z", o navegador leria o
 * texto como hora local e mostraria tudo três horas adiantado.
 */
export function dataDaApi(iso) {
  if (!iso) return null
  const texto = String(iso)
  const temOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(texto)
  const data = new Date(temOffset ? texto : `${texto}Z`)
  return Number.isNaN(data.getTime()) ? null : data
}

/** Carimbo da API em "dd/mm/aaaa, hh:mm" no fuso do navegador. */
export function formatarDataHora(iso, opcoes = { dateStyle: 'short', timeStyle: 'short' }) {
  const data = dataDaApi(iso)
  return data ? data.toLocaleString('pt-BR', opcoes) : '—'
}

/** Só a data (dd/mm/aaaa) de um carimbo da API, no fuso do navegador. */
export function formatarDataDoCarimbo(iso) {
  const data = dataDaApi(iso)
  return data ? data.toLocaleDateString('pt-BR') : '—'
}

/** Data ISO (AAAA-MM-DD) em pt-BR sem passar por fuso horário. */
export function formatarDataBr(iso) {
  const [ano, mes, dia] = String(iso || '').slice(0, 10).split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : '—'
}

/** Competência AAAA-MM no formato "mar/2026". */
export function formatarCompetencia(competencia) {
  const [ano, mes] = String(competencia || '').split('-')
  if (!ano || !mes) return '—'
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${meses[Number(mes) - 1] || mes}/${ano}`
}
