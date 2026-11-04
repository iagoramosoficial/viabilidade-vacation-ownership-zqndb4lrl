// scripts/sync-core.mjs
// Sincroniza o core único (pocketbase/core/viabilidade_core.js) para o navegador:
// gera src/lib/pocketbase/viabilidade_core.mjs como módulo ES idêntico.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const origem = resolve(raiz, 'pocketbase/core/viabilidade_core.js')
const destino = resolve(raiz, 'src/lib/pocketbase/viabilidade_core.mjs')

let codigo = readFileSync(origem, 'utf8')
// 'use strict' duplo não é problema; exportamos os símbolos no fim do módulo.
codigo = codigo.replace(
  /\/\/ Exportação para os dois runtimes[\s\S]*$/,
  `export { vb_resolverValorMes, vb_formatarBRL, vb_formatarPorcentagem, vb_validarPremissas, vb_calcularSimulacao, VB_MOTOR_VERSAO }
`,
)
writeFileSync(destino, codigo, 'utf8')
console.log('sync-core: ' + destino + ' atualizado a partir de pocketbase/core/viabilidade_core.js')
