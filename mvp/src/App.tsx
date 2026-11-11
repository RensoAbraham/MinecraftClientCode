import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import "./App.css";

type Launcher = { id: string; name: string; detected: boolean; executable?: string; installMode: string };
const pack = { name: "Tu primer modpack", minecraft: "Minecraft 1.21.1", loader: "NeoForge", server: "play.ejemplo.com:25565" };

export default function App() {
  const [launchers, setLaunchers] = useState<Launcher[]>([]);
  const [loading, setLoading] = useState(true);

  async function scan() {
    setLoading(true);
    try { setLaunchers(await invoke<Launcher[]>("detect_launchers")); }
    finally { setLoading(false); }
  }

  useEffect(() => { void scan(); }, []);

  return (
    <main>
      <header><p className="eyebrow">MVP · INSTALADOR DE MODPACKS</p><h1>Tenso Installer</h1><p className="intro">Elige tu launcher. Nosotros preparamos el pack, sin almacenar mods ni administrar Minecraft.</p></header>
      <section className="pack" aria-label="Modpack seleccionado"><div><p className="eyebrow">MODPACK</p><h2>{pack.name}</h2></div><dl><div><dt>Juego</dt><dd>{pack.minecraft}</dd></div><div><dt>Loader</dt><dd>{pack.loader}</dd></div><div><dt>Servidor</dt><dd>{pack.server}</dd></div></dl></section>
      <section className="launchers">
        <div className="section-title"><div><p className="eyebrow">EN TU EQUIPO</p><h2>Launchers detectados</h2></div><button onClick={() => void scan()} disabled={loading}>{loading ? "Buscando…" : "Volver a buscar"}</button></div>
        <div className="grid">{launchers.map((launcher) => <article className={launcher.detected ? "launcher ready" : "launcher"} key={launcher.id}><span className="status">{launcher.detected ? "Detectado" : "No encontrado"}</span><h3>{launcher.name}</h3><p>{launcher.installMode}</p>{launcher.detected ? <button className="primary" disabled>Instalar pronto</button> : <button disabled>Instalar launcher</button>}</article>)}</div>
        <p className="note">Esta primera versión solo detecta aplicaciones: todavía no cambia archivos ni instala contenido.</p>
      </section>
    </main>
  );
}
