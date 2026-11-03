"use client";

import { useEffect, useState } from "react";

interface TokenRow {
  id: number;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "—");

function stateOf(t: TokenRow): { label: string; cls: string } {
  if (t.revokedAt) return { label: "revocado", cls: "archived" };
  if (t.expiresAt && new Date(t.expiresAt).getTime() <= Date.now()) return { label: "vencido", cls: "archived" };
  return { label: "activo", cls: "published" };
}

/** Personal access tokens for the MCP endpoint (lib/auth/apiTokens.ts). */
export default function ApiTokens() {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState("");
  const [days, setDays] = useState("90");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [created, setCreated] = useState<{ name: string; secret: string } | null>(null);
  const [origin, setOrigin] = useState("");

  async function load() {
    const res = await fetch("/api/admin/account/tokens");
    const d = (await res.json().catch(() => ({}))) as { tokens?: TokenRow[]; error?: string };
    if (res.ok) setTokens(d.tokens ?? []);
    else setMsg({ ok: false, text: d.error ?? "No se pudieron cargar los tokens." });
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/account/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, expiresInDays: days || null }),
      });
      const d = (await res.json().catch(() => ({}))) as { secret?: string; error?: string };
      if (!res.ok || !d.secret) {
        setMsg({ ok: false, text: d.error ?? "No se pudo crear el token." });
        return;
      }
      setCreated({ name, secret: d.secret });
      setName("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(t: TokenRow) {
    if (!confirm(`¿Revocar «${t.name}»? Los clientes que lo usen dejarán de conectarse.`)) return;
    const res = await fetch(`/api/admin/account/tokens/${t.id}`, { method: "DELETE" });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    setMsg(res.ok ? { ok: true, text: "Token revocado." } : { ok: false, text: d.error ?? "No se pudo revocar." });
    await load();
  }

  const urlFor = (secret: string) => `${origin}/api/mcp/${secret}`;
  const headerConfig = (secret: string) =>
    JSON.stringify(
      { mcpServers: { pensum: { serverUrl: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${secret}` } } } },
      null,
      2
    );

  return (
    <section className="admin-section" style={{ maxWidth: 760 }}>
      <h2>Acceso para asistentes (MCP)</h2>
      <p className="admin-note">
        Un token permite que un asistente de IA (Claude, Antigravity…) consulte y cambie los prerrequisitos y
        correquisitos de los cursos en tu nombre. Solo eso: no puede tocar usuarios, cargas ni el super-panel. Cada
        cambio queda en la auditoría con tu usuario.
      </p>

      {created && (
        <div className="disc-alert warn" role="status" style={{ display: "grid", gap: 8 }}>
          <strong>Token «{created.name}» creado. Cópialo ahora: no se vuelve a mostrar.</strong>
          <label>
            Claude (web o escritorio) → Configuración → Conectores → Agregar conector personalizado, con esta URL:
          </label>
          <input className="admin-input" readOnly value={urlFor(created.secret)} onFocus={(e) => e.currentTarget.select()} />
          <label>Antigravity → Manage MCP Servers → View raw config (mcp_config.json):</label>
          <textarea className="admin-textarea" readOnly rows={11} value={headerConfig(created.secret)} onFocus={(e) => e.currentTarget.select()} />
          <label>Claude Code (terminal):</label>
          <input
            className="admin-input"
            readOnly
            value={`claude mcp add --transport http pensum ${origin}/api/mcp --header "Authorization: Bearer ${created.secret}"`}
            onFocus={(e) => e.currentTarget.select()}
          />
          <span className="admin-note">
            El token va dentro de la URL y de la configuración: trátalos como una contraseña. Si se filtran, revoca el
            token abajo. Instrucciones completas: docs/admin-mcp.md.
          </span>
          <div>
            <button type="button" className="admin-btn" onClick={() => setCreated(null)}>
              Ya lo guardé
            </button>
          </div>
        </div>
      )}

      <form onSubmit={create} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", margin: "12px 0" }}>
        <div>
          <label>Nombre</label>
          <input className="admin-input" placeholder="p. ej. Claude escritorio" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label>Vence en</label>
          <select className="admin-input" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="30">30 días</option>
            <option value="90">90 días</option>
            <option value="365">1 año</option>
            <option value="">Sin vencimiento</option>
          </select>
        </div>
        <button className="admin-btn primary" disabled={busy || !name.trim()}>
          {busy ? "Creando…" : "Crear token"}
        </button>
      </form>
      {msg && <p className={msg.ok ? "admin-saved" : "admin-error"}>{msg.text}</p>}

      {tokens && tokens.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Token</th>
              <th>Último uso</th>
              <th>Vence</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => {
              const st = stateOf(t);
              return (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>
                    <code>{t.prefix}…</code>
                  </td>
                  <td>{fmt(t.lastUsedAt)}</td>
                  <td>{t.expiresAt ? fmt(t.expiresAt) : "nunca"}</td>
                  <td>
                    <span className={`admin-badge ${st.cls}`}>{st.label}</span>
                  </td>
                  <td>
                    {st.label === "activo" && (
                      <button type="button" className="admin-btn danger" onClick={() => revoke(t)}>
                        Revocar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {tokens && tokens.length === 0 && <p className="admin-note">Aún no tienes tokens.</p>}
    </section>
  );
}
