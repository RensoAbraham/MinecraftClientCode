// Genera los iconos de la app a partir de build/app-source.png (la imagen
// definitiva: estrella pixelada violeta).
// Salida: build/icon.ico (Windows, multi-tamaño) y build/icon.png (512, Linux/macOS).
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'build', 'app-source.png')

// Tamaños que incluye un .ico de Windows de buena calidad.
const sizes = [16, 24, 32, 48, 64, 128, 256]

const pngBuffers = await Promise.all(
  sizes.map((s) => sharp(source).resize(s, s).png().toBuffer()),
)

const ico = await pngToIco(pngBuffers)
writeFileSync(join(root, 'build', 'icon.ico'), ico)

// PNG grande para Linux/macOS.
await sharp(source).resize(512, 512).png().toFile(join(root, 'build', 'icon.png'))

console.log('Iconos generados desde app-source.png: build/icon.ico y build/icon.png')
