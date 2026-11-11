// Configuración del proceso principal.
//
// __AZURE_CLIENT_ID__ se sustituye en tiempo de build por Vite (ver
// vite.config.ts) con el valor de AZURE_CLIENT_ID del .env. El Client ID de
// Azure es PÚBLICO, por eso puede ir embebido en el binario.
declare const __AZURE_CLIENT_ID__: string
declare const __PAPUT_API_URL__: string
declare const __PAPUT_GROUP_BASE_URL__: string
declare const __PAPUT_GROUP_ID__: string

/** Id. de aplicación (cliente) de la app de Azure/Entra para el login premium. */
export const AZURE_CLIENT_ID: string = __AZURE_CLIENT_ID__

/** URL pública del Worker de acceso. Vacía mientras el backend no esté desplegado. */
export const PAPUT_API_URL: string = __PAPUT_API_URL__.replace(/\/$/, '')

/** Grupo oficial incorporado al compilar; elimina el antiguo código manual. */
export const PAPUT_GROUP_BASE_URL: string = __PAPUT_GROUP_BASE_URL__.replace(/\/$/, '')
export const PAPUT_GROUP_ID: string = __PAPUT_GROUP_ID__
