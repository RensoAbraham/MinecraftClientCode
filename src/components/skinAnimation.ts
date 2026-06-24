import { PlayerAnimation } from 'skinview3d'
import type { PlayerObject } from 'skinview3d'

/**
 * Animación idle estilo Modrinth: respiración fluida continua + un repertorio
 * de gestos que se alternan cada cierto tiempo (estirarse, mirarse los hombros,
 * sorpresa, y manos a la barriga con balanceo). Las transiciones entran y salen
 * suavemente para que se sienta fluido.
 */
const GESTURES = ['wave', 'shoulders', 'belly', 'dance'] as const

export class IdleGesturesAnimation extends PlayerAnimation {
  protected animate(player: PlayerObject): void {
    const t = this.progress
    const s = player.skin

    // --- Base idle: respiración suave y continua ---
    const breath = Math.sin(t * 1.6)
    s.head.rotation.x = breath * 0.03
    s.head.rotation.y = Math.sin(t * 0.4) * 0.08 // mira despacio a los lados
    s.head.rotation.z = 0
    s.body.rotation.x = breath * 0.015
    s.body.rotation.z = 0
    s.leftArm.rotation.z = 0.07 + Math.cos(t * 1.0) * 0.025
    s.rightArm.rotation.z = -0.07 - Math.cos(t * 1.0) * 0.025
    s.leftArm.rotation.x = Math.sin(t * 1.0) * 0.03
    s.rightArm.rotation.x = -Math.sin(t * 1.0) * 0.03
    s.leftLeg.rotation.x = 0
    s.rightLeg.rotation.x = 0

    // --- Gestos divertidos (se alternan en orden) ---
    const idleLen = 4.5
    const gestureLen = 2.8
    const cycle = idleLen + gestureLen
    const phase = t % cycle
    if (phase <= idleLen) return

    const p = (phase - idleLen) / gestureLen // 0..1 dentro del gesto
    const ease = Math.sin(p * Math.PI) // entra y sale suave
    const gesture = GESTURES[Math.floor(t / cycle) % GESTURES.length]

    if (gesture === 'wave') {
      // Saludo: levanta el brazo derecho AL COSTADO (rotation.z, no atrás) y
      // agita la mano. Así no atraviesa la cabeza.
      s.rightArm.rotation.z = -ease * 2.6
      s.rightArm.rotation.x = Math.sin(p * Math.PI * 6) * ease * 0.35
      s.head.rotation.z = ease * 0.06
    } else if (gesture === 'shoulders') {
      // Mirarse los hombros (un lado y el otro), como ropa nueva.
      s.head.rotation.y = Math.sin(p * Math.PI * 2) * 0.9
      s.head.rotation.x = ease * 0.18
      s.head.rotation.z = Math.sin(p * Math.PI * 2) * 0.12
      s.leftArm.rotation.x = ease * 0.25
      s.rightArm.rotation.x = ease * 0.25
    } else if (gesture === 'dance') {
      // Mini baile: balanceo lateral con la cabeza y brazos al ritmo.
      const beat = Math.sin(p * Math.PI * 4)
      s.body.rotation.z = beat * ease * 0.18
      s.head.rotation.z = -beat * ease * 0.14
      s.leftArm.rotation.x = beat * ease * 0.5
      s.rightArm.rotation.x = -beat * ease * 0.5
      s.leftArm.rotation.z = 0.07 + ease * 0.15
      s.rightArm.rotation.z = -0.07 - ease * 0.15
    } else if (gesture === 'belly') {
      // Brazos cruzados al frente (manos juntas adelante) y el cuerpo se
      // balancea adelante/atrás manteniendo las manos ahí.
      s.leftArm.rotation.x = ease * 1.45
      s.rightArm.rotation.x = ease * 1.45
      s.leftArm.rotation.z = 0.07 - ease * 0.65 // cruza hacia el centro
      s.rightArm.rotation.z = -0.07 + ease * 0.65
      const rock = Math.sin(p * Math.PI * 4) // -1..1, balanceo adelante/atrás
      s.body.rotation.x = ease * (0.05 + rock * 0.17)
      s.head.rotation.x = ease * rock * 0.12
    }
  }
}
