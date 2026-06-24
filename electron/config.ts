// Configuración del proceso principal.
//
// __AZURE_CLIENT_ID__ se sustituye en tiempo de build por Vite (ver
// vite.config.ts) con el valor de AZURE_CLIENT_ID del .env. El Client ID de
// Azure es PÚBLICO, por eso puede ir embebido en el binario.
declare const __AZURE_CLIENT_ID__: string

/** Id. de aplicación (cliente) de la app de Azure/Entra para el login premium. */
export const AZURE_CLIENT_ID: string = __AZURE_CLIENT_ID__
