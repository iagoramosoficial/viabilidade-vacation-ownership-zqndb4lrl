// pocketbase/core/viabilidade_core.js
// CORE DETERMINÍSTICO DO MOTOR (fonte única, ES5, sem imports/exports)
// Carregado via load_file no JSVM do PocketBase (pocketbase/hooks/viabilidade.pb.js)
// e sincronizado ao navegador por scripts/sync-core.mjs (npm run sync-core) em
// src/lib/pocketbase/viabilidade_core.mjs — altere ESTE arquivo e rode o sync.
// API exposta: vb_resolverValorMes, vb_formatarBRL, vb_formatarPorcentagem,
// vb_validarPremissas, vb_calcularSimulacao, VB_MOTOR_VERSAO.

'use strict'

var VB_MOTOR_VERSAO = 'v1.3.1'

// ---------- Formatação e helpers compartilhados ----------
function vb_resolverValorMes(config, mesIdx) {
  if (config === undefined || config === null) return 0
  if (typeof config === 'number') return config
  if (config.ajustes && config.ajustes[mesIdx] !== undefined && config.ajustes[mesIdx] !== null) {
    return Number(config.ajustes[mesIdx])
  }
  return Number(config.base || 0)
}

function vb_formatarBRL(valor) {
  var n = Number(valor || 0)
  var s = Math.abs(n).toFixed(2).replace('.', ',')
  var inteiro = s.slice(0, s.length - 3)
  var milhar = ''
  var count = 0
  for (var i = inteiro.length - 1; i >= 0; i--) {
    milhar = inteiro.charAt(i) + milhar
    count++
    if (count % 3 === 0 && i > 0) milhar = '.' + milhar
  }
  return (n < 0 ? '-R$ ' : 'R$ ') + (milhar || '0') + ',' + s.slice(s.length - 2)
}

function vb_formatarPorcentagem(valor, casas) {
  var num = (Number(valor) || 0) * 100
  var c = casas === undefined ? 2 : casas
  var f = Math.pow(10, c)
  var s = (Math.round(num * f) / f).toFixed(c).replace('.', ',')
  return s + '%'
}

// ---------- Validação de premissas (bloqueante, antes do cálculo) ----------
function vb_validarPremissas(premissas, horizonte) {
  var erros = []
  var h = Math.max(1, Number(horizonte) || 12)
  function isNum(v) {
    return typeof v === 'number' && isFinite(v)
  }
  function pegaBase(v, onde) {
    if (typeof v === 'number') {
      if (!isFinite(v)) erros.push(onde + ': valor numérico deve ser finito')
      return
    }
    if (!v || typeof v !== 'object') {
      erros.push(onde + ': valor mensal ausente ou inválido')
      return
    }
    if (!isNum(v.base)) erros.push(onde + ': base deve ser número finito')
  }
  function pegaPerc(v, onde) {
    pegaBase(v, onde)
    var bruto = typeof v === 'number' ? v : v && v.base
    if (isNum(bruto) && (bruto < 0 || bruto > 1))
      erros.push(onde + ': percentual deve estar entre 0% e 100%')
  }
  function pegaAjustes(v, onde) {
    if (v && typeof v === 'object' && v.ajustes) {
      if (typeof v.ajustes !== 'object') erros.push(onde + ': ajustes deve ser objeto mês→valor')
      else {
        for (var k in v.ajustes) {
          if (!isNum(Number(v.ajustes[k])))
            erros.push(onde + ': ajuste no mês ' + k + ' deve ser número finito')
          var km = Number(k)
          if (!isFinite(km) || km < 0 || km >= h)
            erros.push(onde + ': ajuste no mês ' + k + ' fora do horizonte (0..' + (h - 1) + ')')
        }
      }
    }
  }
  function pegaVM(v, onde) {
    pegaBase(v, onde)
    pegaAjustes(v, onde)
  }
  function rv(v) {
    if (v === undefined || v === null) return 0
    if (typeof v === 'number') return v
    if (v && typeof v === 'object') return Number(v.base || 0)
    return 0
  }

  if (!premissas || typeof premissas !== 'object') {
    return ['Premissas ausentes ou inválidas']
  }

  var salas = premissas.salas || []
  var produtos = premissas.produtos || []
  var mix = premissas.mix_por_sala || []
  var cp = premissas.condicoes_pagamento || {}
  var ci = premissas.cancelamentos_inadimplencia || {}
  var rem = premissas.remuneracoes || []
  var cd = premissas.custos_despesas || []
  var inv = premissas.investimentos || []
  var caixa = premissas.caixa_inicial || {}

  var idsSalas = {}
  var idsProdutos = {}
  var idsSalasComMix = {}
  var idsSalasComPonto = {}

  if (!Array.isArray(salas)) erros.push('salas deve ser lista')
  else {
    salas.forEach(function (sala, i) {
      var onde = 'salas[' + i + ']'
      if (!sala || typeof sala !== 'object') return erros.push(onde + ': sala inválida')
      if (!sala.id) erros.push(onde + ': id ausente')
      else if (idsSalas[sala.id]) erros.push(onde + ': id de sala duplicado "' + sala.id + '"')
      else idsSalas[sala.id] = true
      pegaVM(sala.capacidade_mensal, onde + '.capacidade_mensal')
      if (rv(sala.capacidade_mensal) < 0)
        erros.push(onde + '.capacidade_mensal: não pode ser negativo')
      if (!Array.isArray(sala.pontos)) erros.push(onde + '.pontos deve ser lista')
      else {
        var idsPontos = {}
        var temPontoAtivo = false
        sala.pontos.forEach(function (ponto, j) {
          var ondeP = onde + '.pontos[' + j + ']'
          if (!ponto || typeof ponto !== 'object') return erros.push(ondeP + ': ponto inválido')
          if (!ponto.id) erros.push(ondeP + ': id ausente')
          else if (idsPontos[ponto.id]) erros.push(ondeP + ': id de ponto duplicado')
          else idsPontos[ponto.id] = true
          if (ponto.sala_id !== sala.id)
            erros.push(
              ondeP + ': sala_id "' + ponto.sala_id + '" não corresponde à sala "' + sala.id + '"',
            )
          if (
            ['abordados', 'qualificados', 'convidados', 'comparecidos'].indexOf(
              ponto.etapa_entrada,
            ) < 0
          )
            erros.push(ondeP + ': etapa_entrada inválida "' + ponto.etapa_entrada + '"')
          pegaVM(ponto.volume_entrada, ondeP + '.volume_entrada')
          if (rv(ponto.volume_entrada) < 0)
            erros.push(ondeP + '.volume_entrada: não pode ser negativo')
          ;[
            'taxa_qualificados',
            'taxa_convidados',
            'taxa_comparecimento',
            'taxa_conversao_venda',
          ].forEach(function (campo) {
            if (ponto[campo] !== undefined) {
              pegaPerc(ponto[campo], ondeP + '.' + campo)
              if (rv(ponto[campo]) < 0 || rv(ponto[campo]) > 1)
                erros.push(ondeP + '.' + campo + ': deve estar entre 0% e 100%')
            }
          })
          if (
            ponto.etapa_entrada === 'comparecidos' &&
            ponto.taxa_comparecimento !== undefined &&
            rv(ponto.taxa_comparecimento) < 1
          ) {
            erros.push(
              ondeP +
                '.taxa_comparecimento: ignorada quando etapa_entrada = comparecidos (entrada direta); remova-a ou defina 100%',
            )
          }
          pegaVM(ponto.custo_transporte_unitario, ondeP + '.custo_transporte_unitario')
          if (rv(ponto.custo_transporte_unitario) < 0)
            erros.push(ondeP + '.custo_transporte_unitario: não pode ser negativo')
          temPontoAtivo = true
          idsSalasComPonto[sala.id] = true
        })
        if (!temPontoAtivo)
          erros.push(onde + ': sala sem ponto de captação (nenhum canal gera demanda)')
      }
    })
  }

  if (!Array.isArray(produtos)) erros.push('produtos deve ser lista')
  else {
    produtos.forEach(function (prod, i) {
      var onde = 'produtos[' + i + ']'
      if (!prod || typeof prod !== 'object') return erros.push(onde + ': produto inválido')
      if (!prod.id) erros.push(onde + ': id ausente')
      else if (idsProdutos[prod.id]) erros.push(onde + ': id de produto duplicado')
      else idsProdutos[prod.id] = true
      if (['multipropriedade', 'timeshare'].indexOf(prod.modalidade) < 0)
        erros.push(onde + ': modalidade inválida "' + prod.modalidade + '"')
      pegaVM(prod.preco, onde + '.preco')
      if (rv(prod.preco) < 0) erros.push(onde + '.preco: não pode ser negativo')
      if (!isNum(Number(prod.estoque_disponivel)))
        erros.push(onde + '.estoque_disponivel: deve ser número finito')
      else if (Number(prod.estoque_disponivel) < 0)
        erros.push(onde + '.estoque_disponivel: não pode ser negativo')
    })
  }

  if (!Array.isArray(mix)) erros.push('mix_por_sala deve ser lista')
  else {
    mix.forEach(function (ms, i) {
      var onde = 'mix_por_sala[' + i + ']'
      if (!ms || typeof ms !== 'object') return erros.push(onde + ': mix inválido')
      if (!idsSalas[ms.sala_id])
        erros.push(onde + ': sala_id "' + ms.sala_id + '" não existe em salas')
      else idsSalasComMix[ms.sala_id] = true
      if (!Array.isArray(ms.produtos)) erros.push(onde + '.produtos deve ser lista')
      else {
        var soma = 0
        ms.produtos.forEach(function (mp, j) {
          var ondeM = onde + '.produtos[' + j + ']'
          if (!mp || typeof mp !== 'object') return erros.push(ondeM + ': item inválido')
          if (!idsProdutos[mp.produto_id])
            erros.push(ondeM + ': produto_id "' + mp.produto_id + '" não existe em produtos')
          pegaPerc(mp.percentual, ondeM + '.percentual')
          var v = rv(mp.percentual)
          if (v < 0 || v > 1) erros.push(ondeM + '.percentual: deve estar entre 0% e 100%')
          soma += v
        })
        if (soma > 1.0001)
          erros.push(onde + ': soma dos percentuais (' + Math.round(soma * 100) + '%) excede 100%')
        else if (soma < 0.9999)
          erros.push(
            onde +
              ': soma dos percentuais (' +
              Math.round(soma * 100) +
              '%) não fecha 100% — a sala vende apenas o mix informado',
          )
      }
    })
  }

  // Toda sala ativa precisa de mix definido (o mix fecha 100% por nível ativo)
  salas.forEach(function (sala) {
    if (sala && sala.id && idsSalasComPonto[sala.id] && !idsSalasComMix[sala.id]) {
      erros.push(
        'mix_por_sala: sala "' +
          (sala.nome || sala.id) +
          '" não tem mix definido (o mix fecha 100% por nível ativo)',
      )
    }
  })

  function validaCond(mod) {
    var cond = cp[mod]
    if (!cond) return
    var onde = 'condicoes_pagamento.' + mod
    pegaPerc(cond.perc_entrada, onde + '.perc_entrada')
    if (!isNum(Number(cond.parcelas_entrada)) || Number(cond.parcelas_entrada) < 1)
      erros.push(onde + '.parcelas_entrada: deve ser inteiro >= 1')
    if (!isNum(Number(cond.mes_primeira_saldo)) || Number(cond.mes_primeira_saldo) < 0)
      erros.push(
        onde + '.mes_primeira_saldo: deve ser inteiro >= 0 (0 = primeira parcela do saldo em M0)',
      )
    if (!isNum(Number(cond.parcelas_saldo)) || Number(cond.parcelas_saldo) < 0)
      erros.push(onde + '.parcelas_saldo: deve ser >= 0')
  }
  validaCond('multipropriedade')
  validaCond('timeshare')

  function validaCancInad(mod) {
    var cfg = ci[mod]
    if (!cfg) return
    var onde = 'cancelamentos_inadimplencia.' + mod
    var c = cfg.cancelamento
    if (c) {
      pegaPerc(c.taxa, onde + '.cancelamento.taxa')
      if (!isNum(Number(c.mes_medio)) || Number(c.mes_medio) < 0)
        erros.push(onde + '.cancelamento.mes_medio: deve ser >= 0')
      pegaPerc(c.taxa_devolucao, onde + '.cancelamento.taxa_devolucao')
      if (!isNum(Number(c.prazo_devolucao)) || Number(c.prazo_devolucao) < 1)
        erros.push(
          onde +
            '.cancelamento.prazo_devolucao: deve ser >= 1 (meses APÓS o cancelamento em mes_medio)',
        )
    }
    var inad = cfg.inadimplencia
    if (inad) {
      pegaPerc(inad.taxa, onde + '.inadimplencia.taxa')
      pegaPerc(inad.parcela_recuperavel, onde + '.inadimplencia.parcela_recuperavel')
      if (!isNum(Number(inad.prazo_recuperacao)) || Number(inad.prazo_recuperacao) < 1)
        erros.push(onde + '.inadimplencia.prazo_recuperacao: deve ser >= 1')
    }
  }
  validaCancInad('multipropriedade')
  validaCancInad('timeshare')

  if (!Array.isArray(rem)) erros.push('remuneracoes deve ser lista')
  else {
    rem.forEach(function (r, i) {
      var onde = 'remuneracoes[' + i + ']'
      if (!r || typeof r !== 'object') return erros.push(onde + ': remuneração inválida')
      if (['fixo', 'perc_vgv', 'perc_recebimento', 'retencao_entrada'].indexOf(r.tipo) < 0)
        erros.push(onde + ': tipo inválido "' + r.tipo + '"')
      if (['adicional', 'compensavel'].indexOf(r.adicional_ou_compensavel) < 0)
        erros.push(onde + ': adicional_ou_compensavel deve ser "adicional" ou "compensavel"')
      pegaVM(r.valor, onde + '.valor')
      if (
        (r.tipo === 'perc_vgv' || r.tipo === 'perc_recebimento') &&
        isNum(rv(r.valor)) &&
        (rv(r.valor) < 0 || rv(r.valor) > 1)
      )
        erros.push(onde + '.valor: percentual deve estar entre 0% e 100%')
      if ((r.tipo === 'fixo' || r.tipo === 'retencao_entrada') && rv(r.valor) < 0)
        erros.push(onde + '.valor: não pode ser negativo')
    })
  }

  if (!Array.isArray(cd)) erros.push('custos_despesas deve ser lista')
  else {
    cd.forEach(function (d, i) {
      var onde = 'custos_despesas[' + i + ']'
      if (!d || typeof d !== 'object') return erros.push(onde + ': despesa inválida')
      if (['fixo', 'por_atendimento', 'por_venda', 'perc_vgv'].indexOf(d.tipo) < 0)
        erros.push(onde + ': tipo inválido "' + d.tipo + '"')
      if (['comercializadora', 'empreendimento'].indexOf(d.responsavel_economico) < 0)
        erros.push(onde + ': responsavel_economico deve ser "comercializadora" ou "empreendimento"')
      pegaVM(d.valor, onde + '.valor')
      if (d.tipo === 'perc_vgv' && isNum(rv(d.valor)) && (rv(d.valor) < 0 || rv(d.valor) > 1))
        erros.push(onde + '.valor: percentual deve estar entre 0% e 100%')
      if (d.tipo !== 'perc_vgv' && rv(d.valor) < 0)
        erros.push(onde + '.valor: não pode ser negativo')
      if (d.ponto_id && !d.sala_id)
        erros.push(onde + ': ponto_id exige sala_id (escopo hierárquico)')
      if (d.sala_id && !idsSalas[d.sala_id])
        erros.push(onde + ': sala_id "' + d.sala_id + '" não existe em salas')
      if (d.ponto_id) {
        var achou = false
        salas.forEach(function (sala) {
          if (sala.id !== d.sala_id || !Array.isArray(sala.pontos)) return
          sala.pontos.forEach(function (ponto) {
            if (ponto.id === d.ponto_id) achou = true
          })
        })
        if (!achou)
          erros.push(
            onde + ': ponto_id "' + d.ponto_id + '" não pertence à sala "' + d.sala_id + '"',
          )
      }
      if (
        d.prazo_pagamento_meses !== undefined &&
        (!isNum(Number(d.prazo_pagamento_meses)) || Number(d.prazo_pagamento_meses) < 0)
      )
        erros.push(onde + '.prazo_pagamento_meses: deve ser >= 0')
      if (
        d.prazo_reembolso_meses !== undefined &&
        (!isNum(Number(d.prazo_reembolso_meses)) || Number(d.prazo_reembolso_meses) < 0)
      )
        erros.push(onde + '.prazo_reembolso_meses: deve ser >= 0')
    })
  }

  if (!Array.isArray(inv)) erros.push('investimentos deve ser lista')
  else {
    inv.forEach(function (v, i) {
      var onde = 'investimentos[' + i + ']'
      if (!v || typeof v !== 'object') return erros.push(onde + ': investimento inválido')
      if (!isNum(Number(v.mes)) || Number(v.mes) < 0)
        erros.push(onde + '.mes: deve ser inteiro >= 0')
      if (!isNum(Number(v.valor)) || Number(v.valor) < 0)
        erros.push(onde + '.valor: deve ser número finito >= 0')
      if (['comercializadora', 'empreendimento'].indexOf(v.parte) < 0)
        erros.push(onde + ': parte deve ser "comercializadora" ou "empreendimento"')
      if (
        ['obra/reforma', 'mobiliario/equipamentos', 'projetos e implantacao'].indexOf(v.categoria) <
        0
      )
        erros.push(onde + ': categoria inválida "' + v.categoria + '"')
    })
  }

  if (caixa) {
    if (isNum(Number(caixa.comercializadora))) {
      if (Number(caixa.comercializadora) < 0)
        erros.push('caixa_inicial.comercializadora: não pode ser negativo')
    } else erros.push('caixa_inicial.comercializadora: deve ser número finito')
    if (isNum(Number(caixa.empreendimento))) {
      if (Number(caixa.empreendimento) < 0)
        erros.push('caixa_inicial.empreendimento: não pode ser negativo')
    } else erros.push('caixa_inicial.empreendimento: deve ser número finito')
  }

  return erros
}

// ---------- Motor determinístico ----------
// Calcula a simulação a partir das premissas (validação roda antes: premissa
// inválida lança Error com mensagem explicativa — nunca resultado zero/sucesso).
function vb_calcularSimulacao(premissas, horizonteMeses, mesInicialStr) {
  var errosValidacao = vb_validarPremissas(premissas, horizonteMeses)
  if (errosValidacao.length > 0) {
    var msg =
      'Premissas inválidas (' +
      errosValidacao.length +
      (errosValidacao.length === 1 ? ' erro' : ' erros') +
      '):'
    var limite = Math.min(errosValidacao.length, 8)
    for (var ve = 0; ve < limite; ve++) msg += '\n • ' + errosValidacao[ve]
    if (errosValidacao.length > 8)
      msg += '\n • ... e mais ' + (errosValidacao.length - 8) + ' erro(s)'
    throw new Error(msg)
  }

  var horizonte = Math.max(1, horizonteMeses || 12)
  var salas = premissas.salas || []
  var produtos = premissas.produtos || []
  var mixSalas = premissas.mix_por_sala || []
  var condicoesPagamento = premissas.condicoes_pagamento || {}
  var cancelamentos = premissas.cancelamentos_inadimplencia || {}
  var remuneracoes = premissas.remuneracoes || []
  var custosDespesas = premissas.custos_despesas || []
  var investimentos = premissas.investimentos || []
  var caixasIniciais = premissas.caixa_inicial || {}

  function rv(config, mesIdx) {
    return vb_resolverValorMes(config, mesIdx)
  }

  // ===== 1. Funil de vendas por mês / sala / ponto =====
  var funilMensal = []
  var vendasMesProduto = []
  var estoqueRestante = {}
  produtos.forEach(function (p) {
    estoqueRestante[p.id] = Number(p.estoque_disponivel || 0)
  })

  var totalPotencialGlobal = 0
  var totalAdmitidoGlobal = 0
  var totalNaoAtendidoEstoqueGlobal = 0
  var totalDemandaNaoAtendidaCapacidadeGlobal = 0

  for (var m = 0; m < horizonte; m++) {
    var mesData = {
      mes: m,
      salas: [],
      total_vgv_mes: 0,
      total_vendas_mes: 0,
      total_atendimentos_mes: 0,
    }

    salas.forEach(function (sala) {
      var capSala = rv(sala.capacidade_mensal, m)
      var pontosSala = sala.pontos || []

      var pontosDemandas = pontosSala.map(function (ponto) {
        var etapaEntrada = ponto.etapa_entrada
        var volEntrada = rv(ponto.volume_entrada, m)

        var taxaQual = ponto.taxa_qualificados !== undefined ? rv(ponto.taxa_qualificados, m) : 1
        var taxaConv = ponto.taxa_convidados !== undefined ? rv(ponto.taxa_convidados, m) : 1
        var taxaComp = ponto.etapa_entrada === 'comparecidos' ? 1 : rv(ponto.taxa_comparecimento, m)
        var taxaConvVenda =
          ponto.taxa_conversao_venda !== undefined ? rv(ponto.taxa_conversao_venda, m) : 0

        var abordados = 0
        var qualificados = 0
        var convidados = 0
        var comparecidos = 0

        if (etapaEntrada === 'abordados') {
          abordados = volEntrada
          qualificados = abordados * taxaQual
          convidados = qualificados * taxaConv
          comparecidos = convidados * taxaComp
        } else if (etapaEntrada === 'qualificados') {
          qualificados = volEntrada
          convidados = qualificados * taxaConv
          comparecidos = convidados * taxaComp
        } else if (etapaEntrada === 'convidados') {
          convidados = volEntrada
          comparecidos = convidados * taxaComp
        } else if (etapaEntrada === 'comparecidos') {
          comparecidos = volEntrada // entrada direta: NÃO reaplica taxa de comparecimento
        }

        return {
          ponto_id: ponto.id,
          nome: ponto.nome,
          etapa_entrada: etapaEntrada,
          volume_entrada: volEntrada,
          abordados: abordados,
          qualificados: qualificados,
          convidados: convidados,
          comparecidos_demanda: comparecidos,
          taxa_conversao_venda: taxaConvVenda,
          custo_transporte_unit: rv(ponto.custo_transporte_unitario, m),
        }
      })

      var demandaTotalSala = pontosDemandas.reduce(function (acc, p) {
        return acc + p.comparecidos_demanda
      }, 0)
      var atendimentosTotaisSala = Math.min(demandaTotalSala, capSala)
      var demandaNaoAtendidaSala = Math.max(0, demandaTotalSala - capSala)
      totalDemandaNaoAtendidaCapacidadeGlobal += demandaNaoAtendidaSala

      var fatorRateio = demandaTotalSala > 0 ? atendimentosTotaisSala / demandaTotalSala : 0

      var pontosResultados = pontosDemandas.map(function (pd) {
        var atendimentosEfetivos =
          pd.comparecidos_demanda * (demandaTotalSala <= capSala ? 1 : fatorRateio)
        var naoAtendidosCapacidade = pd.comparecidos_demanda - atendimentosEfetivos
        var vendasPotenciais = atendimentosEfetivos * pd.taxa_conversao_venda

        return {
          ponto_id: pd.ponto_id,
          nome: pd.nome,
          etapa_entrada: pd.etapa_entrada,
          volume_entrada: pd.volume_entrada,
          comparecidos_demanda: pd.comparecidos_demanda,
          atendimentos_efetivos: atendimentosEfetivos,
          demanda_nao_atendida: naoAtendidosCapacidade,
          taxa_conversao_venda: pd.taxa_conversao_venda,
          vendas_potenciais: vendasPotenciais,
          custo_transporte_total: atendimentosEfetivos * pd.custo_transporte_unit,
        }
      })

      var vendasPotenciaisSala = pontosResultados.reduce(function (acc, p) {
        return acc + p.vendas_potenciais
      }, 0)
      totalPotencialGlobal += vendasPotenciaisSala

      var mixSala = null
      mixSalas.forEach(function (ms) {
        if (ms.sala_id === sala.id) mixSala = ms
      })
      var produtosMix = (mixSala && mixSala.produtos) || []

      produtosMix.forEach(function (pm) {
        var prodId = pm.produto_id
        var prod = null
        produtos.forEach(function (p) {
          if (p.id === prodId) prod = p
        })
        if (!prod) return

        var percMix = rv(pm.percentual, m)
        var potencialProduto = vendasPotenciaisSala * percMix

        var estDisponivel = estoqueRestante[prodId] || 0
        var admitidoProduto = Math.min(potencialProduto, estDisponivel)
        var naoAtendidoEstoque = Math.max(0, potencialProduto - admitidoProduto)

        estoqueRestante[prodId] = Math.max(0, estDisponivel - admitidoProduto)
        totalAdmitidoGlobal += admitidoProduto
        totalNaoAtendidoEstoqueGlobal += naoAtendidoEstoque

        var precoUnitario = rv(prod.preco, m)
        var vgvProduto = admitidoProduto * precoUnitario

        mesData.total_vgv_mes += vgvProduto
        mesData.total_vendas_mes += admitidoProduto

        vendasMesProduto.push({
          mes: m,
          sala_id: sala.id,
          produto_id: prodId,
          modalidade: prod.modalidade,
          nome_produto: prod.nome,
          potencial: potencialProduto,
          admitido: admitidoProduto,
          nao_atendido_estoque: naoAtendidoEstoque,
          preco_unitario: precoUnitario,
          vgv: vgvProduto,
        })
      })

      mesData.total_atendimentos_mes += atendimentosTotaisSala
      mesData.salas.push({
        sala_id: sala.id,
        nome: sala.nome,
        capacidade: capSala,
        demanda_total: demandaTotalSala,
        atendimentos_efetivos: atendimentosTotaisSala,
        demanda_nao_atendida: demandaNaoAtendidaSala,
        vendas_potenciais: vendasPotenciaisSala,
        pontos: pontosResultados,
      })
    })

    funilMensal.push(mesData)
  }

  // ===== 2. Cobranças esperadas por GRUPO DE VENDA (mês da venda × modalidade) =====
  var carteiraAlemHorizonte = {
    multipropriedade: 0,
    timeshare: 0,
    total: 0,
    devolucoes_a_pagar_alem: 0,
    recuperacoes_a_receber_alem: 0,
    despesas_a_pagar_alem: 0,
  }
  var cobrancasEsperadas = {}
  var gruposVenda = [] // { mes, mod, cobrancas: [{mes, tipo, valor}] }

  for (var c1 = 0; c1 < horizonte; c1++) {
    cobrancasEsperadas[c1] = {
      multipropriedade: { entrada: 0, saldo: 0, bruto: 0 },
      timeshare: { entrada: 0, saldo: 0, bruto: 0 },
      total_bruto: 0,
    }
  }

  function registrarCobrancaGrupo(grupo, mesCobr, tipo, valor) {
    grupo.cobrancas.push({ mes: mesCobr, tipo: tipo, valor: valor })
    if (mesCobr < horizonte) {
      cobrancasEsperadas[mesCobr][grupo.mod][tipo] += valor
      cobrancasEsperadas[mesCobr][grupo.mod].bruto += valor
      cobrancasEsperadas[mesCobr].total_bruto += valor
    } else {
      // cobrança futura além do horizonte: recebível de carteira (conciliação)
      carteiraAlemHorizonte[grupo.mod] += valor
      carteiraAlemHorizonte.total += valor
    }
  }

  vendasMesProduto.forEach(function (venda) {
    if (venda.vgv <= 0) return
    var mod = venda.modalidade
    var cond = condicoesPagamento[mod] || {
      perc_entrada: 0.2,
      parcelas_entrada: 1,
      mes_primeira_saldo: 1,
      parcelas_saldo: 10,
    }

    var percEntrada = Number(cond.perc_entrada || 0)
    var numParcEntrada = Math.max(1, Math.round(Number(cond.parcelas_entrada || 1)))
    // M0 é válido: 0 permanece 0; só a ausência herda o comportamento padrão (1)
    var mesPrimSaldo = Math.max(
      0,
      Math.round(
        Number(
          cond.mes_primeira_saldo === undefined || cond.mes_primeira_saldo === null
            ? 1
            : cond.mes_primeira_saldo,
        ),
      ),
    )
    var numParcSaldo = Math.max(0, Math.round(Number(cond.parcelas_saldo || 0)))

    var vgvEntrada = venda.vgv * percEntrada
    var vgvSaldo = venda.vgv - vgvEntrada

    var valorParcEntrada = vgvEntrada / numParcEntrada
    var valorParcSaldo = numParcSaldo > 0 ? vgvSaldo / numParcSaldo : 0

    var grupo = { mes: venda.mes, mod: mod, cobrancas: [] }
    gruposVenda.push(grupo)

    for (var ep = 0; ep < numParcEntrada; ep++) {
      registrarCobrancaGrupo(grupo, venda.mes + ep, 'entrada', valorParcEntrada)
    }
    for (var sp = 0; sp < numParcSaldo; sp++) {
      registrarCobrancaGrupo(grupo, venda.mes + mesPrimSaldo + sp, 'saldo', valorParcSaldo)
    }
  })

  // ===== 3. Cancelamento e inadimplência por GRUPO DE VENDA (mes_medio desde a venda) =====
  var recebimentosEfetivos = {}
  var devolucoesAgendadas = {}
  var recuperacoesAgendadas = {}

  for (var r1 = 0; r1 < horizonte; r1++) {
    recebimentosEfetivos[r1] = {
      multipropriedade: 0,
      timeshare: 0,
      total_recebido: 0,
      devolucoes_pagas: 0,
      inadimplencia_perdida: 0,
      inadimplencia_recuperada: 0,
    }
    devolucoesAgendadas[r1] = 0
    recuperacoesAgendadas[r1] = 0
  }

  ;['multipropriedade', 'timeshare'].forEach(function (mod) {
    var cfgMod = cancelamentos[mod] || {}
    var cancConf = cfgMod.cancelamento || {
      taxa: 0,
      mes_medio: 1,
      taxa_devolucao: 0,
      prazo_devolucao: 1,
    }
    var inadConf = cfgMod.inadimplencia || { taxa: 0, parcela_recuperavel: 0, prazo_recuperacao: 1 }

    var taxaCanc = Number(cancConf.taxa || 0)
    var mesMedio = Math.max(
      0,
      Math.round(Number(cancConf.mes_medio === undefined ? 1 : cancConf.mes_medio)),
    )
    var taxaDevolucao = Number(cancConf.taxa_devolucao || 0)
    var prazoDevolucao = Math.max(
      1,
      Math.round(Number(cancConf.prazo_devolucao === undefined ? 1 : cancConf.prazo_devolucao)),
    )

    var taxaInad = Number(inadConf.taxa || 0)
    var percRecup = Number(inadConf.parcela_recuperavel || 0)
    var prazoRecup = Math.max(
      1,
      Math.round(Number(inadConf.prazo_recuperacao === undefined ? 1 : inadConf.prazo_recuperacao)),
    )

    gruposVenda.forEach(function (grupo) {
      if (grupo.mod !== mod) return
      var mesCancelamento = grupo.mes + mesMedio
      var recebidoElegivel = 0 // recebido ANTES do cancelamento — base da devolução
      grupo.cobrancas.forEach(function (cob) {
        if (cob.mes >= mesCancelamento) return // cancelada: sem nova cobrança/dedução de VGV
        var inad = cob.valor * taxaInad
        var recup = inad * percRecup
        var perda = inad - recup
        recebidoElegivel += cob.valor
        if (cob.mes < horizonte) {
          recebimentosEfetivos[cob.mes][mod] += cob.valor - inad
          recebimentosEfetivos[cob.mes].total_recebido += cob.valor - inad
          recebimentosEfetivos[cob.mes].inadimplencia_perdida += perda
        } else {
          carteiraAlemHorizonte[mod] += cob.valor - inad
          carteiraAlemHorizonte.total += cob.valor - inad
        }
        var mesRecup = cob.mes + prazoRecup
        if (recup > 0) {
          if (mesRecup < horizonte) {
            recuperacoesAgendadas[mesRecup] += recup
          } else {
            carteiraAlemHorizonte.recuperacoes_a_receber_alem += recup
          }
        }
      })
      // Devolução sobre o EFETIVAMENTE RECEBIDO, com prazo APÓS o cancelamento
      if (taxaCanc > 0 && taxaDevolucao > 0 && recebidoElegivel > 0) {
        var valorDevolver = recebidoElegivel * taxaCanc * taxaDevolucao
        var mesDev = mesCancelamento + prazoDevolucao
        if (mesDev < horizonte) {
          devolucoesAgendadas[mesDev] += valorDevolver
        } else {
          carteiraAlemHorizonte.devolucoes_a_pagar_alem += valorDevolver
        }
      }
    })
  })

  for (var r2 = 0; r2 < horizonte; r2++) {
    var recup = recuperacoesAgendadas[r2] || 0
    recebimentosEfetivos[r2].total_recebido += recup
    recebimentosEfetivos[r2].inadimplencia_recuperada = recup
    recebimentosEfetivos[r2].devolucoes_pagas = devolucoesAgendadas[r2] || 0
  }

  // ===== 4. Remuneração, custos, investimentos e caixas =====
  var fluxosComercializadora = []
  var fluxosEmpreendimento = []
  var transferenciasInternas = []

  var saldoAcumuladoComercializadora = Number(caixasIniciais.comercializadora || 0)
  var saldoAcumuladoEmpreendimento = Number(caixasIniciais.empreendimento || 0)

  var maiorDeficitComercializadora = 0
  var mesMaiorDeficitComercializadora = 0
  var maiorDeficitEmpreendimento = 0
  var mesMaiorDeficitEmpreendimento = 0

  for (var fm = 0; fm < horizonte; fm++) {
    var vgvMes = funilMensal[fm].total_vgv_mes
    var recMes = recebimentosEfetivos[fm].total_recebido

    // Remuneração da comercializadora: fixo + comissões sobre VGV de venda admitida
    // e sobre recebimentos. "compensável": o empreendimento reembolsa o componente
    // pago pela comercializadora — entra como custo DO EMPREENDIMENTO e é eliminado
    // 1:1 no consolidado (por isso compensável ≠ adicional nos resultados).
    var fixoComercialMes = 0
    var percVgvMes = 0
    var percRecebimentoMes = 0
    var somaRetencaoEntrada = 0
    var compensavelFixoMes = 0
    var compensavelPercVgvMes = 0
    var compensavelPercRecebimentoMes = 0

    remuneracoes.forEach(function (rem) {
      var tipo = rem.tipo
      var valorBase = rv(rem.valor, fm)
      var isCompensavel = rem.adicional_ou_compensavel === 'compensavel'
      if (isCompensavel) {
        if (tipo === 'fixo') compensavelFixoMes += valorBase
        else if (tipo === 'perc_vgv') compensavelPercVgvMes += valorBase
        else if (tipo === 'perc_recebimento') compensavelPercRecebimentoMes += valorBase
      } else {
        if (tipo === 'fixo') fixoComercialMes += valorBase
        else if (tipo === 'perc_vgv') percVgvMes += valorBase
        else if (tipo === 'perc_recebimento') percRecebimentoMes += valorBase
        else if (tipo === 'retencao_entrada') somaRetencaoEntrada += valorBase
      }
    })

    // ----- Custos com escopo de sala/ponto, pagador e prazo -----
    var custosComercializadoraMes = 0
    var custosEmpreendimentoMes = 0
    var detalhesCustosMes = []
    var reembolsosPendentes = []

    custosDespesas.forEach(function (cdItem) {
      var valorItem = 0
      var tipo = cdItem.tipo
      var vUnit = rv(cdItem.valor, fm)

      var atendimentosEscopo = 0
      var vendasEscopo = 0
      var vgvEscopo = 0
      var temEscopo = !!cdItem.sala_id || !!cdItem.ponto_id
      var salaEscopo = null
      funilMensal[fm].salas.forEach(function (s) {
        if (cdItem.sala_id && s.sala_id === cdItem.sala_id) salaEscopo = s
      })

      if (!temEscopo) {
        // Sem escopo: consolidado do mês (todas as salas)
        atendimentosEscopo = funilMensal[fm].total_atendimentos_mes
        vendasEscopo = funilMensal[fm].total_vendas_mes
        vgvEscopo = vgvMes
      } else if (salaEscopo) {
        // Escopo por sala: usa APENOS dados dessa sala (não o consolidado do mês)
        atendimentosEscopo = salaEscopo.atendimentos_efetivos
        vendasMesProduto.forEach(function (v) {
          if (v.mes === fm && v.sala_id === cdItem.sala_id) {
            vendasEscopo += v.admitido
            vgvEscopo += v.vgv
          }
        })
        if (cdItem.ponto_id) {
          var atendPonto = 0
          salaEscopo.pontos.forEach(function (pt) {
            if (pt.ponto_id === cdItem.ponto_id) {
              atendPonto = pt.atendimentos_efetivos
            }
          })
          atendimentosEscopo = atendPonto // ponto restringe ATENDIMENTOS (mix é por sala)
        }
      }

      if (tipo === 'fixo') {
        valorItem = vUnit
      } else if (tipo === 'por_atendimento') {
        valorItem = atendimentosEscopo * vUnit
      } else if (tipo === 'por_venda') {
        valorItem = vendasEscopo * vUnit
      } else if (tipo === 'perc_vgv') {
        valorItem = vgvEscopo * vUnit
      }

      if (valorItem === 0) return
      var pagador = cdItem.pagador_inicial || cdItem.responsavel_economico || 'comercializadora'
      var resp = cdItem.responsavel_economico || 'comercializadora'
      var prazo = Math.max(
        0,
        Math.round(
          Number(cdItem.prazo_pagamento_meses === undefined ? 0 : cdItem.prazo_pagamento_meses),
        ),
      )
      var mesPagamento = fm + prazo
      detalhesCustosMes.push({
        mes_competencia: fm,
        mes_pagamento: mesPagamento,
        valor: valorItem,
        responsavel: resp,
        pagador: pagador,
        base: tipo === 'fixo' ? 'valor fixo mensal' : tipo,
      })
      if (mesPagamento < horizonte) {
        if (pagador === 'comercializadora') custosComercializadoraMes += valorItem
        else custosEmpreendimentoMes += valorItem
      } else {
        // despesa competida dentro do horizonte com pagamento além dele
        carteiraAlemHorizonte.despesas_a_pagar_alem += valorItem
      }
      // Reembolso: pagador ≠ responsável — o responsável reembolsa o pagador
      // (mesPagamento + prazo_reembolso)
      if (pagador !== resp) {
        var prazoReemb = Math.max(
          0,
          Math.round(
            Number(cdItem.prazo_reembolso_meses === undefined ? 1 : cdItem.prazo_reembolso_meses),
          ),
        )
        var mesReemb = mesPagamento + prazoReemb
        reembolsosPendentes.push({
          mes: mesReemb,
          pagador: pagador,
          resp: resp,
          valor: valorItem,
        })
      }
    })

    var somaPercVgv = percVgvMes + compensavelPercVgvMes
    var somaPercRecebimento = percRecebimentoMes + compensavelPercRecebimentoMes
    var comissaoVendaMes = vgvMes * somaPercVgv
    var comissaoRecebimentoMes = recMes * somaPercRecebimento
    // Remuneração total = adicional + compensável; retenção limita o que é repassado
    var remuneracaoComercial =
      fixoComercialMes + compensavelFixoMes + comissaoVendaMes + comissaoRecebimentoMes
    // remuneracaoAdicionalMes referencia o que é SEMPRE da comercializadora
    var remuneracaoAdicionalMes = fixoComercialMes + comissaoVendaMes + comissaoRecebimentoMes

    var investComercializadora = 0
    var investEmpreendimento = 0
    investimentos.forEach(function (invItem) {
      if (Number(invItem.mes) === fm) {
        var val = Number(invItem.valor || 0)
        if (invItem.parte === 'comercializadora') investComercializadora += val
        else investEmpreendimento += val
      }
    })

    var devolucoesMes = recebimentosEfetivos[fm].devolucoes_pagas

    // ===== Retenção de entrada: sobre a entrada EFETIVAMENTE RECEBIDA =====
    // A base é o que os compradores pagaram de entrada (líquido de inadimplência)
    // no mês — SEM recuperações agendadas de parcelas antigas em atraso.
    var baseRetencaoMes =
      recebimentosEfetivos[fm].multipropriedade + recebimentosEfetivos[fm].timeshare
    var retencaoEntradaMes = baseRetencaoMes * somaRetencaoEntrada
    // A retenção transfere CAIXA do empreendimento (não é remuneração); limitada à
    // remuneração a pagar; o excedente fica no empreendimento e é reportado.
    var retencaoAplicada = Math.min(retencaoEntradaMes, remuneracaoComercial)
    var retencaoNaoAplicada = retencaoEntradaMes - retencaoAplicada
    var repasseLiquidoMes = remuneracaoComercial - retencaoAplicada

    reembolsosPendentes.forEach(function (r) {
      if (r.mes === fm) {
        if (r.resp === 'empreendimento') {
          repasseLiquidoMes -= r.valor
        } else {
          repasseLiquidoMes += r.valor
        }
        transferenciasInternas.push({
          mes: fm,
          de: r.resp,
          para: r.pagador,
          valor: r.valor,
          descricao: 'Reembolso de despesa paga antecipadamente por ' + r.pagador,
        })
      }
    })

    var entradasEmpreendimento = recMes
    var saidasEmpreendimento =
      repasseLiquidoMes +
      retencaoAplicada +
      custosEmpreendimentoMes +
      devolucoesMes +
      investEmpreendimento
    var fluxoLiquidoEmpreendimento = entradasEmpreendimento - saidasEmpreendimento
    saldoAcumuladoEmpreendimento += fluxoLiquidoEmpreendimento

    if (saldoAcumuladoEmpreendimento < maiorDeficitEmpreendimento) {
      maiorDeficitEmpreendimento = saldoAcumuladoEmpreendimento
      mesMaiorDeficitEmpreendimento = fm
    }

    var entradasComercial = remuneracaoComercial
    var saidasComercial = custosComercializadoraMes + investComercializadora
    var fluxoLiquidoComercial = entradasComercial - saidasComercial
    saldoAcumuladoComercializadora += fluxoLiquidoComercial

    if (saldoAcumuladoComercializadora < maiorDeficitComercializadora) {
      maiorDeficitComercializadora = saldoAcumuladoComercializadora
      mesMaiorDeficitComercializadora = fm
    }

    // Transporte: despesa de operação, lançada UMA ÚNICA VEZ no caixa da parte que
    // a assume (aqui: pagador maior do mês), NUNCA somando por ponto de captação.
    var transporteMes = 0
    funilMensal[fm].salas.forEach(function (s) {
      s.pontos.forEach(function (pt) {
        transporteMes += pt.custo_transporte_total
      })
    })
    if (transporteMes > 0) {
      var pagadorTransporte =
        custosComercializadoraMes >= custosEmpreendimentoMes ? 'comercializadora' : 'empreendimento'
      if (pagadorTransporte === 'comercializadora') {
        custosComercializadoraMes += transporteMes
      } else {
        custosEmpreendimentoMes += transporteMes
      }
      detalhesCustosMes.push({
        mes_competencia: fm,
        mes_pagamento: fm,
        valor: transporteMes,
        responsavel: pagadorTransporte,
        pagador: pagadorTransporte,
        base: 'transporte (por atendimento, uma vez por ponto, lançado uma única vez)',
      })
      transferenciasInternas.push({
        mes: fm,
        de: pagadorTransporte,
        para: 'transporte',
        valor: transporteMes,
        descricao: 'Custo de transporte dos atendimentos do mês (lançado uma única vez no caixa)',
      })
    }

    if (repasseLiquidoMes !== 0) {
      transferenciasInternas.push({
        mes: fm,
        de: 'empreendimento',
        para: 'comercializadora',
        valor: repasseLiquidoMes,
        descricao: 'Repasse líquido de remuneração comercial',
      })
    }
    if (retencaoAplicada > 0) {
      transferenciasInternas.push({
        mes: fm,
        de: 'empreendimento',
        para: 'retencao_caixa',
        valor: retencaoAplicada,
        descricao: 'Retenção de entrada sobre remuneração a pagar',
      })
    }

    fluxosComercializadora.push({
      mes: fm,
      receita_remuneracao: entradasComercial - retencaoAplicada,
      custos_operacionais: custosComercializadoraMes,
      investimentos: investComercializadora,
      fluxo_liquido: fluxoLiquidoComercial,
      saldo_acumulado: saldoAcumuladoComercializadora,
      retencao_nao_aplicada: retencaoNaoAplicada,
      remuneracao_adicional: remuneracaoAdicionalMes,
      detalhes_custos: detalhesCustosMes,
    })

    fluxosEmpreendimento.push({
      mes: fm,
      recebimentos_brutos: entradasEmpreendimento,
      repasse_comercial: repasseLiquidoMes,
      custos_proprios: custosEmpreendimentoMes,
      devolucoes: devolucoesMes,
      investimentos: investEmpreendimento,
      fluxo_liquido: fluxoLiquidoEmpreendimento,
      saldo_acumulado: saldoAcumuladoEmpreendimento,
    })
  }

  // ===== 5. Totais e retorno =====
  var totalVgv = 0
  vendasMesProduto.forEach(function (v) {
    totalVgv += v.vgv
  })
  var totalVendasAdmitidas = 0
  vendasMesProduto.forEach(function (v) {
    totalVendasAdmitidas += v.admitido
  })
  var totalRecebidoCompradores = 0
  var totalDevolucoesPagas = 0
  for (var rr = 0; rr < horizonte; rr++) {
    totalRecebidoCompradores += recebimentosEfetivos[rr].total_recebido
    totalDevolucoesPagas += recebimentosEfetivos[rr].devolucoes_pagas
  }
  var totalReceitaComercial = 0
  var totalCustosComercial = 0
  fluxosComercializadora.forEach(function (f) {
    totalReceitaComercial += f.receita_remuneracao
    totalCustosComercial += f.custos_operacionais
  })
  var resultadoGerencialComercial = totalReceitaComercial - totalCustosComercial
  var totalInvestEmpreendimento = 0
  var totalCustosEmpreendimento = 0
  var totalRepasses = 0
  fluxosEmpreendimento.forEach(function (f) {
    totalInvestEmpreendimento += f.investimentos
    totalCustosEmpreendimento += f.custos_proprios
    totalRepasses += f.repasse_comercial
  })

  return {
    titulo: 'Simulação comercial e financeira preliminar',
    schema_version: 2,
    motor_versao: VB_MOTOR_VERSAO,
    horizonte_meses: horizonte,
    mes_inicial: mesInicialStr || '2025-01',
    resumo_global: {
      vgv_total: totalVgv,
      vendas_potenciais_total: totalPotencialGlobal,
      vendas_admitidas_total: totalVendasAdmitidas,
      vendas_recusadas_capacidade_total: totalDemandaNaoAtendidaCapacidadeGlobal,
      vendas_recusadas_estoque_total: totalNaoAtendidoEstoqueGlobal,
      recebimentos_compradores_total: totalRecebidoCompradores,
      devolucoes_total: totalDevolucoesPagas,
      carteira_alem_horizonte: carteiraAlemHorizonte,
      estoque_restante_por_produto: estoqueRestante,
    },
    comercializadora: {
      caixa_inicial: Number(caixasIniciais.comercializadora || 0),
      total_receita_propria: totalReceitaComercial,
      total_custos_assumidos: totalCustosComercial,
      resultado_gerencial_comercial: resultadoGerencialComercial,
      saldo_final: saldoAcumuladoComercializadora,
      maior_deficit: maiorDeficitComercializadora,
      mes_maior_deficit: mesMaiorDeficitComercializadora,
      fluxos_mensais: fluxosComercializadora,
    },
    empreendimento: {
      caixa_inicial: Number(caixasIniciais.empreendimento || 0),
      recebimentos_brutos_total: totalRecebidoCompradores,
      repasses_comercializadora_total: totalRepasses,
      custos_proprios_total: totalCustosEmpreendimento,
      devolucoes_total: totalDevolucoesPagas,
      investimentos_total: totalInvestEmpreendimento,
      saldo_final: saldoAcumuladoEmpreendimento,
      maior_deficit: maiorDeficitEmpreendimento,
      mes_maior_deficit: mesMaiorDeficitEmpreendimento,
      fluxos_mensais: fluxosEmpreendimento,
    },
    funil_mensal: funilMensal,
    vendas_mes_produto: vendasMesProduto,
    transferencias_internas: transferenciasInternas,
    avisos_escopo: [
      'Aviso: O estoque comercial informado não foi validado por capacidade de direitos/hospedagem.',
      'Aviso: Valores nominais sem juros/correção nesta etapa preliminar.',
      'Aviso: Revenda de contratos cancelados não foi simulada; obrigações de uso serão verificadas na etapa de direitos.',
      'Aviso: Faltam hotelaria completa, direitos/capacidade contratual, tributos, financiamento e encargos ainda não modelados (não são zero no negócio real).',
      'Aviso: O saldo de caixa após custos comerciais NÃO constitui lucro líquido do empreendimento completo.',
    ],
  }
}

// Exportação para os dois runtimes: JSVM (globalThis) e módulo ES (navegador).
if (typeof globalThis !== 'undefined') {
  globalThis.vb_resolverValorMes = vb_resolverValorMes
  globalThis.vb_formatarBRL = vb_formatarBRL
  globalThis.vb_formatarPorcentagem = vb_formatarPorcentagem
  globalThis.vb_validarPremissas = vb_validarPremissas
  globalThis.vb_calcularSimulacao = vb_calcularSimulacao
  globalThis.VB_MOTOR_VERSAO = VB_MOTOR_VERSAO
}
