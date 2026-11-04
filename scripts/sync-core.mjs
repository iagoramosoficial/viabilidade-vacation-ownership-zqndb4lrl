// scripts/sync-core.mjs
// Sincroniza pocketbase/core/viabilidade_core.js para src/lib/pocketbase/viabilidade_core.mjs (módulo ES)
// e para pocketbase/hooks/viabilidade_core.js (para o require do PocketBase hooks).

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const srcCorePath = resolve(root, 'pocketbase/core/viabilidade_core.js')
const destEsPath = resolve(root, 'src/lib/pocketbase/viabilidade_core.mjs')
const destHookPath = resolve(root, 'pocketbase/hooks/viabilidade_core.js')

const coreCode = readFileSync(srcCorePath, 'utf8')

// 1. Gera módulo ES para o frontend
const banner = `// GERADO AUTOMATICAMENTE POR scripts/sync-core.mjs — NÃO EDITE DIRETAMENTE
// Fonte única: pocketbase/core/viabilidade_core.js
/* eslint-disable */
// @ts-nocheck

`

const esModuleFooter = `
export {
  vb_resolverValorMes,
  vb_formatarBRL,
  vb_formatarPorcentagem,
  vb_validarPremissas,
  vb_calcularSimulacao,
  vb_gerarHashPremissas,
  VB_MOTOR_VERSAO,
}
`

writeFileSync(destEsPath, banner + coreCode + esModuleFooter, 'utf8')
console.log('✔ Sincronizado para src/lib/pocketbase/viabilidade_core.mjs')

// 2. Atualiza cópia do hook
writeFileSync(destHookPath, coreCode, 'utf8')
console.log('✔ Sincronizado para pocketbase/hooks/viabilidade_core.js')
