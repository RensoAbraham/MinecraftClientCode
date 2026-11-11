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

## Límite de uso gratuito

El Worker solo debe usar la clase `Standard` de R2. Tenso impone un límite
interno de **5 GiB** para todos los archivos de `packs/` y de **90 MiB** por
archivo. Publicar una versión que exceda ese espacio se rechaza; elimina una
versión antigua antes de volver a intentarlo. El Publisher es de un único
operador, por lo que las publicaciones no deben ejecutarse en paralelo.

Esto deja margen frente a los 10 GB mensuales incluidos por R2, pero no
sustituye revisar el consumo en Cloudflare: R2 requiere activar una
suscripción de uso y Cloudflare puede facturar cualquier exceso de cuota.

## Preparación

1. `npm install`
2. Crea el bucket: `npx wrangler r2 bucket create tenso-content`.
3. Crea el secreto exclusivo del Publisher: `npx wrangler secret put PUBLISHER_TOKEN`.
4. Genera los tipos de bindings: `npm run types`.
5. Revisa `worker-configuration.d.ts` generado y despliega con `npm run deploy`.

`PUBLISHER_TOKEN` debe guardarse únicamente en la instalación privada de Tenso
Publisher; nunca en Tenso Installer ni en el repositorio.
