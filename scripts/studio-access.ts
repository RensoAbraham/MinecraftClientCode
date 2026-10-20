import fs from 'node:fs'
import path from 'node:path'

const action = process.argv[2]
const appData = process.env.APPDATA

if (!appData) {
  console.error('No se encontró la carpeta APPDATA de Windows.')
  process.exit(1)
}

const userDataDir = path.join(appData, 'Paput Client')
const markerPath = path.join(userDataDir, 'dev.enabled')

switch (action) {
  case 'enable':
    fs.mkdirSync(userDataDir, { recursive: true })
    fs.writeFileSync(markerPath, 'Paput Studio habilitado localmente.\n', 'utf8')
    console.log('Paput Studio quedó habilitado. Reinicia Paput Client para usarlo.')
    break
  case 'disable':
    fs.rmSync(markerPath, { force: true })
    console.log('Paput Studio quedó deshabilitado en este equipo.')
    break
  case 'status':
    console.log(fs.existsSync(markerPath) ? 'Paput Studio está habilitado.' : 'Paput Studio está deshabilitado.')
    break
  default:
    console.error('Uso: studio-access.ts <enable|disable|status>')
    process.exit(1)
}
