import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import "./credit.css";

type AccountMode = "microsoft" | "offline";
type Stage = "account" | "launcher" | "installing" | "complete";
type Launcher = { id: string; name: string; detected: boolean; executable?: string; iconDataUrl?: string; installMode: string };

const launcherInfo: Record<string, { mark: string; tint: string; modes: AccountMode[]; description: string }> = {
  modrinth: { mark: "M", tint: "mint", modes: ["microsoft"], description: "Instala desde la versión publicada" },
  prism: { mark: "P", tint: "sunset", modes: ["microsoft"], description: "Importa el modpack de forma segura" },
  curseforge: { mark: "C", tint: "ember", modes: ["microsoft"], description: "Abre el pack en CurseForge" },
  polymc: { mark: "◇", tint: "lime", modes: ["microsoft", "offline"], description: "Importa el pack compatible" },
  sklauncher: { mark: "S", tint: "sky", modes: ["offline"], description: "Prepara un perfil sin conexión" },
};

const demoLaunchers: Launcher[] = [
  { id: "modrinth", name: "Modrinth App", detected: true, executable: "C:\\Apps\\Modrinth App", installMode: "Instala desde Modrinth" },
  { id: "prism", name: "Prism Launcher", detected: true, executable: "C:\\Apps\\Prism Launcher", installMode: "Importa un .mrpack" },
  { id: "curseforge", name: "CurseForge", detected: false, installMode: "Abre el pack oficial" },
  { id: "polymc", name: "PolyMC", detected: true, executable: "C:\\Apps\\PolyMC", installMode: "Importa el modpack" },
  { id: "sklauncher", name: "SKLauncher", detected: false, installMode: "Prepara un perfil offline" },
];
const installTasks = ["Comprobando la versión del pack", "Preparando archivos", "Configurando el servidor", "Terminando la instalación"];

export default function App() {
  const [stage, setStage] = useState<Stage>("account");
  const [accountMode, setAccountMode] = useState<AccountMode>("microsoft");
  const [runtimeLaunchers, setRuntimeLaunchers] = useState<Launcher[]>([]);
  const [demo, setDemo] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  async function scan() { try { setRuntimeLaunchers(await invoke<Launcher[]>("detect_launchers")); } catch { setRuntimeLaunchers([]); } }
  useEffect(() => { void scan(); }, []);
  const launchers = demo ? demoLaunchers : runtimeLaunchers;
  const compatible = useMemo(() => launchers.filter((launcher) => launcherInfo[launcher.id]?.modes.includes(accountMode)), [accountMode, launchers]);
  const installed = compatible.filter((launcher) => launcher.detected);
  const active = installed.find((launcher) => launcher.id === selected) ?? installed[0] ?? null;

  function chooseAccount(mode: AccountMode) { setAccountMode(mode); setSelected(null); setStage("launcher"); }
  function simulateInstall() {
    setProgress(0); setStage("installing");
    const timer = window.setInterval(() => setProgress((value) => {
      const next = Math.min(value + 4, 100);
      if (next === 100) { window.clearInterval(timer); setStage("complete"); }
      return next;
    }), 115);
  }
  function restart() { setStage("account"); setSelected(null); setProgress(0); }
  const taskIndex = Math.min(Math.floor(progress / 25), installTasks.length - 1);

  return <div className="installer">
    <header className="app-header"><button className="wordmark" onClick={restart}><b>tenso</b><span>installer</span></button><div className="header-actions"><label><input type="checkbox" checked={demo} onChange={(event) => setDemo(event.target.checked)} /> Modo demo</label><span>v0.1.0</span></div></header>
    <main>
      {stage === "account" && <section className="account-screen screen-enter">
        <div className="hero-art"><span className="moon" /><span className="star one">✦</span><span className="star two">·</span><span className="land" /></div>
        <p className="eyebrow">MIDNIGHT VALLEY · 1.0.0</p><h1>Antes de empezar,<br />¿cómo juegas?</h1><p className="intro">Te mostraremos solamente launchers compatibles contigo. Sin configuraciones que no necesitas.</p>
        <div className="account-options"><button onClick={() => chooseAccount("microsoft")}><span className="option-symbol">◆</span><strong>Tengo Minecraft</strong><small>Usaré mi cuenta Microsoft</small><i>→</i></button><button onClick={() => chooseAccount("offline")}><span className="option-symbol">◇</span><strong>Perfil sin conexión</strong><small>Jugaré en un servidor compatible</small><i>→</i></button></div>
      </section>}

      {stage === "launcher" && <section className="launcher-screen screen-enter">
        <button className="back" onClick={() => setStage("account")}>← Volver</button><div className="screen-head"><div><p className="eyebrow">02 — ELIGE UN LAUNCHER</p><h1>¿Dónde lo<br />instalamos?</h1></div><div className="mini-pack"><span>✦</span><div><strong>Midnight Valley</strong><small>1.21.1 · NeoForge</small></div></div></div>
        {installed.length > 0 ? <><div className="launcher-grid">{installed.map((launcher) => <button key={launcher.id} onClick={() => setSelected(launcher.id)} className={`launcher-card ${active?.id === launcher.id ? "is-selected" : ""}`}>{launcher.iconDataUrl ? <img className="launcher-logo real-logo" src={launcher.iconDataUrl} alt="" /> : <span className={`launcher-logo ${launcherInfo[launcher.id].tint}`}>{launcherInfo[launcher.id].mark}</span>}<strong>{launcher.name}</strong><small>{launcherInfo[launcher.id].description}</small><em>{active?.id === launcher.id ? "Seleccionado" : "Elegir"}</em></button>)}</div><div className="bottom-action"><p>{accountMode === "offline" ? "Podrás usar un perfil sin conexión compatible con tu servidor." : "Conectarás tu cuenta Microsoft desde el launcher elegido."}</p><button className="primary" onClick={simulateInstall}>Continuar <span>→</span></button></div></> : <div className="empty-state"><span className="empty-orbit">✦</span><h2>No encontramos un launcher compatible.</h2><p>Instala uno y vuelve aquí. Tenso no instalará nada en carpetas desconocidas.</p><div><button onClick={() => void scan()}>Buscar otra vez</button><button className="primary" onClick={() => window.open(accountMode === "offline" ? "https://sklauncher.pl/" : "https://prismlauncher.org/download/", "_blank")}>Ver opciones de descarga <span>↗</span></button></div></div>}
      </section>}

      {stage === "installing" && <section className="install-screen screen-enter"><p className="eyebrow">03 — PREPARANDO {active?.name.toUpperCase()}</p><h1>Todo está<br />tomando forma.</h1><p className="intro">Esta instalación es una demostración: no se está modificando ningún archivo.</p><div className="progress-block"><div><strong>{progress}</strong><small>%</small></div><span className="progress-line"><i style={{ width: `${progress}%` }} /></span><p>{installTasks[taskIndex]}</p></div><ol>{installTasks.map((task, index) => <li className={index < taskIndex ? "done" : index === taskIndex ? "doing" : ""} key={task}><span>{index < taskIndex ? "✓" : `0${index + 1}`}</span>{task}</li>)}</ol></section>}

      {stage === "complete" && <section className="complete-screen screen-enter"><div className="success-mark">✓</div><p className="eyebrow">04 — DEMOSTRACIÓN COMPLETADA</p><h1>Listo para<br />la aventura.</h1><p className="intro">En la versión real, Midnight Valley quedará preparado en {active?.name}. Ningún archivo fue cambiado en esta prueba.</p><div className="details"><div><small>SERVIDOR</small><strong>play.midnightvalley.gg</strong></div><div><small>LAUNCHER</small><strong>{active?.name}</strong></div><div><small>REQUISITO</small><strong>Java 21</strong></div></div><button className="primary" onClick={restart}>Probar otro flujo <span>↻</span></button></section>}
    </main>
    <footer className="project-credit"><span>Una creación de Renso</span><span aria-hidden="true">·</span><strong>con el impulso de Lilith&apos;s Dream World</strong></footer>
  </div>;
}
