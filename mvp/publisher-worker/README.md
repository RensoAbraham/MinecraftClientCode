# Tenso Publisher Worker

Puerta de publicación privada entre Tenso Publisher y R2. El Installer de los
jugadores no conoce las credenciales de R2.

## Flujo

1. El Publisher carga cada archivo de `overlay/` con `PUT /v1/admin/packs/...`.
2. Carga `manifest.json`, que contiene hashes, IP y referencia al modpack base.
3. Promueve la versión con `POST /v1/admin/packs/:id/:version/promote`.
4. El Installer consulta `GET /v1/packs/:id/latest` y descarga solo la versión
   promovida.

Los objetos nunca se sobrescriben entre versiones. El puntero `latest.json`
solo cambia después de que exista el manifiesto.

## Preparación

1. `npm install`
2. Crea el bucket: `npx wrangler r2 bucket create tenso-content`.
3. Crea el secreto exclusivo del Publisher: `npx wrangler secret put PUBLISHER_TOKEN`.
4. Genera los tipos de bindings: `npm run types`.
5. Revisa `worker-configuration.d.ts` generado y despliega con `npm run deploy`.

`PUBLISHER_TOKEN` debe guardarse únicamente en la instalación privada de Tenso
Publisher; nunca en Tenso Installer ni en el repositorio.
