/// <reference path="../types/pocketbase.d.ts" />

// 0007_fix_cenario_exemplo.js
// Correção idempotente e com preservação de dados do cenário marcado com
// is_exemplo = true: alinha as premissas gravadas no banco ao exemplo
// demonstrativo atual (mesma estrutura da tela EstudoCenario ›
// carregarExemploDemonstrativo), garantindo que o cálculo rode sem pendências
// (vb_validarPremissas) e sem o aviso de taxa de comparecimento ignorada.
//
// Regras:
// - Incremental: só atualiza registros com is_exemplo = true; nunca apaga.
// - Idempotente: o objeto EXEMPLO_PREMISSAS é canônico; aplicar duas vezes
//   produz o mesmo resultado. Se um cenário de exemplo já tem exatamente essas
//   premissas, nada é gravado.
// - Preserva os demais campos do registro (nome, descricao, estudo, ...).

migrate(
  (app) => {
    // Exemplo demonstrativo canônico — espelha o objeto da tela (mesmo conteúdo).
    const EXEMPLO_PREMISSAS = {
      salas: [
        {
          id: 'sal_exemplo_1',
          nome: 'Sala Principal - Resort (Exemplo)',
          capacidade_mensal: { base: 120, ajustes: {} },
          pontos: [
            {
              id: 'pnt_exemplo_1',
              sala_id: 'sal_exemplo_1',
              nome: 'Recepção / Lobby (Exemplo Fictício)',
              etapa_entrada: 'comparecidos',
              volume_entrada: { base: 80, ajustes: {} },
              taxa_qualificados: { base: 1.0, ajustes: {} },
              taxa_convidados: { base: 1.0, ajustes: {} },
              taxa_conversao_venda: { base: 0.2, ajustes: {} },
              custo_transporte_unitario: { base: 0, ajustes: {} },
            },
          ],
        },
      ],
      produtos: [
        {
          id: 'prd_exemplo_1',
          nome: 'Fração 2 Quartos Luxo (Exemplo)',
          modalidade: 'multipropriedade',
          preco: { base: 45000, ajustes: {} },
          estoque_disponivel: 120,
        },
      ],
      mix_por_sala: [
        {
          sala_id: 'sal_exemplo_1',
          produtos: [
            {
              produto_id: 'prd_exemplo_1',
              percentual: { base: 1.0, ajustes: {} },
            },
          ],
        },
      ],
      condicoes_pagamento: {
        multipropriedade: {
          perc_entrada: 0.15,
          parcelas_entrada: 2,
          mes_primeira_saldo: 2,
          parcelas_saldo: 48,
        },
        timeshare: {
          perc_entrada: 0.2,
          parcelas_entrada: 1,
          mes_primeira_saldo: 1,
          parcelas_saldo: 24,
        },
      },
      cancelamentos_inadimplencia: {
        multipropriedade: {
          cancelamento: { taxa: 0.08, mes_medio: 2, taxa_devolucao: 0.7, prazo_devolucao: 1 },
          inadimplencia: { taxa: 0.05, parcela_recuperavel: 0.6, prazo_recuperacao: 2 },
        },
        timeshare: {
          cancelamento: { taxa: 0.05, mes_medio: 1, taxa_devolucao: 0.5, prazo_devolucao: 1 },
          inadimplencia: { taxa: 0.04, parcela_recuperavel: 0.5, prazo_recuperacao: 2 },
        },
      },
      remuneracoes: [
        {
          id: 'rem_exemplo_1',
          nome: 'Comissão Comercial Padrão (Exemplo)',
          tipo: 'perc_vgv',
          valor: { base: 0.12, ajustes: {} },
          adicional_ou_compensavel: 'adicional',
        },
      ],
      custos_despesas: [
        {
          id: 'desp_exemplo_1',
          nome: 'Custo Fixo Sala / Administrativo (Exemplo)',
          tipo: 'fixo',
          valor: { base: 15000, ajustes: {} },
          responsavel_economico: 'comercializadora',
          pagador_inicial: 'comercializadora',
        },
      ],
      investimentos: [],
      caixa_inicial: { comercializadora: 50000, empreendimento: 100000 },
    }

    let exemplos = []
    try {
      exemplos = app.findRecordsByFilter('cenarios', 'is_exemplo = true', '-updated', 500)
    } catch (err) {
      console.error('0007_fix_cenario_exemplo: falha ao buscar cenários de exemplo:', err)
      exemplos = []
    }

    const canonico = JSON.stringify(EXEMPLO_PREMISSAS)

    exemplos.forEach((registro) => {
      try {
        const raw = registro.getString('premissas') || ''
        let atuais = null
        try {
          atuais = raw ? JSON.parse(raw) : null
        } catch (_) {
          atuais = null
        }

        const jaCorreto = atuais && JSON.stringify(atuais) === canonico
        if (jaCorreto) return // idempotente: nada a gravar

        // Preserva demais campos do registro; só premissas é reescrito.
        registro.set('premissas', EXEMPLO_PREMISSAS)
        app.save(registro)
      } catch (err) {
        console.error('0007_fix_cenario_exemplo: falha ao corrigir cenário ' + registro.id, err)
      }
    })
  },
  (app) => {
    // Down idempotente: nada a reverter (não criamos campo nem apagamos nada).
  },
)
