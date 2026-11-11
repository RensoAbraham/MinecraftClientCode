const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const token = process.env.PAPUT_ADMIN_BOOTSTRAP
if (!token || token.length < 24) throw new Error('Falta el token administrativo temporal.')

app.setName('Paput Client')
app.whenReady().then(() => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows no ofrece almacenamiento seguro para Paput Studio.')
  }
  const target = path.join(app.getPath('userData'), 'paput-admin-token.dat')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, safeStorage.encryptString(token))
  console.log(`Token administrativo guardado de forma cifrada en ${target}`)
  app.quit()
})
