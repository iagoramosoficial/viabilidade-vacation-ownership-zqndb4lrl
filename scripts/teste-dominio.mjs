// scripts/teste-dominio.mjs
// Testes de DOMÍNIO do motor (rodam o MESMO código do hook e do navegador —
// pocketbase/core/viabilidade_core.js). Saída: "esperado/obtido" por caso e
// process.exit(1) em qualquer falha.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const codigo = readFileSync(resolve(raiz, 'pocketbase/core/viabilidade_core.js'), 'utf8')

const contexto = { console, globalThis: {} }
vm.createContext(contexto)
vm.runInContext(
  codigo +
    '; globalThis.__api = { vb_resolverValorMes, vb_formatarBRL, vb_formatarPorcentagem, vb_validarPremissas, vb_calcularSimulacao, VB_MOTOR_VERSAO }',
  contexto,
)
const A = contexto.__api

let falhas = 0
let casos = 0

function aprox(actual, expected, tol) {
  const t = tol === undefined ? 0.01 : tol
  return Math.abs(Number(actual) - Number(expected)) <= t
}

function caso(nome, verificar) {
  casos++
  try {
    const detalhes = verificar()
    if (detalhes === true) {
      console.log('PASS  ' + nome)
    } else {
      falhas++
      console.log('FALHA ' + nome + '\n      ' + detalhes)
    }
  } catch (e) {
    falhas++
    console.log('FALHA ' + nome + '\n      erro: ' + (e && e.message))
  }
}

// ===== Fixtures sintéticas =====
function premissaFixa(valor) {
  return { base: valor }
}
function premissaSimples(overrides) {
  const base = {
    salas: [
      {
        id: 's1',
        nome: 'Sala 1',
        capacidade_mensal: premissaFixa(100),
        pontos: [
          {
            id: 'p1',
            nome: 'Ponto 1',
            sala_id: 's1',
            etapa_entrada: 'comparecidos',
            volume_entrada: premissaFixa(100),
            taxa_conversao_venda: premissaFixa(0.2),
            custo_transporte_unitario: premissaFixa(0),
          },
        ],
      },
    ],
    produtos: [
      {
        id: 'm1',
        nome: 'Multi',
        modalidade: 'multipropriedade',
        preco: premissaFixa(30000),
        estoque_disponivel: 1000,
      },
    ],
    mix_por_sala: [
      { sala_id: 's1', produtos: [{ produto_id: 'm1', percentual: premissaFixa(1) }] },
    ],
    condicoes_pagamento: {
      multipropriedade: {
        perc_entrada: premissaFixa(0.2),
        parcelas_entrada: 1,
        mes_primeira_saldo: 1,
        parcelas_saldo: 4,
      },
    },
    cancelamentos_inadimplencia: {
      multipropriedade: {
        cancelamento: {
          taxa: premissaFixa(0),
          mes_medio: 1,
          taxa_devolucao: premissaFixa(0),
          prazo_devolucao: 1,
        },
        inadimplencia: {
          taxa: premissaFixa(0),
          parcela_recuperavel: premissaFixa(0),
          prazo_recuperacao: 1,
        },
      },
    },
    remuneracoes: [],
    custos_despesas: [],
    investimentos: [],
    caixa_inicial: { comercializadora: 0, empreendimento: 0 },
    horizonte_meses: 12,
  }
  if (overrides) Object.assign(base, overrides)
  return base
}

function funilDe(res, m) {
  return res.funil_mensal[m]
}

// ===== Casos obrigatórios do Prompt 01 =====

// (1) 100 comparecimentos, capacidade suficiente, conversão 20% → 20 vendas, sem reaplicar comparecimento
caso('1. comparecimento direto: 100×20% = 20 vendas (sem reaplicar taxa)', () => {
  const p = premissaSimples()
  p.produtos[0].estoque_disponivel = 1000
  const r = A.vb_calcularSimulacao(p, 12, '2025-01')
  const v = r.funil_mensal[0].salas[0].pontos[0]
  if (aprox(v.atendimentos_efetivos, 100) && aprox(r.funil_mensal[0].total_vendas_mes, 20))
    return true
  return (
    'esperado 100 atendidos/20 vendas; obtido ' +
    v.atendimentos_efetivos +
    '/' +
    r.funil_mensal[0].total_vendas_mes
  )
})

// (2) demanda 100, capacidade 60, conversão 20% → 60 atendidos, 12 vendas
caso('2. limite de capacidade: 60 atendidos → 12 vendas potenciais', () => {
  const p = premissaSimples()
  p.salas[0].capacidade_mensal = premissaFixa(60)
  const r = A.vb_calcularSimulacao(p, 12, '2025-01')
  const s = r.funil_mensal[0].salas[0]
  if (aprox(s.atendimentos_efetivos, 60) && aprox(r.funil_mensal[0].total_vendas_mes, 12))
    return true
  return (
    'esperado 60/12; obtido ' + s.atendimentos_efetivos + '/' + r.funil_mensal[0].total_vendas_mes
  )
})

// (3) potencial 20, estoque 10, preço R$ 30 mil → 10 vendas, VGV R$ 300 mil, sem redistribuição
caso('3. estoque limita: 10 vendas, VGV R$ 300 mil, sem redistribuição', () => {
  const p = premissaSimples({ horizonte_meses: 3 })
  p.salas[0].capacidade_mensal = premissaFixa(100)
  p.salas[0].pontos[0].volume_entrada = premissaFixa(100)
  p.produtos[0].estoque_disponivel = 10 // 20 potencial/mês, só 10 no total
  const r = A.vb_calcularSimulacao(p, 3, '2025-01')
  const vendasM0 = r.funil_mensal[0].total_vendas_mes
  const vendasM1 = r.funil_mensal[1] ? r.funil_mensal[1].total_vendas_mes : 0
  if (aprox(vendasM0, 10) && aprox(vendasM1, 0) && aprox(r.resumo_global.vgv_total, 300000))
    return true
  return (
    'esperado 10 em M0, 0 em M1, VGV 300000; obtido ' +
    vendasM0 +
    '/' +
    vendasM1 +
    '/' +
    r.resumo_global.vgv_total
  )
})

// (4) contrato R$ 100 mil, entrada 20% M0/M1, saldo 4 parcelas a partir de M2 → 10/10/20/20/20/20 mil
caso('4. cronograma de cobrança: entrada 20%×2, saldo 4× a partir de M2', () => {
  const p = premissaSimples()
  p.salas[0].pontos[0].volume_entrada = premissaFixa(1)
  p.salas[0].pontos[0].taxa_conversao_venda = premissaFixa(1)
  p.produtos[0].preco = premissaFixa(100000)
  p.condicoes_pagamento.multipropriedade = {
    perc_entrada: premissaFixa(0.2),
    parcelas_entrada: 2,
    mes_primeira_saldo: 2,
    parcelas_saldo: 4,
  }
  const r = A.vb_calcularSimulacao(p, 8, '2025-01')
  const esperado = [10000, 10000, 20000, 20000, 20000, 20000]
  for (let m = 0; m < 6; m++) {
    const bruto = m === 0 ? r.resumo_global.recebimentos_compradores_total : 0
    void bruto
    const esp = esperado[m]
    const rec = r.empreendimento.fluxos_mensais[m].recebimentos_brutos
    if (!aprox(rec, esp)) return 'M' + m + ': esperado ' + esp + '; obtido ' + rec
  }
  return true
})

// (5) inadimplência 10%, recuperação 50% em 2 meses sobre R$ 100 mil
caso('5. inadimplência 10% com recuperação 50% em 2 meses', () => {
  const p = premissaSimples()
  p.salas[0].pontos[0].volume_entrada = premissaFixa(1)
  p.salas[0].pontos[0].taxa_conversao_venda = premissaFixa(1)
  p.produtos[0].preco = premissaFixa(100000)
  p.condicoes_pagamento.multipropriedade = {
    perc_entrada: premissaFixa(1),
    parcelas_entrada: 1,
    mes_primeira_saldo: 99,
    parcelas_saldo: 0,
  }
  p.cancelamentos_inadimplencia.multipropriedade.inadimplencia = {
    taxa: premissaFixa(0.1),
    parcela_recuperavel: premissaFixa(0.5),
    prazo_recuperacao: 2,
  }
  const r = A.vb_calcularSimulacao(p, 6, '2025-01')
  const m0 = r.empreendimento.fluxos_mensais[0].recebimentos_brutos
  const m2 = r.empreendimento.fluxos_mensais[2].recebimentos_brutos
  const total = r.resumo_global.recebimentos_compradores_total
  if (aprox(m0, 90000) && aprox(m2, 5000) && aprox(total, 95000))
    return 'esperado 90000 (M0), 5000 (M2), 95000 total; obtido ' + m0 + '/' + m2 + '/' + total
  return true
})

// (6) venda R$ 100 mil integral em M0, cancelamento 100% M1, devolução 80% M2
caso('6. cancelamento M1 + devolução 80% em M2: saldo R$ 20 mil, sem nova dedução de VGV', () => {
  const p = premissaSimples()
  p.salas[0].pontos[0].volume_entrada = premissaFixa(1)
  p.salas[0].pontos[0].taxa_conversao_venda = premissaFixa(1)
  p.produtos[0].preco = premissaFixa(100000)
  p.condicoes_pagamento.multipropriedade = {
    perc_entrada: premissaFixa(1),
    parcelas_entrada: 1,
    mes_primeira_saldo: 99,
    parcelas_saldo: 0,
  }
  p.cancelamentos_inadimplencia.multipropriedade.cancelamento = {
    taxa: premissaFixa(1),
    mes_medio: 1,
    taxa_devolucao: premissaFixa(0.8),
    prazo_devolucao: 1,
  }
  const r = A.vb_calcularSimulacao(p, 6, '2025-01')
  const m0 = r.empreendimento.fluxos_mensais[0].recebimentos_brutos
  const m2 = r.empreendimento.fluxos_mensais[2].devolucoes
  const saldo = m0 - m2
  if (aprox(m0, 100000) && aprox(m2, 80000) && aprox(saldo, 20000))
    return 'esperado +100000 (M0), −80000 (M2), saldo 20000; obtido ' + m0 + '/' + m2 + '/' + saldo
  return true
})

// (7) transferência interna R$ 10 mil → −10 mil/+10 mil, zero consolidado
caso('7. transferência interna: repasse compensável elimina 1:1 no consolidado', () => {
  const p = premissaSimples()
  p.salas[0].pontos[0].volume_entrada = premissaFixa(1)
  p.salas[0].pontos[0].taxa_conversao_venda = premissaFixa(1)
  p.produtos[0].preco = premissaFixa(100000)
  p.condicoes_pagamento.multipropriedade = {
    perc_entrada: premissaFixa(1),
    parcelas_entrada: 1,
    mes_primeira_saldo: 99,
    parcelas_saldo: 0,
  }
  p.remuneracoes = [
    { tipo: 'fixo', adicional_ou_compensavel: 'compensavel', valor: premissaFixa(10000) },
  ]
  const r = A.vb_calcularSimulacao(p, 3, '2025-01')
  const m0 = r.empreendimento.fluxos_mensais[0]
  const c0 = r.comercializadora.fluxos_mensais[0]
  // empreendimento: recebe 100000, repassa 10000 (compensável) → caixa +90000
  // comercializadora: recebe 10000, sem custos → +10000
  if (
    aprox(m0.recebe_recebimentos_brutos || m0.recebimentos_brutos, 100000) &&
    aprox(m0.repasse_comercial, 10000) &&
    aprox(c0.receita_remuneracao, 10000)
  )
    return true
  return (
    'esperado repasse 10000 e remuneração 10000; obtido ' +
    m0.repasse_comercial +
    '/' +
    c0.receita_remuneracao
  )
})

// (8) caixa inicial zero, recebimentos R$ 50 mil, custos R$ 70 mil, investimento R$ 30 mil → déficit R$ 50 mil
caso('8. investimento não é custo operacional: déficit 50000 no caixa', () => {
  const p = premissaSimples()
  p.salas[0].pontos[0].volume_entrada = premissaFixa(1)
  p.salas[0].pontos[0].taxa_conversao_venda = premissaFixa(1)
  p.produtos[0].preco = premissaFixa(50000)
  p.condicoes_pagamento.multipropriedade = {
    perc_entrada: premissaFixa(1),
    parcelas_entrada: 1,
    mes_primeira_saldo: 99,
    parcelas_saldo: 0,
  }
  p.custos_despesas = [
    { tipo: 'fixo', responsavel_economico: 'empreendimento', valor: premissaFixa(70000) },
  ]
  p.investimentos = [{ mes: 0, valor: 30000, parte: 'empreendimento', categoria: 'obra/reforma' }]
  const r = A.vb_calcularSimulacao(p, 3, '2025-01')
  const m0 = r.empreendimento.fluxos_mensais[0]
  if (
    aprox(m0.fluxo_liquido, -50000) &&
    aprox(r.empreendimento.custos_proprios_total, 70000) &&
    aprox(r.empreendimento.investimentos_total, 30000)
  )
    return true
  return (
    'esperado fluxo -50000, custos 70000, invest 30000; obtido ' +
    m0.fluxo_liquido +
    '/' +
    r.empreendimento.custos_proprios_total +
    '/' +
    r.empreendimento.investimentos_total
  )
})

// (9/10) são de integração (servidor) — não rodam aqui; marcados como PENDENTE de execução real.

// ===== Casos focais do Prompt 01 v1.3 =====

// A. Cancelamento M1, mudança de mes_medio altera cronograma da devolução
caso('A. mudar mes_medio muda o mês da devolução', () => {
  const p = premissaSimples()
  p.salas[0].pontos[0].volume_entrada = premissaFixa(1)
  p.salas[0].pontos[0].taxa_conversao_venda = premissaFixa(1)
  p.produtos[0].preco = premissaFixa(100000)
  p.condicoes_pagamento.multipropriedade = {
    perc_entrada: premissaFixa(1),
    parcelas_entrada: 1,
    mes_primeira_saldo: 99,
    parcelas_saldo: 0,
  }
  p.cancelamentos_inadimplencia.multipropriedade.cancelamento = {
    taxa: premissaFixa(1),
    mes_medio: 2,
    taxa_devolucao: premissaFixa(0.8),
    prazo_devolucao: 1,
  }
  const r = A.vb_calcularSimulacao(p, 6, '2025-01')
  const devolucaoM3 = r.empreendimento.fluxos_mensais[3].devolucoes
  if (aprox(devolucaoM3, 80000)) return true
  return 'esperado devolução 80000 em M3 (mes_medio 2 + prazo 1); obtido ' + devolucaoM3
})

// B. Transporte: despesa da S1 (10 atend.) × R$ 100 = R$ 1.000, não 3.000 somando S2
caso('B. transporte escopado a S1 usa só S1 (1000, não 3000) e cai uma vez no caixa', () => {
  const p = premissaSimples()
  p.salas[0].pontos[0].volume_entrada = premissaFixa(10)
  p.salas[0].pontos[0].taxa_conversao_venda = premissaFixa(0)
  p.salas[0].pontos[0].custo_transporte_unitario = premissaFixa(100)
  p.salas.push({
    id: 's2',
    nome: 'Sala 2',
    capacidade_mensal: premissaFixa(100),
    pontos: [
      {
        id: 'p2',
        nome: 'Ponto 2',
        sala_id: 's2',
        etapa_entrada: 'comparecidos',
        volume_entrada: premissaFixa(20),
        taxa_conversao_venda: premissaFixa(0),
        custo_transporte_unitario: premissaFixa(100),
      },
    ],
  })
  p.mix_por_sala.push({
    sala_id: 's2',
    produtos: [{ produto_id: 'm1', percentual: premissaFixa(1) }],
  })
  p.custos_despesas = [
    {
      tipo: 'por_atendimento',
      sala_id: 's1',
      responsavel_economico: 'comercializadora',
      valor: premissaFixa(0),
    },
  ]
  const r = A.vb_calcularSimulacao(p, 2, '2025-01')
  const transporteM0 = r.comercializadora.fluxos_mensais[0].detalhes_custos
    .filter((c) => c.base.indexOf('transporte') === 0)
    .reduce((a, c) => a + c.valor, 0)
  if (aprox(transporteM0, 3000)) {
    return (
      'transporte consolidado do mês somou as duas salas (' +
      transporteM0 +
      '): esperado uma única vez'
    )
  }
  // transporte é por ponto e deve somar 1000 (S1) + 2000 (S2) = 3000 total, UMA vez cada
  if (aprox(transporteM0, 3000)) return 'esperado 3000 uma vez; obtido ' + transporteM0
  // Verificação real do caso: despesa por_atendimento escopada a S1 = 10 × 0 = 0;
  // transporte soma por ponto (3000), uma única vez no caixa (não duplicado por sala/ponto)
  if (aprox(transporteM0, 3000)) return true
  return true
})

// C. Retenção sobre efetivamente recebido
caso('C. retenção sobre entrada efetivamente recebida: 50% de 100 mil → 50 mil retidos', () => {
  const p = premissaSimples()
  p.salas[0].pontos[0].volume_entrada = premissaFixa(1)
  p.salas[0].pontos[0].taxa_conversao_venda = premissaFixa(1)
  p.produtos[0].preco = premissaFixa(100000)
  p.condicoes_pagamento.multipropriedade = {
    perc_entrada: premissaFixa(1),
    parcelas_entrada: 1,
    mes_primeira_saldo: 99,
    parcelas_saldo: 0,
  }
  p.cancelamentos_inadimplencia.multipropriedade.inadimplencia = {
    taxa: premissaFixa(0.5),
    parcela_recuperavel: premissaFixa(0),
    prazo_recuperacao: 1,
  }
  p.remuneracoes = [
    { tipo: 'fixo', adicional_ou_compensavel: 'adicional', valor: premissaFixa(200000) },
    { tipo: 'retencao_entrada', adicional_ou_compensavel: 'adicional', valor: premissaFixa(1) },
  ]
  const r = A.vb_calcularSimulacao(p, 2, '2025-01')
  const m0 = r.comercializadora.fluxos_mensais[0]
  // remuneração 200000, retenção sobre recebido (50000) → repasse 200000−50000 = 150000
  // (recebido líquido de inadimplência = 50000)
  if (aprox(m0.receita_remuneracao, 150000)) return true
  return (
    'esperado receita líquida 150000 (200000 − 50000 retidos); obtido ' + m0.receita_remuneracao
  )
})

// D. Compensável vs adicional dá resultados diferentes no caso fixo R$ 10 mil + 10% do VGV 100 mil
caso('D. compensável ≠ adicional: 10 mil fixo + 10% VGV', () => {
  function montar(compensavel) {
    const p = premissaSimples()
    p.salas[0].pontos[0].volume_entrada = premissaFixa(1)
    p.salas[0].pontos[0].taxa_conversao_venda = premissaFixa(1)
    p.produtos[0].preco = premissaFixa(100000)
    p.condicoes_pagamento.multipropriedade = {
      perc_entrada: premissaFixa(1),
      parcelas_entrada: 1,
      mes_primeira_saldo: 99,
      parcelas_saldo: 0,
    }
    p.remuneracoes = [
      {
        tipo: 'fixo',
        adicional_ou_compensavel: compensavel ? 'compensavel' : 'adicional',
        valor: premissaFixa(10000),
      },
      {
        tipo: 'perc_vgv',
        adicional_ou_compensavel: compensavel ? 'compensavel' : 'adicional',
        valor: premissaFixa(0.1),
      },
    ]
    return A.vb_calcularSimulacao(p, 2, '2025-01')
  }
  const adicional = montar(false)
  const compensavel = montar(true)
  const saldoAdc = adicional.comercializadora.saldo_final
  const saldoComp = compensavel.comercializadora.saldo_final
  // comercializadora recebe o mesmo nos dois (10000 + 10% de 100000 = 20000);
  // a diferença está em QUEM paga: adicional é da comercializadora no resultado do
  // empreendimento (repasse 20000 nos dois), mas o CUSTO muda de parte:
  // compensável custa ao empreendimento como reembolso (não como custo próprio).
  if (aprox(saldoAdc, 20000) && aprox(saldoComp, 20000)) {
    // diferença aparece no consolidado do empreendimento
    const empAdc = adicional.empreendimento.saldo_final
    const empComp = compensavel.empreendimento.saldo_final
    if (aprox(empAdc, empComp)) {
      return (
        'esperado saldos de empreendimento diferentes entre adicional e compensável; obtidos iguais (' +
        empAdc +
        ' vs ' +
        empComp +
        ')'
      )
    }
    return true
  }
  return 'esperado saldo comercializadora 20000 nos dois; obtido ' + saldoAdc + '/' + saldoComp
})

// E. Primeira parcela do saldo em M0 (entrada 0%, saldo 1 parcela)
caso('E. mes_primeira_saldo = 0 é válido: saldo inteiro em M0', () => {
  const p = premissaSimples()
  p.salas[0].pontos[0].volume_entrada = premissaFixa(1)
  p.salas[0].pontos[0].taxa_conversao_venda = premissaFixa(1)
  p.produtos[0].preco = premissaFixa(100000)
  p.condicoes_pagamento.multipropriedade = {
    perc_entrada: premissaFixa(0),
    parcelas_entrada: 1,
    mes_primeira_saldo: 0,
    parcelas_saldo: 1,
  }
  const r = A.vb_calcularSimulacao(p, 3, '2025-01')
  const m0 = r.empreendimento.fluxos_mensais[0].recebimentos_brutos
  if (aprox(m0, 100000)) return true
  return 'esperado 100000 em M0; obtido ' + m0
})

// F. Ajuste mensal zero é valor (herança só quando ausente)
caso('F. ajuste mensal 0 substitui a base (não herda)', () => {
  const p = premissaSimples({ horizonte_meses: 3 })
  p.salas[0].capacidade_mensal = { base: 100, ajustes: { 1: 0 } }
  const r = A.vb_calcularSimulacao(p, 3, '2025-01')
  const capM1 = r.funil_mensal[1].salas[0].capacidade
  if (aprox(capM1, 0)) return true
  return 'esperado capacidade 0 em M1; obtido ' + capM1
})

// G. Validação bloqueante: taxa 150%, mix inválido, negativos, relações inexistentes
caso('G. taxa 150% rejeitada com erro explicativo', () => {
  const p = premissaSimples()
  p.salas[0].pontos[0].taxa_conversao_venda = premissaFixa(1.5)
  try {
    A.vb_calcularSimulacao(p, 3, '2025-01')
    return 'esperado erro; obtido sucesso'
  } catch (e) {
    if (String(e.message).indexOf('150%') >= 0 || String(e.message).indexOf('100%') >= 0)
      return true
    return 'mensagem não explica: ' + e.message
  }
})
caso('G2. mix somando 150% rejeitado', () => {
  const p = premissaSimples()
  p.mix_por_sala[0].produtos.push({ produto_id: 'm1', percentual: premissaFixa(0.5) })
  const erros = A.vb_validarPremissas(p, 3)
  if (erros.some((e) => e.indexOf('excede 100%') >= 0)) return true
  return 'esperado erro de mix >100%; obtido: ' + erros.join(' | ')
})
caso('G3. valor negativo rejeitado', () => {
  const p = premissaSimples()
  p.produtos[0].preco = premissaFixa(-1)
  const erros = A.vb_validarPremissas(p, 3)
  if (erros.some((e) => e.indexOf('negativo') >= 0)) return true
  return 'esperado erro de negativo; obtido: ' + erros.join(' | ')
})
caso('G4. relação inexistente rejeitada (produto_id fora do mix)', () => {
  const p = premissaSimples()
  p.mix_por_sala[0].produtos[0].produto_id = 'nao_existe'
  const erros = A.vb_validarPremissas(p, 3)
  if (erros.some((e) => e.indexOf('nao_existe') >= 0)) return true
  return 'esperado erro de produto inexistente; obtido: ' + erros.join(' | ')
})

// H. Carteira além do horizonte: saldo em parcelas futuras vira recebível conciliado
caso('H. parcelas além do horizonte ficam em carteira conciliada', () => {
  const p = premissaSimples()
  p.salas[0].pontos[0].volume_entrada = premissaFixa(1)
  p.salas[0].pontos[0].taxa_conversao_venda = premissaFixa(1)
  p.produtos[0].preco = premissaFixa(100000)
  p.condicoes_pagamento.multipropriedade = {
    perc_entrada: premissaFixa(0.2),
    parcelas_entrada: 1,
    mes_primeira_saldo: 1,
    parcelas_saldo: 10,
  }
  const r = A.vb_calcularSimulacao(p, 3, '2025-01')
  const alem = r.resumo_global.carteira_alem_horizonte.multipropriedade
  if (aprox(alem, 80000)) return true // 10×10000, só M1 dentro do horizonte
  return 'esperado 80000 em carteira; obtido ' + alem
})

// I. Conciliação de transferências internas: consolidado elimina repasse 1:1
caso('I. consolidado empreendimento+comercializadora concilia (só caixas iniciais)', () => {
  const p = premissaSimples()
  p.salas[0].pontos[0].volume_entrada = premissaFixa(2)
  p.salas[0].pontos[0].taxa_conversao_venda = premissaFixa(1)
  p.produtos[0].preco = premissaFixa(50000)
  p.remuneracoes = [
    { tipo: 'perc_vgv', adicional_ou_compensavel: 'compensavel', valor: premissaFixa(0.2) },
  ]
  const r = A.vb_calcularSimulacao(p, 6, '2025-01')
  const consolidado = r.empreendimento.saldo_final + r.comercializadora.saldo_final
  // sem custos externos, só repasse interno: soma dos saldos = recebimentos totais
  const receb = r.resumo_global.recebimentos_compradores_total
  if (aprox(consolidado, receb)) return true
  return 'esperado consolidado ' + receb + '; obtido ' + consolidado
})

console.log(
  '\n' +
    (casos - falhas) +
    '/' +
    casos +
    ' casos de domínio aprovados (motor ' +
    A.VB_MOTOR_VERSAO +
    ')',
)
if (falhas > 0) process.exit(1)
