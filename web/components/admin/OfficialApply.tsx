"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OfficialApply({ jobId, status, conflicts }: { jobId: number; status: string; conflicts: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removals, setRemovals] = useState(true);
  const [force, setForce] = useState(false);

  async function post(path: string, body?: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/official/${jobId}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const d = (await res.json()) as { error?: string };
      if (!res.ok) setError(d.error ?? "No se pudo completar.");
      router.refresh();
    } catch {
      setError("Error de red.");
    } finally {
      setBusy(false);
    }
  }

  if (status !== "parsed") return null;
  return (
    <div className="admin-card">
      <h2>Aplicar</h2>
      <label className="admin-check">
        <input type="checkbox" checked={removals} onChange={(e) => setRemovals(e.target.checked)} /> Quitar de los planes los cursos que el archivo ya no tiene
      </label>
      {conflicts > 0 && (
        <label className="admin-check">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Sobrescribir también los {conflicts} campo(s) que un admin fijó a mano
        </label>
      )}
      <p className="admin-note">Antes de escribir se guarda una copia de cada plan (se puede restaurar).</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="admin-btn primary" disabled={busy} onClick={() => post("apply", { confirmRemovals: removals, forceConflicts: force })}>
          {busy ? "Aplicando…" : "Aplicar la carga"}
        </button>
        <button className="admin-btn" disabled={busy} onClick={() => post("discard")}>
          Descartar
        </button>
      </div>
      {error && <div className="admin-error">{error}</div>}
    </div>
  );
}
