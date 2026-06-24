# Paput Client

Launcher de escritorio para Minecraft (premium) hecho para jugar modpacks con un
grupo cerrado de amigos: instala el modpack solo, mantiene a todas en la misma
versión y entra directo al servidor. Incluye un **panel de desarrollador** (solo
para el dueño) para crear/publicar instancias y un **modo jugador** para el resto.

> Este repositorio es para mostrar **cómo está construido el cliente**, no es una
> guía de instalación para jugadores.

## Tecnologías

- **Electron** — app de escritorio (proceso principal en CommonJS).
- **Vite** + **vite-plugin-electron** — bundling y dev server.
- **React 19** + **TypeScript** — interfaz.
- **Tailwind CSS v4** — estilos.
- **EML-Lib** — autenticación con Microsoft (premium), descarga de Java/Minecraft/
  NeoForge, lanzamiento del juego y sincronización del modpack.
- **skinview3d** (Three.js) — visor 3D de skins y capas.
- **Cloudflare R2** (S3-compatible, vía `aws4fetch`) — hosting de los archivos del
  modpack para que los jugadores descarguen desde la nube.
- **extract-zip** — importación de modpacks de Modrinth (`.mrpack`).
- **electron-updater** — actualizaciones automáticas vía GitHub Releases.
- **electron-builder** — empaquetado del instalador (NSIS) para Windows.

## Arquitectura (resumen)

- `electron/` — proceso principal: servicios de auth, juego, instancias, panel
  dev, R2, skins, Java y el contrato IPC.
- `src/` — interfaz React (pantallas de inicio, login, panel dev, editor de skins…).
- `shared/` — tipos e IPC compartidos entre main y renderer (única fuente de verdad).
- `scripts/` — utilidades de desarrollo (servir/publicar modpacks, generar iconos).

## Cómo funciona (alto nivel)

1. El **dev** crea/importa instancias en el panel, les pone versión, servidor e
   imagen, y **publica**: se generan los manifiestos y se suben a R2.
2. El dev comparte un **código de grupo** (token con la URL de R2 + id del grupo).
3. El **jugador** mete el código, inicia sesión con Microsoft y pulsa JUGAR: el
   launcher descarga/actualiza el modpack y entra al servidor.

## Desarrollo

```bash
npm install
npm run dev          # arranca la app en modo desarrollo
npm run build        # genera el instalador (.exe) en release/
```

El Client ID de Azure (público) se configura en `.env` (ver `.env.example`).
