// pocketbase/migrations/0003_users_master_and_rules.js
// 1. users.createRule = null (cadastro público bloqueado no servidor)
// 2. Campo users.is_master (bool, opcional, padrão false)
// 3. users.updateRule impede que usuário comum altere is_master (ex.: @request.body.is_master:isset = false)
// 4. Marca is_master = true para e-mail configurado em MASTER_EMAIL se existir (idempotente)
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Adicionar campo is_master se não existir
    // Lembrar da regra: NUNCA required em bool (false é considerado vazio pelo PocketBase)
    if (!users.fields.getByName('is_master')) {
      users.fields.add(
        new BoolField({
          name: 'is_master',
          required: false,
        }),
      )
    }

    // 2. createRule = null (cadastro público bloqueado no servidor)
    users.createRule = null

    // 3. updateRule: usuário só pode atualizar a si mesmo E não pode setar/alterar is_master
    // @request.body.is_master:isset = false garante que ninguém pode enviar is_master no payload de update
    users.updateRule = 'id = @request.auth.id && @request.body.is_master:isset = false'

    // Salvar coleção users com o novo campo e regras
    app.save(users)

    // 4. Se houver segredo/env MASTER_EMAIL configurado, marcar o usuário como is_master=true se ele já existir
    const masterEmail = ($os.getenv('MASTER_EMAIL') || '').trim().toLowerCase()
    if (masterEmail) {
      try {
        const masterUser = app.findAuthRecordByEmail('_pb_users_auth_', masterEmail)
        masterUser.set('is_master', true)
        app.save(masterUser)
      } catch (_) {
        // Usuário com masterEmail ainda não foi criado no banco — sem erro, no-op seguro
      }
    }
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      const isMasterField = users.fields.getByName('is_master')
      if (isMasterField) {
        users.fields.removeByName('is_master')
      }
      users.createRule = ''
      users.updateRule = 'id = @request.auth.id'
      app.save(users)
    } catch (_) {}
  },
)
