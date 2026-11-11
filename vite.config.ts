import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import pkg from './package.json'

// Algunos entornos (p. ej. la terminal integrada de VS Code) heredan
// ELECTRON_RUN_AS_NODE=1, lo que obliga a Electron a comportarse como Node
// plano (sin app/BrowserWindow). Lo limpiamos para que el proceso de Electron
// hijo arranque con su API completa.
delete process.env.ELECTRON_RUN_AS_NODE

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carga el .env (sin prefijo) para inyectar el Client ID en el bundle.
  // El Client ID de Azure es PÚBLICO, así que puede ir embebido sin riesgo.
  const env = loadEnv(mode, process.cwd(), '')

  // El Client ID se inyecta en TODOS los procesos. vite-plugin-electron usa
  // una config de Vite propia por cada entry, así que el define debe repetirse
  // dentro de cada build de Electron (no se hereda del define de nivel raíz).
  // El Client ID se toma del .env (local) o de la variable de entorno (CI/GitHub
  // Actions, donde no hay .env). El Client ID de Azure es PÚBLICO.
  // El Client ID de Azure es PÚBLICO. Se toma del .env (local) o del secret de CI.
  // Defensa: si por error el valor incluye el prefijo "AZURE_CLIENT_ID=" (pegar la
  // línea entera del .env como secret) o espacios, se limpia. Y si llega vacío, se
  // usa el ID público conocido como respaldo para que el login nunca quede roto.
  const FALLBACK_CLIENT_ID = 'cd53b42b-5314-4455-9073-2285e34bac00'
  const azureClientId =
    (env.AZURE_CLIENT_ID || process.env.AZURE_CLIENT_ID || '')
      .trim()
      .replace(/^AZURE_CLIENT_ID\s*=\s*/i, '')
      .trim() || FALLBACK_CLIENT_ID
  const paputApiUrl = (env.PAPUT_API_URL || process.env.PAPUT_API_URL || '').trim().replace(/\/$/, '')
  const paputGroupBaseUrl = (env.PAPUT_GROUP_BASE_URL || process.env.PAPUT_GROUP_BASE_URL || '').trim().replace(/\/$/, '')
  const paputGroupId = (env.PAPUT_GROUP_ID || process.env.PAPUT_GROUP_ID || '').trim()
  const define = {
    __AZURE_CLIENT_ID__: JSON.stringify(azureClientId),
    __PAPUT_API_URL__: JSON.stringify(paputApiUrl),
    __PAPUT_GROUP_BASE_URL__: JSON.stringify(paputGroupBaseUrl),
    __PAPUT_GROUP_ID__: JSON.stringify(paputGroupId),
    __APP_VERSION__: JSON.stringify(pkg.version),
  }

  return {
    // Rutas relativas: necesario para que los assets carguen bajo file:// en el
    // .exe empaquetado (con '/' apuntarían a la raíz del disco y no cargarían).
    base: './',
    define,
    server: {
      watch: {
        // No vigilar las carpetas de modpacks ni la salida: contienen .jar
        // grandes que pueden quedar bloqueados (EBUSY) y provocan recargas
        // innecesarias al sincronizar/importar.
        ignored: ['**/modpack/**', '**/.paput-content/**', '**/.paput-draft-snapshot/**', '**/dist-electron/**', '**/release/**'],
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      electron([
        {
          // Proceso principal de Electron
          entry: 'electron/main.ts',
          vite: {
            define,
            build: {
              rollupOptions: {
                // eml-lib se carga dinámicamente desde node_modules en tiempo
                // de ejecución. electron-updater también conserva su árbol.
                // yauzl sí se integra en el bundle principal.
                external: ['eml-lib', 'electron-updater'],
              },
            },
          },
        },
        {
          // Script de preload (puente seguro main <-> renderer)
          entry: 'electron/preload.ts',
          onstart(args) {
            args.reload()
          },
        },
      ]),
      // Permite usar APIs de Node en el renderer cuando sea necesario
      renderer(),
    ],
  }
})
