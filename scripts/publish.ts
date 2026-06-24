/**
 * Generador de manifiestos del modpack (por GRUPOS) desde la línea de comandos.
 *
 * Estructura:
 *   modpack/<grupo>/group.json                 <- { "name": "PaputGanga" }
 *   modpack/<grupo>/<instancia>/instance.json  <- metadatos + "published": true|false
 *   modpack/<grupo>/<instancia>/{mods,config}/...
 *
 * Uso:
 *   npm run publish
 *   MODPACK_BASE_URL=https://xxx.r2.dev npm run publish
 */
import path from 'node:path'
import { publishGroup, listGroupIds } from '../shared/publisher'
import { encodeGroupCode } from '../shared/instance-code'

const ROOT = path.resolve('modpack')
const BASE = (process.env.MODPACK_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '')

function main() {
  const groups = listGroupIds(ROOT)
  if (groups.length === 0) {
    console.error(`No hay grupos en "${ROOT}". Crea "modpack/<grupo>/<instancia>/".`)
    process.exit(1)
  }

  console.log(`URL base: ${BASE}`)
  for (const groupId of groups) {
    const r = publishGroup(ROOT, groupId, BASE)
    const code = encodeGroupCode({ baseUrl: BASE, groupId })
    console.log(`\n✓ Grupo "${r.name}" (${groupId})`)
    console.log(`  ${r.publishedCount} publicada(s), ${r.hiddenCount} oculta(s)`)
    console.log(`  Código de grupo:  ${code}`)
  }
  console.log(`\nSirve los modpacks con:  npm run serve-modpack`)
}

main()
