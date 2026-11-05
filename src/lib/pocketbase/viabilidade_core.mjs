// src/lib/pocketbase/viabilidade_core.mjs
// Ponte ES do motor para o navegador. FONTE ÚNICA DAS REGRAS:
// pocketbase/hooks/viabilidade_core.pb.js — o mesmo arquivo carregado pelo
// PocketBase via require em viabilidade.pb.js. Assim as regras do front NUNCA
// dessincronizam do backend: não há segunda cópia do código do motor.
//
// O core é ES5 sem imports/exports e se fecha com um fecho CommonJS guardado
// (if (typeof module !== 'undefined' && module.exports)), então ele é avaliado
// aqui com um shim de module, exatamente como o JSVM do PocketBase faz.
//
// (Re)geração via scripts/sync-core.mjs permanece disponível para cópia estática,
// mas o carregamento em runtime abaixo dispensa sincronização manual.

// @ts-nocheck
/* eslint-disable @typescript-eslint/no-implied-eval, no-new-func */

import coreCode from '../../../pocketbase/hooks/viabilidade_core.pb.js?raw'

function carregarCore() {
  const shim = { exports: {} }
  const factory = new Function('module', 'exports', 'globalThis', coreCode)
  factory(shim, shim.exports, globalThis)
  const exportsCore = shim.exports && shim.exports.vb_calcularSimulacao ? shim.exports : null
  const fonte = exportsCore || globalThis
  return fonte
}

const core = carregarCore()

export const VB_MOTOR_VERSAO = core.VB_MOTOR_VERSAO
export const vb_resolverValorMes = core.vb_resolverValorMes
export const vb_formatarBRL = core.vb_formatarBRL
export const vb_formatarPorcentagem = core.vb_formatarPorcentagem
export const vb_validarPremissas = core.vb_validarPremissas
export const vb_calcularSimulacao = core.vb_calcularSimulacao
export const vb_gerarHashPremissas = core.vb_gerarHashPremissas
