import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fixInstanceMods, inspectMods } from '../electron/services/mod-integrity'
import type { Instance } from '../shared/ipc'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paput-integrity-'))
  try {
    const mods = path.join(root, 'mods')
    fs.mkdirSync(mods)
    const good = Buffer.from('official-good')
    const changed = Buffer.from('official-original')
    fs.writeFileSync(path.join(mods, 'good.jar'), good)
    fs.writeFileSync(path.join(mods, 'changed.jar'), 'tampered')
    fs.writeFileSync(path.join(mods, 'extra.jar'), 'not-allowed')
    fs.mkdirSync(path.join(root, 'config'))
    fs.mkdirSync(path.join(root, 'resourcepacks'))
    fs.writeFileSync(path.join(root, 'config', 'personal.cfg'), 'keep-config')
    fs.writeFileSync(path.join(root, 'resourcepacks', 'personal.zip'), 'keep-pack')
    const files = [
      manifest('good.jar', good),
      manifest('changed.jar', changed),
      manifest('missing.jar', Buffer.from('missing')),
    ]

    const report = await inspectMods(root, files)
    assert.equal(report.status, 'issues')
    assert.deepEqual(
      report.issues.map((issue) => `${issue.kind}:${issue.path}`).sort(),
      ['missing:mods/missing.jar', 'modified:mods/changed.jar', 'unexpected:mods/extra.jar'],
    )

    // Para probar la reparación sin red se sirve el mismo manifiesto con fetch.
    const previousFetch = globalThis.fetch
    globalThis.fetch = async () => new Response(JSON.stringify({ files }))
    const instance = { id: 'test', modpackUrl: 'https://example.invalid/modpack.json' } as Instance
    const repaired = await fixInstanceMods(instance, root, 'repair')
    assert.equal(repaired.removed, 2)
    assert.equal(fs.existsSync(path.join(mods, 'good.jar')), true)
    assert.equal(fs.existsSync(path.join(mods, 'changed.jar')), false)
    assert.equal(fs.existsSync(path.join(mods, 'extra.jar')), false)

    fs.writeFileSync(path.join(mods, 'again.jar'), 'again')
    const reinstalled = await fixInstanceMods(instance, root, 'reinstall')
    assert.equal(reinstalled.removed, 2)
    assert.equal(fs.existsSync(mods), false)
    assert.equal(fs.readFileSync(path.join(root, 'config', 'personal.cfg'), 'utf8'), 'keep-config')
    assert.equal(fs.readFileSync(path.join(root, 'resourcepacks', 'personal.zip'), 'utf8'), 'keep-pack')
    globalThis.fetch = previousFetch
    console.log('Integridad verificada: detección, reparación selectiva y reinstalación de mods.')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

function manifest(name: string, data: Buffer) {
  return {
    name,
    path: 'mods/',
    size: data.length,
    sha1: crypto.createHash('sha1').update(data).digest('hex'),
    sha512: crypto.createHash('sha512').update(data).digest('hex'),
    type: 'MOD',
  }
}

void main()
