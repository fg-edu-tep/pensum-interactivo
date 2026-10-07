"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) {
      setMsg({ ok: false, text: "Las contraseñas nuevas no coinciden." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "No se pudo cambiar." });
        return;
      }
      setMsg({ ok: true, text: "Contraseña actualizada." });
      setCurrent("");
      setNext("");
      setConfirm("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-section" onSubmit={onSubmit} style={{ maxWidth: 460 }}>
      <h2>Cambiar contraseña</h2>
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label>Contraseña actual</label>
          <input
            className="admin-input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div>
          <label>Nueva contraseña</label>
          <input
            className="admin-input"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div>
          <label>Confirmar nueva contraseña</label>
          <input
            className="admin-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
      </div>
      <div className="admin-section-actions">
        <button
          className="admin-btn primary"
          disabled={busy || !current || !next}
        >
          {busy ? "Guardando…" : "Cambiar contraseña"}
        </button>
        {msg && (
          <span className={msg.ok ? "admin-saved" : "admin-error"}>{msg.text}</span>
        )}
      </div>
    </form>
  );
}
