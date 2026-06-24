/**
 * Prueba de subida a Cloudflare R2 (uso puntual de diagnóstico).
 *
 * Toma las credenciales de variables de entorno (no se guardan en disco),
 * regenera los manifiestos apuntando a la URL pública de R2 y sube cada grupo.
 * Luego verifica que group.json es accesible públicamente.
 *
 * Uso (PowerShell):
 *   $env:R2_ENDPOINT="..."; $env:R2_BUCKET="..."; $env:R2_ACCESS_KEY="...";
 *   $env:R2_SECRET="..."; $env:R2_PUBLIC_URL="..."; npx tsx scripts/test-r2.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { AwsClient } from 'aws4fetch'
import { publishGroup, listGroupIds } from '../shared/publisher'
import { encodeGroupCode } from '../shared/instance-code'

const ENDPOINT = (process.env.R2_ENDPOINT ?? '').replace(/\/$/, '')
const BUCKET = process.env.R2_BUCKET ?? ''
const ACCESS = process.env.R2_ACCESS_KEY ?? ''
const SECRET = process.env.R2_SECRET ?? ''
const PUBLIC = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')
const ROOT = path.resolve('modpack')

if (!ENDPOINT || !BUCKET || !ACCESS || !SECRET || !PUBLIC) {
  console.error('Faltan variables R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY/R2_SECRET/R2_PUBLIC_URL.')
  process.exit(1)
}

const client = new AwsClient({ accessKeyId: ACCESS, secretAccessKey: SECRET, service: 's3', region: 'auto' })

function contentType(name: string): string {
  return name.endsWith('.json') ? 'application/json' : 'application/octet-stream'
}

function walk(dir: string, root: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, root, acc)
    else {
      const rel = path.relative(root, full).split(path.sep).join('/')
      if (rel !== 'instance.json') acc.push(rel)
    }
  }
  return acc
}

async function put(key: string, body: Buffer) {
  const res = await client.fetch(`${ENDPOINT}/${BUCKET}/${key}`, {
    method: 'PUT',
    body: new Uint8Array(body) as unknown as BodyInit,
    headers: { 'Content-Type': contentType(key) },
  })
  if (!res.ok) throw new Error(`PUT ${key} -> HTTP ${res.status} ${await res.text()}`)
}

async function uploadGroup(groupId: string) {
  const groupDir = path.join(ROOT, groupId)
  const group = JSON.parse(fs.readFileSync(path.join(groupDir, 'group.json'), 'utf8')) as {
    instances: { id: string }[]
  }
  await put(`${groupId}/group.json`, fs.readFileSync(path.join(groupDir, 'group.json')))
  for (const inst of group.instances) {
    const instDir = path.join(groupDir, inst.id)
    for (const rel of walk(instDir, instDir)) {
      const key = rel === 'modpack.json' ? `${groupId}/${inst.id}/modpack.json` : `${groupId}/${inst.id}/files/${rel}`
      await put(key, fs.readFileSync(path.join(instDir, rel)))
    }
  }
}

async function main() {
  for (const groupId of listGroupIds(ROOT)) {
    console.log(`\nPublicando y subiendo "${groupId}"…`)
    publishGroup(ROOT, groupId, PUBLIC)
    await uploadGroup(groupId)
    console.log(`  ✓ subido. Código:  ${encodeGroupCode({ baseUrl: PUBLIC, groupId })}`)
    const check = await fetch(`${PUBLIC}/${groupId}/group.json`)
    console.log(`  Verificación group.json -> HTTP ${check.status} ${check.ok ? '✓ accesible' : '✗'}`)
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
