// Deterministic simulation calculation engine in TypeScript (pure function, no side effects)
import type {
  PremissasEstudo,
  ResultadoSimulacaoViabilidade,
  ValorMensalConfig,
  MesFunilResultado,
  VendaMesProdutoResultado,
  FluxoMensalComercializadora,
  FluxoMensalEmpreendimento,
  TransferenciaInternaConciliada,
  ModalidadeProduto,
} from '@/types/viabilidade'

export function resolverValorMes(
  config: ValorMensalConfig | number | undefined,
  mesIdx: number,
): number {
  if (config === undefined || config === null) return 0
  if (typeof config === 'number') return config
  if (config.ajustes && config.ajustes[mesIdx] !== undefined && config.ajustes[mesIdx] !== null) {
    return Number(config.ajustes[mesIdx])
  }
  return Number(config.base || 0)
}

export function formatarBRL(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor || 0)
}

export function formatarPorcentagem(valor: number, casas: number = 2): string {
  // Convention: 0.0175 -> "1,75%"
  const num = (valor || 0) * 100
  return (
    num.toLocaleString('pt-BR', {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    }) + '%'
  )
}

export function calcularSimulacaoDeterministicaEngine(
  premissas: PremissasEstudo,
  horizonteMeses: number,
  mesInicial: string = '2025-01',
): ResultadoSimulacaoViabilidade {
  if (!premissas) throw new Error('Premissas vazias ou não fornecidas')

  const horizonte = Math.max(1, horizonteMeses || 12)
  const salas = premissas.salas || []
  const produtos = premissas.produtos || []
  const mixSalas = premissas.mix_por_sala || []
  const condicoesPagamento = premissas.condicoes_pagamento || {
    multipropriedade: {
      perc_entrada: 0.2,
      parcelas_entrada: 1,
      mes_primeira_saldo: 1,
      parcelas_saldo: 10,
    },
    timeshare: {
      perc_entrada: 0.2,
      parcelas_entrada: 1,
      mes_primeira_saldo: 1,
      parcelas_saldo: 10,
    },
  }
  const cancelamentos = premissas.cancelamentos_inadimplencia || {
    multipropriedade: {
      cancelamento: { taxa: 0, mes_medio: 1, taxa_devolucao: 0, prazo_devolucao: 1 },
      inadimplencia: { taxa: 0, parcela_recuperavel: 0, prazo_recuperacao: 1 },
    },
    timeshare: {
      cancelamento: { taxa: 0, mes_medio: 1, taxa_devolucao: 0, prazo_devolucao: 1 },
      inadimplencia: { taxa: 0, parcela_recuperavel: 0, prazo_recuperacao: 1 },
    },
  }
  const remuneracoes = premissas.remuneracoes || []
  const custosDespesas = premissas.custos_despesas || []
  const investimentos = premissas.investimentos || []
  const caixasIniciais = premissas.caixa_inicial || { comercializadora: 0, empreendimento: 0 }

  // 1. Funil de Vendas por Ponto / Sala / Mês
  const funilMensal: MesFunilResultado[] = []
  const vendasMesProduto: VendaMesProdutoResultado[] = []
  const estoqueRestante: Record<string, number> = {}

  produtos.forEach((p) => {
    estoqueRestante[p.id] = Number(p.estoque_disponivel || 0)
  })

  let totalPotencialGlobal = 0
  let totalAdmitidoGlobal = 0
  let totalNaoAtendidoEstoqueGlobal = 0
  let totalDemandaNaoAtendidaCapacidadeGlobal = 0

  for (let m = 0; m < horizonte; m++) {
    const mesData: MesFunilResultado = {
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

        const taxaQual =
          ponto.taxa_qualificados !== undefined ? resolverValorMes(ponto.taxa_qualificados, m) : 1
        const taxaConv =
          ponto.taxa_convidados !== undefined ? resolverValorMes(ponto.taxa_convidados, m) : 1
        const taxaComp =
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
          // DIRECT COMPARECIDOS: do not re-apply taxa de comparecimento (Test 1)
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

      const vendasPotenciaisSala = pontosResultados.reduce((acc, p) => acc + p.vendas_potenciais, 0)
      totalPotencialGlobal += vendasPotenciaisSala

      const mixSala = mixSalas.find((ms) => ms.sala_id === sala.id)
      const produtosMix = (mixSala && mixSala.produtos) || []

      produtosMix.forEach((pm) => {
        const prodId = pm.produto_id
        const prod = produtos.find((p) => p.id === prodId)
        if (!prod) return

        const percMix = resolverValorMes(pm.percentual, m)
        const potencialProduto = vendasPotenciaisSala * percMix

        const estDisponivel = estoqueRestante[prodId] ?? 0
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

  // 2. Condições Médias de Pagamento, Cancelamentos e Inadimplência
  interface CobrancaGrupo {
    entrada: number
    saldo: number
    bruto: number
  }

  const cobrancasEsperadas: Record<
    number,
    { multipropriedade: CobrancaGrupo; timeshare: CobrancaGrupo; total_bruto: number }
  > = {}
  const carteiraAlemHorizonte = { multipropriedade: 0, timeshare: 0, total: 0 }

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

    // Schedule entrada
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

    // Schedule saldo
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

  // Apply Cancelamento & Inadimplência
  const recebimentosEfetivos: Record<
    number,
    {
      multipropriedade: number
      timeshare: number
      total_recebido: number
      devolucoes_pagas: number
      inadimplencia_perdida: number
      inadimplencia_recuperada: number
    }
  > = {}
  const devolucoesAgendadas: Record<number, number> = {}
  const recuperacoesAgendadas: Record<number, number> = {}

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

  ;(['multipropriedade', 'timeshare'] as ModalidadeProduto[]).forEach((mod) => {
    const cancConf = cancelamentos[mod]?.cancelamento || {
      taxa: 0,
      mes_medio: 1,
      taxa_devolucao: 0,
      prazo_devolucao: 1,
    }
    const inadConf = cancelamentos[mod]?.inadimplencia || {
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
      const brutoMes = cobrancasEsperadas[m][mod].bruto
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

  // 3. Remuneração da Comercializadora e Repasses
  const fluxosComercializadora: FluxoMensalComercializadora[] = []
  const fluxosEmpreendimento: FluxoMensalEmpreendimento[] = []
  const transferenciasInternas: TransferenciaInternaConciliada[] = []

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
