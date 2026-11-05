// scripts/sync-core.mjs
// Fonte única do motor: pocketbase/hooks/viabilidade_core.pb.js (arquivo carregado
// pelo PocketBase via require em viabilidade.pb.js). pocketbase/core/viabilidade_core.js
// é apenas um re-export legado e NÃO é fonte.
// Gera a cópia ES do frontend src/lib/pocketbase/viabilidade_core.mjs.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const srcCorePath = resolve(root, 'pocketbase/hooks/viabilidade_core.pb.js')
const destEsPath = resolve(root, 'src/lib/pocketbase/viabilidade_core.mjs')

const coreCode = readFileSync(srcCorePath, 'utf8')

// Extrai os nomes exportados do fecho CommonJS (module.exports = {...}).
const match = coreCode.match(/module\.exports\s*=\s*\{([\s\S]*?)\}/)
if (!match) {
  console.error('✖ module.exports não encontrado em ' + srcCorePath)
  process.exit(1)
}
const exportNames = match[1]
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => s.split(':')[0].trim())
  .filter(Boolean)

const bodySemExports = coreCode
  .replace(match[0], '')
  // Fecho CommonJS guardado no fim do core: no ES gerado ele é código morto,
  // mas o oxlint reclama de reatribuição de parâmetro dentro dele.
  .replace(
    /if \(typeof module !== ['"]undefined['"]/g,
    'if (false && typeof module !== "undefined"',
  )

const esCode =
  '// GERADO AUTOMATICAMENTE POR scripts/sync-core.mjs — NÃO EDITE DIRETAMENTE\n' +
  '// Fonte única: pocketbase/hooks/viabilidade_core.pb.js\n' +
  '/* eslint-disable */\n// @ts-nocheck\n\n' +
  bodySemExports +
  '\nexport {\n  ' +
  exportNames.join(',\n  ') +
  ',\n}\n'

writeFileSync(destEsPath, esCode, 'utf8')
console.log(
  '✔ Sincronizado src/lib/pocketbase/viabilidade_core.mjs a partir de pocketbase/hooks/viabilidade_core.pb.js',
)
