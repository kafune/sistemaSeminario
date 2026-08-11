import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const srcDir = new URL('../src/', import.meta.url)
const extensoes = new Set(['.js', '.jsx', '.ts', '.tsx'])
const propriedadesEspacamento = '(?:m|mt|mr|mb|ml|mx|my|p|pt|pr|pb|pl|px|py|gap|rowGap|columnGap)'
const erros = []

async function listar(diretorio) {
  const entradas = await readdir(diretorio, { withFileTypes: true })
  const arquivos = await Promise.all(entradas.map((entrada) => {
    const caminho = join(diretorio, entrada.name)
    return entrada.isDirectory() ? listar(caminho) : [caminho]
  }))
  return arquivos.flat()
}

function registrar(arquivo, linha, regra, trecho) {
  erros.push(`${relative(new URL('..', srcDir).pathname, arquivo)}:${linha} [${regra}] ${trecho.trim()}`)
}

function noGridMui(valor) {
  return Math.abs((valor * 8) % 4) < 0.0001
}

function noGridPx(valor) {
  return valor % 4 === 0
}

for (const arquivo of await listar(srcDir.pathname)) {
  if (!extensoes.has(extname(arquivo)) || arquivo.endsWith('/theme.js')) continue
  const linhas = (await readFile(arquivo, 'utf8')).split('\n')

  linhas.forEach((texto, indice) => {
    const linha = indice + 1

    if (/#[\da-f]{3,8}\b|rgba?\(/i.test(texto)) registrar(arquivo, linha, 'cor fora dos tokens', texto)
    if (/\bfontSize\s*:\s*(?:\{\s*)?(?:[a-z]+\s*:\s*)?-?(?:\d|\.\d)|\bfontSize\s*=\s*\{?\s*\d/.test(texto)) {
      registrar(arquivo, linha, 'tipografia fora da escala', texto)
    }
    if (!texto.includes('TOV.') && /\bborderRadius\s*:\s*(?:['"`]\s*-?(?:\d|\.\d)|-?(?:\d|\.\d))/.test(texto)) {
      registrar(arquivo, linha, 'raio fora dos tokens', texto)
    }
    if (!texto.includes('TOV.') && /\btransition(?:Duration)?\s*:\s*['"`]/.test(texto)) {
      registrar(arquivo, linha, 'movimento fora dos tokens', texto)
    }

    const sombra = texto.match(/\bboxShadow\s*:\s*['"`]([^'"`]*)/)
    if (sombra && sombra[1] !== 'none') registrar(arquivo, linha, 'sombra fora dos tokens', texto)

    const peso = texto.match(/\bfontWeight\s*:[^}\n]*/)?.[0]
    if (peso && [...peso.matchAll(/\b(\d{3})\b/g)].some(([, valor]) => Number(valor) > 700)) {
      registrar(arquivo, linha, 'peso tipográfico acima de 700', texto)
    }

    const diretos = new RegExp(`\\b${propriedadesEspacamento}\\s*:\\s*(-?(?:\\d+(?:\\.\\d+)?|\\.\\d+))\\b`, 'g')
    for (const match of texto.matchAll(diretos)) {
      if (!noGridMui(Number(match[1]))) registrar(arquivo, linha, 'espaçamento fora do grid de 4px', texto)
    }

    const objetos = new RegExp(`\\b${propriedadesEspacamento}\\s*:\\s*\\{([^}]*)\\}`, 'g')
    for (const match of texto.matchAll(objetos)) {
      for (const responsivo of match[1].matchAll(/\b(?:xs|sm|md|lg|xl)\s*:\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\b/g)) {
        if (!noGridMui(Number(responsivo[1]))) registrar(arquivo, linha, 'espaçamento responsivo fora do grid de 4px', texto)
      }
      for (const pixel of match[1].matchAll(/(\d+)px/g)) {
        if (!noGridPx(Number(pixel[1]))) registrar(arquivo, linha, 'espaçamento em px fora do grid de 4px', texto)
      }
    }

    const strings = new RegExp(`\\b${propriedadesEspacamento}\\s*:\\s*['"\\x60]([^'"\\x60]*)['"\\x60]`, 'g')
    for (const match of texto.matchAll(strings)) {
      for (const pixel of match[1].matchAll(/(\d+)px/g)) {
        if (!noGridPx(Number(pixel[1]))) registrar(arquivo, linha, 'espaçamento em px fora do grid de 4px', texto)
      }
    }
  })
}

if (erros.length) {
  console.error(`Sistema visual reprovado (${erros.length} ocorrência${erros.length === 1 ? '' : 's'}):`)
  console.error(erros.map((erro) => `- ${erro}`).join('\n'))
  process.exit(1)
}

console.log('Sistema visual aprovado: cores, tipografia, raios, sombras, movimento e espaçamento usam os tokens canônicos.')
