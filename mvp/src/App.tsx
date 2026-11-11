import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import "./App.css";

type Launcher = { id: string; name: string; detected: boolean; executable?: string; installMode: string };
type InstallState = "ready" | "installing" | "complete";

const demoLaunchers: Launcher[] = [
  { id: "prism", name: "Prism Launcher", detected: true, executable: "C:\\Users\\Alex\\AppData\\Roaming\\PrismLauncher", installMode: "Importará el modpack con formato compatible" },
  { id: "modrinth", name: "Modrinth App", detected: true, executable: "C:\\Users\\Alex\\AppData\\Roaming\\ModrinthApp", installMode: "Abrirá la versión publicada en Modrinth" },
  { id: "polymc", name: "PolyMC", detected: false, installMode: "Importará un pack compatible con MultiMC" },
  { id: "curseforge", name: "CurseForge", detected: false, installMode: "Abrirá la página oficial del modpack" },
];

const tasks = ["Preparando el modpack", "Comprobando compatibilidad", "Importando contenido", "Guardando acceso al servidor"];

export default function App() {
  const [detected, setDetected] = useState<Launcher[]>([]);
  const [demo, setDemo] = useState(true);
  const [selected, setSelected] = useState("prism");
  const [state, setState] = useState<InstallState>("ready");
  const [progress, setProgress] = useState(0);

  async function scan() {
    try { setDetected(await invoke<Launcher[]>("detect_launchers")); } catch { setDetected([]); }
  }
  useEffect(() => { void scan(); }, []);

  const launchers = useMemo(() => demo ? demoLaunchers : detected, [demo, detected]);
  const active = launchers.find((launcher) => launcher.id === selected) ?? launchers.find((launcher) => launcher.detected);

  function simulate() {
    setState("installing"); setProgress(0);
    const timer = window.setInterval(() => {
      setProgress((current) => {
        const next = Math.min(current + 4, 100);
        if (next === 100) { window.clearInterval(timer); setState("complete"); }
        return next;
      });
    }, 125);
  }

  function reset() { setState("ready"); setProgress(0); }
  const completedTasks = Math.floor((progress / 100) * tasks.length);

  return (
    <div className="app-shell">
      <aside>
        <div className="brand"><span className="brand-mark">T</span><div><strong>TENSO</strong><small>INSTALLER</small></div></div>
        <div className="side-copy"><p className="eyebrow">TU MODPACK</p><h2>Todo listo<br />para jugar.</h2><p>Instala una experiencia compartida en el launcher que ya usas.</p></div>
        <div className="side-footer"><span className="pulse" /> MVP EN PRUEBAS <small>v0.1.0</small></div>
      </aside>

      <main>
        <div className="topbar"><p className="eyebrow">BIBLIOTECA / MINECRAFT</p><label className="demo-switch"><input type="checkbox" checked={demo} onChange={(event) => setDemo(event.target.checked)} /> <span>Modo demo</span></label></div>

        {state === "ready" && <section className="screen ready-screen">
          <div className="heading"><p className="kicker">01 — ELIGE UN DESTINO</p><h1>¿Dónde quieres<br />instalarlo?</h1><p>Detectamos tus launchers. El contenido se instala o importa en el que elijas.</p></div>
          <div className="pack-summary"><div className="pack-orb"><span>✦</span></div><div><p className="eyebrow">MODPACK SELECCIONADO</p><h3>Midnight Valley</h3><p>Minecraft 1.21.1 · NeoForge</p></div><span className="version">1.0.0</span></div>
          <div className="launcher-list">
            {launchers.map((launcher) => <button key={launcher.id} className={`launcher-row ${selected === launcher.id ? "selected" : ""} ${!launcher.detected ? "unavailable" : ""}`} onClick={() => launcher.detected && setSelected(launcher.id)} disabled={!launcher.detected}>
              <span className="launcher-icon">{launcher.name.charAt(0)}</span><span className="launcher-details"><strong>{launcher.name}</strong><small>{launcher.detected ? launcher.executable : "No se encontró en este equipo"}</small></span><span className="selection-dot" aria-hidden="true" />
            </button>)}
          </div>
          <div className="action-row"><p>{active ? `Instalación preparada para ${active.name}` : "Activa el modo demo o instala un launcher para continuar."}</p><button className="primary-action" onClick={simulate} disabled={!active}>Simular instalación <span>→</span></button></div>
        </section>}

        {state === "installing" && <section className="screen progress-screen">
          <p className="kicker">02 — INSTALANDO EN {active?.name.toUpperCase()}</p><h1>Preparando<br />tu aventura.</h1><p className="lead">No cierres Tenso mientras terminamos de configurar Midnight Valley.</p>
          <div className="progress-visual"><div className="progress-number">{progress}<small>%</small></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><p>{progress < 100 ? tasks[Math.min(completedTasks, tasks.length - 1)] : "Completado"}</p></div>
          <ol className="task-list">{tasks.map((task, index) => <li key={task} className={index < completedTasks ? "done" : index === completedTasks ? "current" : ""}><span>{index < completedTasks ? "✓" : index + 1}</span>{task}</li>)}</ol>
        </section>}

        {state === "complete" && <section className="screen complete-screen">
          <div className="complete-icon">✓</div><p className="kicker">03 — INSTALACIÓN SIMULADA</p><h1>Ya estás<br />dentro.</h1><p className="lead">Midnight Valley quedó preparado en {active?.name}. Esta es una prueba: no se descargó ni modificó ningún archivo.</p>
          <div className="info-grid"><div><span>SERVIDOR</span><strong>play.midnightvalley.gg</strong></div><div><span>LAUNCHER</span><strong>{active?.name}</strong></div><div><span>REQUISITO</span><strong>Java 21</strong></div></div>
          <div className="action-row"><button onClick={reset}>Volver al inicio</button><button className="primary-action" onClick={reset}>Probar de nuevo <span>↻</span></button></div>
        </section>}
      </main>
    </div>
  );
}
