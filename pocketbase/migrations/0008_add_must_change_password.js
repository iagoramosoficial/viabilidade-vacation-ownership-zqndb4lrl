// pocketbase/migrations/0008_add_must_change_password.js
// 1. Adicionar campo must_change_password (bool, opcional, padrão false) na coleção de usuários (_pb_users_auth_)
// 2. No JSVM, collection.fields.getByName retorna vazio quando o campo não existe e NÃO lança erro.
// 3. Usuários existentes ficam false.
// 4. Regra de update: manter id = @request.auth.id && @request.body.is_master:isset = false
//    E acrescentar:
//    - O campo must_change_password só pode ser gravado como false se a senha for alterada na mesma requisição (@request.body.password:isset = true)
//    - Ninguém consegue gravar true pelo navegador (@request.body.must_change_password != true)
//    Ou seja:
//    (@request.body.must_change_password:isset = false || (@request.body.must_change_password = false && @request.body.password:isset = true))
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Adicionar campo must_change_password se não existir
    // Lembrar da regra: NUNCA required em bool (false é considerado vazio pelo PocketBase)
    const existingField = users.fields.getByName('must_change_password')
    if (!existingField) {
      users.fields.add(
        new BoolField({
          name: 'must_change_password',
          required: false,
        }),
      )
    }

    // 2. Atualizar updateRule
    // Regra anterior: id = @request.auth.id && @request.body.is_master:isset = false
    // Nova regra:
    // Mantém a restrição de is_master e restringe must_change_password:
    // (@request.body.must_change_password:isset = false || (@request.body.must_change_password = false && @request.body.password:isset = true))
    users.updateRule =
      'id = @request.auth.id && @request.body.is_master:isset = false && (@request.body.must_change_password:isset = false || (@request.body.must_change_password = false && @request.body.password:isset = true))'

    app.save(users)

    // 3. Garantir que usuários existentes fiquem com must_change_password = false
    try {
      app
        .db()
        .newQuery(
          'UPDATE users SET must_change_password = 0 WHERE must_change_password IS NULL OR must_change_password = ""',
        )
        .execute()
    } catch (err) {
      console.log('Aviso ao normalizar must_change_password:', err)
    }
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      const field = users.fields.getByName('must_change_password')
      if (field) {
        users.fields.removeByName('must_change_password')
      }
      users.updateRule = 'id = @request.auth.id && @request.body.is_master:isset = false'
      app.save(users)
    } catch (_) {}
  },
)
