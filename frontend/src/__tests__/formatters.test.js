import { describe, expect, it } from 'vitest'
import {
  dataDaApi, formatarCompetencia, formatarCpfInput, formatarDataBr, formatarDataHora, formatarMoeda,
} from '../formatters'

describe('dataDaApi', () => {
  it('acrescenta o Z a carimbos UTC ingênuos do backend', () => {
    expect(dataDaApi('2026-09-14T17:30:00').toISOString()).toBe('2026-09-14T17:30:00.000Z')
  })
  it('respeita um offset já presente', () => {
    expect(dataDaApi('2026-09-14T17:30:00-03:00').toISOString()).toBe('2026-09-14T20:30:00.000Z')
    expect(dataDaApi('2026-09-14T17:30:00Z').toISOString()).toBe('2026-09-14T17:30:00.000Z')
  })
  it('devolve null para vazio ou inválido', () => {
    expect(dataDaApi(null)).toBeNull()
    expect(dataDaApi('')).toBeNull()
    expect(dataDaApi('não é data')).toBeNull()
    expect(formatarDataHora(null)).toBe('—')
  })
})

describe('formatarDataBr', () => {
  it('não passa por fuso horário', () => {
    expect(formatarDataBr('1990-05-12')).toBe('12/05/1990')
    expect(formatarDataBr('2026-03-01T00:00:00')).toBe('01/03/2026')
    expect(formatarDataBr(null)).toBe('—')
  })
})

describe('formatarCompetencia', () => {
  it('abrevia o mês', () => {
    expect(formatarCompetencia('2026-03')).toBe('mar/2026')
    expect(formatarCompetencia('')).toBe('—')
  })
})

describe('formatarMoeda e CPF', () => {
  it('formata em reais', () => {
    expect(formatarMoeda(1200.5).replace(/\u00a0/g, ' ')).toBe('R$ 1.200,50')
  })
  it('mascara o CPF conforme digita', () => {
    expect(formatarCpfInput('12345678901')).toBe('123.456.789-01')
  })
})
