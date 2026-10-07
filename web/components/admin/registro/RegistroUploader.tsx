"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegistroUploader() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/registro", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { id?: number; error?: string };
      if (res.ok && data.id) {
        router.push(`/administrador/registro/${data.id}`);
        return;
      }
      setError(data.error ?? "No se pudo procesar el archivo.");
    } catch {
      setError("Error de red.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-card" onSubmit={submit}>
      <h2>1 · Subir Excel_Registro.xlsx</h2>
      <p className="admin-note">
        El archivo completo pesa ~3 MB (≈117 000 filas); procesarlo toma unos 10 segundos. Solo se
        conservan los últimos 3 semestres regulares del departamento de Ingeniería Eléctrica y
        Electrónica y los cursos que estos referencian. Nada cambia hasta que confirmes al final.
      </p>
      <input
        className="admin-file"
        type="file"
        accept=".xlsx"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        aria-label="Archivo Excel_Registro.xlsx"
      />
      <button className="admin-btn primary" type="submit" disabled={!file || busy}>
        {busy ? "Procesando… (≈10 s)" : "Subir y procesar"}
      </button>
      {error && (
        <div className="admin-error" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
