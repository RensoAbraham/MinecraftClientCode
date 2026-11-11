# Tenso telemetry Worker

Worker opcional de Cloudflare para diagnósticos aprobados explícitamente por el
usuario. No recibe archivos, IP pública, nombre de Windows, seriales ni tokens.

## Preparación

1. Copia `wrangler.toml.example` como `wrangler.toml`.
2. Crea una D1: `npx wrangler d1 create tenso-telemetry`.
3. Aplica el esquema: `npx wrangler d1 execute tenso-telemetry --remote --file=schema.sql`.
4. Define un secreto aleatorio: `npx wrangler secret put REPORT_SALT`.
5. Despliega: `npx wrangler deploy`.

El Worker valida el formato y rechaza campos inesperados. Esto reduce informes
accidentales o mal formados; una aplicación instalada en un equipo ajeno no
puede demostrar criptográficamente que sus datos no fueron modificados.
