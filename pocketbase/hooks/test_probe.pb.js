/// <reference path="../types/pocketbase.d.ts" />

routerAdd('GET', '/backend/v1/test-autoteste-probe', function (e) {
  const core = require(`${__hooks}/viabilidade_core.js`)
  return e.json(200, {
    core_loaded: true,
    motor_versao: core.VB_MOTOR_VERSAO,
  })
})
