import type { Account } from '../../shared/ipc'
import type { Group } from '../App'
import { SparkleLogo } from './SparkleLogo'
import homeBgUrl from '../assets/home-bg.mp4'

interface HomeScreenProps {
  groups: Group[]
  account: Account | null
  onSelectGroup: (groupId: string) => void
}

/**
 * Pantalla de inicio (botón Home): hero con la marca, saludo a la cuenta activa
 * y una tarjeta por GRUPO (al abrirlo se elige el tipo LOW/HIGH).
 */
export function HomeScreen({ groups, account, onSelectGroup }: HomeScreenProps) {
  return (
    <main className="relative grid flex-1 place-items-center overflow-y-auto p-8">
      {/* Fondo animado de Inicio (vídeo en bucle, sin audio) con velo para legibilidad */}
      <video
        src={homeBgUrl}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
      />
      <div className="pointer-events-none absolute inset-0 bg-tenso-bg/45" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-tenso-bg/90 via-tenso-bg/20 to-tenso-bg/50" />

      <div className="anim-fade-in relative z-10 w-full max-w-3xl">
        {/* Hero */}
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-24 w-24 place-items-center">
            <SparkleLogo />
          </div>
          <div className="text-5xl font-black tracking-tight [text-shadow:0_2px_16px_rgba(0,0,0,0.8)]">
            PAPUT<span className="font-light text-white/70">CLIENT</span>
          </div>
          <p className="mx-auto mt-3 max-w-md text-sm text-white/80 [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">
            Launcher hecho por Renso para jugar con la ganga: instala el modpack solo,
            mantiene a todas en la misma versión y entra directo al servidor.
          </p>

          {/* Chip de la cuenta activa */}
          {account && (
            <div className="mt-5 flex justify-center">
              <span className="flex items-center gap-2 rounded-full border border-tenso-border bg-tenso-panel/60 px-3 py-1.5 text-xs text-tenso-muted">
                {account.avatarUrl && (
                  <img src={account.avatarUrl} alt="" className="h-4 w-4 rounded-sm [image-rendering:pixelated]" />
                )}
                <span className="text-tenso-text">{account.name}</span>
                {account.premium ? (
                  <span className="text-tenso-accent-soft">Premium</span>
                ) : (
                  <span>Offline</span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Grupos (al abrir uno se elige el tipo) */}
        {groups.length > 0 ? (
          <div className="mt-10">
            <p className="mb-3 text-center text-xs font-semibold tracking-widest text-white/60 uppercase [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">
              Tus instancias
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {groups.map((g) => {
                const art = g.instances[0]
                const isVideo = art?.backgroundUrl && /\.(mp4|webm|ogg)(\?.*)?$/i.test(art.backgroundUrl)
                return (
                  <button
                    key={g.groupId}
                    onClick={() => onSelectGroup(g.groupId)}
                    className="group w-52 overflow-hidden rounded-2xl border border-tenso-border bg-tenso-panel/80 text-left outline-none backdrop-blur transition-transform duration-200 hover:-translate-y-1"
                  >
                    <div className="relative h-32 w-full overflow-hidden bg-tenso-panel-2">
                      {art?.imageUrl ? (
                        <img src={art.imageUrl} alt={g.group} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : isVideo ? (
                        <video
                          src={art.backgroundUrl}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          muted
                          playsInline
                          preload="auto"
                          onLoadedData={(e) => {
                            e.currentTarget.currentTime = 0.1
                          }}
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-3xl font-black text-tenso-muted">
                          {g.group.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-tenso-bg/95 via-tenso-bg/10 to-transparent" />
                      <span className="absolute right-3 bottom-2 left-3 truncate text-lg font-bold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">
                        {g.group}
                      </span>
                    </div>
                    {g.instances.length > 1 && (
                      <p className="px-3 py-2 text-xs text-tenso-muted">
                        {g.instances.length} tipos · elige al entrar
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="mt-10 grid place-items-center rounded-2xl border border-dashed border-tenso-border py-12 text-center">
            <p className="text-tenso-muted">Aún no tienes instancias desbloqueadas.</p>
            <p className="text-sm text-tenso-muted">Pídele a Renso el código del grupo para empezar.</p>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-white/70 [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">
          ¿Alguna duda o error? Repórtalo a Renso por mensaje directo.
        </p>
        <p className="mt-1 text-center text-[11px] text-white/50 [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">
          Arte del fondo:{' '}
          <button
            onClick={() =>
              window.tenso.openExternal('https://steamcommunity.com/sharedfiles/filedetails/?id=2078716698')
            }
            className="font-semibold text-tenso-accent-soft underline-offset-2 hover:underline"
          >
            rilw — Minecraft Scene (Steam Workshop)
          </button>
        </p>
      </div>
    </main>
  )
}
