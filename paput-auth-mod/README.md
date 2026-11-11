# Paput Auth

Mod obligatorio de cliente y servidor para NeoForge 1.21.1. Autentica la
identidad aprobada por Paput Client durante la fase de configuración, antes de
que el jugador entre al mundo.

El JAR se construye con Java 21:

```powershell
.\gradlew.bat build
```

El resultado queda en `build/libs/paput_auth-0.1.0.jar`.

## Servidor

El mismo JAR debe estar en cliente y servidor. Después del primer arranque,
edita `world/serverconfig/paput_auth-server.toml` usando como referencia
`paput_auth-server.toml.example`. La clave es la pública que devuelve el Worker;
la clave privada nunca sale de Cloudflare.

Durante la fase de configuración el servidor solicita una sesión al mod
cliente. El cliente la obtiene del puente local de Paput Client, y el servidor
comprueba firma Ed25519, audiencia, caducidad, nombre y reutilización antes de
permitir que termine el ingreso.

El mod también reemplaza el menú principal por una vista cerrada con **Jugar**,
**Opciones** y **Salir**. Jugar conecta únicamente a la dirección entregada por
el launcher; no expone las listas de un jugador, multijugador o Realms.
