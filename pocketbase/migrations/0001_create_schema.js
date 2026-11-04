migrate(
  (app) => {
    // 1. empresas (Organizations / Companies)
    const empresas = new Collection({
      name: 'empresas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && criador = @request.auth.id",
      deleteRule: "@request.auth.id != '' && criador = @request.auth.id",
      fields: [
        { name: 'nome', type: 'text', required: true, min: 2, max: 200 },
        { name: 'cnpj', type: 'text', required: false, max: 20 },
        {
          name: 'criador',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_empresas_criador ON empresas (criador)'],
    })
    app.save(empresas)

    // 2. empresa_membros (RBAC link between user and empresa)
    const empresaMembros = new Collection({
      name: 'empresa_membros',
      type: 'base',
      listRule: "@request.auth.id != '' && user = @request.auth.id",
      viewRule: "@request.auth.id != '' && user = @request.auth.id",
      createRule: "@request.auth.id != '' && user = @request.auth.id",
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'empresa',
          type: 'relation',
          required: true,
          collectionId: empresas.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'user',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'role',
          type: 'select',
          required: true,
          values: ['admin_master', 'analista', 'viewer'],
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_empresa_user_unique ON empresa_membros (empresa, user)',
        'CREATE INDEX idx_empresa_membros_user ON empresa_membros (user)',
      ],
    })
    app.save(empresaMembros)

    // 3. estudos (Projects / Viability Studies)
    const estudos = new Collection({
      name: 'estudos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'empresa',
          type: 'relation',
          required: true,
          collectionId: empresas.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'nome', type: 'text', required: true, min: 2, max: 200 },
        { name: 'cidade', type: 'text', required: true, min: 2, max: 100 },
        { name: 'uf', type: 'text', required: true, min: 2, max: 2 },
        {
          name: 'estagio',
          type: 'select',
          required: true,
          values: ['operando', 'reforma/expansao', 'novo projeto', 'combinado'],
          maxSelect: 1,
        },
        { name: 'mes_inicial', type: 'text', required: true, pattern: '^\\d{4}-\\d{2}$' },
        {
          name: 'horizonte_meses',
          type: 'number',
          required: true,
          min: 1,
          max: 360,
          onlyInt: true,
        },
        { name: 'observacoes', type: 'text', required: false, max: 5000 },
        {
          name: 'criador',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_estudos_empresa ON estudos (empresa)',
        'CREATE INDEX idx_estudos_criador ON estudos (criador)',
      ],
    })
    app.save(estudos)

    // 4. cenarios (Scenarios of a Study)
    const cenarios = new Collection({
      name: 'cenarios',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'estudo',
          type: 'relation',
          required: true,
          collectionId: estudos.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'nome', type: 'text', required: true, min: 1, max: 100 },
        { name: 'descricao', type: 'text', required: false, max: 1000 },
        { name: 'is_base', type: 'bool', required: false },
        { name: 'schema_version', type: 'number', required: true, min: 1, onlyInt: true },
        { name: 'premissas', type: 'json', required: false },
        { name: 'is_stale', type: 'bool', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_cenarios_estudo ON cenarios (estudo)'],
    })
    app.save(cenarios)

    // 5. simulacoes (Deterministic Execution Runs)
    const simulacoes = new Collection({
      name: 'simulacoes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'cenario',
          type: 'relation',
          required: true,
          collectionId: cenarios.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'schema_version', type: 'number', required: true, min: 1, onlyInt: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['sucesso', 'falha', 'em_processamento'],
          maxSelect: 1,
        },
        { name: 'erro_mensagem', type: 'text', required: false, max: 2000 },
        { name: 'hash_premissas', type: 'text', required: false, max: 100 },
        { name: 'input_snapshot', type: 'json', required: false },
        { name: 'resultado', type: 'json', required: false },
        {
          name: 'executado_por',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_simulacoes_cenario ON simulacoes (cenario)'],
    })
    app.save(simulacoes)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('simulacoes'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('cenarios'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('estudos'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('empresa_membros'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('empresas'))
    } catch (_) {}
  },
)
