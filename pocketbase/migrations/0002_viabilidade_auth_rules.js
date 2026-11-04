// 0002_viabilidade_auth_rules.js — Regras de autorização (Prompt 01 v1.3, achado 1)
// Aplicação incremental: só altera rules de coleções existentes (nenhum dado é tocado).
// Padrão PocketBase: migrate(up, down) com $app — NÃO usa pb.collection(...).rules.
migrate(
  (app) => {
    const auth = '@request.auth.id != ""'

    function aplicarRegras(nome, regras) {
      const c = app.findCollectionByNameOrId(nome)
      c.listRule = regras.listRule
      c.viewRule = regras.viewRule
      c.createRule = regras.createRule
      c.updateRule = regras.updateRule
      c.deleteRule = regras.deleteRule
      app.save(c)
    }

    // Back-relations reais do schema (campo empresa em empresa_membros → empresas):
    //   empresas → empresa_membros_via_empresa
    //   estudos  → empresa (direta)
    //   cenarios → estudo (direta)
    //   simulacoes → cenario (direta)
    // Filtro multi-match: as condições `?` combinadas no MESMO caminho de relação
    // devem casar no MESMO registro de vínculo (mesma linha de empresa_membros),
    // então `user ?= id && role ?!= 'viewer'` garante que o papel de LEITOR não
    // libera escrita mesmo que o usuário tenha outro vínculo viewer em outra empresa.

    // ===== EMPRESAS =====
    // Somente membros veem (criador entra pelo vínculo criado no endpoint de
    // bootstrap). Criação pública bloqueada (endpoint /backend/v1/viabilidade/empresa
    // cria empresa + vínculo admin_master do próprio chamador). Delete bloqueado.
    const regrasEmpresas = {
      listRule:
        auth +
        ' && (criador = @request.auth.id || empresa_membros_via_empresa.user ?= @request.auth.id)',
      viewRule:
        auth +
        ' && (criador = @request.auth.id || empresa_membros_via_empresa.user ?= @request.auth.id)',
      createRule: null,
      updateRule: auth + ' && criador = @request.auth.id',
      deleteRule: null,
    }

    // ===== EMPRESA_MEMBROS =====
    // Nenhuma operação pública direta (create/update/delete null): criação de vínculo
    // e promoção de papel só pelo endpoint do hook, que valida o chamador — o cliente
    // não se autoconcede papel.
    const regrasMembros = {
      listRule: auth + ' && user = @request.auth.id',
      viewRule: auth + ' && user = @request.auth.id',
      createRule: null,
      updateRule: null,
      deleteRule: null,
    }

    // ===== ESTUDOS / CENÁRIOS =====
    // Escopo derivado do recurso via relações (estudo → empresa; cenário → estudo),
    // nunca de campo do payload. Leitura: qualquer membro (inclui viewer).
    // Escrita: membro com role != viewer no MESMO vínculo.
    const leituraEstudo = auth + ' && empresa.empresa_membros_via_empresa.user ?= @request.auth.id'
    const escritaEstudo =
      leituraEstudo + " && empresa.empresa_membros_via_empresa.role ?!= 'viewer'"
    const leituraCenario =
      auth + ' && estudo.empresa.empresa_membros_via_empresa.user ?= @request.auth.id'
    const escritaCenario =
      leituraCenario + " && estudo.empresa.empresa_membros_via_empresa.role ?!= 'viewer'"

    const regrasEstudos = {
      listRule: leituraEstudo,
      viewRule: leituraEstudo,
      createRule: escritaEstudo,
      updateRule: escritaEstudo,
      deleteRule: escritaEstudo,
    }
    const regrasCenarios = {
      listRule: leituraCenario,
      viewRule: leituraCenario,
      createRule: escritaCenario,
      updateRule: escritaCenario,
      deleteRule: escritaCenario,
    }

    // ===== SIMULAÇÕES =====
    // Leitura: membro da empresa do cenário. create/update/delete null: resultado,
    // input_snapshot, hash_premissas e versão do motor só são gravados pelo hook
    // autorizado — nenhum cliente forja resultado oficial.
    const leituraSimulacao =
      auth + ' && cenario.estudo.empresa.empresa_membros_via_empresa.user ?= @request.auth.id'
    const regrasSimulacoes = {
      listRule: leituraSimulacao,
      viewRule: leituraSimulacao,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    }

    aplicarRegras('empresas', regrasEmpresas)
    aplicarRegras('empresa_membros', regrasMembros)
    aplicarRegras('estudos', regrasEstudos)
    aplicarRegras('cenarios', regrasCenarios)
    aplicarRegras('simulacoes', regrasSimulacoes)
  },
  (app) => {
    // rollback: restaura as regras anteriores (auditadas como permissivas demais)
    function restaurar(nome, rules) {
      try {
        const c = app.findCollectionByNameOrId(nome)
        c.listRule = rules.listRule
        c.viewRule = rules.viewRule
        c.createRule = rules.createRule
        c.updateRule = rules.updateRule
        c.deleteRule = rules.deleteRule
        app.save(c)
      } catch (_) {}
    }
    restaurar('empresas', {
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != "" && criador = @request.auth.id',
      deleteRule: '@request.auth.id != "" && criador = @request.auth.id',
    })
    restaurar('empresa_membros', {
      listRule: '@request.auth.id != "" && user = @request.auth.id',
      viewRule: '@request.auth.id != "" && user = @request.auth.id',
      createRule: '@request.auth.id != "" && user = @request.auth.id',
      updateRule: null,
      deleteRule: null,
    })
    restaurar('estudos', {
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    })
    restaurar('cenarios', {
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    })
    restaurar('simulacoes', {
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    })
  },
)
