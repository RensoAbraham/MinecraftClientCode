# Base de autenticación de Paput

Este documento fija el límite de confianza entre Paput Client, el futuro
backend de acceso y el mod `PaputAuth`. El launcher por sí solo no autoriza una
conexión al servidor.

## Identidades

- **Cuenta de juego:** Microsoft u offline. Permite iniciar Minecraft.
- **Cuenta Paput:** registro remoto que reserva un nombre y define su estado.
- **Dispositivo:** par Ed25519 generado por cada instalación del launcher.
- **Sesión de juego:** token corto emitido por el backend para una conexión.

La clave privada del dispositivo se guarda cifrada con `safeStorage` y nunca se
expone al renderer, R2, Studio ni al servidor. Solo se comparte la clave pública.

## Estados preparados en el launcher

| Estado | Significado |
| --- | --- |
| `not-enrolled` | Cuenta local todavía no registrada en Paput. |
| `pending` | Solicitud enviada y esperando aprobación. |
| `approved` | Cuenta y dispositivo autorizados. |
| `denied` | Solicitud rechazada. |
| `revoked` | Acceso anteriormente concedido y posteriormente retirado. |

Hasta que Worker/D1 esté conectado, todas las cuentas nuevas permanecen en
`not-enrolled`. Este estado no debe interpretarse como autorización.

## Flujo objetivo

1. El launcher crea o recupera la identidad Ed25519 del dispositivo.
2. El jugador inicia sesión con Microsoft o elige un nombre offline.
3. El launcher solicita vincular cuenta, nombre y clave pública.
4. Paput Studio aprueba o rechaza la solicitud.
5. Antes de jugar, el launcher solicita una sesión corta y firma un desafío.
6. El backend devuelve un token firmado con audiencia del servidor y expiración.
7. El mod cliente entrega el token a `PaputAuth` durante la fase de configuración.
8. El mod servidor verifica firma, audiencia, expiración, nombre y dispositivo.
9. Sin verificación satisfactoria, la conexión termina antes de entrar al mundo.

## Contrato previsto del backend

Endpoints mínimos:

- `POST /v1/enrollments`: crea o actualiza una solicitud.
- `GET /v1/enrollments/:id`: consulta el estado desde el launcher.
- `GET /v1/admin/enrollments`: solicitudes pendientes para Studio.
- `POST /v1/admin/enrollments/:id/approve`: reserva nombre y dispositivo.
- `POST /v1/admin/enrollments/:id/deny`: rechaza la solicitud.
- `POST /v1/sessions/challenge`: entrega un nonce de autenticación.
- `POST /v1/sessions`: verifica la firma del dispositivo y emite una sesión.
- `POST /v1/admin/devices/:id/revoke`: revoca un dispositivo perdido.

El token de sesión debe incluir como mínimo:

- `sub`: id interno e inmutable de la cuenta Paput.
- `name`: nombre canónico reservado.
- `device_id`: dispositivo aprobado.
- `aud`: identificador del servidor de destino.
- `iat` y `exp`: emisión y caducidad corta.
- `jti`: identificador único para evitar reutilización.

## Reglas de seguridad

- R2 distribuye contenido; nunca decide permisos ni guarda credenciales.
- El nombre de Minecraft no es prueba de identidad.
- El renderer nunca recibe claves privadas ni secretos administrativos.
- No se guarda una contraseña offline en el launcher como prueba del servidor.
- Si se añade recuperación por contraseña, el backend guarda únicamente Argon2id.
- Studio requiere credencial administrativa independiente de las cuentas de juego.
- El servidor rechaza conexiones sin `PaputAuth`, incluso si el launcher fue alterado.

## Etapas

1. **Completada en esta rama:** tipos, estados, identidad Ed25519 local y UI honesta.
2. Worker + D1: solicitudes, aprobaciones y revocaciones.
3. Integración de Studio con los endpoints administrativos.
4. Emisión de sesiones cortas y firma del backend.
5. Mod NeoForge `PaputAuth` cliente/servidor.
6. Retirada definitiva del acceso offline heredado sin verificación.
