# Paput Auth API

Worker gratuito de Cloudflare + D1 para aprobar cuentas/dispositivos y emitir
sesiones breves firmadas. No almacena contraseñas de Microsoft ni del juego.

## Preparación (cuando se vaya a desplegar)

1. Copiar `wrangler.toml.example` a `wrangler.toml`.
2. Crear la base: `npx wrangler d1 create paput-auth` y pegar su id.
3. Aplicar el esquema: `npx wrangler d1 execute paput-auth --remote --file=backend/schema.sql`.
4. Ejecutar `npm run generate:secrets --prefix backend` y guardar su salida en
   un gestor de contraseñas. El script no escribe las claves en disco.
5. Guardar `ADMIN_TOKEN` y `SESSION_PRIVATE_KEY` con `wrangler secret put`.
6. Poner solo `SESSION_PUBLIC_KEY` en `wrangler.toml`.
7. Desplegar con `npx wrangler deploy --config backend/wrangler.toml`.

Nunca se debe confirmar `backend/wrangler.toml`, tokens administrativos ni la
clave privada de sesiones. El servidor de Minecraft recibirá únicamente la
clave pública.

## Conexión con Paput Client y Kinetic

1. Configurar `PAPUT_API_URL` en el `.env` del launcher antes de compilarlo.
2. Copiar `paput_auth-0.1.0.jar` a `mods/` de High, Low y del servidor.
3. Arrancar una vez el servidor para generar
   `world/serverconfig/paput_auth-server.toml`.
4. En ese archivo poner `sessionPublicKey`, `sessionKeyId` y `audience`.
   La audiencia es `paput:<groupId>`; por ejemplo `paput:castle-town`. High y
   Low del mismo grupo comparten audiencia porque entran al mismo servidor.
5. En Kinetic mantener `online-mode=false` solo si se admitirán cuentas offline;
   PaputAuth pasa a ser entonces la comprobación obligatoria de identidad.

La clave privada del backend nunca se copia a Kinetic. Si se rota el par de
sesión hay que actualizar la clave pública del servidor y reiniciarlo.

## Contrato

- `POST /v1/enrollments`: solicita aprobación de cuenta y dispositivo.
- `GET /v1/enrollments/:id`: consulta su estado.
- `GET /v1/admin/enrollments?status=pending`: lista para Studio.
- `GET /v1/admin/devices`: dispositivos aprobados o revocados para Studio.
- `POST /v1/admin/enrollments/:id/approve|deny`: revisa una solicitud.
- `POST /v1/sessions/challenge`: nonce de 90 segundos para un dispositivo aprobado.
- `POST /v1/sessions`: consume una firma Ed25519 y emite un JWT EdDSA de 120 segundos.
- `POST /v1/admin/devices/:id/revoke`: revoca el dispositivo.
- `POST /v1/admin/accounts/:id/revoke`: revoca al jugador y todos sus vínculos de dispositivo.
- `GET /v1/session-key`: publica la clave que usará PaputAuth en el servidor.

Las altas Microsoft se contrastan directamente contra
`api.minecraftservices.com/minecraft/profile`. El token llega por HTTPS, se usa
solo para esa consulta y nunca se escribe en D1 ni se devuelve a Studio.
