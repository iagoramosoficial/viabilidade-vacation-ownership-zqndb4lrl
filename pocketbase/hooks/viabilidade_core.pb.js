// pocketbase/hooks/viabilidade_core.pb.js
// Cópia idêntica de pocketbase/core/viabilidade_core.js para carregamento direto via require(`${__hooks}/viabilidade_core.pb.js`) no JSVM do PocketBase.

'use strict'

var VB_MOTOR_VERSAO = 'v1.4.1'

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

// Hash determinístico simples (DJB2 / FNV-1a híbrido) para rastreabilidade
function vb_gerarHashPremissas(premissas) {
  var str = ''
  try {
    str = JSON.stringify(premissas) || ''
  } catch (_) {
    str = String(premissas || '')
  }
  var h = 5381
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i)
    h = h & h // converte para 32-bit int
  }
  var hex = (h >>> 0).toString(16)
  while (hex.length < 8) hex = '0' + hex
  return 'sha_' + hex
}

// ---------- Validação de premissas (bloqueante, antes do cálculo) ----------
function vb_validarPremissas(premissas, horizonte) {
  // Cada pendência é um objeto:
  // { mensagem: texto claro em português indicando a aba onde se resolve,
  //   caminho: caminho técnico do campo (exibido em tooltip somente para master),
  //   aba: aba do formulário onde a pendência se resolve }
  var erros = []
  var h = Math.max(1, Number(horizonte) || 12)
  function pend(aba, mensagem, caminho) {
    erros.push({ mensagem: mensagem, caminho: caminho || '', aba: aba })
  }
  function isNum(v) {
    return typeof v === 'number' && isFinite(v)
  }
  // null / undefined / string vazia = campo NÃO informado (pendência). 0 digitado é valor válido.
  function vazio(v) {
    return v === undefined || v === null || v === ''
  }
  function pegaBase(v, onde, aba, mensagem) {
    if (vazio(v)) {
      pend(aba, mensagem, onde)
      return
    }
    if (typeof v === 'number') {
      if (!isFinite(v)) pend(aba, mensagem, onde)
      return
    }
    if (!v || typeof v !== 'object') {
      pend(aba, mensagem, onde)
      return
    }
    if (vazio(v.base) || !isNum(v.base)) pend(aba, mensagem, onde + '.base')
  }
  function pegaPerc(v, onde, aba, mensagem) {
    pegaBase(v, onde, aba, mensagem)
    var bruto = typeof v === 'number' ? v : v && v.base
    if (isNum(bruto) && (bruto < 0 || bruto > 1))
      pend(aba, mensagem + ' — informe um valor entre 0% e 100%', onde)
  }
  function pegaAjustes(v, onde, aba) {
    if (v && typeof v === 'object' && v.ajustes) {
      if (typeof v.ajustes !== 'object')
        pend(aba, onde + ': ajustes mensais inválidos', onde + '.ajustes')
      else {
        for (var k in v.ajustes) {
          if (!isNum(Number(v.ajustes[k])))
            pend(aba, onde + ': ajuste do mês ' + k + ' deve ser um número', onde + '.ajustes.' + k)
          var km = Number(k)
          if (!isFinite(km) || km < 0 || km >= h)
            pend(
              aba,
              onde + ': ajuste do mês ' + k + ' está fora do horizonte do estudo',
              onde + '.ajustes.' + k,
            )
        }
      }
    }
  }
  function pegaVM(v, onde, aba, mensagem) {
    pegaBase(v, onde, aba, mensagem)
    pegaAjustes(v, onde, aba)
  }
  function rv(v) {
    if (v === undefined || v === null) return 0
    if (typeof v === 'number') return v
    if (v && typeof v === 'object') return Number(v.base || 0)
    return 0
  }

  if (!premissas || typeof premissas !== 'object') {
    pend('funil', 'Premissas ausentes ou inválidas — recarregue o cenário', '')
    return erros
  }

  var salas = premissas.salas || []
  var produtos = premissas.produtos || []
  var mix = premissas.mix_por_sala || []
  var cp = premissas.condicoes_pagamento
  var ci = premissas.cancelamentos_inadimplencia
  var rem = premissas.remuneracoes || []
  var cd = premissas.custos_despesas || []
  var inv = premissas.investimentos || []
  var caixa = premissas.caixa_inicial

  var idsSalas = {}
  var idsProdutos = {}
  var idsSalasComMix = {}
  var idsSalasComPonto = {}
  var nomesSalas = {}
  var numSalasComPonto = 0
  var numSalasComMix = 0
  var modalidadesPresentes = {}

  if (!Array.isArray(salas))
    pend('funil', 'Cadastre ao menos 1 sala de vendas com ponto de captação', 'premissas.salas')
  else {
    if (salas.length === 0)
      pend(
        'funil',
        'Cadastre ao menos 1 sala de vendas com ponto de captação (aba Salas e Funil)',
        'premissas.salas',
      )
    salas.forEach(function (sala, i) {
      var onde = 'salas[' + i + ']'
      var nomeSala = sala && sala.nome ? '"' + sala.nome + '"' : 'sem nome'
      if (!sala || typeof sala !== 'object')
        return pend('funil', 'Salas e Funil › há uma sala inválida na lista', onde)
      if (!sala.id)
        pend(
          'funil',
          'Salas e Funil › sala ' +
            nomeSala +
            ' está sem identificação — salve o cenário e recarregue',
          onde + '.id',
        )
      else if (idsSalas[sala.id])
        pend('funil', 'Salas e Funil › sala ' + nomeSala + ' está duplicada', onde + '.id')
      else idsSalas[sala.id] = true
      nomesSalas[sala.id] = sala.nome || sala.id
      pegaVM(
        sala.capacidade_mensal,
        onde + '.capacidade_mensal',
        'funil',
        'Salas e Funil › sala ' + nomeSala + ': informe a capacidade mensal de atendimentos',
      )
      if (rv(sala.capacidade_mensal) < 0)
        pend(
          'funil',
          'Salas e Funil › sala ' + nomeSala + ': a capacidade mensal não pode ser negativa',
          onde + '.capacidade_mensal',
        )
      if (!Array.isArray(sala.pontos))
        pend(
          'funil',
          'Salas e Funil › sala ' + nomeSala + ': cadastre ao menos 1 ponto de captação',
          onde + '.pontos',
        )
      else {
        var idsPontos = {}
        var temPontoAtivo = false
        sala.pontos.forEach(function (ponto, j) {
          var ondeP = onde + '.pontos[' + j + ']'
          var nomePonto = ponto && ponto.nome ? '"' + ponto.nome + '"' : 'sem nome'
          if (!ponto || typeof ponto !== 'object')
            return pend(
              'funil',
              'Salas e Funil › há um ponto de captação inválido na sala ' + nomeSala,
              ondeP,
            )
          if (!ponto.id)
            pend(
              'funil',
              'Salas e Funil › ponto ' +
                nomePonto +
                ' está sem identificação — salve o cenário e recarregue',
              ondeP + '.id',
            )
          else if (idsPontos[ponto.id])
            pend(
              'funil',
              'Salas e Funil › ponto ' + nomePonto + ' está duplicado na sala ' + nomeSala,
              ondeP + '.id',
            )
          else idsPontos[ponto.id] = true
          if (ponto.sala_id !== sala.id)
            pend(
              'funil',
              'Salas e Funil › ponto ' +
                nomePonto +
                ' está vinculado a outra sala — salve o cenário e recarregue',
              ondeP + '.sala_id',
            )
          if (
            ['abordados', 'qualificados', 'convidados', 'comparecidos'].indexOf(
              ponto.etapa_entrada,
            ) < 0
          )
            pend(
              'funil',
              'Salas e Funil › ponto ' + nomePonto + ': selecione a etapa de entrada conhecida',
              ondeP + '.etapa_entrada',
            )
          pegaVM(
            ponto.volume_entrada,
            ondeP + '.volume_entrada',
            'funil',
            'Salas e Funil › ponto ' +
              nomePonto +
              ': informe o volume de entrada mensal (0 é válido)',
          )
          if (rv(ponto.volume_entrada) < 0)
            pend(
              'funil',
              'Salas e Funil › ponto ' + nomePonto + ': o volume de entrada não pode ser negativo',
              ondeP + '.volume_entrada',
            )
          ;[
            ['taxa_qualificados', 'a taxa de qualificados'],
            ['taxa_convidados', 'a taxa de convidados/agendados'],
            ['taxa_comparecimento', 'a taxa de comparecimento'],
            ['taxa_conversao_venda', 'a taxa de conversão em venda'],
          ].forEach(function (par) {
            var campo = par[0]
            if (ponto[campo] !== undefined) {
              pegaPerc(
                ponto[campo],
                ondeP + '.' + campo,
                'funil',
                'Salas e Funil › ponto ' + nomePonto + ': informe ' + par[1] + ' (0% é válido)',
              )
            }
          })

          pegaVM(
            ponto.custo_transporte_unitario,
            ondeP + '.custo_transporte_unitario',
            'funil',
            'Salas e Funil › ponto ' +
              nomePonto +
              ': informe o custo do transporte por casal (0 é válido)',
          )
          if (rv(ponto.custo_transporte_unitario) < 0)
            pend(
              'funil',
              'Salas e Funil › ponto ' +
                nomePonto +
                ': o custo do transporte não pode ser negativo',
              ondeP + '.custo_transporte_unitario',
            )
          if (
            !vazio(ponto.responsavel_transporte) &&
            ['comercializadora', 'empreendimento'].indexOf(ponto.responsavel_transporte) < 0
          ) {
            pend(
              'funil',
              'Salas e Funil › ponto ' +
                nomePonto +
                ': quem paga o transporte deve ser Comercializadora ou Empreendimento',
              ondeP + '.responsavel_transporte',
            )
          }
          if (rv(ponto.custo_transporte_unitario) > 0 && vazio(ponto.responsavel_transporte)) {
            pend(
              'funil',
              'Salas e Funil › ponto ' +
                nomePonto +
                ': o ponto tem custo de transporte — informe quem paga (Comercializadora ou Empreendimento)',
              ondeP + '.responsavel_transporte',
            )
          }
          temPontoAtivo = true
          idsSalasComPonto[sala.id] = true
          numSalasComPonto++
        })
        if (!temPontoAtivo)
          pend(
            'funil',
            'Salas e Funil › sala ' + nomeSala + ': cadastre ao menos 1 ponto de captação',
            onde + '.pontos',
          )
      }
    })
  }
  if (numSalasComPonto === 0)
    pend(
      'funil',
      'Cadastre ao menos 1 sala de vendas com ponto de captação (aba Salas e Funil)',
      'premissas.salas',
    )

  if (!Array.isArray(produtos))
    pend(
      'produtos',
      'Produtos e Mix › cadastre ao menos 1 produto para o empreendimento',
      'premissas.produtos',
    )
  else {
    if (produtos.length === 0)
      pend(
        'produtos',
        'Produtos e Mix › cadastre ao menos 1 produto para o empreendimento (aba Produtos e Mix)',
        'premissas.produtos',
      )
    produtos.forEach(function (prod, i) {
      var onde = 'produtos[' + i + ']'
      var nomeProd = prod && prod.nome ? '"' + prod.nome + '"' : 'sem nome'
      if (!prod || typeof prod !== 'object')
        return pend('produtos', 'Produtos e Mix › há um produto inválido na lista', onde)
      if (!prod.id)
        pend(
          'produtos',
          'Produtos e Mix › produto ' +
            nomeProd +
            ' está sem identificação — salve o cenário e recarregue',
          onde + '.id',
        )
      else if (idsProdutos[prod.id])
        pend('produtos', 'Produtos e Mix › produto ' + nomeProd + ' está duplicado', onde + '.id')
      else idsProdutos[prod.id] = true
      if (['multipropriedade', 'timeshare'].indexOf(prod.modalidade) < 0)
        pend(
          'produtos',
          'Produtos e Mix › produto ' +
            nomeProd +
            ': selecione a modalidade (Multipropriedade ou Timeshare)',
          onde + '.modalidade',
        )
      else modalidadesPresentes[prod.modalidade] = true
      pegaVM(
        prod.preco,
        onde + '.preco',
        'produtos',
        'Produtos e Mix › produto ' + nomeProd + ': informe o preço de venda (0 é válido)',
      )
      if (rv(prod.preco) < 0)
        pend(
          'produtos',
          'Produtos e Mix › produto ' + nomeProd + ': o preço de venda não pode ser negativo',
          onde + '.preco',
        )
      if (!isNum(Number(prod.estoque_disponivel)))
        pend(
          'produtos',
          'Produtos e Mix › produto ' +
            nomeProd +
            ': informe o estoque disponível de unidades (0 é válido)',
          onde + '.estoque_disponivel',
        )
      else if (Number(prod.estoque_disponivel) < 0)
        pend(
          'produtos',
          'Produtos e Mix › produto ' + nomeProd + ': o estoque disponível não pode ser negativo',
          onde + '.estoque_disponivel',
        )
    })
  }

  if (!Array.isArray(mix))
    erros.push({
      mensagem: 'Produtos e Mix › mix de vendas inválido',
      caminho: 'premissas.mix_por_sala',
      aba: 'produtos',
    })
  else {
    mix.forEach(function (ms, i) {
      var onde = 'mix_por_sala[' + i + ']'
      var nomeSalaMix = nomesSalas[ms && ms.sala_id] || (ms && ms.sala_id) || 'sem nome'
      if (!ms || typeof ms !== 'object')
        return erros.push({
          mensagem: 'Produtos e Mix › há um mix inválido na lista',
          caminho: onde,
          aba: 'produtos',
        })
      if (!idsSalas[ms.sala_id])
        erros.push({
          mensagem:
            'Produtos e Mix › o mix está vinculado a uma sala que não existe — salve o cenário e recarregue',
          caminho: onde + '.sala_id',
          aba: 'produtos',
        })
      else idsSalasComMix[ms.sala_id] = true
      if (!Array.isArray(ms.produtos))
        erros.push({
          mensagem:
            'Produtos e Mix › sala ' +
            nomeSalaMix +
            ': defina o mix de produtos vendidos pela sala',
          caminho: onde + '.produtos',
          aba: 'produtos',
        })
      else {
        var soma = 0
        ms.produtos.forEach(function (mp, j) {
          var ondeM = onde + '.produtos[' + j + ']'
          if (!mp || typeof mp !== 'object')
            return erros.push({
              mensagem: 'Produtos e Mix › sala ' + nomeSalaMix + ': há um item de mix inválido',
              caminho: ondeM,
              aba: 'produtos',
            })
          if (!idsProdutos[mp.produto_id])
            erros.push({
              mensagem:
                'Produtos e Mix › sala ' +
                nomeSalaMix +
                ': um item do mix está vinculado a um produto que não existe — salve o cenário e recarregue',
              caminho: ondeM + '.produto_id',
              aba: 'produtos',
            })
          pegaPerc(
            mp.percentual,
            ondeM + '.percentual',
            'produtos',
            'Produtos e Mix › sala ' +
              nomeSalaMix +
              ': informe o percentual de participação do produto no mix (0% é válido)',
          )
          var v = rv(mp.percentual)
          soma += v
        })
        if (soma > 1.0001)
          erros.push({
            mensagem:
              'Produtos e Mix › sala ' +
              nomeSalaMix +
              ': a soma dos percentuais do mix (' +
              Math.round(soma * 100) +
              '%) excede 100%',
            caminho: onde + '.produtos',
            aba: 'produtos',
          })
        else if (soma < 0.9999)
          erros.push({
            mensagem:
              'Produtos e Mix › sala ' +
              nomeSalaMix +
              ': a soma dos percentuais do mix (' +
              Math.round(soma * 100) +
              '%) não fecha 100% — a sala vende apenas o mix informado',
            caminho: onde + '.produtos',
            aba: 'produtos',
          })
      }
    })
  }

  salas.forEach(function (sala) {
    if (sala && sala.id && idsSalasComPonto[sala.id] && !idsSalasComMix[sala.id]) {
      erros.push({
        mensagem:
          'Produtos e Mix › sala "' +
          (sala.nome || sala.id) +
          '" não tem mix definido — informe quais produtos a sala vende e em qual proporção (o mix fecha 100%)',
        caminho: 'premissas.mix_por_sala',
        aba: 'produtos',
      })
    }
  })

  if (!cp || typeof cp !== 'object') {
    if (modalidadesPresentes['multipropriedade'] || modalidadesPresentes['timeshare'])
      pend(
        'pagamento',
        'Pagamento › informe as condições de pagamento das modalidades com produtos cadastrados',
        'premissas.condicoes_pagamento',
      )
  } else {
    function validaCond(mod) {
      if (!modalidadesPresentes[mod]) return // sem produto da modalidade, o bloco é ignorado
      var nomeMod = mod === 'multipropriedade' ? 'Multipropriedade' : 'Timeshare'
      var cond = cp[mod]
      if (!cond) {
        pend(
          'pagamento',
          'Pagamento › ' +
            nomeMod +
            ': informe as condições de pagamento (entrada, parcelas e saldo)',
          'premissas.condicoes_pagamento.' + mod,
        )
        return
      }
      var onde = 'condicoes_pagamento.' + mod
      pegaPerc(
        cond.perc_entrada,
        onde + '.perc_entrada',
        'pagamento',
        'Pagamento › ' + nomeMod + ': informe o percentual de entrada (0% é válido)',
      )
      if (!isNum(Number(cond.parcelas_entrada)) || Number(cond.parcelas_entrada) < 1)
        pend(
          'pagamento',
          'Pagamento › ' + nomeMod + ': informe em quantas parcelas a entrada é paga (mínimo 1)',
          onde + '.parcelas_entrada',
        )
      if (!isNum(Number(cond.mes_primeira_saldo)) || Number(cond.mes_primeira_saldo) < 0)
        pend(
          'pagamento',
          'Pagamento › ' +
            nomeMod +
            ': informe em qual mês começa o pagamento do saldo (0 = já no primeiro mês)',
          onde + '.mes_primeira_saldo',
        )
      if (!isNum(Number(cond.parcelas_saldo)) || Number(cond.parcelas_saldo) < 0)
        pend(
          'pagamento',
          'Pagamento › ' + nomeMod + ': informe em quantas parcelas o saldo é pago (0 é válido)',
          onde + '.parcelas_saldo',
        )
    }
    validaCond('multipropriedade')
    validaCond('timeshare')
  }

  if (!ci || typeof ci !== 'object') {
    if (modalidadesPresentes['multipropriedade'] || modalidadesPresentes['timeshare'])
      pend(
        'cancelamento',
        'Cancelamentos › informe as regras de cancelamento e inadimplência das modalidades com produtos cadastrados',
        'premissas.cancelamentos_inadimplencia',
      )
  } else {
    function validaCancInad(mod) {
      if (!modalidadesPresentes[mod]) return // sem produto da modalidade, o bloco é ignorado
      var nomeMod = mod === 'multipropriedade' ? 'Multipropriedade' : 'Timeshare'
      var cfg = ci[mod]
      if (!cfg) {
        pend(
          'cancelamento',
          'Cancelamentos › ' +
            nomeMod +
            ': informe as regras de cancelamento e inadimplência da modalidade',
          'premissas.cancelamentos_inadimplencia.' + mod,
        )
        return
      }
      var onde = 'cancelamentos_inadimplencia.' + mod
      var c = cfg.cancelamento
      if (c) {
        pegaPerc(
          c.taxa,
          onde + '.cancelamento.taxa',
          'cancelamento',
          'Cancelamentos › ' + nomeMod + ': informe a taxa de cancelamento (0% é válido)',
        )
        if (!isNum(Number(c.mes_medio)) || Number(c.mes_medio) < 0)
          pend(
            'cancelamento',
            'Cancelamentos › ' +
              nomeMod +
              ': informe o mês médio em que o cancelamento ocorre (0 é válido)',
            onde + '.cancelamento.mes_medio',
          )
        pegaPerc(
          c.taxa_devolucao,
          onde + '.cancelamento.taxa_devolucao',
          'cancelamento',
          'Cancelamentos › ' +
            nomeMod +
            ': informe o percentual devolvido no cancelamento (0% é válido)',
        )
        if (!isNum(Number(c.prazo_devolucao)) || Number(c.prazo_devolucao) < 1)
          pend(
            'cancelamento',
            'Cancelamentos › ' +
              nomeMod +
              ': informe em quantos meses a devolução é paga (mínimo 1)',
            onde + '.cancelamento.prazo_devolucao',
          )
      }
      var inad = cfg.inadimplencia
      if (inad) {
        pegaPerc(
          inad.taxa,
          onde + '.inadimplencia.taxa',
          'cancelamento',
          'Cancelamentos › ' + nomeMod + ': informe a taxa de inadimplência (0% é válido)',
        )
        pegaPerc(
          inad.parcela_recuperavel,
          onde + '.inadimplencia.parcela_recuperavel',
          'cancelamento',
          'Cancelamentos › ' +
            nomeMod +
            ': informe o percentual recuperável das parcelas inadimplidas (0% é válido)',
        )
        if (!isNum(Number(inad.prazo_recuperacao)) || Number(inad.prazo_recuperacao) < 1)
          pend(
            'cancelamento',
            'Cancelamentos › ' +
              nomeMod +
              ': informe em quantos meses a parcela inadimplida é recuperada (mínimo 1)',
            onde + '.inadimplencia.prazo_recuperacao',
          )
      }
    }
    validaCancInad('multipropriedade')
    validaCancInad('timeshare')
  }

  if (!Array.isArray(rem))
    erros.push({
      mensagem: 'Remuneração › a lista de remunerações está ausente ou inválida',
      caminho: 'premissas.remuneracoes',
      aba: 'remuneracao',
    })
  else {
    rem.forEach(function (r, i) {
      var onde = 'remuneracoes[' + i + ']'
      var descR = r && r.descricao ? '"' + r.descricao + '"' : 'item ' + (i + 1)
      if (!r || typeof r !== 'object')
        return erros.push({
          mensagem: 'Remuneração › há uma remuneração inválida na lista',
          caminho: onde,
          aba: 'remuneracao',
        })
      if (['fixo', 'perc_vgv', 'perc_recebimento', 'retencao_entrada'].indexOf(r.tipo) < 0)
        erros.push({
          mensagem:
            'Remuneração › ' +
            descR +
            ': selecione o tipo de remuneração (fixo, % do VGV, % do recebimento ou retenção de entrada)',
          caminho: onde + '.tipo',
          aba: 'remuneracao',
        })
      if (['adicional', 'compensavel'].indexOf(r.adicional_ou_compensavel) < 0)
        erros.push({
          mensagem:
            'Remuneração › ' + descR + ': informe se a remuneração é adicional ou compensável',
          caminho: onde + '.adicional_ou_compensavel',
          aba: 'remuneracao',
        })
      pegaVM(
        r.valor,
        onde + '.valor',
        'remuneracao',
        'Remuneração › ' + descR + ': informe o valor da remuneração (0 é válido)',
      )
      if (
        (r.tipo === 'perc_vgv' || r.tipo === 'perc_recebimento' || r.tipo === 'retencao_entrada') &&
        isNum(rv(r.valor)) &&
        (rv(r.valor) < 0 || rv(r.valor) > 1)
      )
        erros.push({
          mensagem: 'Remuneração › ' + descR + ': o percentual deve estar entre 0% e 100%',
          caminho: onde + '.valor',
          aba: 'remuneracao',
        })
      if (r.tipo === 'fixo' && rv(r.valor) < 0)
        erros.push({
          mensagem: 'Remuneração › ' + descR + ': o valor não pode ser negativo',
          caminho: onde + '.valor',
          aba: 'remuneracao',
        })
    })
  }

  if (!Array.isArray(cd))
    erros.push({
      mensagem: 'Custos e Investimentos › a lista de custos e despesas está ausente ou inválida',
      caminho: 'premissas.custos_despesas',
      aba: 'custos',
    })
  else {
    cd.forEach(function (d, i) {
      var onde = 'custos_despesas[' + i + ']'
      var descD = d && d.descricao ? '"' + d.descricao + '"' : 'item ' + (i + 1)
      if (!d || typeof d !== 'object')
        return erros.push({
          mensagem: 'Custos e Investimentos › há um custo ou despesa inválido na lista',
          caminho: onde,
          aba: 'custos',
        })
      if (['fixo', 'por_atendimento', 'por_venda', 'perc_vgv'].indexOf(d.tipo) < 0)
        erros.push({
          mensagem:
            'Custos e Investimentos › ' +
            descD +
            ': selecione o tipo de custo (fixo, por atendimento, por venda ou % do VGV)',
          caminho: onde + '.tipo',
          aba: 'custos',
        })
      if (['comercializadora', 'empreendimento'].indexOf(d.responsavel_economico) < 0)
        erros.push({
          mensagem:
            'Custos e Investimentos › ' +
            descD +
            ': informe o responsável econômico (Comercializadora ou Empreendimento)',
          caminho: onde + '.responsavel_economico',
          aba: 'custos',
        })
      if (
        d.pagador_inicial !== undefined &&
        d.pagador_inicial !== null &&
        ['comercializadora', 'empreendimento'].indexOf(d.pagador_inicial) < 0
      )
        erros.push({
          mensagem:
            'Custos e Investimentos › ' +
            descD +
            ': o pagador inicial deve ser Comercializadora ou Empreendimento',
          caminho: onde + '.pagador_inicial',
          aba: 'custos',
        })
      pegaVM(
        d.valor,
        onde + '.valor',
        'custos',
        'Custos e Investimentos › ' + descD + ': informe o valor do custo (0 é válido)',
      )
      if (d.tipo === 'perc_vgv' && isNum(rv(d.valor)) && (rv(d.valor) < 0 || rv(d.valor) > 1))
        erros.push({
          mensagem:
            'Custos e Investimentos › ' + descD + ': o percentual deve estar entre 0% e 100%',
          caminho: onde + '.valor',
          aba: 'custos',
        })
      if (d.tipo !== 'perc_vgv' && rv(d.valor) < 0)
        erros.push({
          mensagem: 'Custos e Investimentos › ' + descD + ': o valor não pode ser negativo',
          caminho: onde + '.valor',
          aba: 'custos',
        })
      if (d.ponto_id && !d.sala_id)
        erros.push({
          mensagem:
            'Custos e Investimentos › ' +
            descD +
            ': um custo de ponto precisa indicar a sala à qual pertence',
          caminho: onde + '.sala_id',
          aba: 'custos',
        })
      if (d.sala_id && !idsSalas[d.sala_id])
        erros.push({
          mensagem:
            'Custos e Investimentos › ' +
            descD +
            ': o custo está vinculado a uma sala que não existe — salve o cenário e recarregue',
          caminho: onde + '.sala_id',
          aba: 'custos',
        })
      if (d.ponto_id) {
        var achou = false
        salas.forEach(function (sala) {
          if (sala.id !== d.sala_id || !Array.isArray(sala.pontos)) return
          sala.pontos.forEach(function (ponto) {
            if (ponto.id === d.ponto_id) achou = true
          })
        })
        if (!achou)
          erros.push({
            mensagem:
              'Custos e Investimentos › ' +
              descD +
              ': o custo está vinculado a um ponto que não pertence à sala indicada — salve o cenário e recarregue',
            caminho: onde + '.ponto_id',
            aba: 'custos',
          })
      }
      if (
        d.prazo_pagamento_meses !== undefined &&
        (!isNum(Number(d.prazo_pagamento_meses)) || Number(d.prazo_pagamento_meses) < 0)
      )
        erros.push({
          mensagem:
            'Custos e Investimentos › ' +
            descD +
            ': o prazo de pagamento em meses não pode ser negativo',
          caminho: onde + '.prazo_pagamento_meses',
          aba: 'custos',
        })
      if (
        d.prazo_reembolso_meses !== undefined &&
        (!isNum(Number(d.prazo_reembolso_meses)) || Number(d.prazo_reembolso_meses) < 0)
      )
        erros.push({
          mensagem:
            'Custos e Investimentos › ' +
            descD +
            ': o prazo de reembolso em meses não pode ser negativo',
          caminho: onde + '.prazo_reembolso_meses',
          aba: 'custos',
        })
    })
  }

  if (!Array.isArray(inv))
    erros.push({
      mensagem: 'Custos e Investimentos › a lista de investimentos está ausente ou inválida',
      caminho: 'premissas.investimentos',
      aba: 'custos',
    })
  else {
    inv.forEach(function (v, i) {
      var onde = 'investimentos[' + i + ']'
      var descV = v && v.descricao ? '"' + v.descricao + '"' : 'item ' + (i + 1)
      if (!v || typeof v !== 'object')
        return erros.push({
          mensagem: 'Custos e Investimentos › há um investimento inválido na lista',
          caminho: onde,
          aba: 'custos',
        })
      if (!isNum(Number(v.mes)) || Number(v.mes) < 0)
        erros.push({
          mensagem:
            'Custos e Investimentos › ' + descV + ': informe o mês do investimento (0 é válido)',
          caminho: onde + '.mes',
          aba: 'custos',
        })
      if (!isNum(Number(v.valor)) || Number(v.valor) < 0)
        erros.push({
          mensagem:
            'Custos e Investimentos › ' + descV + ': informe o valor do investimento (0 é válido)',
          caminho: onde + '.valor',
          aba: 'custos',
        })
      if (['comercializadora', 'empreendimento'].indexOf(v.parte) < 0)
        erros.push({
          mensagem:
            'Custos e Investimentos › ' +
            descV +
            ': informe qual parte investe (Comercializadora ou Empreendimento)',
          caminho: onde + '.parte',
          aba: 'custos',
        })
      if (
        ['obra/reforma', 'mobiliario/equipamentos', 'projetos e implantacao'].indexOf(v.categoria) <
        0
      )
        erros.push({
          mensagem: 'Custos e Investimentos › ' + descV + ': selecione a categoria do investimento',
          caminho: onde + '.categoria',
          aba: 'custos',
        })
    })
  }

  if (!caixa || typeof caixa !== 'object') {
    erros.push({
      mensagem:
        'Custos e Investimentos › informe o caixa inicial da Comercializadora e do Empreendimento (0 é válido)',
      caminho: 'premissas.caixa_inicial',
      aba: 'custos',
    })
  } else {
    if (vazio(caixa.comercializadora) || !isNum(Number(caixa.comercializadora))) {
      erros.push({
        mensagem:
          'Custos e Investimentos › informe o caixa inicial da Comercializadora (0 é válido)',
        caminho: 'premissas.caixa_inicial.comercializadora',
        aba: 'custos',
      })
    } else if (Number(caixa.comercializadora) < 0) {
      erros.push({
        mensagem:
          'Custos e Investimentos › o caixa inicial da Comercializadora não pode ser negativo',
        caminho: 'premissas.caixa_inicial.comercializadora',
        aba: 'custos',
      })
    }
    if (vazio(caixa.empreendimento) || !isNum(Number(caixa.empreendimento))) {
      erros.push({
        mensagem: 'Custos e Investimentos › informe o caixa inicial do Empreendimento (0 é válido)',
        caminho: 'premissas.caixa_inicial.empreendimento',
        aba: 'custos',
      })
    } else if (Number(caixa.empreendimento) < 0) {
      erros.push({
        mensagem:
          'Custos e Investimentos › o caixa inicial do Empreendimento não pode ser negativo',
        caminho: 'premissas.caixa_inicial.empreendimento',
        aba: 'custos',
      })
    }
  }

  return erros
}

// ---------- Motor determinístico ----------
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
          comparecidos = volEntrada
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
          responsavel_transporte: ponto.responsavel_transporte,
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
          responsavel_transporte: pd.responsavel_transporte,
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

  // ===== 2. Cobranças esperadas por GRUPO DE VENDA =====
  var carteiraAlemHorizonte = {
    multipropriedade: 0,
    timeshare: 0,
    total: 0,
    devolucoes_a_pagar_alem: 0,
    recuperacoes_a_receber_alem: 0,
    despesas_a_pagar_alem: 0,
  }
  var cobrancasEsperadas = {}
  var gruposVenda = []

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

  // ===== 3. Cancelamento e inadimplência =====
  var recebimentosEfetivos = {}
  var recebimentosEntradaEfetivos = {}
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
    recebimentosEntradaEfetivos[r1] = 0
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

    var fracAtiva = 1 - taxaCanc
    var fracCanc = taxaCanc

    gruposVenda.forEach(function (grupo) {
      if (grupo.mod !== mod) return
      var mesCancelamento = grupo.mes + mesMedio
      var recebidoCancLiquidoAntes = 0

      grupo.cobrancas.forEach(function (cob) {
        if (fracAtiva > 0) {
          var valAtivo = cob.valor * fracAtiva
          var inadAtivo = valAtivo * taxaInad
          var recupAtivo = inadAtivo * percRecup
          var perdaAtivo = inadAtivo - recupAtivo
          var recLiqAtivo = valAtivo - inadAtivo

          if (cob.mes < horizonte) {
            recebimentosEfetivos[cob.mes][mod] += recLiqAtivo
            recebimentosEfetivos[cob.mes].total_recebido += recLiqAtivo
            recebimentosEfetivos[cob.mes].inadimplencia_perdida += perdaAtivo
            if (cob.tipo === 'entrada') {
              recebimentosEntradaEfetivos[cob.mes] += recLiqAtivo
            }
          } else {
            carteiraAlemHorizonte[mod] += recLiqAtivo
            carteiraAlemHorizonte.total += recLiqAtivo
          }

          if (recupAtivo > 0) {
            var mesRecupAtivo = cob.mes + prazoRecup
            if (mesRecupAtivo < horizonte) {
              recuperacoesAgendadas[mesRecupAtivo] += recupAtivo
            } else {
              carteiraAlemHorizonte.recuperacoes_a_receber_alem += recupAtivo
            }
          }
        }

        if (fracCanc > 0) {
          if (cob.mes < mesCancelamento) {
            var valCanc = cob.valor * fracCanc
            var inadCanc = valCanc * taxaInad
            var recupCanc = inadCanc * percRecup
            var perdaCanc = inadCanc - recupCanc
            var recLiqCanc = valCanc - inadCanc

            recebidoCancLiquidoAntes += recLiqCanc

            if (cob.mes < horizonte) {
              recebimentosEfetivos[cob.mes][mod] += recLiqCanc
              recebimentosEfetivos[cob.mes].total_recebido += recLiqCanc
              recebimentosEfetivos[cob.mes].inadimplencia_perdida += perdaCanc
              if (cob.tipo === 'entrada') {
                recebimentosEntradaEfetivos[cob.mes] += recLiqCanc
              }
            } else {
              carteiraAlemHorizonte[mod] += recLiqCanc
              carteiraAlemHorizonte.total += recLiqCanc
            }

            if (recupCanc > 0) {
              var mesRecupCanc = cob.mes + prazoRecup
              if (mesRecupCanc < horizonte) {
                recuperacoesAgendadas[mesRecupCanc] += recupCanc
              } else {
                carteiraAlemHorizonte.recuperacoes_a_receber_alem += recupCanc
              }
            }
          }
        }
      })

      if (fracCanc > 0 && taxaDevolucao > 0 && recebidoCancLiquidoAntes > 0) {
        var valorDevolver = recebidoCancLiquidoAntes * taxaDevolucao
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

  var reembolsosGlobais = []

  for (var fm = 0; fm < horizonte; fm++) {
    var vgvMes = funilMensal[fm].total_vgv_mes
    var recMes = recebimentosEfetivos[fm].total_recebido

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

    var custosComercializadoraMes = 0
    var custosEmpreendimentoMes = 0
    var detalhesCustosMes = []

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
        atendimentosEscopo = funilMensal[fm].total_atendimentos_mes
        vendasEscopo = funilMensal[fm].total_vendas_mes
        vgvEscopo = vgvMes
      } else if (salaEscopo) {
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
          atendimentosEscopo = atendPonto
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

      if (mesPagamento === fm) {
        if (pagador === 'comercializadora') custosComercializadoraMes += valorItem
        else custosEmpreendimentoMes += valorItem
      } else if (mesPagamento >= horizonte) {
        carteiraAlemHorizonte.despesas_a_pagar_alem += valorItem
      }

      if (pagador !== resp) {
        var prazoReemb = Math.max(
          0,
          Math.round(
            Number(cdItem.prazo_reembolso_meses === undefined ? 1 : cdItem.prazo_reembolso_meses),
          ),
        )
        var mesReemb = mesPagamento + prazoReemb
        reembolsosGlobais.push({
          mes: mesReemb,
          pagador: pagador,
          resp: resp,
          valor: valorItem,
          descricao: 'Reembolso de despesa paga antecipadamente por ' + pagador,
        })
      }
    })

    for (var mPrev = 0; mPrev < fm; mPrev++) {
      custosDespesas.forEach(function (cdPrev) {
        var prazoP = Math.max(
          0,
          Math.round(
            Number(cdPrev.prazo_pagamento_meses === undefined ? 0 : cdPrev.prazo_pagamento_meses),
          ),
        )
        if (mPrev + prazoP !== fm) return
        var pagadorP = cdPrev.pagador_inicial || cdPrev.responsavel_economico || 'comercializadora'
        var vUnitP = rv(cdPrev.valor, mPrev)
        var valorItemP = 0
        var tipoP = cdPrev.tipo

        var atendEscP = 0
        var vendEscP = 0
        var vgvEscP = 0
        var temEscP = !!cdPrev.sala_id || !!cdPrev.ponto_id
        var salaEscP = null
        funilMensal[mPrev].salas.forEach(function (s) {
          if (cdPrev.sala_id && s.sala_id === cdPrev.sala_id) salaEscP = s
        })

        if (!temEscP) {
          atendEscP = funilMensal[mPrev].total_atendimentos_mes
          vendEscP = funilMensal[mPrev].total_vendas_mes
          vgvEscP = funilMensal[mPrev].total_vgv_mes
        } else if (salaEscP) {
          atendEscP = salaEscP.atendimentos_efetivos
          vendasMesProduto.forEach(function (v) {
            if (v.mes === mPrev && v.sala_id === cdPrev.sala_id) {
              vendEscP += v.admitido
              vgvEscP += v.vgv
            }
          })
          if (cdPrev.ponto_id) {
            salaEscP.pontos.forEach(function (pt) {
              if (pt.ponto_id === cdPrev.ponto_id) atendEscP = pt.atendimentos_efetivos
            })
          }
        }

        if (tipoP === 'fixo') valorItemP = vUnitP
        else if (tipoP === 'por_atendimento') valorItemP = atendEscP * vUnitP
        else if (tipoP === 'por_venda') valorItemP = vendEscP * vUnitP
        else if (tipoP === 'perc_vgv') valorItemP = vgvEscP * vUnitP

        if (valorItemP > 0) {
          if (pagadorP === 'comercializadora') custosComercializadoraMes += valorItemP
          else custosEmpreendimentoMes += valorItemP
        }
      })
    }

    // O responsável pelo transporte vem SOMENTE do ponto de captação (validação
    // vb_validarPremissas já bloqueia ponto com custo de transporte > 0 sem
    // responsável informado). Sem inferência, sem default.
    var transportePorResponsavel = { comercializadora: 0, empreendimento: 0 }
    funilMensal[fm].salas.forEach(function (s) {
      s.pontos.forEach(function (pt) {
        if (pt.custo_transporte_total > 0) {
          if (pt.responsavel_transporte === 'empreendimento') {
            transportePorResponsavel.empreendimento += pt.custo_transporte_total
          } else if (pt.responsavel_transporte === 'comercializadora') {
            transportePorResponsavel.comercializadora += pt.custo_transporte_total
          }
        }
      })
    })

    if (transportePorResponsavel.comercializadora > 0) {
      custosComercializadoraMes += transportePorResponsavel.comercializadora
      detalhesCustosMes.push({
        mes_competencia: fm,
        mes_pagamento: fm,
        valor: transportePorResponsavel.comercializadora,
        responsavel: 'comercializadora',
        pagador: 'comercializadora',
        base: 'transporte de captação (comercializadora)',
      })
    }
    if (transportePorResponsavel.empreendimento > 0) {
      custosEmpreendimentoMes += transportePorResponsavel.empreendimento
      detalhesCustosMes.push({
        mes_competencia: fm,
        mes_pagamento: fm,
        valor: transportePorResponsavel.empreendimento,
        responsavel: 'empreendimento',
        pagador: 'empreendimento',
        base: 'transporte de captação (empreendimento)',
      })
    }

    var somaPercVgv = percVgvMes + compensavelPercVgvMes
    var somaPercRecebimento = percRecebimentoMes + compensavelPercRecebimentoMes
    var comissaoVendaMes = vgvMes * somaPercVgv
    var comissaoRecebimentoMes = recMes * somaPercRecebimento
    var remuneracaoComercial =
      fixoComercialMes + compensavelFixoMes + comissaoVendaMes + comissaoRecebimentoMes
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

    var baseEntradaRecebida = recebimentosEntradaEfetivos[fm] || 0
    var retencaoEntradaMes = baseEntradaRecebida * somaRetencaoEntrada
    var retencaoAplicada = Math.min(retencaoEntradaMes, remuneracaoComercial)
    var retencaoNaoAplicada = retencaoEntradaMes - retencaoAplicada
    var repasseLiquidoMes = remuneracaoComercial - retencaoAplicada

    var liquidacaoReembolsoMes = 0
    reembolsosGlobais.forEach(function (r) {
      if (r.mes === fm) {
        if (r.pagador === 'comercializadora' && r.resp === 'empreendimento') {
          liquidacaoReembolsoMes += r.valor
          transferenciasInternas.push({
            mes: fm,
            de: 'empreendimento',
            para: 'comercializadora',
            valor: r.valor,
            descricao: r.descricao,
          })
        } else if (r.pagador === 'empreendimento' && r.resp === 'comercializadora') {
          liquidacaoReembolsoMes -= r.valor
          transferenciasInternas.push({
            mes: fm,
            de: 'comercializadora',
            para: 'empreendimento',
            valor: r.valor,
            descricao: r.descricao,
          })
        }
      }
    })

    // O valor retido na fonte sai dos recebimentos do empreendimento (a comercializadora
    // fica com ele na fonte como forma de pagamento da remuneração, não remuneração adicional).
    // recEmpreendimentoLiquido = recMes - retencaoAplicada
    var recEmpreendimentoLiquido = recMes - retencaoAplicada
    var entradasEmpreendimento =
      recEmpreendimentoLiquido + (liquidacaoReembolsoMes < 0 ? -liquidacaoReembolsoMes : 0)
    var saidasEmpreendimento =
      repasseLiquidoMes +
      custosEmpreendimentoMes +
      devolucoesMes +
      investEmpreendimento +
      (liquidacaoReembolsoMes > 0 ? liquidacaoReembolsoMes : 0)
    var fluxoLiquidoEmpreendimento = entradasEmpreendimento - saidasEmpreendimento
    saldoAcumuladoEmpreendimento += fluxoLiquidoEmpreendimento

    if (saldoAcumuladoEmpreendimento < maiorDeficitEmpreendimento) {
      maiorDeficitEmpreendimento = saldoAcumuladoEmpreendimento
      mesMaiorDeficitEmpreendimento = fm
    }

    var entradasComercial =
      remuneracaoComercial + (liquidacaoReembolsoMes > 0 ? liquidacaoReembolsoMes : 0)
    var saidasComercial =
      custosComercializadoraMes +
      investComercializadora +
      (liquidacaoReembolsoMes < 0 ? -liquidacaoReembolsoMes : 0)
    var fluxoLiquidoComercial = entradasComercial - saidasComercial
    saldoAcumuladoComercializadora += fluxoLiquidoComercial

    if (saldoAcumuladoComercializadora < maiorDeficitComercializadora) {
      maiorDeficitComercializadora = saldoAcumuladoComercializadora
      mesMaiorDeficitComercializadora = fm
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
        para: 'comercializadora',
        valor: retencaoAplicada,
        descricao: 'Retenção de entrada aplicada como remuneração',
      })
    }

    fluxosComercializadora.push({
      mes: fm,
      receita_remuneracao: remuneracaoComercial,
      custos_operacionais: custosComercializadoraMes,
      investimentos: investComercializadora,
      reembolsos_recebidos: liquidacaoReembolsoMes > 0 ? liquidacaoReembolsoMes : 0,
      reembolsos_pagos: liquidacaoReembolsoMes < 0 ? -liquidacaoReembolsoMes : 0,
      fluxo_liquido: fluxoLiquidoComercial,
      saldo_acumulado: saldoAcumuladoComercializadora,
      retencao_aplicada: retencaoAplicada,
      retencao_nao_aplicada: retencaoNaoAplicada,
      remuneracao_adicional: remuneracaoAdicionalMes,
      detalhes_custos: detalhesCustosMes,
    })

    fluxosEmpreendimento.push({
      mes: fm,
      recebimentos_brutos: recEmpreendimentoLiquido,
      repasse_comercial: repasseLiquidoMes,
      custos_proprios: custosEmpreendimentoMes,
      devolucoes: devolucoesMes,
      investimentos: investEmpreendimento,
      reembolsos_pagos: liquidacaoReembolsoMes > 0 ? liquidacaoReembolsoMes : 0,
      reembolsos_recebidos: liquidacaoReembolsoMes < 0 ? -liquidacaoReembolsoMes : 0,
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
    totalReceitaComercial += f.receita_remuneracao + (f.reembolsos_recebidos || 0)
    totalCustosComercial += f.custos_operacionais + (f.reembolsos_pagos || 0)
  })
  var resultadoGerencialComercial = totalReceitaComercial - totalCustosComercial
  var totalInvestEmpreendimento = 0
  var totalCustosEmpreendimento = 0
  var totalRepasses = 0
  var totalRecebimentosLiquidosEmpreendimento = 0
  fluxosEmpreendimento.forEach(function (f) {
    totalRecebimentosLiquidosEmpreendimento += f.recebimentos_brutos
    totalInvestEmpreendimento += f.investimentos
    totalCustosEmpreendimento += f.custos_proprios + (f.reembolsos_pagos || 0)
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
      recebimentos_brutos_total: totalRecebimentosLiquidosEmpreendimento,
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
    avisos_escopo: (function () {
      var lista = [
        'Aviso: O estoque comercial informado não foi validado por capacidade de direitos/hospedagem.',
        'Aviso: Valores nominais sem juros/correção nesta etapa preliminar.',
        'Aviso: Revenda de contratos cancelados não foi simulada; obrigações de uso serão verificadas na etapa de direitos.',
        'Aviso: Faltam hotelaria completa, direitos/capacidade contratual, tributos, financiamento e encargos ainda não modelados (não são zero no negócio real).',
        'Aviso: O saldo de caixa após custos comerciais NÃO constitui lucro líquido do empreendimento completo.',
      ]
      salas.forEach(function (sala) {
        if (!sala || !Array.isArray(sala.pontos)) return
        sala.pontos.forEach(function (ponto) {
          if (
            ponto &&
            ponto.etapa_entrada === 'comparecidos' &&
            ponto.taxa_comparecimento !== undefined &&
            ponto.taxa_comparecimento !== null
          ) {
            lista.push(
              'Aviso: No ponto de captação "' +
                (ponto.nome || ponto.id) +
                '" (sala "' +
                (sala.nome || sala.id) +
                '"), a etapa de entrada é "comparecidos"; a taxa de comparecimento informada foi ignorada para não reaplicá-la.',
            )
          }
        })
      })
      return lista
    })(),
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.vb_resolverValorMes = vb_resolverValorMes
  globalThis.vb_formatarBRL = vb_formatarBRL
  globalThis.vb_formatarPorcentagem = vb_formatarPorcentagem
  globalThis.vb_validarPremissas = vb_validarPremissas
  globalThis.vb_calcularSimulacao = vb_calcularSimulacao
  globalThis.vb_gerarHashPremissas = vb_gerarHashPremissas
  globalThis.VB_MOTOR_VERSAO = VB_MOTOR_VERSAO
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    vb_resolverValorMes: vb_resolverValorMes,
    vb_formatarBRL: vb_formatarBRL,
    vb_formatarPorcentagem: vb_formatarPorcentagem,
    vb_validarPremissas: vb_validarPremissas,
    vb_calcularSimulacao: vb_calcularSimulacao,
    vb_gerarHashPremissas: vb_gerarHashPremissas,
    VB_MOTOR_VERSAO: VB_MOTOR_VERSAO,
  }
}
