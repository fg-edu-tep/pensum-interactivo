"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SuperUnlock() {
  const router = useRouter();
  const [mnemonic, setMnemonic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/super/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mnemonic }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "No se pudo desbloquear.");
    } catch {
      setError("Error de red.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-section" onSubmit={onSubmit} style={{ maxWidth: 560 }}>
      <h2>Desbloquear</h2>
      <p className="admin-note">
        Escribe las 12 palabras separadas por espacios.
      </p>
      <textarea
        className="admin-input"
        rows={3}
        value={mnemonic}
        onChange={(e) => setMnemonic(e.target.value)}
        placeholder="palabra1 palabra2 … palabra12"
        autoFocus
        style={{ fontFamily: "ui-monospace, monospace" }}
      />
      <div className="admin-section-actions">
        <button className="admin-btn primary" disabled={busy || !mnemonic.trim()}>
          {busy ? "Verificando…" : "Desbloquear super-panel"}
        </button>
        {error && <span className="admin-error">{error}</span>}
      </div>
    </form>
  );
}
