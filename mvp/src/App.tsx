import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import "./App.css";

type AccountMode = "microsoft" | "offline";
type Stage = "account" | "launcher" | "installing" | "complete";
type IconName = "arrow" | "back" | "check" | "cube" | "key" | "monitor" | "profile" | "refresh" | "spark";
type Launcher = { id: string; name: string; detected: boolean; executable?: string; iconDataUrl?: string; installMode: string };

const launcherInfo: Record<string, { modes: AccountMode[]; description: string }> = {
  modrinth: { modes: ["microsoft"], description: "Abre la versión publicada" }, prism: { modes: ["microsoft"], description: "Importa el pack compatible" },
  curseforge: { modes: ["microsoft"], description: "Abre el pack oficial" }, polymc: { modes: ["microsoft", "offline"], description: "Prepara una instancia nueva" },
  sklauncher: { modes: ["offline"], description: "Crea un perfil sin conexión" },
};
const demoLaunchers: Launcher[] = [
  { id: "modrinth", name: "Modrinth App", detected: true, executable: "C:\\Apps\\Modrinth App", installMode: "Instala desde Modrinth" },
  { id: "prism", name: "Prism Launcher", detected: true, executable: "C:\\Apps\\Prism Launcher", installMode: "Importa un .mrpack" },
  { id: "curseforge", name: "CurseForge", detected: false, installMode: "Abre el pack oficial" },
  { id: "polymc", name: "PolyMC", detected: true, executable: "C:\\Apps\\PolyMC", installMode: "Importa el modpack" },
  { id: "sklauncher", name: "SKLauncher", detected: false, installMode: "Prepara un perfil offline" },
];
const installTasks = ["Comprobando la versión del pack", "Preparando los archivos", "Configurando el servidor", "Finalizando la instalación"];

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />, back: <path d="M19 12H5m6 6-6-6 6-6" />, check: <path d="m5 12 4.25 4.25L19 6.5" />,
    cube: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.75 7.5 4.5 7.5-4.5M12 12.5V21" /></>,
    key: <><circle cx="8" cy="15" r="3" /><path d="m10.2 12.8 7.3-7.3 2 2-1.5 1.5 1.5 1.5-2 2-1.5-1.5-4.6 4.6" /></>,
    monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8m-4-4v4" /></>,
    profile: <><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20c.7-3.5 3-5.25 6.5-5.25s5.8 1.75 6.5 5.25" /></>,
    refresh: <><path d="M20 11a8.1 8.1 0 0 0-14.9-3L3 10" /><path d="M3 5v5h5M4 13a8.1 8.1 0 0 0 14.9 3L21 14" /><path d="M21 19v-5h-5" /></>,
    spark: <path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" />,
  };
  return <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
function LauncherBadge({ launcher }: { launcher: Launcher }) {
  const fallback = launcher.name.split(/[\s-]/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
  return launcher.iconDataUrl ? <img className="launcher-badge launcher-badge-image" src={launcher.iconDataUrl} alt="" /> : <span className="launcher-badge launcher-badge-fallback" aria-hidden="true">{fallback}</span>;
}

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
  const taskIndex = Math.min(Math.floor(progress / 25), installTasks.length - 1);
  function chooseAccount(mode: AccountMode) { setAccountMode(mode); setSelected(null); setStage("launcher"); }
  function simulateInstall() { setProgress(0); setStage("installing"); const timer = window.setInterval(() => setProgress((value) => { const next = Math.min(value + 4, 100); if (next === 100) { window.clearInterval(timer); setStage("complete"); } return next; }), 120); }
  function restart() { setStage("account"); setSelected(null); setProgress(0); }
  function openDownload() { window.open(accountMode === "offline" ? "https://sklauncher.pl/" : "https://prismlauncher.org/download/", "_blank", "noopener,noreferrer"); }
  const stageNumber = stage === "account" ? 0 : stage === "launcher" ? 1 : 3;

  return <div className="installer" data-stage={stage}>
    <header className="app-header"><button className="wordmark" onClick={restart} aria-label="Volver al inicio de Tenso"><span className="wordmark-mark"><span /></span><span className="wordmark-name">tenso</span><span className="wordmark-product">installer</span></button><div className="header-right"><ol className="stepper" aria-label="Progreso de instalación">{["Cuenta", "Launcher", "Listo"].map((label, index) => <li key={label} className={index <= stageNumber ? "is-active" : ""}>{label}</li>)}</ol><label className="demo-switch"><input type="checkbox" checked={demo} onChange={(event) => setDemo(event.target.checked)} /><span aria-hidden="true" />Modo demo</label></div></header>
    <main>
      {stage === "account" && <section className="account-screen screen-enter" aria-labelledby="account-title"><div className="atmosphere" aria-hidden="true"><span className="atmosphere-core" /><span className="atmosphere-ring ring-one" /><span className="atmosphere-ring ring-two" /><span className="atmosphere-dot dot-one" /><span className="atmosphere-dot dot-two" /></div><div className="screen-copy"><p className="eyebrow"><Icon name="spark" size={13} /> MIDNIGHT VALLEY <span>·</span> 1.0.0</p><h1 id="account-title">Empieza donde<br />te resulte natural.</h1><p className="intro">Tenso separa las opciones para que solo veas launchers compatibles con tu forma de jugar.</p><div className="account-options"><button className="account-card" onClick={() => chooseAccount("microsoft")}><span className="account-icon"><Icon name="key" size={21} /></span><span><strong>Tengo Minecraft</strong><small>Usaré mi cuenta Microsoft</small></span><Icon name="arrow" /></button><button className="account-card" onClick={() => chooseAccount("offline")}><span className="account-icon"><Icon name="profile" size={21} /></span><span><strong>Perfil sin conexión</strong><small>Jugaré en un servidor compatible</small></span><Icon name="arrow" /></button></div></div></section>}
      {stage === "launcher" && <section className="launcher-screen screen-enter" aria-labelledby="launcher-title"><button className="back" onClick={() => setStage("account")}><Icon name="back" size={16} /> Volver</button><div className="screen-head"><div><p className="eyebrow">02 <span>—</span> ELIGE UN LAUNCHER</p><h1 id="launcher-title">Un clic y<br />queda preparado.</h1></div><div className="pack-summary"><span className="pack-summary-icon"><Icon name="cube" size={19} /></span><span><strong>Midnight Valley</strong><small>1.21.1 <i>·</i> NeoForge</small></span></div></div>{installed.length > 0 ? <><div className="launcher-toolbar"><p>{accountMode === "offline" ? "Launchers compatibles con perfil sin conexión" : "Launchers compatibles con cuenta Microsoft"}</p><span>{installed.length} encontrado{installed.length === 1 ? "" : "s"}</span></div><div className="launcher-grid" role="list" aria-label="Launchers detectados">{installed.map((launcher) => <div key={launcher.id} role="listitem"><button onClick={() => setSelected(launcher.id)} aria-pressed={active?.id === launcher.id} className={`launcher-card ${active?.id === launcher.id ? "is-selected" : ""}`}><LauncherBadge launcher={launcher} /><span className="launcher-content"><strong>{launcher.name}</strong><small>{launcherInfo[launcher.id].description}</small></span><span className="selection-indicator" aria-hidden="true"><Icon name="check" size={14} /></span></button></div>)}</div><div className="bottom-action"><p><Icon name="monitor" size={17} /> {active?.installMode}. Tenso no tocará carpetas no reconocidas.</p><button className="primary" onClick={simulateInstall}>Continuar <Icon name="arrow" size={17} /></button></div></> : <div className="empty-state"><span className="empty-mark"><Icon name="monitor" size={27} /></span><h2>No encontramos un launcher compatible.</h2><p>Instala uno y vuelve aquí. Tenso no instalará nada en carpetas desconocidas.</p><div><button className="secondary" onClick={() => void scan()}><Icon name="refresh" size={16} /> Buscar otra vez</button><button className="primary" onClick={openDownload}>Ver opciones de descarga <Icon name="arrow" size={17} /></button></div></div>}</section>}
      {stage === "installing" && <section className="install-screen screen-enter" aria-labelledby="install-title"><p className="eyebrow">03 <span>—</span> PREPARANDO {active?.name.toUpperCase()}</p><h1 id="install-title">Todo va<br />encajando.</h1><p className="intro">Esta instalación es una demostración: aún no se modifica ningún archivo en tu equipo.</p><div className="progress-block"><div className="progress-value"><strong>{progress}</strong><small>%</small></div><div className="progress-track" role="progressbar" aria-label="Progreso de la demostración" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ transform: `scaleX(${progress / 100})` }} /></div><p aria-live="polite">{installTasks[taskIndex]}</p></div><ol className="install-list">{installTasks.map((task, index) => <li className={index < taskIndex ? "done" : index === taskIndex ? "doing" : ""} key={task}><span>{index < taskIndex ? <Icon name="check" size={13} /> : `0${index + 1}`}</span>{task}</li>)}</ol></section>}
      {stage === "complete" && <section className="complete-screen screen-enter" aria-labelledby="complete-title"><div className="success-mark"><Icon name="check" size={30} /></div><p className="eyebrow">04 <span>—</span> DEMOSTRACIÓN COMPLETADA</p><h1 id="complete-title">Listo para<br />la aventura.</h1><p className="intro">En la versión real, Midnight Valley quedará preparado en {active?.name}. Ningún archivo fue cambiado en esta prueba.</p><div className="details"><div><small>SERVIDOR</small><strong>play.midnightvalley.gg</strong></div><div><small>LAUNCHER</small><strong>{active?.name}</strong></div><div><small>REQUISITO</small><strong>Java 21</strong></div></div><button className="primary" onClick={restart}>Probar otro flujo <Icon name="refresh" size={17} /></button></section>}
    </main>
    <footer className="project-credit"><span>Una creación de Renso</span><span aria-hidden="true">·</span><strong>con el impulso de Lilith&apos;s Dream World</strong></footer>
  </div>;
}
