// Vacía por completo el bucket R2 usando las credenciales cifradas que la app
// guardó en este equipo (userData/r2.dat, cifrado con safeStorage/DPAPI).
// Se ejecuta con Electron para poder descifrar. Uso: electron scripts/clear-r2.cjs
const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// safeStorage en Windows deriva su clave de `userData/Local State`. Para descifrar
// lo que cifró "Paput Client", este script debe usar SU carpeta de datos y nombre.
const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
app.setName('Paput Client')
app.setPath('userData', path.join(APPDATA, 'Paput Client'))

app.whenReady().then(async () => {
  let code = 0
  try {
    await run()
  } catch (e) {
    console.error('ERROR:', (e && e.message) || e)
    code = 1
  }
  app.exit(code)
})

async function run() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  const cfgPath = path.join(appData, 'Paput Client', 'r2.dat')
  const buf = fs.readFileSync(cfgPath)
  const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8')
  const c = JSON.parse(json)
  if (!c.accessKeyId || !c.secretAccessKey || !c.endpoint || !c.bucket) {
    throw new Error('Config R2 incompleta.')
  }
  const { AwsClient } = await import('aws4fetch')
  const client = new AwsClient({
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    service: 's3',
    region: 'auto',
  })
  let base = c.endpoint.replace(/\/+$/, '')
  const suffix = '/' + c.bucket.toLowerCase()
  if (base.toLowerCase().endsWith(suffix)) base = base.slice(0, base.length - suffix.length)

  // 1) Listar TODAS las claves (paginado).
  const keys = []
  let token
  do {
    const q = `list-type=2${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`
    const res = await client.fetch(`${base}/${c.bucket}/?${q}`)
    if (!res.ok) throw new Error('Listado HTTP ' + res.status)
    const xml = await res.text()
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1].replace(/&amp;/g, '&'))
    const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)
    token = next ? next[1] : undefined
  } while (token)
  console.log('BUCKET:', c.bucket, '| OBJETOS:', keys.length)

  // 2) Borrar cada objeto.
  let deleted = 0
  for (const key of keys) {
    const enc = key.split('/').map(encodeURIComponent).join('/')
    const r = await client.fetch(`${base}/${c.bucket}/${enc}`, { method: 'DELETE' })
    if (r.ok || r.status === 204) deleted++
    else console.log('FALLO', r.status, key)
    if (deleted % 100 === 0) console.log('progreso:', deleted, '/', keys.length)
  }
  console.log('TOTAL BORRADO:', deleted, '/', keys.length)
}
