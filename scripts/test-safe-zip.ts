import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
// @ts-expect-error yazl es una dependencia de test transitiva sin declaraciones instaladas.
import yazl from 'yazl'
import { safeExtractZip } from '../electron/services/safe-zip'

async function makeZip(file: string, entryName: string, mode?: number): Promise<void> {
  const zip = new yazl.ZipFile()
  zip.addBuffer(Buffer.from('paput'), entryName, mode == null ? undefined : { mode })
  zip.end()
  const output = fs.createWriteStream(file)
  zip.outputStream.pipe(output)
  await once(output, 'close')
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paput-safe-zip-test-'))
  try {
    const validZip = path.join(root, 'valid.zip')
    const validOut = path.join(root, 'valid')
    await makeZip(validZip, 'config/paput.txt')
    await safeExtractZip(validZip, validOut)
    assert.equal(fs.readFileSync(path.join(validOut, 'config', 'paput.txt'), 'utf8'), 'paput')

    // yazl evita crear traversal directamente. Cambiamos el mismo nombre tanto
    // en la cabecera local como en el directorio central para simular un ZIP hostil.
    const traversalZip = path.join(root, 'traversal.zip')
    await makeZip(traversalZip, 'safe/evil.txt')
    const hostile = fs.readFileSync(traversalZip)
    const original = Buffer.from('safe/evil.txt')
    const replacement = Buffer.from('../x/evil.txt')
    for (let offset = hostile.indexOf(original); offset !== -1; offset = hostile.indexOf(original, offset + 1)) {
      replacement.copy(hostile, offset)
    }
    fs.writeFileSync(traversalZip, hostile)
    await assert.rejects(
      () => safeExtractZip(traversalZip, path.join(root, 'traversal')),
      /fuera|invalid relative path/,
    )
    assert.equal(fs.existsSync(path.join(root, 'x', 'evil.txt')), false)

    const symlinkZip = path.join(root, 'symlink.zip')
    await makeZip(symlinkZip, 'link', 0o120777)
    await assert.rejects(() => safeExtractZip(symlinkZip, path.join(root, 'symlink')), /simbólico/)

    console.log('ZIP seguro verificado: extracción normal, traversal y enlaces simbólicos.')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

void main()
