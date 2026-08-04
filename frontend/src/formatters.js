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
