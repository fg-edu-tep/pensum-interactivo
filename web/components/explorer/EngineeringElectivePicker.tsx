"use client";

// "Electiva en Fundamentos de Ingeniería": not a fixed bag — any engineering
// course counts, i.e. any code whose subject starts with I (IELE, IMEC, IBIO,
// ISIS, IIND, ICYA, IQUI, …). The student types a code; /api/courses/lookup
// fills in name and credits from the live offering, or from what the database
// knows when the offering doesn't list it.

import { useState } from "react";
import type { ElectiveAssignment } from "@/lib/types";
import { termLabel } from "@/lib/term";
import { isEngineeringCode } from "@/lib/engineeringCode";
import { normalizeCode } from "@/lib/import/normalizeCode";

const OFERTA_CURSOS_URL = "https://ofertadecursos.uniandes.edu.co/";
const EXAMPLES = ["IELE", "IMEC", "IBIO", "ISIS", "IIND", "ICYA", "IQUI"];

interface LookupResult {
  code: string;
  title: string;
  credits: number | null;
  sectionCount: number;
  offered: boolean | null;
  source: "api" | "database" | "registro";
}

interface Props {
  term: string;
  mode: "explore" | "progress";
  assignment?: ElectiveAssignment;
  slotCredits: number;
  onAssign: (a: ElectiveAssignment | null) => void;
}

export default function EngineeringElectivePicker({ term, mode, assignment, slotCredits, onAssign }: Props) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<LookupResult | null>(null);
  const tShort = termLabel(term);
  const canPick = mode === "progress";
  const code = normalizeCode(raw);
  const valid = isEngineeringCode(raw);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setFound(null);
    setError(null);
    if (!valid) {
      setError("Debe ser un código de Ingeniería: cuatro letras que empiezan por I y cuatro números (p. ej. IMEC 1310).");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/courses/lookup?code=${encodeURIComponent(code)}&term=${encodeURIComponent(term)}`);
      if (res.ok) setFound((await res.json()) as LookupResult);
      else if (res.status === 404) setError("No encontramos ese código. Revísalo en la oferta de cursos.");
      else setError("No se pudo consultar el código ahora.");
    } catch {
      setError("No se pudo consultar el código ahora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="elective-picker">
      <h3>Cursos válidos · Fundamentos de Ingeniería</h3>
      <p className="elective-hint">
        Sirve <strong>cualquier curso de Ingeniería</strong>: todos los códigos que empiezan por <strong>I</strong> (
        {EXAMPLES.join(", ")}…).
      </p>

      {canPick && assignment && (
        <div className="elective-assigned">
          <div className="elective-assigned-main">
            <strong>Elegida:</strong> {assignment.title}
          </div>
          <div className="elective-assigned-meta">
            {assignment.code ? `${assignment.code} · ` : ""}
            {assignment.credits ?? slotCredits} créditos
            {assignment.sectionCount ? ` · ${assignment.sectionCount} secc.` : ""}
          </div>
          <button type="button" className="elective-remove" onClick={() => onAssign(null)}>
            Quitar
          </button>
        </div>
      )}

      {canPick ? (
        <form className="efi-form" onSubmit={lookup}>
          <label className="efi-label" htmlFor="efi-code">
            Código del curso
          </label>
          <div className="efi-row">
            <input
              id="efi-code"
              type="text"
              className="elective-search"
              placeholder="p. ej. IMEC 1310"
              value={raw}
              autoComplete="off"
              aria-invalid={raw.trim() !== "" && !valid}
              onChange={(e) => {
                setRaw(e.target.value);
                setFound(null);
                setError(null);
              }}
            />
            <button type="submit" className="elective-pick" disabled={busy || raw.trim() === ""}>
              {busy ? "Buscando…" : "Buscar"}
            </button>
          </div>
        </form>
      ) : (
        <p className="elective-hint">
          En <strong>Mi avance</strong> puedes escribir aquí el código del curso que cursarás en este espacio.
        </p>
      )}

      {error && <p className="elective-resolve-error">{error}</p>}

      {found && (
        <div className="elective-row">
          <div className="elective-row-head">
            <span className="elective-name">{found.title || found.code}</span>
            {found.offered && <span className="chip ptrm">{tShort}</span>}
          </div>
          <div className="elective-live">
            <span className="elective-live-code">{found.code}</span>
            {found.credits != null && <span>{found.credits} cr</span>}
            <span>
              {found.source === "api"
                ? `${found.sectionCount} secc. en ${tShort}`
                : found.offered === false
                  ? `No aparece en la oferta de ${tShort}`
                  : "Oferta en línea no disponible"}
            </span>
          </div>
          <div className="elective-row-actions">
            <button
              type="button"
              className="elective-pick"
              onClick={() =>
                onAssign({
                  code: found.code,
                  title: found.title || found.code,
                  credits: found.credits ?? slotCredits,
                  sectionCount: found.sectionCount || undefined,
                })
              }
            >
              Elegir para este espacio
            </button>
          </div>
        </div>
      )}

      <a className="mihorario-link" href={OFERTA_CURSOS_URL} target="_blank" rel="noopener noreferrer">
        Explorar la oferta de cursos de Ingeniería →
      </a>
    </section>
  );
}
