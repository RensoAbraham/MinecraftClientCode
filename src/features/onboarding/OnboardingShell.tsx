import type { ReactNode } from 'react'
import homeBgUrl from '../../assets/home-bg.mp4'
import { SparkleLogo } from '../../components/SparkleLogo'

interface OnboardingShellProps {
  step: 1 | 2
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}

/** Marco visual compartido por los pasos de acceso y cuenta del jugador. */
export function OnboardingShell({
  step,
  eyebrow,
  title,
  description,
  children,
}: OnboardingShellProps) {
  return (
    <div className="relative h-full w-full overflow-y-auto bg-tenso-bg">
      <video
        src={homeBgUrl}
        className="pointer-events-none fixed inset-0 h-full w-full scale-[1.02] object-cover opacity-55"
        autoPlay
        loop
        muted
        playsInline
      />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(12,14,15,0.97)_0%,rgba(15,17,19,0.88)_52%,rgba(15,17,19,0.72)_100%)]" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-t from-[#0f1113] via-transparent to-[#0f1113]/65" />

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-[1180px] flex-col px-8 py-7">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SparkleLogo size={38} />
            <div>
              <p className="text-sm font-black tracking-[0.18em] text-white">PAPUT CLIENT</p>
              <p className="text-[10px] tracking-[0.22em] text-white/45 uppercase">Minecraft launcher</p>
            </div>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/55 backdrop-blur-md">
            Configuración inicial
          </span>
        </header>

        <main className="grid flex-1 items-center gap-10 py-7 md:grid-cols-[minmax(0,1fr)_440px]">
          <section className="max-w-xl pr-4">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-tenso-accent/30 bg-black/20 px-3 py-1.5 text-xs font-semibold text-tenso-accent-soft">
              <span className="h-1.5 w-1.5 bg-tenso-accent-soft" />
              Tu modpack siempre al día
            </div>
            <h1 className="max-w-lg text-4xl leading-[1.06] font-black tracking-[-0.035em] text-white lg:text-5xl">
              Menos configuración.
              <span className="block text-tenso-accent-soft">
                Más tiempo jugando.
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-6 text-white/60">
              Paput Client instala, sincroniza y prepara todo por ti. Solo necesitas el acceso de
              tu grupo y una cuenta de juego.
            </p>

            <div className="mt-7 grid max-w-lg grid-cols-3 gap-3">
              <Feature title="Automático" detail="Mods y Java" />
              <Feature title="Sincronizado" detail="Misma versión" />
              <Feature title="Directo" detail="Listo para entrar" />
            </div>

            <div className="mt-9 flex items-center gap-3" aria-label={`Paso ${step} de 2`}>
              <Step active={step === 1} complete={step > 1} number="01" label="Acceso al grupo" />
              <div className={`h-px w-8 ${step > 1 ? 'bg-tenso-accent' : 'bg-white/15'}`} />
              <Step active={step === 2} complete={false} number="02" label="Cuenta de juego" />
            </div>
          </section>

          <section className="anim-fade-in-scale rounded-2xl border border-white/10 bg-[#181b1e]/94 p-7 shadow-[0_20px_55px_rgba(0,0,0,0.38)] backdrop-blur-xl">
            <p className="text-[11px] font-bold tracking-[0.2em] text-tenso-accent-soft uppercase">
              {eyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">{title}</h2>
            <p className="mt-2 text-sm leading-5 text-white/50">{description}</p>
            <div className="mt-6">{children}</div>
          </section>
        </main>

        <footer className="flex items-center justify-between text-[10px] text-white/30">
          <span>Paput Client</span>
          <span>El launcher nunca guarda tu contraseña de Microsoft.</span>
        </footer>
      </div>
    </div>
  )
}

function Feature({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-3 backdrop-blur-sm">
      <p className="text-xs font-semibold text-white/85">{title}</p>
      <p className="mt-0.5 text-[10px] text-white/35">{detail}</p>
    </div>
  )
}

function Step({
  active,
  complete,
  number,
  label,
}: {
  active: boolean
  complete: boolean
  number: string
  label: string
}) {
  return (
    <div className={`flex items-center gap-2 ${active || complete ? 'text-white' : 'text-white/35'}`}>
      <span
        className={`grid h-7 w-7 place-items-center rounded-full border text-[10px] font-bold ${
          active
            ? 'border-tenso-accent bg-tenso-accent text-[#17120a]'
            : complete
              ? 'border-tenso-accent/50 bg-tenso-accent/15 text-tenso-accent-soft'
              : 'border-white/15 bg-white/5'
        }`}
      >
        {complete ? '✓' : number}
      </span>
      <span className="text-[11px] font-medium">{label}</span>
    </div>
  )
}
