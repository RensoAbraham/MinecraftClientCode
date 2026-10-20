# Dirección de producto de Paput Client

Este documento conserva las decisiones de experiencia que deben guiar la
reformulación visual. No describe necesariamente funciones ya terminadas.

## Paput Studio: agregar contenido

Studio tendrá una única acción principal, **Agregar contenido**, que acepta
selección de archivos y arrastrar y soltar. Antes de copiar, muestra un resumen
con tipo, destino y posibles reemplazos.

Tipos admitidos:

- **Mod:** archivo `.jar` destinado a `mods/`. Studio lee los metadatos del JAR,
  comprueba loader, versión de Minecraft y dependencias declaradas, calcula su
  hash y advierte que solo debe redistribuirse contenido con permiso.
- **Paquete de recursos:** archivo `.zip` con `pack.mcmeta`, destinado a
  `resourcepacks/`.
- **Configuración:** archivo o carpeta para `config/` o `defaultconfigs/`. El
  administrador confirma la ruta relativa y cualquier sobrescritura.

La interfaz puede detectar el tipo, pero siempre permite corregirlo antes de
confirmar. Los cambios permanecen en borrador hasta pulsar **Publicar**. La
publicación incremental sube únicamente los archivos y manifiestos modificados.

La acción **Agregar desde Modrinth** será una alternativa dentro del mismo flujo,
no un requisito para administrar el modpack.

## Contenido del jugador

- `mods/` pertenece al modpack y se verifica antes de jugar.
- `resourcepacks/` está abierto para archivos personales del jugador.
- Los paquetes oficiales y personales deben distinguirse en la interfaz; una
  reparación no elimina los personales.
- Mundos, capturas y opciones personales no se mezclan con la publicación.

## Skins y capas

La experiencia cambia según el tipo de cuenta:

- **Microsoft:** muestra el armario completo para importar, previsualizar y
  aplicar skins, además de administrar capas oficiales disponibles.
- **No premium:** no muestra controles que aparenten subir una skin a Mojang.
  Muestra una guía breve para elegir una skin en NameMC y aplicar en el servidor
  el comando que proporcione el futuro sistema de skins.

El texto del tutorial no debe fijar todavía `/skin nombre`: la sintaxis exacta
dependerá del mod o servicio instalado en el servidor. El nombre copiado desde
NameMC será el nombre del perfil que usa la skin, no un nombre propio de la skin.

Importar una imagen únicamente en el launcher offline no garantiza que los
demás jugadores la vean. El servidor deberá almacenar o resolver la textura y
sincronizarla con los clientes.

## Fondos y movimiento

Los videos dejan de ser la dirección visual principal. La nueva interfaz usa:

- una ilustración estática predeterminada de Paput;
- una imagen estática opcional por instancia;
- degradados legibles y movimiento CSS muy sutil;
- una alternativa sólida si la imagen falta o no carga.

Esto reduce ruido, consumo y diferencias visuales entre pantallas. El soporte
técnico de video puede retirarse después de migrar las instancias existentes.

## Cuenta y navegación

El avatar abre un panel de perfil compacto con la cuenta activa y las acciones
frecuentes. **Administrar cuentas** abre una vista dedicada para cambiar,
agregar o eliminar cuentas; no se amontonan todas esas acciones en un modal.

Las opciones que no aplican al tipo de cuenta se sustituyen por orientación útil
en vez de mostrarse deshabilitadas sin explicación.

## Reforma visual

No se siguen puliendo de forma aislada las pantallas actuales. La siguiente
etapa define primero un sistema común de color, tipografía, espaciado, estados y
componentes, y después rehace onboarding, inicio, instancia, cuenta y Studio.

El nombre público se decide durante esa etapa. Hasta entonces se conserva
**Paput Client** y se evita añadir más nombres visibles; `TensoClient` puede
seguir siendo el nombre técnico temporal del repositorio.
