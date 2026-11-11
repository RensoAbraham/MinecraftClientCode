# Tenso Publisher

Herramienta privada de línea de comandos para publicar los overrides locales de
un modpack. No forma parte de Tenso Installer y no debe compartirse con los
jugadores porque usa el secreto de publicación.

## Uso

```powershell
$env:TENSO_PUBLISHER_TOKEN = "el-secreto-configurado-en-el-Worker"
cargo run --release -- `
  --source C:\packs\midnight-valley\overrides `
  --pack-id midnight-valley `
  --version 1.0.0 `
  --minecraft 1.21.1 `
  --loader neoforge `
  --server play.example.com:25565 `
  --base-source modrinth `
  --base-url https://modrinth.com/modpack/tu-pack/version/tu-version `
  --endpoint https://tenso-publisher.tu-subdominio.workers.dev
```

El Publisher rechaza enlaces simbólicos y rutas peligrosas, calcula SHA-256 de
cada archivo y solo promueve la versión cuando el manifiesto se subió con éxito.
