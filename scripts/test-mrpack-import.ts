// Prueba de la integración Modrinth: importa un .mrpack por ruta y verifica que
// crea una instancia válida (instance.json + overrides copiados). Demuestra que
// el HIGH se integrará bien cuando lo exportes de Modrinth.
// Uso: npx tsx scripts/test-mrpack-import.ts <ruta-al-.mrpack>
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { importMrpackFromPath } from '../electron/services/importers/mrpack'

async function main() {
  const mrpack = process.argv[2]
  if (!mrpack || !fs.existsSync(mrpack)) {
    console.error('Falta la ruta al .mrpack')
    process.exit(1)
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mrtest-root-'))
  const group = 'grupo-prueba'
  fs.mkdirSync(path.join(root, group), { recursive: true })

  const res = await importMrpackFromPath(mrpack, root, group, (p) =>
    console.log('  progreso:', p.label, p.fraction),
  )

  const instDir = path.join(root, group, res.instanceId)
  const okInstance = fs.existsSync(path.join(instDir, 'instance.json'))
  const meta = JSON.parse(fs.readFileSync(path.join(instDir, 'instance.json'), 'utf8'))
  const okOverride = fs.existsSync(path.join(instDir, 'config', 'test.txt'))

  console.log('\n=== RESULTADO ===')
  console.log('instanceId:', res.instanceId)
  console.log('name:', res.name, '| mc:', res.mcVersion, '| loader:', res.loader, res.loaderVersion)
  console.log('instance.json existe:', okInstance)
  console.log('meta.name/mcVersion/loader:', meta.name, '/', meta.mcVersion, '/', meta.loader)
  console.log('override (config/test.txt) copiado:', okOverride)

  const pass = okInstance && okOverride && res.loader === 'neoforge' && res.mcVersion === '1.21.1'
  console.log('\nPRUEBA:', pass ? 'OK — el import de HIGH funciona end-to-end' : 'FALLO')
  fs.rmSync(root, { recursive: true, force: true })
  process.exit(pass ? 0 : 1)
}

main().catch((e) => {
  console.error('ERROR:', e)
  process.exit(1)
})
