/// <reference path="../types/pocketbase.d.ts" />

/**
 * pocketbase/hooks/teste_executor.pb.js
 * Executa o autoteste gravando em uma coleção ou log para conferência
 */

onBootstrap((e) => {
  e.next()

  try {
    const masterUser = e.app.findFirstRecordByData('users', 'is_master', true)
    if (!masterUser) {
      console.log('AUTOTESTE_EXEC: Nenhum usuário master encontrado')
      return
    }

    const token = masterUser.newAuthToken()
    // Porta padrão do pocketbase interno em Go
    const ports = ['8090', '8080']
    for (let i = 0; i < ports.length; i++) {
      try {
        const res = $http.send({
          url: 'http://127.0.0.1:' + ports[i] + '/backend/v1/viabilidade/autoteste',
          method: 'GET',
          headers: {
            Authorization: token,
          },
        })
        console.log('AUTOTESTE_PORT_' + ports[i] + '_STATUS:', res.statusCode)
        if (res.statusCode === 200) {
          console.log('AUTOTESTE_RES_EXATO:', res.raw)
          return
        }
      } catch (errHttp) {
        console.log('AUTOTESTE_PORT_' + ports[i] + '_ERR:', errHttp.message)
      }
    }
  } catch (err) {
    console.error('AUTOTESTE_BOOTSTRAP_ERR:', err)
  }
})
