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

## Ciclo de vida de dispositivos

La identidad Ed25519 se reutiliza mientras exista el directorio de datos de la
aplicación. Abrir o actualizar el launcher no crea una identidad nueva. Borrar
los datos de la aplicación, cambiar de equipo o perder el archivo de identidad
sí genera un dispositivo distinto.

El backend debe tratar estos casos como dispositivos, no como cuentas nuevas:

- Una clave nueva queda en `pending`; nunca hereda una aprobación anterior.
- Solo los dispositivos `approved` cuentan contra el límite de una cuenta.
- Límite inicial recomendado: 3 dispositivos activos por cuenta.
- Studio permite identificar, nombrar y revocar cada dispositivo.
- Solicitudes pendientes sin actividad caducan después de 7 días.
- Registros revocados o inactivos pueden purgarse después de 90 días.
- No se utiliza una huella de hardware. La recuperación se hace aprobando el
  dispositivo nuevo y revocando el anterior.

Cada registro contiene solo un identificador, una clave pública de 32 bytes y
metadatos pequeños. Varias reinstalaciones fallidas no generan una carga
relevante y las solicitudes pendientes caducan automáticamente.

## Política de integridad del contenido

La instancia se divide en contenido administrado y contenido personal:

- `mods/` es administrado por Paput. Antes de jugar se contrasta contra el
  manifiesto publicado usando SHA-512.
- `resourcepacks/` permanece abierto. Los paquetes oficiales pueden verificarse,
  pero los paquetes añadidos por el jugador se conservan.
- `saves/`, `screenshots/` y `options.txt` son datos del jugador y nunca deben
  eliminarse durante una reparación de mods.

La verificación de `mods/` clasifica los problemas así:

- **Faltante:** el sincronizador descarga el mod esperado.
- **Modificado:** existe el nombre esperado pero su hash no coincide.
- **No permitido:** hay un JAR que no aparece en el manifiesto.

Si encuentra contenido modificado o no permitido, el launcher no inicia el
juego y ofrece:

1. **Apartar y continuar:** mueve los JAR ajenos a una cuarentena recuperable y
   sincroniza lo que falte.
2. **Reinstalar solo los mods:** reemplaza `mods/` desde el manifiesto sin tocar
   configuraciones ni datos personales.
3. **Cancelar:** no modifica nada y no inicia Minecraft.

Esta verificación asegura que Paput soporte una copia consistente del modpack;
no debe presentarse como anticheat. El usuario controla su equipo y podría
alterar el launcher. Las reglas de juego críticas se validan en el servidor y
`PaputAuth` exige el mod base para conectarse.

## Publicación incremental desde Studio

Publicar una versión no debe equivaler a subir otra vez todo el modpack. El
publicador ya genera un manifiesto por archivo y el servicio de R2 compara los
ETag antes de subir: los archivos sin cambios se omiten.

El flujo objetivo de Studio es:

1. **Agregar desde Modrinth:** buscar o pegar un proyecto, filtrar versiones por
   versión de Minecraft y loader, seleccionar el archivo compatible y resolver
   sus dependencias requeridas.
2. Guardar URL de origen, nombre, tamaño, SHA-1 y SHA-512 en los metadatos de la
   instancia.
3. Descargar y verificar el archivo local para que la vista previa sea idéntica
   a lo que recibirá el jugador.
4. Al publicar, conservar la URL CDN de Modrinth y subir a R2 únicamente los
   manifiestos pequeños que cambiaron.
5. Para un mod local que permita redistribución, subir únicamente ese JAR nuevo
   y los manifiestos. Para una configuración, subir únicamente el archivo
   modificado y los manifiestos.

No se reconstruye ni vuelve a alojar el `.mrpack` completo en cada cambio. El
manifiesto publicado es la fuente de verdad de la versión instalada.

## Etapas

1. **Completada en esta rama:** tipos, estados, identidad Ed25519 local y UI honesta.
2. Worker + D1: solicitudes, aprobaciones y revocaciones.
3. Integración de Studio con los endpoints administrativos.
4. Emisión de sesiones cortas y firma del backend.
5. Mod NeoForge `PaputAuth` cliente/servidor.
6. Verificación selectiva de `mods/`, cuarentena y reparación solo de mods.
7. Acción **Agregar desde Modrinth** y metadatos de origen en Studio.
8. Retirada definitiva del acceso offline heredado sin verificación.
