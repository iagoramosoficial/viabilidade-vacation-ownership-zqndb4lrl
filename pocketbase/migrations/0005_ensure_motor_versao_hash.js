/// <reference path="../types/pocketbase.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('simulacoes')

    let motorVersaoField = null
    try {
      motorVersaoField = collection.fields.getByName('motor_versao')
    } catch (_) {}

    if (!motorVersaoField) {
      collection.fields.add(
        new TextField({
          name: 'motor_versao',
          required: false,
        }),
      )
    }

    let hashPremissasField = null
    try {
      hashPremissasField = collection.fields.getByName('hash_premissas')
    } catch (_) {}

    if (!hashPremissasField) {
      collection.fields.add(
        new TextField({
          name: 'hash_premissas',
          required: false,
        }),
      )
    }

    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('simulacoes')
    try {
      const f1 = collection.fields.getByName('motor_versao')
      if (f1) collection.fields.remove(f1)
    } catch (_) {}
    try {
      const f2 = collection.fields.getByName('hash_premissas')
      if (f2) collection.fields.remove(f2)
    } catch (_) {}
    app.save(collection)
  },
)
