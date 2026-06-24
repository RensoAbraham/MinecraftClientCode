// Códec del "código de grupo" (TENSO-<base64url>).
//
// Un código es un token auto-contenido que embebe la URL base del hosting y el
// id del GRUPO (ecosistema). Al canjearlo, el cliente descarga la lista de
// instancias PUBLICADAS de ese grupo. Usa Buffer (Node), así que SOLO debe
// importarse desde el proceso main o desde scripts Node — nunca del renderer.

const PREFIX = 'TENSO-'

export interface GroupRef {
  baseUrl: string
  groupId: string
}

export function encodeGroupCode(ref: GroupRef): string {
  const json = JSON.stringify({ b: ref.baseUrl.replace(/\/$/, ''), g: ref.groupId })
  return PREFIX + Buffer.from(json, 'utf8').toString('base64url')
}

export function decodeGroupCode(code: string): GroupRef | null {
  const trimmed = code.trim()
  if (!trimmed.startsWith(PREFIX)) return null
  try {
    const json = Buffer.from(trimmed.slice(PREFIX.length), 'base64url').toString('utf8')
    const obj = JSON.parse(json)
    if (typeof obj?.b === 'string' && typeof obj?.g === 'string') {
      return { baseUrl: obj.b.replace(/\/$/, ''), groupId: obj.g }
    }
  } catch {
    /* token inválido */
  }
  return null
}
