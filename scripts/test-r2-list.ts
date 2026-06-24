/**
 * Diagnóstico: prueba distintas formas de LISTAR objetos en R2 para ver cuál
 * funciona. Uso puntual.
 *
 *   $env:R2_ENDPOINT="https://<id>.r2.cloudflarestorage.com"
 *   $env:R2_BUCKET="<bucket>"; $env:R2_ACCESS_KEY="<access>"; $env:R2_SECRET="<secret>"
 *   npx tsx scripts/test-r2-list.ts
 */
import { AwsClient } from 'aws4fetch'

const ENDPOINT = (process.env.R2_ENDPOINT ?? '').replace(/\/$/, '')
const BUCKET = process.env.R2_BUCKET ?? ''
const ACCESS = process.env.R2_ACCESS_KEY ?? ''
const SECRET = process.env.R2_SECRET ?? ''

if (!ENDPOINT || !BUCKET || !ACCESS || !SECRET) {
  console.error('Faltan R2_ENDPOINT / R2_BUCKET / R2_ACCESS_KEY / R2_SECRET')
  process.exit(1)
}

const client = new AwsClient({ accessKeyId: ACCESS, secretAccessKey: SECRET, service: 's3', region: 'auto' })

async function probar(nombre: string, url: string) {
  try {
    const res = await client.fetch(url, { headers: { 'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD' } })
    const body = await res.text()
    console.log(`\n[${nombre}] ${url}`)
    console.log(`  status: ${res.status}`)
    console.log(`  body: ${body.slice(0, 300).replace(/\n/g, ' ')}`)
  } catch (e) {
    console.log(`\n[${nombre}] ${url}\n  ERROR: ${e instanceof Error ? e.message : e}`)
  }
}

async function main() {
  // Host virtual: <bucket>.<host>
  const u = new URL(ENDPOINT)
  const virtual = `${u.protocol}//${BUCKET}.${u.host}/?list-type=2`

  await probar('path sin barra', `${ENDPOINT}/${BUCKET}?list-type=2`)
  await probar('path con barra', `${ENDPOINT}/${BUCKET}/?list-type=2`)
  await probar('virtual-host', virtual)
  console.log('\nListo.')
}

main()
