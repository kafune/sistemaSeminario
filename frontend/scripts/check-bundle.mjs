import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const assetsDir = new URL('../dist/assets/', import.meta.url)
const arquivos = await readdir(assetsDir)
const tamanhos = await Promise.all(
  arquivos.map(async (nome) => ({
    nome,
    tamanho: (await stat(new URL(nome, assetsDir))).size,
  })),
)

const entradas = tamanhos.filter(({ nome }) => /^index-.*\.js$/.test(nome))
const fontes = tamanhos.filter(({ nome }) => nome.endsWith('.woff2'))
const javascript = tamanhos.filter(({ nome }) => nome.endsWith('.js'))
const maiorChunk = javascript.reduce(
  (maior, atual) => atual.tamanho > maior.tamanho ? atual : maior,
  { nome: 'nenhum', tamanho: 0 },
)

const erros = []
if (entradas.length !== 1) {
  erros.push(`esperado um bundle de entrada; encontrados ${entradas.length}`)
} else if (entradas[0].tamanho > 350_000) {
  erros.push(`bundle inicial tem ${entradas[0].tamanho} bytes; limite 350000`)
}
if (fontes.length > 7) {
  erros.push(`foram geradas ${fontes.length} fontes; limite 7`)
}
if (maiorChunk.tamanho > 350_000) {
  erros.push(`maior chunk (${maiorChunk.nome}) tem ${maiorChunk.tamanho} bytes`)
}

if (erros.length) {
  console.error(erros.map((erro) => `- ${erro}`).join('\n'))
  process.exit(1)
}

console.log(
  `Bundle aprovado: entrada ${entradas[0].tamanho} bytes, `
  + `${javascript.length} chunks JS e ${fontes.length} fontes WOFF2.`,
)
