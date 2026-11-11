export interface Env { DB: D1Database; REPORT_SALT: string }

type Report = {
  id: string; appVersion: string; packId: string; launcherId: string;
  accountMode: "microsoft" | "offline"; nickname?: string;
  operatingSystem: string; cpu: string; cpuCores: number; totalMemoryMb: number;
  availableMemoryMb: number; diskFreeGb: number; outcome: "installed" | "failed";
};

const keys = ["id", "appVersion", "packId", "launcherId", "accountMode", "nickname", "operatingSystem", "cpu", "cpuCores", "totalMemoryMb", "availableMemoryMb", "diskFreeGb", "outcome"];
const text = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max;
const number = (value: unknown, max: number) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;

function valid(value: unknown): value is Report {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !keys.includes(key))) return false;
  return text(body.id, 64) && text(body.appVersion, 40) && text(body.packId, 64) && text(body.launcherId, 32)
    && (body.accountMode === "microsoft" || body.accountMode === "offline")
    && (body.nickname === undefined || text(body.nickname, 24))
    && text(body.operatingSystem, 120) && text(body.cpu, 180)
    && number(body.cpuCores, 256) && number(body.totalMemoryMb, 4_194_304)
    && number(body.availableMemoryMb, 4_194_304) && number(body.diskFreeGb, 1_000_000)
    && (body.outcome === "installed" || body.outcome === "failed");
}

async function sourceHash(request: Request, salt: string): Promise<string> {
  const input = new TextEncoder().encode(`${request.headers.get("CF-Connecting-IP") ?? "unknown"}:${salt}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/v1/reports") return new Response("Not found", { status: 404 });
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return new Response("Expected JSON", { status: 415 });
    let report: unknown;
    try { report = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
    if (!valid(report)) return new Response("Invalid report", { status: 422 });
    const payload = report as Report;
    const source = await sourceHash(request, env.REPORT_SALT);
    const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM reports WHERE source_hash = ? AND submitted_at > datetime('now', '-1 day')").bind(source).first<{ count: number }>();
    if ((recent?.count ?? 0) >= 10) return new Response("Too many reports", { status: 429 });
    await env.DB.prepare("INSERT OR IGNORE INTO reports (id, submitted_at, app_version, pack_id, launcher_id, account_mode, nickname, operating_system, cpu, cpu_cores, total_memory_mb, available_memory_mb, disk_free_gb, outcome, source_hash) VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(payload.id, payload.appVersion, payload.packId, payload.launcherId, payload.accountMode, payload.nickname ?? null, payload.operatingSystem, payload.cpu, payload.cpuCores, payload.totalMemoryMb, payload.availableMemoryMb, payload.diskFreeGb, payload.outcome, source).run();
    return Response.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  },
};
