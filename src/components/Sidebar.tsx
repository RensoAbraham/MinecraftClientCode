import type { Account } from '../../shared/ipc'
import type { Group } from '../App'

interface SidebarProps {
  groups: Group[]
  selectedGroupId: string | null
  variants: Record<string, string>
  account: Account | null
  onHome: () => void
  onSelectGroup: (groupId: string) => void
  /** Si se pasa, muestra el botón de añadir más grupos. */
  onAdd?: () => void
  onOpenSettings: () => void
  onOpenAccounts: () => void
  onOpenSkin: () => void
  /** Si se pasa (modo dev), muestra el botón del Panel Dev. */
  onOpenDev?: () => void
  /** Si se pasa (modo dev), muestra el botón del menú de vistas previas. */
  onPreviewLogin?: () => void
}

/**
 * Barra lateral: inicio, un icono por GRUPO (con el arte de la variante elegida),
 * botón de añadir, ajustes y avatar.
 */
export function Sidebar({
  groups,
  selectedGroupId,
  variants,
  account,
  onHome,
  onSelectGroup,
  onAdd,
  onOpenSettings,
  onOpenAccounts,
  onOpenSkin,
  onOpenDev,
  onPreviewLogin,
}: SidebarProps) {
  return (
    <aside className="flex w-20 flex-col items-center gap-2 overflow-y-auto border-r border-tenso-border bg-tenso-panel py-4">
      <button
        onClick={onHome}
        className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white shadow-lg transition-transform hover:scale-105 active:scale-95 ${
          selectedGroupId === null ? 'bg-tenso-accent ring-2 ring-tenso-accent-soft' : 'bg-tenso-accent'
        }`}
        title="Inicio"
      >
        <HomeIcon />
      </button>

      <div className="my-1 h-px w-10 shrink-0 bg-tenso-border" />

      {/* Un icono por grupo (con el arte de la variante elegida o la primera) */}
      {groups.map((g, idx) => {
        const shown = g.instances.find((i) => i.id === variants[g.groupId]) ?? g.instances[0]
        const active = g.groupId === selectedGroupId
        return (
          <button
            key={g.groupId}
            data-tour={idx === 0 ? 'groups' : undefined}
            onClick={() => onSelectGroup(g.groupId)}
            title={g.group}
            className={`grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-tenso-panel-2 transition-transform hover:scale-105 active:scale-95 ${
              active ? 'border-tenso-accent ring-2 ring-tenso-accent' : 'border-tenso-border'
            }`}
          >
            {shown?.imageUrl ? (
              <img src={shown.imageUrl} alt={g.group} className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-bold text-tenso-text">
                {g.group.charAt(0).toUpperCase()}
              </span>
            )}
          </button>
        )
      })}

      {/* Botón de añadir grupo (oculto temporalmente: solo se muestra si se pasa onAdd) */}
      {onAdd && (
        <button
          onClick={onAdd}
          title="Añadir un grupo con su código"
          className="mt-1 grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2 border-dashed border-tenso-border text-2xl text-tenso-muted transition-colors hover:border-tenso-accent hover:text-tenso-accent-soft"
        >
          +
        </button>
      )}

      {/* Empuja el grupo inferior de botones hacia abajo */}
      <div className="mt-auto" />

      {onPreviewLogin && (
        <button
          onClick={onPreviewLogin}
          className="mt-1 grid h-12 w-12 shrink-0 place-items-center rounded-xl text-tenso-muted transition-colors hover:bg-tenso-panel-2 hover:text-tenso-accent-soft"
          title="Vistas previas (dev)"
        >
          <EyeIcon />
        </button>
      )}

      {onOpenDev && (
        <button
          onClick={onOpenDev}
          className="mt-1 grid h-12 w-12 shrink-0 place-items-center rounded-xl text-tenso-muted transition-colors hover:bg-tenso-panel-2 hover:text-tenso-accent-soft"
          title="Modo Dev"
        >
          <CodeIcon />
        </button>
      )}

      <button
        data-tour="settings"
        onClick={onOpenSettings}
        className="mt-1 grid h-12 w-12 shrink-0 place-items-center rounded-xl text-tenso-muted transition-all hover:rotate-45 hover:bg-tenso-panel-2 hover:text-tenso-text"
        title="Ajustes"
      >
        <GearIcon />
      </button>

      {/* Editar skin (icono de ropa) */}
      <button
        data-tour="skin"
        onClick={onOpenSkin}
        className="mt-1 grid h-12 w-12 shrink-0 place-items-center rounded-xl text-tenso-muted transition-colors hover:bg-tenso-panel-2 hover:text-tenso-accent-soft"
        title="Editar skin"
      >
        <ShirtIcon />
      </button>

      {/* Avatar (clic = cambiar de cuenta) */}
      <button
        data-tour="account"
        onClick={onOpenAccounts}
        className="mt-1 grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-tenso-accent bg-tenso-panel-2 transition-transform hover:scale-105 active:scale-95"
        title={account ? `${account.name} — cambiar cuenta` : 'Cuentas'}
      >
        {account ? (
          // Render del busto (cabeza + torso) en 3D, no solo la cara.
          <img
            src={`https://visage.surgeplay.com/bust/128/${account.uuid}`}
            alt={account.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-sm font-semibold text-tenso-muted">?</span>
        )}
      </button>
    </aside>
  )
}

function HomeIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3.2 3 10.1V21h6v-6h6v6h6V10.1L12 3.2Z" />
    </svg>
  )
}

function CodeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

function ShirtIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 3 12 5 8 3 3 6l2.5 4L8 9v12h8V9l2.5 1L21 6 16 3Z" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94a7.5 7.5 0 0 0 .05-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.12.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.33 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.5 7.5 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.24 1.12-.56 1.62-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
    </svg>
  )
}
