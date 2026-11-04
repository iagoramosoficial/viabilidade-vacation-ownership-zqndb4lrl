/// <reference path="../types/pocketbase.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('simulacoes')
    const fieldName = 'motor_versao'

    let fieldExists = false
    try {
      collection.fields.getByName(fieldName)
      fieldExists = true
    } catch (_) {
      fieldExists = false
    }

    if (!fieldExists) {
      collection.fields.add(
        new TextField({
          name: fieldName,
          required: false,
        }),
      )
      app.save(collection)
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('simulacoes')
    try {
      const field = collection.fields.getByName('motor_versao')
      if (field) {
        collection.fields.remove(field)
        app.save(collection)
      }
    } catch (_) {}
  },
)
