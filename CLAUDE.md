# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

**Paput Client**: launcher de escritorio (Windows) para Minecraft *premium* que instala y sincroniza un modpack privado para un grupo cerrado, y entra directo al servidor. Tiene dos modos: **Dev** (crear/publicar instancias) y **Jugador** (canjear un código y jugar).

Stack: Electron (proceso principal CommonJS) + React 19 + TypeScript + Vite (`vite-plugin-electron`) + Tailwind CSS v4. Librería clave: **EML-Lib** (login Microsoft, descarga de Java/Minecraft/NeoForge, lanzamiento y sync del modpack). Hosting de modpacks: **Cloudflare R2** (S3, vía `aws4fetch`).

## Comandos

```bash
npm run dev          # app en desarrollo (vite + electron con HMR)
npm run typecheck    # tsc --noEmit  (NO hay tests en el repo)
npm run build        # instalador .exe en release/ (sin publicar)
npm run release      # tsc + vite build + electron-builder --publish always (lo usa el CI)
```

- No hay framework de tests ni linter configurado; valida con `npm run typecheck`.
- El Client ID de Azure (público) va en `.env` (ver `.env.example`); Vite lo inyecta como `__AZURE_CLIENT_ID__`.

## Publicar una versión (release)

El CI (`.github/workflows/release.yml`) se dispara al **subir un tag `v*`** y hace `npm run release` (electron-builder publica a GitHub Releases) y **pone las notas leyendo la sección `## X.Y.Z` de `CHANGELOG.md`**. Los usuarios se auto-actualizan (electron-updater). Flujo:

1. Añade `## X.Y.Z` al principio de `CHANGELOG.md` (secciones Nuevo/Mejorado/Arreglado).
2. Sube `version` en `package.json`.
3. Commit, `git push origin main`, luego `git tag -a vX.Y.Z -m "X.Y.Z"` y `git push origin vX.Y.Z`.

No se necesita token local: el CI usa `secrets.GITHUB_TOKEN`.

## Contrato IPC (la columna vertebral)

`shared/` es la **única fuente de verdad** entre main y renderer. Para añadir cualquier función que cruce procesos hay que tocar **cuatro sitios**:

1. `shared/ipc.ts` — añade el método a la interfaz `TensoApi` y su canal al objeto `IPC`.
2. `electron/preload.ts` — expón el método en `window.tenso` (con `ipcRenderer.invoke(IPC.x, ...)`).
3. `electron/ipc.ts` — registra el `ipcMain.handle(IPC.x, ...)` que delega en un servicio.
4. `electron/services/*` — implementa la lógica.

El renderer siempre llama vía `window.tenso.*` (tipado por `TensoApi`).

## Arquitectura del proceso principal (`electron/`)

- `main.ts` — ventana, auto-updater, y el protocolo propio `paput-asset://` (registrado con `registerSchemesAsPrivileged`) para servir imágenes/fondos locales del jugador.
- **Dos modos** los decide `dev.isDevMode()`: `true` si la app NO está empaquetada, o si existe `userData/dev.enabled`. En Dev se ve el Panel Dev; en Jugador, la pantalla de código + jugar.
- **Modo Jugador** (`services/instances.ts`): el jugador canjea un **código de grupo** (`redeemCode`) — un token (`shared/instance-code.ts`) que embebe la URL base de R2 + el `groupId`. Los grupos desbloqueados se guardan en `userData/player-groups.json` (con caché). Al resolver, baja `<baseUrl>/<groupId>/group.json` y construye por instancia su `modpackUrl` (`.../<instanceId>/modpack.json`). Las imágenes/fondos que el jugador personaliza viven en `userData/overrides/<instanceId>/` y se sirven por `paput-asset://`.
- **Modo Dev** (`services/dev.ts`, `services/r2.ts`, `shared/publisher.ts`): crea grupos/instancias en local, importa `.mrpack` (`services/importers/mrpack.ts`), y al **Publicar** genera los manifiestos (`publisher.ts`) y los sube a Cloudflare R2 (`r2.ts`).

## Lanzamiento del juego — `services/game.ts` (lo más delicado)

- Carpeta raíz del juego: `%APPDATA%/.tensoclient`. Usa EML-Lib `Launcher` con **`storage: 'shared'`** + `profile.slug` (`slugFor(instanceId)`).
- **Layout COMPARTIDO**: `assets`, `libraries`, `versions` y `runtime` (Java) se guardan **una sola vez en la raíz** y todas las instancias los comparten; solo `mods`, `config` y `saves` son por instancia en `.tensoclient/<slug>`. Ahorra varios GB.
- **`cleaning` DEBE ir en `false`** en modo shared: si no, al lanzar una instancia EML-Lib borraría los assets/librerías compartidos y los mods de las otras instancias. Contrapartida: un mod que un modpack ELIMINE en una actualización no se borra solo → para eso está "Reparar".
- `migrateSharedLayout()` corre antes de lanzar: promueve/deduplica las carpetas pesadas del layout aislado viejo hacia la raíz compartida.
- Se lanza con **`AIKAR_FLAGS`** (afinado de G1GC, vía `java.args` de EML-Lib). Es **obligatorio**: sin esas flags un pack de ~300 mods thrashea el GC y con poca RAM (4-5 GB) puede no llegar a iniciar.
- RAM por instancia: `getInstanceSettings(instanceId).maxRamMb` (default 4 GB).
- Limpieza: `repairInstance`/`deepClean` borran datos de UNA instancia (conservan `saves`); `deleteInstanceData` borra la carpeta entera de la instancia (lo usa "Eliminar instancia" del jugador).

## Convenciones (importantes)

- **Todo en español**: textos de UI, comentarios, mensajes de commit y CHANGELOG.
- **Sin emojis** en ningún sitio (UI, código, CHANGELOG, commits).
- Estilos por variables CSS `--color-tenso-*` en `src/index.css` (bloque `@theme`), con overrides de tema claro bajo `:root[data-theme='light']`; las utilidades Tailwind son `tenso-*`. El Panel Dev remapea esas variables localmente con la clase `.dev-surface` (fondo oscuro suave).
- **Secretos**: nunca mostrar/loguear claves (p. ej. la auth key de Tailscale) en mensajes de error. El Azure Client ID sí es público (embebido).

## Notas de Windows / entorno

- Solo Windows (instalador NSIS). El desinstalador (`build/installer.nsh`, macro `customUnInstall`) ofrece borrar `%APPDATA%/.tensoclient` y `%APPDATA%/Paput Client`.
- Datos: juego en `%APPDATA%/.tensoclient`; ajustes/userData de la app en `%APPDATA%/Paput Client` (incluye `player-groups.json`, `settings.json`, `overrides/`).
- La app se **minimiza a la bandeja** al jugar; el auto-update solo instala al cerrar del todo (desde la bandeja).
- Si al lanzar Electron desde una terminal "corre como Node" y se cae (`electron.protocol` undefined), la variable `ELECTRON_RUN_AS_NODE` está activa en ese shell: hay que quitarla (`unset ELECTRON_RUN_AS_NODE`).
