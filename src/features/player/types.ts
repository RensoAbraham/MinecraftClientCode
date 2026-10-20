import type { Instance } from '../../../shared/ipc'

/** Grupo de instancias tal como lo consume la interfaz del jugador. */
export interface PlayerGroup {
  groupId: string
  group: string
  instances: Instance[]
}
