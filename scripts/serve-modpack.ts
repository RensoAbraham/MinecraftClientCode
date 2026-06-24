/**
 * Servidor HTTP de desarrollo para los modpacks (multi-instancia).
 *
 * Sirve la carpeta `modpack/<id>/` para que TensoClient (vía EML-Lib) sincronice:
 *   GET /<id>/instance.json     -> metadatos de la instancia
 *   GET /<id>/modpack.json      -> manifiesto generado por `npm run publish`
 *   GET /<id>/files/<ruta>      -> cada archivo del modpack
 *
 * Uso:  npm run serve-modpack   (escucha en http://localhost:8080)
 *
 * En producción este rol lo cumplirá Cloudflare R2 (mismos endpoints).
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('modpack')
const PORT = Number(process.env.MODPACK_PORT ?? 8080)

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.json': 'application/json; charset=utf-8',
}

function serveFile(res: http.ServerResponse, filePath: string) {
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('Not found')
  }
  const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  res.writeHead(200, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
  })
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0])

  // /<grupo>/<instancia>/files/<ruta>
  const filesMatch = url.match(/^\/([^/]+)\/([^/]+)\/files\/(.+)$/)
  if (filesMatch) {
    const [, groupId, instanceId, rel] = filesMatch
    return serveFile(res, path.resolve(ROOT, groupId, instanceId, rel))
  }

  // /<grupo>/<instancia>/modpack.json
  const modpackMatch = url.match(/^\/([^/]+)\/([^/]+)\/modpack\.json$/)
  if (modpackMatch) {
    const [, groupId, instanceId] = modpackMatch
    return serveFile(res, path.resolve(ROOT, groupId, instanceId, 'modpack.json'))
  }

  // /<grupo>/group.json
  const groupMatch = url.match(/^\/([^/]+)\/group\.json$/)
  if (groupMatch) {
    const [, groupId] = groupMatch
    return serveFile(res, path.resolve(ROOT, groupId, 'group.json'))
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Usa /<grupo>/group.json, /<grupo>/<instancia>/modpack.json o .../files/<ruta>')
})

server.listen(PORT, () => {
  console.log(`Modpacks servidos en http://localhost:${PORT}`)
  console.log(`  carpeta: ${ROOT}`)
})
