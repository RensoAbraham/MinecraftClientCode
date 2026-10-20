# Paput Client

Launcher de escritorio para Minecraft hecho para jugar modpacks con un
grupo cerrado de amigos: instala el modpack solo, mantiene a todos en la misma
versión y entra directo al servidor. El launcher siempre abre **Paput Client**;
las herramientas de creación y publicación viven en **Paput Studio**, un área
local que solo se habilita en el equipo del dueño.

> Este repositorio es para mostrar **cómo está construido el cliente**, no es una
> guía de instalación para jugadores.

## Tecnologías

- **Electron** — app de escritorio (proceso principal en CommonJS).
- **Vite** + **vite-plugin-electron** — bundling y dev server.
- **React 19** + **TypeScript** — interfaz.
- **Tailwind CSS v4** — estilos.
- **EML-Lib** — autenticación con Microsoft (premium) o por nombre (no premium), descarga de Java/Minecraft/
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
- `src/App.tsx` — raíz mínima: abre Client y permite cambiar a Studio solo cuando
  el equipo tiene acceso local habilitado.
- `src/features/player/` — flujo del jugador, biblioteca y lanzamiento.
- `src/features/studio/` — entrada a las herramientas de creación/publicación.
- `src/features/onboarding/` — experiencia compartida de acceso y cuenta.
- `src/components/` — pantallas y componentes visuales reutilizables.
- `shared/` — tipos e IPC compartidos entre main y renderer (única fuente de verdad).
- `scripts/` — utilidades de desarrollo (servir/publicar modpacks, generar iconos).

## Cómo funciona (alto nivel)

1. El dueño crea o importa una instancia `.mrpack` en Paput Studio, completa
   servidor/arte y publica. Los archivos intactos del pack conservan sus URLs
   verificadas de Modrinth; R2 recibe únicamente overrides, configuración, arte
   y archivos propios.
2. El jugador elige primero su cuenta Microsoft o una identidad offline local.
3. La referencia de contenido (`TENSO-...`) añade el grupo publicado; solo
   contiene la ubicación del manifiesto y **no es una credencial de acceso**.
4. El jugador pulsa JUGAR: el
   launcher descarga/actualiza el modpack desde ambas fuentes y entra al servidor.

La publicación mantiene cada prefijo de R2 como un espejo: elimina archivos
antiguos que ya no aparecen en el manifiesto, evitando que versiones anteriores
consuman almacenamiento indefinidamente.

> El acceso offline actual es provisional y todavía no evita la suplantación de
> nombres por sí solo. La base para vincular cuentas, dispositivos y el futuro
> mod de servidor se describe en [AUTH_FOUNDATION.md](./AUTH_FOUNDATION.md).

## Desarrollo

```bash
npm install
npm run dev          # arranca la app en modo desarrollo
npm run build        # genera el instalador (.exe) en release/
```

El Client ID de Azure (público) se configura en `.env` (ver `.env.example`).

### Acceso privado a Paput Studio

En desarrollo, Studio está disponible automáticamente. En la instalación del
dueño se habilita una sola vez desde este repositorio:

```bash
npm run studio:enable
```

Después de reiniciar el launcher, se puede abrir desde el discreto botón de
herramientas de la barra lateral o con `Ctrl+Shift+D` (también funciona durante
el onboarding). Para convertir ese equipo nuevamente en un Client normal:

```bash
npm run studio:disable
```

Las instalaciones de jugadores no llevan ese marcador local, no muestran
ninguna entrada a Studio y tampoco registran sus canales IPC de escritura.
