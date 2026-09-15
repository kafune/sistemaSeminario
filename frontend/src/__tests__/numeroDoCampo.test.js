import { describe, expect, it } from 'vitest'
import { numeroDoCampo, textoDoValor, textoPercentual } from '../pages/FinanceiroComum'

// O achado B2 da auditoria: "200.50" virava 20050 e a mensalidade da turma
// inteira era gravada cem vezes maior.
describe('numeroDoCampo', () => {
  it.each([
    ['1.200,50', 1200.5],
    ['200,00', 200],
    ['200.50', 200.5],
    ['1200.5', 1200.5],
    ['50.00', 50],
    ['1.5', 1.5],
    ['1.200', 1200],
    ['1.200.000', 1200000],
    [' 12 ', 12],
    ['0,99', 0.99],
  ])('%s -> %s', (entrada, esperado) => {
    expect(numeroDoCampo(entrada)).toBe(esperado)
  })
  it('devolve null para vazio ou texto', () => {
    expect(numeroDoCampo('')).toBeNull()
    expect(numeroDoCampo(null)).toBeNull()
    expect(numeroDoCampo('abc')).toBeNull()
  })
  it('faz a volta com textoDoValor', () => {
    expect(numeroDoCampo(textoDoValor(1234.5))).toBe(1234.5)
    expect(textoPercentual(12.5)).toBe('12,5')
    expect(textoPercentual(10)).toBe('10')
  })
})
