// pocketbase/migrations/0009_lock_users_delete.js
// users.deleteRule = null (bloqueia autoexclusão direta pela API de usuários comuns).
// Manter as demais regras da coleção users como estão.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.deleteRule = null
    app.save(users)
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      users.deleteRule = 'id = @request.auth.id'
      app.save(users)
    } catch (_) {}
  },
)
