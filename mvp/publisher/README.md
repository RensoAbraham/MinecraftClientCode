# Tenso Publisher

Herramienta privada para empaquetar los overrides locales de un modpack en una
GitHub Release pública. No usa Cloudflare, R2 ni una tarjeta. Los jugadores
solo descargan el `.zip`; no reciben credenciales de publicación.

Cada archivo se incorpora en `overrides/` y el paquete contiene un
`tenso-pack.json` con hashes, versión, IP del servidor y enlace al pack base de
Modrinth o CurseForge. Los overrides están limitados a **250 MiB** para que
Tenso distribuya únicamente configuraciones y recursos propios, no mods.

## Uso

1. Crea un fine-grained token de GitHub con permiso **Contents: Read and write**
   exclusivamente sobre `RensoAbraham/MinecraftClientCode`.
2. Guárdalo de forma temporal en tu terminal, nunca en el repositorio:

```powershell
$env:GITHUB_TOKEN = "tu-token-privado"
cargo run --release -- `
  --source C:\packs\midnight-valley\overrides `
  --pack-id midnight-valley `
  --version 1.0.0 `
  --minecraft 1.21.1 `
  --loader neoforge `
  --server play.example.com:25565 `
  --base-source modrinth `
  --base-url https://modrinth.com/modpack/tu-pack/version/tu-version `
  --repo RensoAbraham/MinecraftClientCode
```

El Publisher rechaza enlaces simbólicos y rutas peligrosas, calcula SHA-256,
crea una Release `tenso-<pack>-<versión>` y elimina el `.zip` temporal tras
subirlo. No ejecutes dos publicaciones para la misma versión: GitHub no permite
crear dos Releases con la misma etiqueta.

Añade `--dry-run` al comando para crear y validar el paquete localmente, sin
usar el token ni contactar GitHub.
