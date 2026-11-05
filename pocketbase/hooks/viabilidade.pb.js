/// <reference path="../types/pocketbase.d.ts" />

/**
 * pocketbase/hooks/viabilidade.pb.js
 *
 * Rotas customizadas do sistema de Viabilidade Vacation Ownership:
 * - POST /backend/v1/admin/usuarios (is_master)
 * - GET  /backend/v1/admin/usuarios (is_master)
 * - POST /backend/v1/admin/empresas (is_master)
 * - POST /backend/v1/viabilidade/duplicar-cenario (membro não-viewer da empresa)
 * - POST /backend/v1/viabilidade/simular (membro não-viewer; executa core e grava resultado)
 * - GET  /backend/v1/viabilidade/autoteste (is_master; roda suite de autoteste no servidor)
 *
 * NOTA DE ESCOPO: Todos os callbacks de routerAdd contêm sua lógica 100% inline,
 * sem depender de funções ou variáveis do escopo de topo.
 */

// ---------------------------------------------------------------------------
// ADMIN: POST /backend/v1/admin/usuarios
// ---------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/admin/usuarios', (e) => {
  const callerAuth = e.auth
  const callerIsMaster = Boolean(callerAuth && callerAuth.getBool('is_master'))
  if (!callerIsMaster) {
    return e.json(403, { error: 'Acesso restrito a Administradores Master.' })
  }

  const reqInfo = e.requestInfo()
  const reqData = reqInfo.body || {}

  const email = (reqData.email || '').trim().toLowerCase()
  const password = (reqData.password || '').trim()
  const name = (reqData.name || '').trim()
  const isMasterPayload = Boolean(reqData.is_master)
  const empresaId = reqData.empresa_id || null
  const role = reqData.role || 'analista'

  if (!email || !password) {
    return e.json(400, { error: 'E-mail e senha são obrigatórios.' })
  }
  if (password.length < 8) {
    return e.json(400, { error: 'A senha deve ter no mínimo 8 caracteres.' })
  }

  const usersCollection = e.app.findCollectionByNameOrId('users')

  let existing = null
  try {
    existing = e.app.findFirstRecordByData('users', 'email', email)
  } catch (_) {}

  if (existing) {
    return e.json(400, { error: 'Já existe um usuário cadastrado com este e-mail.' })
  }

  const userRecord = new Record(usersCollection)
  userRecord.set('email', email)
  userRecord.set('password', password)
  userRecord.set('passwordConfirm', password)
  userRecord.set('name', name)
  userRecord.set('is_master', isMasterPayload)
  e.app.save(userRecord)

  let vinculoCriado = null
  if (empresaId) {
    try {
      const empresa = e.app.findRecordById('empresas', empresaId)
      if (empresa) {
        const membrosCollection = e.app.findCollectionByNameOrId('empresa_membros')
        const membroRecord = new Record(membrosCollection)
        membroRecord.set('user', userRecord.id)
        membroRecord.set('empresa', empresa.id)
        membroRecord.set('role', role)
        e.app.save(membroRecord)
        vinculoCriado = { empresa_id: empresa.id, role: role }
      }
    } catch (err) {
      console.error('Aviso ao vincular usuário à empresa:', err)
    }
  }

  return e.json(201, {
    success: true,
    user: {
      id: userRecord.id,
      email: userRecord.getString('email'),
      name: userRecord.getString('name'),
      is_master: userRecord.getBool('is_master'),
    },
    vinculo: vinculoCriado,
  })
})

// ---------------------------------------------------------------------------
// ADMIN: GET /backend/v1/admin/usuarios
// ---------------------------------------------------------------------------
routerAdd('GET', '/backend/v1/admin/usuarios', (e) => {
  const callerAuth = e.auth
  const callerIsMaster = Boolean(callerAuth && callerAuth.getBool('is_master'))
  if (!callerIsMaster) {
    return e.json(403, { error: 'Acesso restrito a Administradores Master.' })
  }

  const users = e.app.findRecordsByFilter('users', '1 = 1', '-created', 100)
  const empresas = e.app.findRecordsByFilter('empresas', '1 = 1', 'nome', 100)
  const membros = e.app.findRecordsByFilter('empresa_membros', '1 = 1', '-created', 500)

  const membrosMap = {}
  membros.forEach((m) => {
    const uId = m.getString('user')
    if (!membrosMap[uId]) membrosMap[uId] = []
    membrosMap[uId].push({
      id: m.id,
      empresa_id: m.getString('empresa'),
      role: m.getString('role'),
    })
  })

  const empresasMap = {}
  empresas.forEach((emp) => {
    empresasMap[emp.id] = {
      id: emp.id,
      nome: emp.getString('nome'),
      cnpj: emp.getString('cnpj'),
    }
  })

  const listaUsuarios = users.map((u) => {
    const uMembros = membrosMap[u.id] || []
    return {
      id: u.id,
      email: u.getString('email'),
      name: u.getString('name'),
      is_master: u.getBool('is_master'),
      created: u.getString('created'),
      vinculos: uMembros.map((vm) => ({
        id: vm.id,
        empresa_id: vm.empresa_id,
        empresa_nome: empresasMap[vm.empresa_id] ? empresasMap[vm.empresa_id].nome : 'Desconhecida',
        role: vm.role,
      })),
    }
  })

  const listaEmpresas = empresas.map((emp) => ({
    id: emp.id,
    nome: emp.getString('nome'),
    cnpj: emp.getString('cnpj'),
    created: emp.getString('created'),
  }))

  return e.json(200, {
    usuarios: listaUsuarios,
    empresas: listaEmpresas,
  })
})

// ---------------------------------------------------------------------------
// ADMIN: POST /backend/v1/admin/empresas
// ---------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/admin/empresas', (e) => {
  const callerAuth = e.auth
  const callerIsMaster = Boolean(callerAuth && callerAuth.getBool('is_master'))
  if (!callerIsMaster) {
    return e.json(403, { error: 'Acesso restrito a Administradores Master.' })
  }

  const reqInfo = e.requestInfo()
  const reqData = reqInfo.body || {}

  const nome = (reqData.nome || '').trim()
  const rawCnpj = (reqData.cnpj || '').toString().trim()
  const cnpjLimpo = rawCnpj.replace(/\D/g, '')
  const usuarioId = reqData.usuario_id || null
  const role = reqData.role || 'admin_master'

  if (!nome) {
    return e.json(400, { error: 'O nome da empresa é obrigatório.' })
  }

  if (cnpjLimpo && cnpjLimpo.length !== 14) {
    return e.json(400, {
      error: 'Quando informado, o CNPJ da empresa deve possuir exatamente 14 dígitos numéricos.',
    })
  }

  const empresasCollection = e.app.findCollectionByNameOrId('empresas')
  const empRecord = new Record(empresasCollection)
  empRecord.set('nome', nome)
  if (cnpjLimpo) {
    empRecord.set('cnpj', cnpjLimpo)
  }
  e.app.save(empRecord)

  let vinculo = null
  const userParaVincularId = usuarioId === 'self' || !usuarioId ? callerAuth.id : usuarioId
  if (userParaVincularId) {
    try {
      const membrosCollection = e.app.findCollectionByNameOrId('empresa_membros')
      const mRecord = new Record(membrosCollection)
      mRecord.set('user', userParaVincularId)
      mRecord.set('empresa', empRecord.id)
      mRecord.set('role', role)
      e.app.save(mRecord)
      vinculo = { user_id: userParaVincularId, role: role }
    } catch (err) {
      console.error('Aviso ao vincular usuário criador:', err)
    }
  }

  return e.json(201, {
    success: true,
    empresa: {
      id: empRecord.id,
      nome: empRecord.getString('nome'),
      cnpj: empRecord.getString('cnpj'),
    },
    vinculo: vinculo,
  })
})

// ---------------------------------------------------------------------------
// VIABILIDADE: POST /backend/v1/viabilidade/duplicar-cenario
// ---------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/viabilidade/duplicar-cenario', (e) => {
  const callerAuth = e.auth
  if (!callerAuth) {
    return e.json(401, { error: 'Não autenticado.' })
  }

  const reqInfo = e.requestInfo()
  const reqData = reqInfo.body || {}
  const cenarioId = reqData.cenario_id
  const novoNome = (reqData.novo_nome || '').trim()

  if (!cenarioId || !novoNome) {
    return e.json(400, { error: 'cenario_id e novo_nome são obrigatórios.' })
  }

  let cenarioOrigem = null
  try {
    cenarioOrigem = e.app.findRecordById('cenarios', cenarioId)
  } catch (_) {
    return e.json(404, { error: 'Cenário de origem não encontrado.' })
  }

  const estudoId = cenarioOrigem.getString('estudo')
  let estudo = null
  try {
    estudo = e.app.findRecordById('estudos', estudoId)
  } catch (_) {
    return e.json(404, { error: 'Estudo do cenário não encontrado.' })
  }

  const empresaId = estudo.getString('empresa')
  const callerIsMaster = Boolean(callerAuth.getBool('is_master'))

  let papel = null
  if (empresaId) {
    try {
      const records = e.app.findRecordsByFilter(
        'empresa_membros',
        `user = "${callerAuth.id}" && empresa = "${empresaId}"`,
        '-created',
        1,
      )
      if (records && records.length > 0) {
        papel = records[0].getString('role') || 'viewer'
      }
    } catch (_) {}
  }

  if (!callerIsMaster) {
    if (!papel) {
      return e.json(403, { error: 'Você não tem acesso ao estudo desta empresa.' })
    }
    if (papel === 'viewer') {
      return e.json(403, {
        error: 'Visualizadores (viewer) não possuem permissão para duplicar cenários.',
      })
    }
  }

  const cenariosCollection = e.app.findCollectionByNameOrId('cenarios')
  const novoCenario = new Record(cenariosCollection)
  novoCenario.set('estudo', estudoId)
  novoCenario.set('nome', novoNome)
  novoCenario.set('descricao', `Duplicado a partir de "${cenarioOrigem.getString('nome')}"`)
  novoCenario.set('is_base', false)
  novoCenario.set('schema_version', cenarioOrigem.getInt('schema_version') || 2)
  try {
    const rawOrigem = cenarioOrigem.getString('premissas')
    novoCenario.set('premissas', rawOrigem ? JSON.parse(rawOrigem) : {})
  } catch (_) {
    novoCenario.set('premissas', cenarioOrigem.get('premissas'))
  }
  novoCenario.set('is_stale', true)

  e.app.save(novoCenario)

  return e.json(201, {
    success: true,
    id: novoCenario.id,
    cenario: {
      id: novoCenario.id,
      nome: novoCenario.getString('nome'),
      estudo: novoCenario.getString('estudo'),
      is_base: novoCenario.getBool('is_base'),
      is_stale: novoCenario.getBool('is_stale'),
    },
  })
})

// ---------------------------------------------------------------------------
// VIABILIDADE: POST /backend/v1/viabilidade/simular
// ---------------------------------------------------------------------------
routerAdd('POST', '/backend/v1/viabilidade/simular', (e) => {
  const callerAuth = e.auth
  if (!callerAuth) {
    return e.json(401, { error: 'Não autenticado.' })
  }

  const reqInfo = e.requestInfo()
  const reqData = reqInfo.body || {}
  const cenarioId = reqData.cenario_id

  if (!cenarioId) {
    return e.json(400, { error: 'cenario_id é obrigatório.' })
  }

  let cenario = null
  try {
    cenario = e.app.findRecordById('cenarios', cenarioId)
  } catch (_) {
    return e.json(404, { error: 'Cenário não encontrado.' })
  }

  const estudoId = cenario.getString('estudo')
  let estudo = null
  try {
    estudo = e.app.findRecordById('estudos', estudoId)
  } catch (_) {
    return e.json(404, { error: 'Estudo associado não encontrado.' })
  }

  const empresaId = estudo.getString('empresa')
  const callerIsMaster = Boolean(callerAuth.getBool('is_master'))

  let papel = null
  if (empresaId) {
    try {
      const records = e.app.findRecordsByFilter(
        'empresa_membros',
        `user = "${callerAuth.id}" && empresa = "${empresaId}"`,
        '-created',
        1,
      )
      if (records && records.length > 0) {
        papel = records[0].getString('role') || 'viewer'
      }
    } catch (_) {}
  }

  if (!callerIsMaster) {
    if (!papel) {
      return e.json(403, { error: 'Você não tem acesso a esta empresa.' })
    }
    if (papel === 'viewer') {
      return e.json(403, {
        error: 'Visualizadores (viewer) não possuem permissão para executar simulações.',
      })
    }
  }

  let premissas = reqData.premissas
  if (!premissas || typeof premissas !== 'object') {
    try {
      const raw = cenario.getString('premissas')
      premissas = raw ? JSON.parse(raw) : null
    } catch (_) {
      premissas = null
    }
  }
  if (!premissas || typeof premissas !== 'object') {
    premissas = {}
  } else if (reqData.premissas && typeof reqData.premissas === 'object') {
    try {
      cenario.set('premissas', premissas)
      e.app.save(cenario)
    } catch (_) {}
  }

  const horizonte = estudo.getInt('horizonte_meses') || 36
  const mesInicial = estudo.getString('mes_inicial') || '2025-01'

  // Carrega motor determinístico fonte única. Nome local: pocketbase/hooks/viabilidade_core.pb.js;
  // no servidor o sufixo ".pb.js" do nome local vira "_pb.pb.js" e o nome publicado é viabilidade_core_pb.pb.js.
  const core = require(`${__hooks}/viabilidade_core_pb.pb.js`)

  // Validação estrita antes do cálculo: se houver pendências bloqueantes, retorna 422
  const errosValidacao = core.vb_validarPremissas(premissas, horizonte)
  if (errosValidacao && errosValidacao.length > 0) {
    return e.json(422, {
      status: 'erro_validacao',
      error: 'Premissas incompletas ou inválidas para cálculo determinístico.',
      pendencias: errosValidacao,
    })
  }

  let resultado = null
  try {
    resultado = core.vb_calcularSimulacao(premissas, horizonte, mesInicial)
  } catch (err) {
    const simulacoesCollection = e.app.findCollectionByNameOrId('simulacoes')
    const simFalha = new Record(simulacoesCollection)
    simFalha.set('cenario', cenario.id)
    simFalha.set('schema_version', 2)
    simFalha.set('status', 'falha')
    simFalha.set('erro_mensagem', String(err.message || err))
    simFalha.set('executado_por', callerAuth.id)
    simFalha.set('motor_versao', core.VB_MOTOR_VERSAO)
    simFalha.set('hash_premissas', core.vb_gerarHashPremissas(premissas))
    e.app.save(simFalha)

    return e.json(500, {
      status: 'falha',
      error: 'Erro no cálculo do motor: ' + (err.message || String(err)),
    })
  }

  const hashPremissas = core.vb_gerarHashPremissas(premissas)
  const motorVersao = core.VB_MOTOR_VERSAO

  // Grava simulação oficial de sucesso
  const simulacoesCollection = e.app.findCollectionByNameOrId('simulacoes')
  const simRecord = new Record(simulacoesCollection)
  simRecord.set('cenario', cenario.id)
  simRecord.set('schema_version', 2)
  simRecord.set('status', 'sucesso')
  simRecord.set('input_snapshot', premissas)
  simRecord.set('resultado', resultado)
  simRecord.set('executado_por', callerAuth.id)
  simRecord.set('motor_versao', motorVersao)
  simRecord.set('hash_premissas', hashPremissas)
  e.app.save(simRecord)

  // Atualiza cenário para não-stale
  cenario.set('is_stale', false)
  e.app.save(cenario)

  return e.json(200, {
    status: 'sucesso',
    simulacao_id: simRecord.id,
    motor_versao: motorVersao,
    hash_premissas: hashPremissas,
    resultado: resultado,
  })
})

// ---------------------------------------------------------------------------
// VIABILIDADE: GET /backend/v1/viabilidade/autoteste (só is_master, 403 para os demais)
// ---------------------------------------------------------------------------
routerAdd('GET', '/backend/v1/viabilidade/autoteste', (e) => {
  const callerAuth = e.auth
  const callerIsMaster = Boolean(callerAuth && callerAuth.getBool('is_master'))
  if (!callerIsMaster) {
    return e.json(403, { error: 'Acesso restrito a Administradores Master.' })
  }

  try {
    const core = require(`${__hooks}/viabilidade_core_pb.pb.js`)

    const casos = []

    const addCaso = (id, nome, esperado, obtido, passou, detalhe) => {
      casos.push({
        id: id,
        nome: nome,
        esperado: esperado,
        obtido: obtido,
        passou: Boolean(passou),
        detalhe: detalhe || '',
      })
    }

    const criarBaseMinima = () => ({
      salas: [],
      produtos: [],
      mix_por_sala: [],
      condicoes_pagamento: {
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
      },
      cancelamentos_inadimplencia: {
        multipropriedade: {
          cancelamento: { taxa: 0, mes_medio: 1, taxa_devolucao: 0, prazo_devolucao: 1 },
          inadimplencia: { taxa: 0, parcela_recuperavel: 0, prazo_recuperacao: 1 },
        },
        timeshare: {
          cancelamento: { taxa: 0, mes_medio: 1, taxa_devolucao: 0, prazo_devolucao: 1 },
          inadimplencia: { taxa: 0, parcela_recuperavel: 0, prazo_recuperacao: 1 },
        },
      },
      remuneracoes: [],
      custos_despesas: [],
      investimentos: [],
      caixa_inicial: { comercializadora: 0, empreendimento: 0 },
    })

    // CASO 1: Blueprint 1
    try {
      const p = criarBaseMinima()
      p.salas = [
        {
          id: 's1',
          nome: 'Sala 1',
          capacidade_mensal: { base: 200 },
          pontos: [
            {
              id: 'p1',
              sala_id: 's1',
              nome: 'Ponto 1',
              etapa_entrada: 'comparecidos',
              volume_entrada: { base: 100 },
              taxa_comparecimento: { base: 0.5 },
              taxa_conversao_venda: { base: 0.2 },
              custo_transporte_unitario: { base: 0 },
            },
          ],
        },
      ]
      p.produtos = [
        {
          id: 'prod1',
          nome: 'Fração 1',
          modalidade: 'multipropriedade',
          preco: { base: 50000 },
          estoque_disponivel: 100,
        },
      ]
      p.mix_por_sala = [
        { sala_id: 's1', produtos: [{ produto_id: 'prod1', percentual: { base: 1.0 } }] },
      ]

      const res = core.vb_calcularSimulacao(p, 1, '2025-01')
      const vendas = res.funil_mensal[0].total_vendas_mes
      const ok = Math.abs(vendas - 20) < 0.0001
      addCaso(
        1,
        'Blueprint 1: Entrada 100 comparecidos, conversão 20% -> 20 vendas (sem reaplicar taxa comparecimento)',
        20,
        vendas,
        ok,
        ok ? 'Exatamente 20 vendas obtidas.' : `Obtido ${vendas}`,
      )
    } catch (err) {
      addCaso(
        1,
        'Blueprint 1: Entrada 100 comparecidos',
        20,
        'erro: ' + err.message,
        false,
        err.message,
      )
    }

    // CASO 2: Blueprint 2
    try {
      const p = criarBaseMinima()
      p.salas = [
        {
          id: 's2',
          nome: 'Sala 2',
          capacidade_mensal: { base: 60 },
          pontos: [
            {
              id: 'p2',
              sala_id: 's2',
              nome: 'Ponto 2',
              etapa_entrada: 'comparecidos',
              volume_entrada: { base: 100 },
              taxa_conversao_venda: { base: 0.2 },
              custo_transporte_unitario: { base: 0 },
            },
          ],
        },
      ]
      p.produtos = [
        {
          id: 'prod2',
          nome: 'Prod 2',
          modalidade: 'multipropriedade',
          preco: { base: 40000 },
          estoque_disponivel: 100,
        },
      ]
      p.mix_por_sala = [
        { sala_id: 's2', produtos: [{ produto_id: 'prod2', percentual: { base: 1.0 } }] },
      ]

      const res = core.vb_calcularSimulacao(p, 1, '2025-01')
      const s = res.funil_mensal[0].salas[0]
      const atendidos = s.atendimentos_efetivos
      const potenciais = s.vendas_potenciais
      const ok = Math.abs(atendidos - 60) < 0.0001 && Math.abs(potenciais - 12) < 0.0001
      addCaso(
        2,
        'Blueprint 2: Demanda 100, capacidade 60 e conversão 20% -> 60 atendidos, 12 vendas potenciais',
        { atendidos: 60, vendas_potenciais: 12 },
        { atendidos: atendidos, vendas_potenciais: potenciais },
        ok,
        ok ? 'Capacidade respeitada rigorosamente.' : 'Divergência',
      )
    } catch (err) {
      addCaso(
        2,
        'Blueprint 2: Demanda 100, capacidade 60',
        { atendidos: 60, vendas_potenciais: 12 },
        'erro: ' + err.message,
        false,
        err.message,
      )
    }

    // CASO 3: Blueprint 3
    try {
      const p = criarBaseMinima()
      p.salas = [
        {
          id: 's3',
          nome: 'Sala 3',
          capacidade_mensal: { base: 200 },
          pontos: [
            {
              id: 'p3',
              sala_id: 's3',
              nome: 'Ponto 3',
              etapa_entrada: 'comparecidos',
              volume_entrada: { base: 100 },
              taxa_conversao_venda: { base: 0.2 },
              custo_transporte_unitario: { base: 0 },
            },
          ],
        },
      ]
      p.produtos = [
        {
          id: 'prod3',
          nome: 'Prod 3',
          modalidade: 'multipropriedade',
          preco: { base: 30000 },
          estoque_disponivel: 10,
        },
      ]
      p.mix_por_sala = [
        { sala_id: 's3', produtos: [{ produto_id: 'prod3', percentual: { base: 1.0 } }] },
      ]

      const res = core.vb_calcularSimulacao(p, 1, '2025-01')
      const vendas = res.funil_mensal[0].total_vendas_mes
      const vgv = res.funil_mensal[0].total_vgv_mes
      const recusadas = res.resumo_global.vendas_recusadas_estoque_total
      const ok =
        Math.abs(vendas - 10) < 0.0001 &&
        Math.abs(vgv - 300000) < 0.01 &&
        Math.abs(recusadas - 10) < 0.0001
      addCaso(
        3,
        'Blueprint 3: Potencial 20 vendas, estoque 10 e preço R$ 30 mil -> 10 vendas, VGV R$ 300 mil',
        { vendas: 10, vgv: 300000, recusadas_estoque: 10 },
        { vendas: vendas, vgv: vgv, recusadas_estoque: recusadas },
        ok,
        ok ? 'Estoque limitou exatamente em 10 vendas e R$ 300k VGV.' : 'Divergência',
      )
    } catch (err) {
      addCaso(3, 'Blueprint 3: Estoque limitado', {}, 'erro: ' + err.message, false, err.message)
    }

    // CASO 4: Blueprint 4
    try {
      const p = criarBaseMinima()
      p.salas = [
        {
          id: 's4',
          nome: 'Sala 4',
          capacidade_mensal: { base: 10 },
          pontos: [
            {
              id: 'p4',
              sala_id: 's4',
              nome: 'Ponto 4',
              etapa_entrada: 'comparecidos',
              volume_entrada: { base: 1, ajustes: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
              taxa_conversao_venda: { base: 1.0 },
              custo_transporte_unitario: { base: 0 },
            },
          ],
        },
      ]
      p.produtos = [
        {
          id: 'prod4',
          nome: 'Prod 4',
          modalidade: 'multipropriedade',
          preco: { base: 100000 },
          estoque_disponivel: 10,
        },
      ]
      p.mix_por_sala = [
        { sala_id: 's4', produtos: [{ produto_id: 'prod4', percentual: { base: 1.0 } }] },
      ]
      p.condicoes_pagamento.multipropriedade = {
        perc_entrada: 0.2,
        parcelas_entrada: 2,
        mes_primeira_saldo: 2,
        parcelas_saldo: 4,
      }

      const res = core.vb_calcularSimulacao(p, 6, '2025-01')
      const recs = [0, 1, 2, 3, 4, 5].map(
        (idx) => res.empreendimento.fluxos_mensais[idx].recebimentos_brutos,
      )
      const esp = [10000, 10000, 20000, 20000, 20000, 20000]
      let ok = true
      for (let k = 0; k < 6; k++) {
        if (Math.abs(recs[k] - esp[k]) > 0.01) ok = false
      }
      addCaso(
        4,
        'Blueprint 4: Contrato R$ 100k, entrada 20% M0/M1 e saldo 4 parcelas a partir de M2 -> 10k M0/M1 e 20k M2-M5',
        esp,
        recs,
        ok,
        ok ? 'Cronograma de parcelamento perfeitamente distribuído.' : 'Divergência',
      )
    } catch (err) {
      addCaso(
        4,
        'Blueprint 4: Cronograma de cobrança',
        [],
        'erro: ' + err.message,
        false,
        err.message,
      )
    }

    // CASO 5: Blueprint 5
    try {
      const p = criarBaseMinima()
      p.salas = [
        {
          id: 's5',
          nome: 'Sala 5',
          capacidade_mensal: { base: 10 },
          pontos: [
            {
              id: 'p5',
              sala_id: 's5',
              nome: 'Ponto 5',
              etapa_entrada: 'comparecidos',
              volume_entrada: { base: 1, ajustes: { 1: 0, 2: 0 } },
              taxa_conversao_venda: { base: 1.0 },
              custo_transporte_unitario: { base: 0 },
            },
          ],
        },
      ]
      p.produtos = [
        {
          id: 'prod5',
          nome: 'Prod 5',
          modalidade: 'multipropriedade',
          preco: { base: 100000 },
          estoque_disponivel: 10,
        },
      ]
      p.mix_por_sala = [
        { sala_id: 's5', produtos: [{ produto_id: 'prod5', percentual: { base: 1.0 } }] },
      ]
      p.condicoes_pagamento.multipropriedade = {
        perc_entrada: 1.0,
        parcelas_entrada: 1,
        mes_primeira_saldo: 1,
        parcelas_saldo: 0,
      }
      p.cancelamentos_inadimplencia.multipropriedade.inadimplencia = {
        taxa: 0.1,
        parcela_recuperavel: 0.5,
        prazo_recuperacao: 2,
      }

      const res = core.vb_calcularSimulacao(p, 3, '2025-01')
      const m0 = res.empreendimento.fluxos_mensais[0].recebimentos_brutos
      const m1 = res.empreendimento.fluxos_mensais[1].recebimentos_brutos
      const m2 = res.empreendimento.fluxos_mensais[2].recebimentos_brutos
      const ok =
        Math.abs(m0 - 90000) < 0.01 && Math.abs(m1 - 0) < 0.01 && Math.abs(m2 - 5000) < 0.01
      addCaso(
        5,
        'Blueprint 5: Cobrança R$ 100k, inadimplência 10%, recuperação 50% em 2 meses -> 90k M0, 0k M1, 5k M2',
        { m0: 90000, m1: 0, m2: 5000 },
        { m0: m0, m1: m1, m2: m2 },
        ok,
        ok ? 'Inadimplência e recuperação conformes.' : 'Divergência',
      )
    } catch (err) {
      addCaso(
        5,
        'Blueprint 5: Inadimplência e recuperação',
        {},
        'erro: ' + err.message,
        false,
        err.message,
      )
    }

    // CASO 6: Blueprint 6
    try {
      const p = criarBaseMinima()
      p.salas = [
        {
          id: 's6',
          nome: 'Sala 6',
          capacidade_mensal: { base: 10 },
          pontos: [
            {
              id: 'p6',
              sala_id: 's6',
              nome: 'Ponto 6',
              etapa_entrada: 'comparecidos',
              volume_entrada: { base: 1, ajustes: { 1: 0, 2: 0 } },
              taxa_conversao_venda: { base: 1.0 },
              custo_transporte_unitario: { base: 0 },
            },
          ],
        },
      ]
      p.produtos = [
        {
          id: 'prod6',
          nome: 'Prod 6',
          modalidade: 'multipropriedade',
          preco: { base: 100000 },
          estoque_disponivel: 10,
        },
      ]
      p.mix_por_sala = [
        { sala_id: 's6', produtos: [{ produto_id: 'prod6', percentual: { base: 1.0 } }] },
      ]
      p.condicoes_pagamento.multipropriedade = {
        perc_entrada: 1.0,
        parcelas_entrada: 1,
        mes_primeira_saldo: 1,
        parcelas_saldo: 0,
      }
      p.cancelamentos_inadimplencia.multipropriedade.cancelamento = {
        taxa: 1.0,
        mes_medio: 1,
        taxa_devolucao: 0.8,
        prazo_devolucao: 1,
      }

      const res = core.vb_calcularSimulacao(p, 3, '2025-01')
      const recM0 = res.empreendimento.fluxos_mensais[0].recebimentos_brutos
      const devM2 = res.empreendimento.fluxos_mensais[2].devolucoes
      const saldoM2 = res.empreendimento.fluxos_mensais[2].saldo_acumulado
      const ok =
        Math.abs(recM0 - 100000) < 0.01 &&
        Math.abs(devM2 - 80000) < 0.01 &&
        Math.abs(saldoM2 - 20000) < 0.01
      addCaso(
        6,
        'Blueprint 6: Venda R$ 100k M0, cancelamento 100% M1, devolução 80% M2 -> entrada 100k M0, saída 80k M2, saldo 20k',
        { entrada_m0: 100000, devolucao_m2: 80000, saldo_final: 20000 },
        { entrada_m0: recM0, devolucao_m2: devM2, saldo_final: saldoM2 },
        ok,
        ok ? 'Sem dedução dupla no caixa.' : 'Divergência',
      )
    } catch (err) {
      addCaso(
        6,
        'Blueprint 6: Cancelamento sem dedução dupla',
        {},
        'erro: ' + err.message,
        false,
        err.message,
      )
    }

    // CASO 7: Blueprint 7
    try {
      const p = criarBaseMinima()
      // Estrutura comercial mínima (sala + produto + mix) com volume de entrada 0:
      // necessária para passar na validação sem alterar os valores esperados do caso.
      p.salas = [
        {
          id: 's7',
          nome: 'Sala 7',
          capacidade_mensal: { base: 10 },
          pontos: [
            {
              id: 'p7',
              sala_id: 's7',
              nome: 'Ponto 7',
              etapa_entrada: 'comparecidos',
              volume_entrada: { base: 0 },
              taxa_conversao_venda: { base: 0 },
              custo_transporte_unitario: { base: 0 },
            },
          ],
        },
      ]
      p.produtos = [
        {
          id: 'prod7',
          nome: 'Prod 7',
          modalidade: 'multipropriedade',
          preco: { base: 100000 },
          estoque_disponivel: 10,
        },
      ]
      p.mix_por_sala = [
        { sala_id: 's7', produtos: [{ produto_id: 'prod7', percentual: { base: 1.0 } }] },
      ]
      p.remuneracoes = [
        {
          id: 'rem1',
          nome: 'Fixo Comercial',
          tipo: 'fixo',
          valor: { base: 10000 },
          adicional_ou_compensavel: 'adicional',
        },
      ]

      const res = core.vb_calcularSimulacao(p, 1, '2025-01')
      const comRec = res.comercializadora.fluxos_mensais[0].receita_remuneracao
      const empRep = res.empreendimento.fluxos_mensais[0].repasse_comercial
      const consolidadoEfeito = comRec - empRep
      const ok =
        Math.abs(comRec - 10000) < 0.01 &&
        Math.abs(empRep - 10000) < 0.01 &&
        Math.abs(consolidadoEfeito) < 0.01
      addCaso(
        7,
        'Blueprint 7: Transferência interna R$ 10 mil -> +10k comercializadora, -10k empreendimento, zero consolidado',
        { comercializadora: 10000, empreendimento: 10000, consolidado: 0 },
        { comercializadora: comRec, empreendimento: empRep, consolidado: consolidadoEfeito },
        ok,
        ok ? 'Efeito consolidado estritamente nulo.' : 'Divergência',
      )
    } catch (err) {
      addCaso(
        7,
        'Blueprint 7: Transferência interna',
        {},
        'erro: ' + err.message,
        false,
        err.message,
      )
    }

    // CASO 8: Blueprint 8
    try {
      const p = criarBaseMinima()
      p.salas = [
        {
          id: 's8',
          nome: 'Sala 8',
          capacidade_mensal: { base: 10 },
          pontos: [
            {
              id: 'p8',
              sala_id: 's8',
              nome: 'Ponto 8',
              etapa_entrada: 'comparecidos',
              volume_entrada: { base: 1 },
              taxa_conversao_venda: { base: 1.0 },
              custo_transporte_unitario: { base: 0 },
            },
          ],
        },
      ]
      p.produtos = [
        {
          id: 'prod8',
          nome: 'Prod 8',
          modalidade: 'multipropriedade',
          preco: { base: 50000 },
          estoque_disponivel: 10,
        },
      ]
      p.mix_por_sala = [
        { sala_id: 's8', produtos: [{ produto_id: 'prod8', percentual: { base: 1.0 } }] },
      ]
      p.condicoes_pagamento.multipropriedade = {
        perc_entrada: 1.0,
        parcelas_entrada: 1,
        mes_primeira_saldo: 1,
        parcelas_saldo: 0,
      }
      p.custos_despesas = [
        {
          id: 'c8',
          nome: 'Custos Próprios',
          tipo: 'fixo',
          valor: { base: 70000 },
          responsavel_economico: 'empreendimento',
        },
      ]
      p.investimentos = [
        {
          id: 'inv8',
          descricao: 'Obra M0',
          categoria: 'obra/reforma',
          mes: 0,
          valor: 30000,
          parte: 'empreendimento',
        },
      ]

      const res = core.vb_calcularSimulacao(p, 1, '2025-01')
      const emp = res.empreendimento.fluxos_mensais[0]
      const rec = emp.recebimentos_brutos
      const custos = emp.custos_proprios
      const inv = emp.investimentos
      const liq = emp.fluxo_liquido
      const ok =
        Math.abs(rec - 50000) < 0.01 &&
        Math.abs(custos - 70000) < 0.01 &&
        Math.abs(inv - 30000) < 0.01 &&
        Math.abs(liq - -50000) < 0.01
      addCaso(
        8,
        'Blueprint 8: Recebimentos R$ 50k, custos R$ 70k, invest R$ 30k -> déficit R$ 50k (sem duplicar investimento)',
        { recebimentos: 50000, custos: 70000, investimento: 30000, fluxo_liquido: -50000 },
        { recebimentos: rec, custos: custos, investimento: inv, fluxo_liquido: liq },
        ok,
        ok ? 'Investimento impacta caixa sem virar custo operacional.' : 'Divergência',
      )
    } catch (err) {
      addCaso(
        8,
        'Blueprint 8: Déficit e investimentos',
        {},
        'erro: ' + err.message,
        false,
        err.message,
      )
    }

    // CASO 9: Venda R$ 100 mil sem cancelamento
    try {
      const p = criarBaseMinima()
      p.salas = [
        {
          id: 's9',
          nome: 'Sala 9',
          capacidade_mensal: { base: 10 },
          pontos: [
            {
              id: 'p9',
              sala_id: 's9',
              nome: 'Ponto 9',
              etapa_entrada: 'comparecidos',
              volume_entrada: { base: 1 },
              taxa_conversao_venda: { base: 1.0 },
              custo_transporte_unitario: { base: 0 },
            },
          ],
        },
      ]
      p.produtos = [
        {
          id: 'prod9',
          nome: 'Prod 9',
          modalidade: 'multipropriedade',
          preco: { base: 100000 },
          estoque_disponivel: 10,
        },
      ]
      p.mix_por_sala = [
        { sala_id: 's9', produtos: [{ produto_id: 'prod9', percentual: { base: 1.0 } }] },
      ]
      p.condicoes_pagamento.multipropriedade = {
        perc_entrada: 1.0,
        parcelas_entrada: 1,
        mes_primeira_saldo: 1,
        parcelas_saldo: 0,
      }

      const res = core.vb_calcularSimulacao(p, 1, '2025-01')
      const totalRecebido = res.resumo_global.recebimentos_compradores_total
      const ok = Math.abs(totalRecebido - 100000) < 0.01
      addCaso(
        9,
        'Venda R$ 100 mil sem cancelamento -> recebido R$ 100.000',
        100000,
        totalRecebido,
        ok,
        ok ? 'Total recebido integralmente R$ 100.000.' : `Obtido ${totalRecebido}`,
      )
    } catch (err) {
      addCaso(
        9,
        'Venda R$ 100k sem cancelamento',
        100000,
        'erro: ' + err.message,
        false,
        err.message,
      )
    }

    // CASO 10: Cancelamento 10% no mês 3, devolução 50%, prazo 1 -> recebido R$ 94.000 e devolução R$ 2.000 em M4
    try {
      const p = criarBaseMinima()
      p.salas = [
        {
          id: 's10',
          nome: 'Sala 10',
          capacidade_mensal: { base: 10 },
          pontos: [
            {
              id: 'p10',
              sala_id: 's10',
              nome: 'Ponto 10',
              etapa_entrada: 'comparecidos',
              volume_entrada: { base: 1, ajustes: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
              taxa_conversao_venda: { base: 1.0 },
              custo_transporte_unitario: { base: 0 },
            },
          ],
        },
      ]
      p.produtos = [
        {
          id: 'prod10',
          nome: 'Prod 10',
          modalidade: 'multipropriedade',
          preco: { base: 100000 },
          estoque_disponivel: 10,
        },
      ]
      p.mix_por_sala = [
        { sala_id: 's10', produtos: [{ produto_id: 'prod10', percentual: { base: 1.0 } }] },
      ]
      p.condicoes_pagamento.multipropriedade = {
        perc_entrada: 0.4,
        parcelas_entrada: 2, // M0 = 20k, M1 = 20k (soma antes de M3 = 40k)
        mes_primeira_saldo: 3,
        parcelas_saldo: 3, // M3=20k, M4=20k, M5=20k
      }
      p.cancelamentos_inadimplencia.multipropriedade.cancelamento = {
        taxa: 0.1,
        mes_medio: 3,
        taxa_devolucao: 0.5,
        prazo_devolucao: 1,
      }

      const res = core.vb_calcularSimulacao(p, 6, '2025-01')
      const totalRecebido = res.resumo_global.recebimentos_compradores_total
      const devM4 = res.empreendimento.fluxos_mensais[4].devolucoes
      const ok = Math.abs(totalRecebido - 94000) < 0.01 && Math.abs(devM4 - 2000) < 0.01
      addCaso(
        10,
        'Cancelamento 10% M3, devolução 50%, prazo 1 -> recebido R$ 94.000 e devolução R$ 2.000 em M4',
        { recebido: 94000, devolucao_m4: 2000 },
        { recebido: totalRecebido, devolucao_m4: devM4 },
        ok,
        ok
          ? 'Recebido R$ 94k e devolução de R$ 2k em M4 comprovados.'
          : `recebido=${totalRecebido}, devM4=${devM4}`,
      )
    } catch (err) {
      addCaso(10, 'Cancelamento 10% M3', {}, 'erro: ' + err.message, false, err.message)
    }

    // CASO 11: Reembolso de despesa R$ 10 mil em 2 meses
    try {
      const p = criarBaseMinima()
      // Estrutura comercial mínima (sala + produto + mix) com volume de entrada 0:
      // necessária para passar na validação sem alterar os valores esperados do caso.
      p.salas = [
        {
          id: 's11',
          nome: 'Sala 11',
          capacidade_mensal: { base: 10 },
          pontos: [
            {
              id: 'p11',
              sala_id: 's11',
              nome: 'Ponto 11',
              etapa_entrada: 'comparecidos',
              volume_entrada: { base: 0 },
              taxa_conversao_venda: { base: 0 },
              custo_transporte_unitario: { base: 0 },
            },
          ],
        },
      ]
      p.produtos = [
        {
          id: 'prod11',
          nome: 'Prod 11',
          modalidade: 'multipropriedade',
          preco: { base: 100000 },
          estoque_disponivel: 10,
        },
      ]
      p.mix_por_sala = [
        { sala_id: 's11', produtos: [{ produto_id: 'prod11', percentual: { base: 1.0 } }] },
      ]
      p.custos_despesas = [
        {
          id: 'cd11',
          nome: 'Despesa Reembolsável',
          tipo: 'fixo',
          valor: { base: 10000, ajustes: { 1: 0, 2: 0 } },
          pagador_inicial: 'comercializadora',
          responsavel_economico: 'empreendimento',
          prazo_pagamento_meses: 0,
          prazo_reembolso_meses: 2,
        },
      ]

      const res = core.vb_calcularSimulacao(p, 3, '2025-01')
      const comCustoM0 = res.comercializadora.fluxos_mensais[0].custos_operacionais
      const comReembM2 = res.comercializadora.fluxos_mensais[2].reembolsos_recebidos
      const empReembM2 = res.empreendimento.fluxos_mensais[2].reembolsos_pagos
      const ok =
        Math.abs(comCustoM0 - 10000) < 0.01 &&
        Math.abs(comReembM2 - 10000) < 0.01 &&
        Math.abs(empReembM2 - 10000) < 0.01
      addCaso(
        11,
        'Reembolso de despesa R$ 10 mil em 2 meses -> M0 comercializadora paga 10k, M2 empreendimento reembolsa 10k',
        { com_custo_m0: 10000, com_reemb_m2: 10000, emp_reemb_m2: 10000 },
        { com_custo_m0: comCustoM0, com_reemb_m2: comReembM2, emp_reemb_m2: empReembM2 },
        ok,
        ok
          ? 'Reembolso agendado e quitado em 2 meses com transferências equilibradas.'
          : 'Divergência',
      )
    } catch (err) {
      addCaso(11, 'Reembolso de despesa', {}, 'erro: ' + err.message, false, err.message)
    }

    // CASO 12: Retenção de entrada (Item 3 do prompt)
    try {
      const p = criarBaseMinima()
      p.salas = [
        {
          id: 's12',
          nome: 'Sala 12',
          capacidade_mensal: { base: 100 },
          pontos: [
            {
              id: 'p12',
              sala_id: 's12',
              nome: 'Ponto 12',
              etapa_entrada: 'comparecidos',
              volume_entrada: { base: 10 },
              taxa_conversao_venda: { base: 0.1 },
              custo_transporte_unitario: { base: 0 },
            },
          ],
        },
      ]
      p.produtos = [
        {
          id: 'prod12',
          nome: 'Fração 12',
          modalidade: 'multipropriedade',
          preco: { base: 100000 },
          estoque_disponivel: 10,
        },
      ]
      p.mix_por_sala = [
        { sala_id: 's12', produtos: [{ produto_id: 'prod12', percentual: { base: 1.0 } }] },
      ]
      p.condicoes_pagamento.multipropriedade = {
        perc_entrada: 0.2,
        parcelas_entrada: 1,
        mes_primeira_saldo: 0,
        parcelas_saldo: 1,
      }
      p.remuneracoes = [
        {
          id: 'rem_fixo',
          nome: 'Remuneração Comercial',
          tipo: 'fixo',
          valor: { base: 10000 },
          adicional_ou_compensavel: 'adicional',
        },
        {
          id: 'rem_ret',
          nome: 'Retenção de Entrada',
          tipo: 'retencao_entrada',
          valor: { base: 0.2 },
          adicional_ou_compensavel: 'adicional',
        },
      ]

      const res = core.vb_calcularSimulacao(p, 1, '2025-01')
      const mes0Com = res.comercializadora.fluxos_mensais[0]
      const mes0Emp = res.empreendimento.fluxos_mensais[0]

      const comFluxo = mes0Com.fluxo_liquido
      const empRecebimentoLiq = mes0Emp.recebimentos_brutos
      const empRepasse = mes0Emp.repasse_comercial
      const empFluxo = mes0Emp.fluxo_liquido
      const consolidado = comFluxo + empFluxo

      const ok =
        Math.abs(comFluxo - 10000) < 0.01 &&
        Math.abs(empRecebimentoLiq - 96000) < 0.01 &&
        Math.abs(empRepasse - 6000) < 0.01 &&
        Math.abs(empFluxo - 90000) < 0.01 &&
        Math.abs(consolidado - 100000) < 0.01

      addCaso(
        12,
        'Retenção de entrada (Item 3): Compradores R$ 100k, entrada R$ 20k, ret 20% (4k), rem 10k -> Com +10k, Emp +96k - 6k = +90k, Consolidado R$ 100k',
        {
          comercializadora: 10000,
          empreendimento_recebido: 96000,
          repasse: 6000,
          empreendimento_liquido: 90000,
          consolidado: 100000,
        },
        {
          comercializadora: comFluxo,
          empreendimento_recebido: empRecebimentoLiq,
          repasse: empRepasse,
          empreendimento_liquido: empFluxo,
          consolidado: consolidado,
        },
        ok,
        ok
          ? 'Caso de retenção de entrada comprovado com exatidão matemática.'
          : 'Divergência de valores',
      )
    } catch (err) {
      addCaso(12, 'Retenção de entrada', {}, 'erro: ' + err.message, false, err.message)
    }

    // CASO 13: Cenário vazio -> pendências de sala, produto e caixa inicial
    try {
      const p = criarBaseMinima()
      p.salas = []
      p.produtos = []
      p.mix_por_sala = []
      p.caixa_inicial = null
      const pend = core.vb_validarPremissas(p, 12)
      const temSala = pend.some(
        (x) =>
          ((x && x.caminho) || '').indexOf('salas') >= 0 ||
          ((x && x.mensagem) || '').indexOf('sala') >= 0,
      )
      const temProduto = pend.some(
        (x) =>
          ((x && x.caminho) || '').indexOf('produtos') >= 0 ||
          ((x && x.mensagem) || '').indexOf('produto') >= 0,
      )
      const temCaixa = pend.some(
        (x) =>
          ((x && x.caminho) || '').indexOf('caixa_inicial') >= 0 ||
          ((x && x.mensagem) || '').indexOf('caixa') >= 0,
      )
      const ok = pend.length > 0 && temSala && temProduto && temCaixa
      addCaso(
        13,
        'Cenário vazio -> pendências apontando sala, produto e caixa inicial (bloqueio antes do cálculo)',
        { pendencias: '>0', sala: true, produto: true, caixa: true },
        { total: pend.length, sala: temSala, produto: temProduto, caixa: temCaixa },
        ok,
        ok ? 'Cenário vazio bloqueado com pendências por aba.' : 'Divergência',
      )
    } catch (err) {
      addCaso(13, 'Cenário vazio', {}, 'erro: ' + err.message, false, err.message)
    }

    // CASO 14: Caixa inicial 0 digitado -> aceito sem pendência
    try {
      const p = criarBaseMinima()
      p.salas = [
        {
          id: 's14',
          nome: 'Sala 14',
          capacidade_mensal: { base: 60 },
          pontos: [
            {
              id: 'p14',
              sala_id: 's14',
              nome: 'Ponto 14',
              etapa_entrada: 'comparecidos',
              volume_entrada: { base: 100 },
              taxa_conversao_venda: { base: 0.2 },
              custo_transporte_unitario: { base: 0 },
            },
          ],
        },
      ]
      p.produtos = [
        {
          id: 'prod14',
          nome: 'Prod 14',
          modalidade: 'multipropriedade',
          preco: { base: 40000 },
          estoque_disponivel: 100,
        },
      ]
      p.mix_por_sala = [
        { sala_id: 's14', produtos: [{ produto_id: 'prod14', percentual: { base: 1.0 } }] },
      ]
      p.caixa_inicial = { comercializadora: 0, empreendimento: 0 }
      const pend = core.vb_validarPremissas(p, 3)
      const ok = pend.length === 0
      addCaso(
        14,
        'Caixa inicial 0 digitado -> aceito sem pendência (0 é valor válido, não pendência)',
        { pendencias: 0 },
        { pendencias: pend.length, detalhes: pend.map((x) => x && x.mensagem) },
        ok,
        ok ? 'Cenário completo com caixa 0 digitado validado sem pendências.' : 'Divergência',
      )
    } catch (err) {
      addCaso(14, 'Caixa inicial 0 digitado', {}, 'erro: ' + err.message, false, err.message)
    }

    // CASO 15: Custo de transporte sem responsável -> pendência bloqueante
    try {
      const p = criarBaseMinima()
      p.salas = [
        {
          id: 's15',
          nome: 'Sala 15',
          capacidade_mensal: { base: 60 },
          pontos: [
            {
              id: 'p15',
              sala_id: 's15',
              nome: 'Ponto 15',
              etapa_entrada: 'comparecidos',
              volume_entrada: { base: 100 },
              taxa_conversao_venda: { base: 0.2 },
              custo_transporte_unitario: { base: 50 },
            },
          ],
        },
      ]
      p.produtos = [
        {
          id: 'prod15',
          nome: 'Prod 15',
          modalidade: 'multipropriedade',
          preco: { base: 40000 },
          estoque_disponivel: 100,
        },
      ]
      p.mix_por_sala = [
        { sala_id: 's15', produtos: [{ produto_id: 'prod15', percentual: { base: 1.0 } }] },
      ]
      const pend = core.vb_validarPremissas(p, 3)
      const temResp = pend.some(
        (x) =>
          ((x && x.caminho) || '').indexOf('responsavel_transporte') >= 0 ||
          ((x && x.mensagem) || '').indexOf('transporte') >= 0,
      )
      const ok = pend.length > 0 && temResp
      addCaso(
        15,
        'Custo de transporte sem responsável -> pendência bloqueante (sem default comercializadora)',
        { pendencias: '>0', transporte: true },
        { total: pend.length, transporte: temResp, detalhes: pend.map((x) => x && x.mensagem) },
        ok,
        ok ? 'Transporte sem responsável bloqueia o cálculo.' : 'Divergência',
      )
    } catch (err) {
      addCaso(15, 'Transporte sem responsável', {}, 'erro: ' + err.message, false, err.message)
    }

    const totalPassou = casos.filter((c) => c.passou).length
    const todosPassaram = totalPassou === casos.length

    return e.json(200, {
      motor_versao: core.VB_MOTOR_VERSAO,
      total_casos: casos.length,
      total_passou: totalPassou,
      todos_passaram: todosPassaram,
      casos: casos,
    })
  } catch (outerErr) {
    return e.json(500, {
      error:
        'Erro no autoteste: ' +
        (outerErr && outerErr.message ? outerErr.message : String(outerErr)),
      stack: outerErr && outerErr.stack ? outerErr.stack : '',
    })
  }
})
