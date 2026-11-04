/// <reference path="../types/pocketbase.d.ts" />

routerAdd('GET', '/backend/v1/test-autoteste-v12', (e) => {
  const master = e.app.findFirstRecordByData('users', 'is_master', true)
  const token = $tokens.recordAuthToken(e.app, master)

  const res = $http.send({
    url: 'https://viabilidade-vacation-ownership-00716.shrd01.internal.goskip.dev/backend/v1/viabilidade/autoteste',
    method: 'GET',
    headers: {
      Authorization: token,
    },
  })

  return e.json(200, {
    autoteste_status: res.statusCode,
    autoteste_json: res.json,
  })
})
