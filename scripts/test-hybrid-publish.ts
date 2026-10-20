import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { publishGroup } from '../shared/publisher'
import { MODRINTH_INDEX_FILE, MODRINTH_META_DIR, safePackPath } from '../shared/modrinth'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paput-publisher-'))

try {
  const instanceDir = path.join(root, 'friends', 'hybrid-pack')
  const mod = Buffer.from('modrinth-owned-file')
  const config = Buffer.from('paput custom config')
  fs.mkdirSync(path.join(instanceDir, 'mods'), { recursive: true })
  fs.mkdirSync(path.join(instanceDir, 'config'), { recursive: true })
  fs.mkdirSync(path.join(instanceDir, MODRINTH_META_DIR), { recursive: true })
  fs.writeFileSync(path.join(instanceDir, 'mods', 'example.jar'), mod)
  fs.writeFileSync(path.join(instanceDir, 'config', 'paput.cfg'), config)
  fs.writeFileSync(
    path.join(instanceDir, 'instance.json'),
    JSON.stringify({
      name: 'Hybrid Pack',
      published: true,
      mcVersion: '1.21.1',
      loader: 'neoforge',
      loaderVersion: '21.1.1',
      serverAddress: 'localhost:25565',
    }),
  )
  fs.writeFileSync(
    path.join(instanceDir, MODRINTH_META_DIR, MODRINTH_INDEX_FILE),
    JSON.stringify({
      formatVersion: 1,
      game: 'minecraft',
      name: 'Hybrid Pack',
      dependencies: { minecraft: '1.21.1', neoforge: '21.1.1' },
      files: [
        {
          path: 'mods/example.jar',
          hashes: {
            sha1: crypto.createHash('sha1').update(mod).digest('hex'),
            sha512: crypto.createHash('sha512').update(mod).digest('hex'),
          },
          downloads: ['https://cdn.modrinth.com/data/project/versions/file.jar'],
          fileSize: mod.length,
        },
      ],
    }),
  )
  fs.writeFileSync(path.join(root, 'friends', 'group.json'), JSON.stringify({ name: 'Friends' }))

  publishGroup(root, 'friends', 'https://packs.example.com')
  const manifest = JSON.parse(fs.readFileSync(path.join(instanceDir, 'modpack.json'), 'utf8')) as {
    files: { name: string; path: string; url: string }[]
  }
  const external = manifest.files.find((file) => file.name === 'example.jar')
  const custom = manifest.files.find((file) => file.name === 'paput.cfg')

  assert.equal(external?.url, 'https://cdn.modrinth.com/data/project/versions/file.jar')
  assert.equal(custom?.url, 'https://packs.example.com/friends/hybrid-pack/files/config/paput.cfg')

  // Si el dueño modifica un archivo del pack, deja de confiar en la fuente
  // original y lo publica como archivo propio en R2.
  fs.writeFileSync(path.join(instanceDir, 'mods', 'example.jar'), 'locally-modified-mod')
  publishGroup(root, 'friends', 'https://packs.example.com')
  const changedManifest = JSON.parse(
    fs.readFileSync(path.join(instanceDir, 'modpack.json'), 'utf8'),
  ) as { files: { name: string; url: string }[] }
  assert.equal(
    changedManifest.files.find((file) => file.name === 'example.jar')?.url,
    'https://packs.example.com/friends/hybrid-pack/files/mods/example.jar',
  )
  assert.throws(() => safePackPath('../escape.jar'))
  assert.throws(() => safePackPath('C:/escape.jar'))
  console.log('Publicación híbrida verificada: Modrinth externo + archivos propios en R2.')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
