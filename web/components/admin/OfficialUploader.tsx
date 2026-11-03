"use client";

// Official load (lib/import/official): the three department files + the period
// this load opens for planning ("¿Esta carga es para planeación de 2026-2 o
// 2027-1?", agreed 2026-10-29). Uploading only computes the report and the plan
// diff; nothing is applied until the admin confirms.

import { useState } from "react";
import { useRouter } from "next/navigation";

const FILES = [
  { key: "planes", label: "PLANES", hint: "estructura de los planes (una columna por plan)" },
  { key: "bolsas", label: "BOLSAS", hint: "bolsa de electivas: atributos por programa + PROXIMO" },
  { key: "requisitos", label: "PRERREQUISITOS", hint: "exportación de requisitos de Registro (varios periodos)" },
] as const;

export default function OfficialUploader({ current, next }: { current: { code: string; label: string }; next: { code: string; label: string } }) {
  const router = useRouter();
  const [files, setFiles] = useState<Record<string, File | null>>({ planes: null, bolsas: null, requisitos: null });
  const [term, setTerm] = useState(next.code);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // a file named PLANES_202710.xlsx in the "requisitos" box is easy to do — guess by name
  function onPick(list: FileList | null) {
    if (!list) return;
    const next = { ...files };
    for (const f of Array.from(list)) {
      const n = f.name.toUpperCase();
      if (n.includes("PLANES")) next.planes = f;
      else if (n.includes("BOLSA")) next.bolsas = f;
      else if (n.includes("PRERREQ") || n.includes("REQUISIT") || n.includes("REGISTRO")) next.requisitos = f;
    }
    setFiles(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const f of FILES) fd.append(f.key, files[f.key]!);
      fd.append("planningTerm", term);
      const res = await fetch("/api/admin/official", { method: "POST", body: fd });
      const data = (await res.json()) as { jobId?: number; error?: string };
      if (res.ok && data.jobId) {
        router.push(`/administrador/carga/${data.jobId}`);
        router.refresh();
        return;
      }
      setError(data.error ?? "No se pudieron procesar los archivos.");
    } catch {
      setError("Error de red.");
    } finally {
      setBusy(false);
    }
  }

  const ready = FILES.every((f) => files[f.key]);
  return (
    <form className="admin-card" onSubmit={submit}>
      <h2>Nueva carga</h2>
      <fieldset className="official-term">
        <legend>¿Esta carga es para la planeación de qué periodo?</legend>
        {[current, next].map((t) => (
          <label key={t.code}>
            <input type="radio" name="planningTerm" value={t.code} checked={term === t.code} onChange={() => setTerm(t.code)} />
            {t.label} {t.code === current.code ? "(el semestre en curso)" : "(el próximo semestre)"}
          </label>
        ))}
        <p className="admin-note" style={{ margin: "4px 0 0" }}>
          Al aplicar, los estudiantes planean ese periodo. El archivo no se vuelve a tocar hasta la próxima carga.
        </p>
      </fieldset>
      <label className="official-drop">
        Arrastra o elige los tres archivos (se reconocen por el nombre)
        <input type="file" accept=".xlsx" multiple onChange={(e) => onPick(e.target.files)} />
      </label>
      <ul className="official-files">
        {FILES.map((f) => (
          <li key={f.key} className={files[f.key] ? "ok" : undefined}>
            <strong>{f.label}</strong> <span>{f.hint}</span>
            <label className="admin-btn">
              {files[f.key] ? files[f.key]!.name : "Elegir…"}
              <input
                type="file"
                accept=".xlsx"
                hidden
                onChange={(e) => setFiles({ ...files, [f.key]: e.target.files?.[0] ?? null })}
              />
            </label>
          </li>
        ))}
      </ul>
      <button className="admin-btn primary" type="submit" disabled={!ready || busy}>
        {busy ? "Leyendo los archivos…" : "Revisar la carga"}
      </button>
      {error && <div className="admin-error">{error}</div>}
    </form>
  );
}
