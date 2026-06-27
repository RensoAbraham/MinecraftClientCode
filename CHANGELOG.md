# Cambios de Paput Client

## 1.0.18

### ✨ Nuevo
- **Carpetas por instancia**: cada instancia (HIGH/LOW…) tiene su propia carpeta. Cambiar de tipo es **instantáneo** (solo verifica actualizaciones, no re-descarga todo).
- **Se minimiza a la bandeja al jugar**: al pulsar JUGAR, el launcher se oculta a un icono junto al reloj (como Discord) para **ahorrar recursos**; vuelve al cerrar el juego.
- **Tailscale** (sustituye a ZeroTier): al elegirlo puedes **"Hazlo tú mismo"** (guía) o **"Automático"** (instala Tailscale con winget si falta y te conecta solo, con confirmación) + estado y botón "Comprobar".
- **Barra de progreso** al limpiar o reparar archivos.
- **Detección de crashes**: si el juego se cierra por un error, sale un aviso para **compartir el reporte** (enlace mclo.gs) — solo cuando crashea de verdad, no al cerrarlo tú.

### 🔧 Mejorado
- La **limpieza/reparación es por instancia** (limpias HIGH y solo se borra HIGH).
- El **volumen y la pausa** del fondo ahora se recuerdan.
- **"Reportar un error"** se movió a la **tuerca de la instancia**; Ajustes queda más limpio.

### 🐛 Arreglado
- El doble **"JUGANDO"** que aparecía al jugar.
- Al **cancelar** una instalación, el juego ya no se abre por su cuenta y te ofrece **limpiar** la instancia (la descarga en curso puede dejar archivos a medias).

## 1.0.17
- **Limpieza profunda**: nueva opción en la tuerca de la instancia que borra TODO lo descargado del juego (Java, recursos, mods, versiones, caché…) y conserva solo tus **mundos** y **ajustes**. Ideal si una instancia quedó mal instalada, al cambiar de versión o para liberar espacio.
- **Reparar ya no borra tus mundos** (`saves`): se conservan al reparar.

## 1.0.16
- **Reportar errores con un clic**: en Ajustes → "Reportar un error" → **Crear enlace** sube el último error a mclo.gs y te da un **enlace corto** (copiado al portapapeles) para enviárselo a Renso. Botón "Carpeta" para abrir los registros si hace falta.

## 1.0.15
- **Tus ajustes personales se respetan**: `options.txt` (controles, sensibilidad, FOV, volumen…) se aplica solo la **primera vez** como punto de partida; después cada jugadora lo personaliza y ya **no se le sobrescribe** al jugar (ni con Reparar). El resto de configs compartidas sí se mantienen iguales para todas.

## 1.0.14
- **Dev — buscador de mods**: filtra la lista de mods al escribir.
- **Dev — solo se incluye lo útil**: al importar una carpeta y al "Traer del juego" se copian `mods`, `config`, `defaultconfigs`, `resourcepacks` y `options.txt`; se ignoran partidas, logs, crashes, capturas y cachés (y nunca se publican).

## 1.0.13
- **Ajustes más simples**: el tema y las demás opciones (Java, caché, guía) se ven directas, sin desplegable.
- **Tuerca de la instancia = todo en un sitio**: RAM, entrar automático, tipo, conexión, **Personalizar** y **Reparar**. Se quitó el menú de tres puntos (⋯).
- Se quitó "Quitar grupo".

## 1.0.12
- **RAM y "entrar automático" por instancia**: se ajustan en la **tuerca al lado de JUGAR**, al instante y solo para esa instancia. Ajustes globales queda para el tema y "más opciones".
- **Dev — activar/desactivar mods**: botón "Mods" para encender/apagar un .jar sin borrarlo (ideal para probar Essentials y quitarlo luego).
- **Dev — "Traer del juego"**: copia la config que editaste DENTRO de Minecraft (FancyMenu, arreglos de bugs en configs…) de vuelta a la instancia, lista para Publicar.

## 1.0.11
- **Modo claro y oscuro**: elige el tema desde Ajustes.
- **Ajustes más claros**: arriba lo de siempre (memoria RAM, entrar automático, tema); lo demás (Java, limpiar caché, guía) se agrupa en **"Más opciones"**.
- **Tipo y conexión por instancia**: ahora se cambian desde una **tuerca al lado de JUGAR**, solo para ese grupo (ya no desde Ajustes globales). Más directo y sin confundir entre grupos.

## 1.0.10
- El menú **"Premium"** (broma) aparece **una sola vez** de por vida: ya no vuelve a salir al actualizar la app ni al limpiar la caché (se recuerda de forma fiable).

## 1.0.9
- **Arreglado el inicio de sesión de Microsoft de verdad**: en las versiones publicadas el identificador de la app se incrustaba con un texto de más, y Microsoft lo rechazaba. Ahora se limpia siempre. ¡El login premium ya funciona!

## 1.0.8
- **Una sola ventana**: si Paput Client ya está abierto y lo vuelves a abrir, se enfoca la ventana que ya tienes en vez de abrir otra copia.

## 1.0.7
- **Arreglado el inicio de sesión de Microsoft**: si quedó un error de login "pegado" en caché, ahora se limpia solo al intentar entrar. Además hay un botón **"Limpiar caché"** en Ajustes por si hace falta.
- **La guía rápida ya no se repite**: se recuerda de forma fiable que ya la viste.

## 1.0.6
- **Las instancias se actualizan solas**: al volver a Inicio o reabrir la ventana, el launcher relee la versión y el contenido más reciente sin tener que reiniciar.
- Los cambios que publicas se ven **al instante** (se evita servir copias en caché de la nube).

## 1.0.5
- **Elegir tipo de instancia** (LOW/HIGH): al abrir un grupo eliges según tu PC; se recuerda y puedes cambiarlo en Ajustes.
- **Cartillas de conexión** PLAYIT / ZEROTIER: eliges cómo conectar, sin ver IPs.
- **Reparar instancia** (menú ⋯): reinstala mods y configs si el juego no abre.
- **Personalizar** la imagen y el fondo de tu instancia (se guarda en tu equipo; puedes volver a la de base).
- **Guía rápida** que te señala dónde está cada cosa (sale la primera vez y desde Ajustes).
- Las acciones de la instancia se agrupan en un **menú "⋯"** más limpio.
- **Publicar más rápido**: ahora solo se sube a la nube lo que cambió (subida incremental).
- El **sello de versión** de cada instancia avanza solo en cada publicación.

## 1.0.4
- **Notas de versión automáticas**: cada actualización muestra sus cambios sola.
- Primera actualización **silenciosa** (sin asistente) de la app.
- Mejoras internas de mantenimiento.

## 1.0.3
- **Actualizaciones silenciosas**: a partir de esta versión, las próximas se instalan solas, sin asistente.
- **Gestor de R2**: nuevo panel para ver el contenido de la nube por grupo y borrar de forma selectiva (un grupo o todo), con confirmación.
- Badge de versión: **instancia en morado**, **versión de la app en celeste**.
- Corrección del endpoint de R2 (evita el error al listar objetos).

## 1.0.2
- **Aviso de actualización automático** al abrir la app (banner arriba).
- Las releases se publican solas (sin quedar en borrador).
- Ajustes: sección **"Acerca de"** con la versión, botón de **GitHub** y "Buscar actualización".
- **Java**: comprobar e instalar Java 21 desde Ajustes.
- Memoria RAM editable por **deslizador o por número**.

## 1.0.1
- La corona **Premium** (broma) aparece tras el primer JUGAR, no desde el inicio.
- **Metadatos de autoría** en el ejecutable (Renso Abraham, copyright).
- Arreglos en la limpieza de R2.

## 1.0.0 — Primera versión
- **Login premium** con cuenta de Microsoft.
- **Descarga y sincronización automática** de modpacks.
- **Auto-join** al servidor (entrar directo a la partida).
- **Múltiples cuentas** y **editor de skins 3D** con capas.
- **Importar modpacks de Modrinth** (`.mrpack`).
- **Panel de desarrollador**: crear/editar/publicar instancias, subir a Cloudflare R2 y generar códigos de grupo.
- **Arte por instancia** (imagen + fondo en vídeo) y **RAM configurable**.
- **Menú de suscripción** (broma).
- **Instalador para Windows**, **auto-actualización** vía GitHub y botón al repositorio.
