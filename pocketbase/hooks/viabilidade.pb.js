// pocketbase/hooks/viabilidade.pb.js
// Deterministic simulation & security validation hooks for "Viabilidade Vacation Ownership"
// In PocketBase goja JSVM, callbacks execute in a pool, so all functions/helpers must be defined inside the handler body!

routerAdd('POST', '/backend/v1/viabilidade/simular', (e) => {
  const info = e.requestInfo()
  if (!info.auth) {
    return e.json(401, { error: 'Não autorizado' })
  }

  const userId = info.auth.id
  const body = e.bindBody({})
  const cenarioId = body.cenario_id

  if (!cenarioId) {
    return e.json(400, { error: 'cenario_id é obrigatório' })
  }

  let cenarioRecord
  try {
    cenarioRecord = $app.findRecordById('cenarios', cenarioId)
  } catch (_) {
    return e.json(404, { error: 'Cenário não encontrado' })
  }

  const estudoId = cenarioRecord.getString('estudo')
  let estudoRecord
  try {
    estudoRecord = $app.findRecordById('estudos', estudoId)
  } catch (_) {
    return e.json(404, { error: 'Estudo não encontrado' })
  }

  const empresaId = estudoRecord.getString('empresa')

  let membroRecord = null
  try {
    membroRecord = $app.findFirstRecordByFilter(
      'empresa_membros',
      `empresa = '${empresaId}' && user = '${userId}'`,
    )
  } catch (_) {}

  let empresaRecord
  try {
    empresaRecord = $app.findRecordById('empresas', empresaId)
  } catch (_) {
    return e.json(404, { error: 'Empresa não encontrada' })
  }

  const isCriador = empresaRecord.getString('criador') === userId
  if (!membroRecord && !isCriador) {
    return e.json(403, { error: 'Acesso negado ao estudo desta empresa' })
  }

  const role = membroRecord ? membroRecord.getString('role') : 'admin_master'
  if (role === 'viewer') {
    return e.json(403, {
      error: 'Papel de visualizador não possui permissão para calcular simulações',
    })
  }

  // Parse premissas from cenario
  let rawPremissas = {}
  try {
    const rawStr = cenarioRecord.getString('premissas')
    if (rawStr && rawStr !== 'null') {
      rawPremissas = JSON.parse(rawStr)
    }
  } catch (err) {
    return e.json(400, { error: 'Erro ao ler JSON de premissas: ' + err.message })
  }

  // Deterministic calculation defined inline
  function calcular(premissas, estudoRec) {
    const horizonte = estudoRec.getInt('horizonte_meses') || 12
    const mesInicial = estudoRec.getString('mes_inicial') || '2025-01'

    if (!premissas) throw new Error('Premissas vazias ou não fornecidas')

    const salas = premissas.salas || []
    const produtos = premissas.produtos || []
    const mixSalas = premissas.mix_por_sala || []
    const condicoesPagamento = premissas.condicoes_pagamento || {}
    const cancelamentos = premissas.cancelamentos_inadimplencia || {}
    const remuneracoes = premissas.remuneracoes || []
    const custosDespesas = premissas.custos_despesas || []
    const investimentos = premissas.investimentos || []
    const caixasIniciais = premissas.caixa_inicial || { comercializadora: 0, empreendimento: 0 }

    function resolverValorMes(config, mesIdx) {
      if (!config) return 0
      if (typeof config === 'number') return config
      if (
        config.ajustes &&
        config.ajustes[mesIdx] !== undefined &&
        config.ajustes[mesIdx] !== null
      ) {
        return Number(config.ajustes[mesIdx])
      }
      return Number(config.base || 0)
    }

    const funilMensal = []
    const vendasMesProduto = []
    const estoqueRestante = {}
    produtos.forEach((p) => {
      estoqueRestante[p.id] = Number(p.estoque_disponivel || 0)
    })

    let totalPotencialGlobal = 0
    let totalAdmitidoGlobal = 0
    let totalNaoAtendidoEstoqueGlobal = 0
    let totalDemandaNaoAtendidaCapacidadeGlobal = 0

    for (let m = 0; m < horizonte; m++) {
      const mesData = {
        mes: m,
        salas: [],
        total_vgv_mes: 0,
        total_vendas_mes: 0,
        total_atendimentos_mes: 0,
      }

      salas.forEach((sala) => {
        const capSala = resolverValorMes(sala.capacidade_mensal, m)
        const pontosSala = sala.pontos || []

        const pontosDemandas = pontosSala.map((ponto) => {
          const etapaEntrada = ponto.etapa_entrada
          const volEntrada = resolverValorMes(ponto.volume_entrada, m)

          let taxaQual =
            ponto.taxa_qualificados !== undefined ? resolverValorMes(ponto.taxa_qualificados, m) : 1
          let taxaConv =
            ponto.taxa_convidados !== undefined ? resolverValorMes(ponto.taxa_convidados, m) : 1
          let taxaComp =
            ponto.taxa_comparecimento !== undefined
              ? resolverValorMes(ponto.taxa_comparecimento, m)
              : 1
          const taxaConvVenda =
            ponto.taxa_conversao_venda !== undefined
              ? resolverValorMes(ponto.taxa_conversao_venda, m)
              : 0

          let abordados = 0
          let qualificados = 0
          let convidados = 0
          let comparecidos = 0

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
            abordados,
            qualificados,
            convidados,
            comparecidos_demanda: comparecidos,
            taxa_conversao_venda: taxaConvVenda,
            custo_transporte_unit: resolverValorMes(ponto.custo_transporte_unitario, m),
          }
        })

        const demandaTotalSala = pontosDemandas.reduce((acc, p) => acc + p.comparecidos_demanda, 0)
        const atendimentosTotaisSala = Math.min(demandaTotalSala, capSala)
        const demandaNaoAtendidaSala = Math.max(0, demandaTotalSala - capSala)
        totalDemandaNaoAtendidaCapacidadeGlobal += demandaNaoAtendidaSala

        const fatorRateio = demandaTotalSala > 0 ? atendimentosTotaisSala / demandaTotalSala : 0

        const pontosResultados = pontosDemandas.map((pd) => {
          const atendimentosEfetivos =
            pd.comparecidos_demanda * (demandaTotalSala <= capSala ? 1 : fatorRateio)
          const naoAtendidosCapacidade = pd.comparecidos_demanda - atendimentosEfetivos
          const vendasPotenciais = atendimentosEfetivos * pd.taxa_conversao_venda

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

        const vendasPotenciaisSala = pontosResultados.reduce(
          (acc, p) => acc + p.vendas_potenciais,
          0,
        )
        totalPotencialGlobal += vendasPotenciaisSala

        const mixSala = mixSalas.find((ms) => ms.sala_id === sala.id)
        const produtosMix = (mixSala && mixSala.produtos) || []

        produtosMix.forEach((pm) => {
          const prodId = pm.produto_id
          const prod = produtos.find((p) => p.id === prodId)
          if (!prod) return

          const percMix = resolverValorMes(pm.percentual, m)
          const potencialProduto = vendasPotenciaisSala * percMix

          const estDisponivel = estoqueRestante[prodId] || 0
          const admitidoProduto = Math.min(potencialProduto, estDisponivel)
          const naoAtendidoEstoque = Math.max(0, potencialProduto - admitidoProduto)

          estoqueRestante[prodId] = Math.max(0, estDisponivel - admitidoProduto)
          totalAdmitidoGlobal += admitidoProduto
          totalNaoAtendidoEstoqueGlobal += naoAtendidoEstoque

          const precoUnitario = resolverValorMes(prod.preco, m)
          const vgvProduto = admitidoProduto * precoUnitario

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

    const cobrancasEsperadas = {}
    let carteiraAlemHorizonte = { multipropriedade: 0, timeshare: 0, total: 0 }

    for (let m = 0; m < horizonte; m++) {
      cobrancasEsperadas[m] = {
        multipropriedade: { entrada: 0, saldo: 0, bruto: 0 },
        timeshare: { entrada: 0, saldo: 0, bruto: 0 },
        total_bruto: 0,
      }
    }

    vendasMesProduto.forEach((venda) => {
      if (venda.vgv <= 0) return
      const mod = venda.modalidade
      const cond = condicoesPagamento[mod] || {
        perc_entrada: 0.2,
        parcelas_entrada: 1,
        mes_primeira_saldo: 1,
        parcelas_saldo: 10,
      }

      const percEntrada = Number(cond.perc_entrada || 0)
      const numParcEntrada = Math.max(1, Math.round(Number(cond.parcelas_entrada || 1)))
      const mesPrimSaldo = Math.max(0, Math.round(Number(cond.mes_primeira_saldo || 1)))
      const numParcSaldo = Math.max(0, Math.round(Number(cond.parcelas_saldo || 0)))

      const vgvEntrada = venda.vgv * percEntrada
      const vgvSaldo = venda.vgv - vgvEntrada

      const valorParcEntrada = vgvEntrada / numParcEntrada
      const valorParcSaldo = numParcSaldo > 0 ? vgvSaldo / numParcSaldo : 0

      for (let ep = 0; ep < numParcEntrada; ep++) {
        const mesCobranca = venda.mes + ep
        if (mesCobranca < horizonte) {
          cobrancasEsperadas[mesCobranca][mod].entrada += valorParcEntrada
          cobrancasEsperadas[mesCobranca][mod].bruto += valorParcEntrada
          cobrancasEsperadas[mesCobranca].total_bruto += valorParcEntrada
        } else {
          carteiraAlemHorizonte[mod] += valorParcEntrada
          carteiraAlemHorizonte.total += valorParcEntrada
        }
      }

      for (let sp = 0; sp < numParcSaldo; sp++) {
        const mesCobranca = venda.mes + mesPrimSaldo + sp
        if (mesCobranca < horizonte) {
          cobrancasEsperadas[mesCobranca][mod].saldo += valorParcSaldo
          cobrancasEsperadas[mesCobranca][mod].bruto += valorParcSaldo
          cobrancasEsperadas[mesCobranca].total_bruto += valorParcSaldo
        } else {
          carteiraAlemHorizonte[mod] += valorParcSaldo
          carteiraAlemHorizonte.total += valorParcSaldo
        }
      }
    })

    const recebimentosEfetivos = {}
    const devolucoesAgendadas = {}
    const recuperacoesAgendadas = {}

    for (let m = 0; m < horizonte; m++) {
      recebimentosEfetivos[m] = {
        multipropriedade: 0,
        timeshare: 0,
        total_recebido: 0,
        devolucoes_pagas: 0,
        inadimplencia_perdida: 0,
        inadimplencia_recuperada: 0,
      }
      devolucoesAgendadas[m] = 0
      recuperacoesAgendadas[m] = 0
    }

    ;['multipropriedade', 'timeshare'].forEach((mod) => {
      const cancConf = (cancelamentos[mod] && cancelamentos[mod].cancelamento) || {
        taxa: 0,
        mes_medio: 1,
        taxa_devolucao: 0,
        prazo_devolucao: 1,
      }
      const inadConf = (cancelamentos[mod] && cancelamentos[mod].inadimplencia) || {
        taxa: 0,
        parcela_recuperavel: 0,
        prazo_recuperacao: 1,
      }

      const taxaCanc = Number(cancConf.taxa || 0)
      const taxaDevolucao = Number(cancConf.taxa_devolucao || 0)
      const prazoDevolucao = Math.max(1, Math.round(Number(cancConf.prazo_devolucao || 1)))

      const taxaInad = Number(inadConf.taxa || 0)
      const percRecup = Number(inadConf.parcela_recuperavel || 0)
      const prazoRecup = Math.max(1, Math.round(Number(inadConf.prazo_recuperacao || 1)))

      for (let m = 0; m < horizonte; m++) {
        let brutoMes = cobrancasEsperadas[m][mod].bruto
        const cobrancaAtiva = brutoMes * (1 - taxaCanc)
        const inadMes = cobrancaAtiva * taxaInad
        const recebimentoPontual = cobrancaAtiva - inadMes

        const recupEsperada = inadMes * percRecup
        const perdaInad = inadMes - recupEsperada

        recebimentosEfetivos[m][mod] += recebimentoPontual
        recebimentosEfetivos[m].total_recebido += recebimentoPontual
        recebimentosEfetivos[m].inadimplencia_perdida += perdaInad

        const mesRecup = m + prazoRecup
        if (mesRecup < horizonte) {
          recuperacoesAgendadas[mesRecup] += recupEsperada
        } else {
          carteiraAlemHorizonte[mod] += recupEsperada
          carteiraAlemHorizonte.total += recupEsperada
        }

        if (taxaCanc > 0 && taxaDevolucao > 0) {
          const valorDevolver = recebimentoPontual * taxaCanc * taxaDevolucao
          const mesDev = m + prazoDevolucao
          if (mesDev < horizonte) {
            devolucoesAgendadas[mesDev] += valorDevolver
          }
        }
      }
    })

    for (let m = 0; m < horizonte; m++) {
      const recup = recuperacoesAgendadas[m] || 0
      recebimentosEfetivos[m].total_recebido += recup
      recebimentosEfetivos[m].inadimplencia_recuperada = recup
      recebimentosEfetivos[m].devolucoes_pagas = devolucoesAgendadas[m] || 0
    }

    const fluxosComercializadora = []
    const fluxosEmpreendimento = []
    const transferenciasInternas = []

    let saldoAcumuladoComercializadora = Number(caixasIniciais.comercializadora || 0)
    let saldoAcumuladoEmpreendimento = Number(caixasIniciais.empreendimento || 0)

    let maiorDeficitComercializadora = 0
    let mesMaiorDeficitComercializadora = 0
    let maiorDeficitEmpreendimento = 0
    let mesMaiorDeficitEmpreendimento = 0

    for (let m = 0; m < horizonte; m++) {
      const vgvMes = funilMensal[m].total_vgv_mes
      const recMes = recebimentosEfetivos[m].total_recebido
      const entradaRecMes =
        cobrancasEsperadas[m].multipropriedade.entrada + cobrancasEsperadas[m].timeshare.entrada

      let remuneracaoComercial = 0
      let retencaoEntradaMes = 0
      let comissaoVendaMes = 0
      let comissaoRecebimentoMes = 0
      let fixoComercialMes = 0

      remuneracoes.forEach((rem) => {
        const tipo = rem.tipo
        const valorBase = resolverValorMes(rem.valor, m)

        if (tipo === 'fixo') {
          fixoComercialMes += valorBase
        } else if (tipo === 'perc_vgv') {
          comissaoVendaMes += vgvMes * valorBase
        } else if (tipo === 'perc_recebimento') {
          comissaoRecebimentoMes += recMes * valorBase
        } else if (tipo === 'retencao_entrada') {
          retencaoEntradaMes += entradaRecMes * valorBase
        }
      })

      remuneracaoComercial =
        fixoComercialMes + comissaoVendaMes + comissaoRecebimentoMes + retencaoEntradaMes

      transferenciasInternas.push({
        mes: m,
        de: 'empreendimento',
        para: 'comercializadora',
        valor: remuneracaoComercial,
        descricao: 'Remuneração comercial e repasses/retenções',
      })

      let custosComercializadora = 0
      let custosEmpreendimento = 0

      custosDespesas.forEach((cd) => {
        let valorItem = 0
        const tipo = cd.tipo
        const vUnit = resolverValorMes(cd.valor, m)

        if (tipo === 'fixo') {
          valorItem = vUnit
        } else if (tipo === 'por_atendimento') {
          valorItem = funilMensal[m].total_atendimentos_mes * vUnit
        } else if (tipo === 'por_venda') {
          valorItem = funilMensal[m].total_vendas_mes * vUnit
        } else if (tipo === 'perc_vgv') {
          valorItem = vgvMes * vUnit
        }

        const parteResp = cd.responsavel_economico || 'comercializadora'
        if (parteResp === 'comercializadora') {
          custosComercializadora += valorItem
        } else {
          custosEmpreendimento += valorItem
        }
      })

      let investComercializadora = 0
      let investEmpreendimento = 0

      investimentos.forEach((inv) => {
        if (inv.mes === m) {
          const val = Number(inv.valor || 0)
          if (inv.parte === 'comercializadora') {
            investComercializadora += val
          } else {
            investEmpreendimento += val
          }
        }
      })

      const devolucoesMes = recebimentosEfetivos[m].devolucoes_pagas

      const entradasComercial = remuneracaoComercial
      const saidasComercial = custosComercializadora + investComercializadora
      const fluxoLiquidoComercial = entradasComercial - saidasComercial
      saldoAcumuladoComercializadora += fluxoLiquidoComercial

      if (saldoAcumuladoComercializadora < maiorDeficitComercializadora) {
        maiorDeficitComercializadora = saldoAcumuladoComercializadora
        mesMaiorDeficitComercializadora = m
      }

      const entradasEmpreendimento = recMes
      const saidasEmpreendimento =
        remuneracaoComercial + custosEmpreendimento + devolucoesMes + investEmpreendimento
      const fluxoLiquidoEmpreendimento = entradasEmpreendimento - saidasEmpreendimento
      saldoAcumuladoEmpreendimento += fluxoLiquidoEmpreendimento

      if (saldoAcumuladoEmpreendimento < maiorDeficitEmpreendimento) {
        maiorDeficitEmpreendimento = saldoAcumuladoEmpreendimento
        mesMaiorDeficitEmpreendimento = m
      }

      fluxosComercializadora.push({
        mes: m,
        receita_remuneracao: entradasComercial,
        custos_operacionais: custosComercializadora,
        investimentos: investComercializadora,
        fluxo_liquido: fluxoLiquidoComercial,
        saldo_acumulado: saldoAcumuladoComercializadora,
      })

      fluxosEmpreendimento.push({
        mes: m,
        recebimentos_brutos: entradasEmpreendimento,
        repasse_comercial: remuneracaoComercial,
        custos_proprios: custosEmpreendimento,
        devolucoes: devolucoesMes,
        investimentos: investEmpreendimento,
        fluxo_liquido: fluxoLiquidoEmpreendimento,
        saldo_acumulado: saldoAcumuladoEmpreendimento,
      })
    }

    const totalVgv = vendasMesProduto.reduce((acc, v) => acc + v.vgv, 0)
    const totalVendasAdmitidas = vendasMesProduto.reduce((acc, v) => acc + v.admitido, 0)
    const totalRecebidoCompradores = Object.values(recebimentosEfetivos).reduce(
      (acc, r) => acc + r.total_recebido,
      0,
    )
    const totalDevolucoesPagas = Object.values(recebimentosEfetivos).reduce(
      (acc, r) => acc + r.devolucoes_pagas,
      0,
    )

    const totalReceitaComercial = fluxosComercializadora.reduce(
      (acc, f) => acc + f.receita_remuneracao,
      0,
    )
    const totalCustosComercial = fluxosComercializadora.reduce(
      (acc, f) => acc + f.custos_operacionais,
      0,
    )
    const resultadoGerencialComercial = totalReceitaComercial - totalCustosComercial

    const totalInvestimentosEmpreendimento = fluxosEmpreendimento.reduce(
      (acc, f) => acc + f.investimentos,
      0,
    )
    const totalCustosEmpreendimento = fluxosEmpreendimento.reduce(
      (acc, f) => acc + f.custos_proprios,
      0,
    )
    const totalRepassesComerciais = fluxosEmpreendimento.reduce(
      (acc, f) => acc + f.repasse_comercial,
      0,
    )

    return {
      titulo: 'Simulação comercial e financeira preliminar',
      schema_version: 1,
      horizonte_meses: horizonte,
      mes_inicial: mesInicial,
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
        repasses_comercializadora_total: totalRepassesComerciais,
        custos_proprios_total: totalCustosEmpreendimento,
        devolucoes_total: totalDevolucoesPagas,
        investimentos_total: totalInvestimentosEmpreendimento,
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

  // Run deterministic calculation
  try {
    const resultado = calcular(rawPremissas, estudoRecord)

    const simulacoesCol = $app.findCollectionByNameOrId('simulacoes')
    const simRecord = new Record(simulacoesCol)
    simRecord.set('cenario', cenarioId)
    simRecord.set('schema_version', cenarioRecord.getInt('schema_version') || 1)
    simRecord.set('status', 'sucesso')
    simRecord.set('erro_mensagem', '')
    simRecord.set('input_snapshot', rawPremissas)
    simRecord.set('resultado', resultado)
    simRecord.set('executado_por', userId)
    $app.save(simRecord)

    cenarioRecord.set('is_stale', false)
    $app.save(cenarioRecord)

    return e.json(200, {
      id: simRecord.id,
      cenario_id: cenarioId,
      status: 'sucesso',
      resultado: resultado,
    })
  } catch (err) {
    const simulacoesCol = $app.findCollectionByNameOrId('simulacoes')
    const simRecord = new Record(simulacoesCol)
    simRecord.set('cenario', cenarioId)
    simRecord.set('schema_version', cenarioRecord.getInt('schema_version') || 1)
    simRecord.set('status', 'falha')
    simRecord.set('erro_mensagem', String(err.message || err))
    simRecord.set('input_snapshot', rawPremissas)
    simRecord.set('resultado', null)
    simRecord.set('executado_por', userId)
    $app.save(simRecord)

    return e.json(422, {
      status: 'falha',
      error: 'Falha na simulação: ' + (err.message || String(err)),
    })
  }
})

// Duplication endpoint: safe deep clone with distinct IDs, server-validated authorization
routerAdd('POST', '/backend/v1/viabilidade/duplicar-cenario', (e) => {
  const info = e.requestInfo()
  if (!info.auth) {
    return e.json(401, { error: 'Não autorizado' })
  }

  const userId = info.auth.id
  const body = e.bindBody({})
  const cenarioOrigemId = body.cenario_id
  const novoNome = (body.novo_nome || '').trim()

  if (!cenarioOrigemId || !novoNome) {
    return e.json(400, { error: 'cenario_id e novo_nome são obrigatórios' })
  }

  let cenarioOrigem
  try {
    cenarioOrigem = $app.findRecordById('cenarios', cenarioOrigemId)
  } catch (_) {
    return e.json(404, { error: 'Cenário de origem não encontrado' })
  }

  const estudoId = cenarioOrigem.getString('estudo')
  let estudoRecord
  try {
    estudoRecord = $app.findRecordById('estudos', estudoId)
  } catch (_) {
    return e.json(404, { error: 'Estudo não encontrado' })
  }

  const empresaId = estudoRecord.getString('empresa')

  let membroRecord = null
  try {
    membroRecord = $app.findFirstRecordByFilter(
      'empresa_membros',
      `empresa = '${empresaId}' && user = '${userId}'`,
    )
  } catch (_) {}

  let empresaRecord
  try {
    empresaRecord = $app.findRecordById('empresas', empresaId)
  } catch (_) {
    return e.json(404, { error: 'Empresa não encontrada' })
  }

  if (!membroRecord && empresaRecord.getString('criador') !== userId) {
    return e.json(403, { error: 'Acesso negado ao estudo desta empresa' })
  }

  let premissasClonadas = {}
  try {
    const raw = cenarioOrigem.getString('premissas')
    if (raw && raw !== 'null') {
      premissasClonadas = JSON.parse(raw)
    }
  } catch (_) {}

  function regenerarIds(p) {
    if (!p || typeof p !== 'object') return p
    const clone = JSON.parse(JSON.stringify(p))
    const idMap = {}
    function makeId(prefix) {
      return (
        prefix +
        '_' +
        Math.random().toString(36).substring(2, 9) +
        Date.now().toString(36).slice(-4)
      )
    }

    if (Array.isArray(clone.salas)) {
      clone.salas.forEach((sala) => {
        const oldSalaId = sala.id
        const newSalaId = makeId('sal')
        idMap[oldSalaId] = newSalaId
        sala.id = newSalaId

        if (Array.isArray(sala.pontos)) {
          sala.pontos.forEach((ponto) => {
            const oldPontoId = ponto.id
            const newPontoId = makeId('pnt')
            idMap[oldPontoId] = newPontoId
            ponto.id = newPontoId
            ponto.sala_id = newSalaId
          })
        }
      })
    }

    if (Array.isArray(clone.produtos)) {
      clone.produtos.forEach((prod) => {
        const oldProdId = prod.id
        const newProdId = makeId('prd')
        idMap[oldProdId] = newProdId
        prod.id = newProdId
      })
    }

    if (Array.isArray(clone.mix_por_sala)) {
      clone.mix_por_sala.forEach((m) => {
        if (idMap[m.sala_id]) m.sala_id = idMap[m.sala_id]
        if (Array.isArray(m.produtos)) {
          m.produtos.forEach((mp) => {
            if (idMap[mp.produto_id]) mp.produto_id = idMap[mp.produto_id]
          })
        }
      })
    }

    if (Array.isArray(clone.custos_despesas)) {
      clone.custos_despesas.forEach((cd) => {
        cd.id = makeId('desp')
        if (cd.sala_id && idMap[cd.sala_id]) cd.sala_id = idMap[cd.sala_id]
        if (cd.ponto_id && idMap[cd.ponto_id]) cd.ponto_id = idMap[cd.ponto_id]
      })
    }

    if (Array.isArray(clone.investimentos)) {
      clone.investimentos.forEach((inv) => {
        inv.id = makeId('inv')
      })
    }

    return clone
  }

  const premissasComNovosIds = regenerarIds(premissasClonadas)

  const cenariosCol = $app.findCollectionByNameOrId('cenarios')
  const novoCenario = new Record(cenariosCol)
  novoCenario.set('estudo', estudoId)
  novoCenario.set('nome', novoNome)
  novoCenario.set('descricao', 'Cópia independente de ' + cenarioOrigem.getString('nome'))
  novoCenario.set('is_base', false)
  novoCenario.set('schema_version', cenarioOrigem.getInt('schema_version') || 1)
  novoCenario.set('premissas', premissasComNovosIds)
  novoCenario.set('is_stale', true)
  $app.save(novoCenario)

  return e.json(200, {
    id: novoCenario.id,
    nome: novoNome,
    estudo_id: estudoId,
    message: 'Cenário duplicado com sucesso',
  })
})

// ==========================================
// ROTAS ADMIN PROTEGIDAS POR is_master = true
// ==========================================

// 1. POST /backend/v1/admin/empresas
// Cria empresa e vincula opcionalmente um usuário como admin_master (ou o próprio criador)
routerAdd('POST', '/backend/v1/admin/empresas', (e) => {
  const info = e.requestInfo()
  if (!info.auth) {
    return e.json(401, { error: 'Não autenticado' })
  }
  const callerId = info.auth.id
  let callerRecord
  try {
    callerRecord = $app.findRecordById('users', callerId)
  } catch (_) {
    return e.json(401, { error: 'Usuário não encontrado' })
  }
  if (!callerRecord.getBool('is_master')) {
    return e.json(403, { error: 'Acesso restrito a administradores master' })
  }

  const body = e.bindBody({})
  const nome = (body.nome || '').trim()
  const cnpj = (body.cnpj || '').trim()
  const usuarioVinculoId = (body.usuario_id || '').trim() || callerId
  const roleVinculo = (body.role || 'admin_master').trim()

  if (!nome) {
    return e.json(400, { error: 'Nome da empresa é obrigatório' })
  }

  // Validar se o usuário do vínculo existe
  let usuarioDestino
  try {
    usuarioDestino = $app.findRecordById('users', usuarioVinculoId)
  } catch (_) {
    return e.json(404, { error: 'Usuário a vincular não foi encontrado' })
  }

  const papeisValidos = ['admin_master', 'analista', 'viewer']
  if (!papeisValidos.includes(roleVinculo)) {
    return e.json(400, { error: 'Papel inválido. Permitidos: admin_master, analista, viewer' })
  }

  try {
    const empresasCol = $app.findCollectionByNameOrId('empresas')
    const novaEmpresa = new Record(empresasCol)
    novaEmpresa.set('nome', nome)
    if (cnpj) novaEmpresa.set('cnpj', cnpj)
    novaEmpresa.set('criador', callerId)
    $app.save(novaEmpresa)

    // Criar vínculo em empresa_membros
    const membrosCol = $app.findCollectionByNameOrId('empresa_membros')
    const novoMembro = new Record(membrosCol)
    novoMembro.set('empresa', novaEmpresa.id)
    novoMembro.set('user', usuarioDestino.id)
    novoMembro.set('role', roleVinculo)
    $app.save(novoMembro)

    return e.json(201, {
      message: 'Empresa criada com sucesso',
      empresa: {
        id: novaEmpresa.id,
        nome: novaEmpresa.getString('nome'),
        cnpj: novaEmpresa.getString('cnpj'),
        criador: novaEmpresa.getString('criador'),
      },
      vinculo: {
        id: novoMembro.id,
        empresa_id: novaEmpresa.id,
        user_id: usuarioDestino.id,
        role: roleVinculo,
      },
    })
  } catch (err) {
    return e.json(400, { error: 'Erro ao criar empresa: ' + (err.message || String(err)) })
  }
})

// 2. POST /backend/v1/admin/usuarios
// Cria usuário com senha provisória e vincula à empresa especificada com papel (admin_master, analista, viewer)
routerAdd('POST', '/backend/v1/admin/usuarios', (e) => {
  const info = e.requestInfo()
  if (!info.auth) {
    return e.json(401, { error: 'Não autenticado' })
  }
  const callerId = info.auth.id
  let callerRecord
  try {
    callerRecord = $app.findRecordById('users', callerId)
  } catch (_) {
    return e.json(401, { error: 'Usuário não encontrado' })
  }
  if (!callerRecord.getBool('is_master')) {
    return e.json(403, { error: 'Acesso restrito a administradores master' })
  }

  const body = e.bindBody({})
  const email = (body.email || '').trim().toLowerCase()
  const password = (body.password || '').trim()
  const name = (body.name || '').trim()
  const empresaId = (body.empresa_id || '').trim()
  const role = (body.role || 'analista').trim()
  const isMaster = Boolean(body.is_master)

  if (!email || !password) {
    return e.json(400, { error: 'E-mail e senha são obrigatórios' })
  }
  if (password.length < 8) {
    return e.json(400, { error: 'A senha provisória deve ter no mínimo 8 caracteres' })
  }

  const papeisValidos = ['admin_master', 'analista', 'viewer']
  if (empresaId && !papeisValidos.includes(role)) {
    return e.json(400, { error: 'Papel inválido. Permitidos: admin_master, analista, viewer' })
  }

  // Se passou empresaId, validar existência
  let empresaRec = null
  if (empresaId) {
    try {
      empresaRec = $app.findRecordById('empresas', empresaId)
    } catch (_) {
      return e.json(404, { error: 'Empresa especificada não encontrada' })
    }
  }

  // Verificar se o e-mail já existe
  try {
    const existing = $app.findAuthRecordByEmail('_pb_users_auth_', email)
    if (existing) {
      return e.json(400, { error: 'Já existe um usuário cadastrado com este e-mail' })
    }
  } catch (_) {
    // Ok se não encontrar
  }

  try {
    const usersCol = $app.findCollectionByNameOrId('_pb_users_auth_')
    const novoUsuario = new Record(usersCol)
    novoUsuario.setEmail(email)
    novoUsuario.setPassword(password)
    novoUsuario.setVerified(true)
    if (name) novoUsuario.set('name', name)
    if (isMaster) novoUsuario.set('is_master', true)
    $app.save(novoUsuario)

    let vinculoInfo = null
    if (empresaRec) {
      const membrosCol = $app.findCollectionByNameOrId('empresa_membros')
      const novoMembro = new Record(membrosCol)
      novoMembro.set('empresa', empresaRec.id)
      novoMembro.set('user', novoUsuario.id)
      novoMembro.set('role', role)
      $app.save(novoMembro)

      vinculoInfo = {
        id: novoMembro.id,
        empresa_id: empresaRec.id,
        empresa_nome: empresaRec.getString('nome'),
        role: role,
      }
    }

    return e.json(201, {
      message: 'Usuário criado com sucesso',
      usuario: {
        id: novoUsuario.id,
        email: novoUsuario.getString('email'),
        name: novoUsuario.getString('name'),
        is_master: novoUsuario.getBool('is_master'),
      },
      vinculo: vinculoInfo,
    })
  } catch (err) {
    return e.json(400, { error: 'Erro ao criar usuário: ' + (err.message || String(err)) })
  }
})

// 3. GET /backend/v1/admin/usuarios
// Lista usuários e respectivos vínculos com empresas
routerAdd('GET', '/backend/v1/admin/usuarios', (e) => {
  const info = e.requestInfo()
  if (!info.auth) {
    return e.json(401, { error: 'Não autenticado' })
  }
  const callerId = info.auth.id
  let callerRecord
  try {
    callerRecord = $app.findRecordById('users', callerId)
  } catch (_) {
    return e.json(401, { error: 'Usuário não encontrado' })
  }
  if (!callerRecord.getBool('is_master')) {
    return e.json(403, { error: 'Acesso restrito a administradores master' })
  }

  try {
    const todosUsuarios = $app.findRecordsByFilter('users', '1=1', '-created', 200, 0)
    const todosMembros = $app.findRecordsByFilter('empresa_membros', '1=1', '-created', 500, 0)
    const todasEmpresas = $app.findRecordsByFilter('empresas', '1=1', 'nome', 200, 0)

    const empresasMap = {}
    todasEmpresas.forEach((emp) => {
      empresasMap[emp.id] = {
        id: emp.id,
        nome: emp.getString('nome'),
        cnpj: emp.getString('cnpj'),
        criador: emp.getString('criador'),
      }
    })

    const membrosPorUsuario = {}
    todosMembros.forEach((m) => {
      const uId = m.getString('user')
      if (!membrosPorUsuario[uId]) membrosPorUsuario[uId] = []
      const empId = m.getString('empresa')
      membrosPorUsuario[uId].push({
        id: m.id,
        empresa_id: empId,
        empresa_nome: empresasMap[empId] ? empresasMap[empId].nome : 'Empresa Removida',
        role: m.getString('role'),
        created: m.getString('created'),
      })
    })

    const lista = todosUsuarios.map((u) => ({
      id: u.id,
      email: u.getString('email'),
      name: u.getString('name'),
      is_master: u.getBool('is_master'),
      created: u.getString('created'),
      vinculos: membrosPorUsuario[u.id] || [],
    }))

    return e.json(200, {
      usuarios: lista,
      empresas: Object.values(empresasMap),
    })
  } catch (err) {
    return e.json(500, { error: 'Erro ao listar usuários: ' + (err.message || String(err)) })
  }
})
