import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  cleanContentStore,
  contentStoreStats,
  installStoredFile,
  linkStoredObject,
  optimizeStudioStorage,
  storeExistingFile,
} from '../electron/services/content-store'

async function main() {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.paput-content-store-'))
  try {
    const modpacks = path.join(root, 'modpacks')
    const store = path.join(root, 'content', 'objects')
    const high = path.join(modpacks, 'castle-town', 'high')
    const low = path.join(modpacks, 'castle-town', 'low')
    const shared = Buffer.from('same-mod-content')
    const unique = Buffer.from('low-only-content')

    for (const instance of [high, low]) {
      fs.mkdirSync(path.join(instance, 'mods'), { recursive: true })
      fs.writeFileSync(path.join(instance, 'instance.json'), '{}')
      fs.writeFileSync(path.join(instance, 'mods', 'shared.jar'), shared)
    }
    fs.writeFileSync(path.join(low, 'mods', 'unique.jar'), unique)

    const result = await optimizeStudioStorage(modpacks, store)
    assert.equal(result.scannedFiles, 3)
    assert.equal(result.uniqueFiles, 2)
    assert.equal(result.savedBytes, shared.length)
    assert.equal(result.failedFiles, 0)

    const highShared = fs.statSync(path.join(high, 'mods', 'shared.jar'), { bigint: true })
    const lowShared = fs.statSync(path.join(low, 'mods', 'shared.jar'), { bigint: true })
    assert.equal(highShared.ino, lowShared.ino)
    assert.equal(highShared.dev, lowShared.dev)

    // Reemplazar HIGH debe romper solo su enlace, sin alterar LOW ni el objeto
    // anterior. Así añadir/actualizar un mod nunca modifica otras variantes.
    const replacement = path.join(root, 'replacement.jar')
    fs.writeFileSync(replacement, 'new-high-content')
    installStoredFile(replacement, path.join(high, 'mods', 'shared.jar'), store)
    assert.equal(fs.readFileSync(path.join(high, 'mods', 'shared.jar'), 'utf8'), 'new-high-content')
    assert.deepEqual(fs.readFileSync(path.join(low, 'mods', 'shared.jar')), shared)

    // El jugador puede reutilizar el mismo objeto publicado sin una segunda
    // copia. Un hash o tamaño incorrecto debe caer limpiamente en la descarga.
    const playerMod = path.join(root, 'player', 'mods', 'shared.jar')
    const sharedHash = crypto.createHash('sha512').update(shared).digest('hex')
    assert.equal(linkStoredObject(sharedHash, playerMod, store, shared.length), true)
    const playerStat = fs.statSync(playerMod, { bigint: true })
    assert.equal(playerStat.ino, lowShared.ino)
    assert.equal(playerStat.dev, lowShared.dev)
    assert.equal(linkStoredObject('not-a-hash', playerMod, store), false)
    assert.equal(linkStoredObject(sharedHash, playerMod, store, shared.length + 1), false)

    const beforeClean = contentStoreStats(store)
    assert.equal(beforeClean.referencedObjects, 3)
    assert.equal(beforeClean.savedBytes, shared.length)

    // Un objeto queda huérfano cuando desaparece su último destino. La limpieza
    // debe borrarlo sin tocar objetos todavía enlazados por LOW o el jugador.
    const disposable = path.join(root, 'temporary-instance', 'mods', 'unused.jar')
    fs.mkdirSync(path.dirname(disposable), { recursive: true })
    fs.writeFileSync(disposable, 'unused-content')
    storeExistingFile(disposable, store)
    fs.rmSync(disposable)
    const orphaned = contentStoreStats(store)
    assert.equal(orphaned.reclaimableObjects, 1)
    const cleaned = cleanContentStore(store)
    assert.equal(cleaned.removedObjects, 1)
    assert.equal(cleaned.stats.reclaimableObjects, 0)
    assert.equal(fs.readFileSync(playerMod, 'utf8'), shared.toString())

    console.log('Almacén verificado: deduplicación por hardlink y reemplazo aislado.')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

void main()

