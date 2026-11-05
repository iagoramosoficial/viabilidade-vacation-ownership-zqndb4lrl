/// <reference path="../types/pocketbase.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('cenarios')

    let isExemploField = null
    try {
      isExemploField = collection.fields.getByName('is_exemplo')
    } catch (_) {}

    if (!isExemploField) {
      collection.fields.add(
        new BoolField({
          name: 'is_exemplo',
          required: false,
        }),
      )
      app.save(collection)
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('cenarios')
    try {
      const field = collection.fields.getByName('is_exemplo')
      if (field) {
        collection.fields.remove(field)
        app.save(collection)
      }
    } catch (_) {}
  },
)
