"use client";

import { useEffect } from "react";
import type { Attestation } from "@/lib/types";

const GRADO_FORM_URL =
  "https://registro.uniandes.edu.co/index.php/formulario-de-graduandos";

interface Props {
  attestations: Attestation[];
  attestationsMet: Set<string>;
  onToggle: (id: string) => void;
  onClose: () => void;
}

export default function GradoChecklist({
  attestations,
  attestationsMet,
  onToggle,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const done = attestations.filter((a) => attestationsMet.has(a.id)).length;

  return (
    <div className="grado-backdrop" onClick={onClose}>
      <div
        className="grado-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Checklist para grado"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="grado-close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
        <h2>Checklist para grado</h2>
        <p className="grado-sub">
          Requisitos que debes tener cumplidos, además de aprobar todos los
          créditos del plan. {done}/{attestations.length} marcados.
        </p>

        <ul className="grado-list">
          {attestations.map((a) => (
            <li key={a.id}>
              <label>
                <input
                  type="checkbox"
                  checked={attestationsMet.has(a.id)}
                  onChange={() => onToggle(a.id)}
                />
                <span>
                  <strong>{a.label}</strong>
                  {a.description ? (
                    <span className="grado-desc">{a.description}</span>
                  ) : null}
                </span>
              </label>
            </li>
          ))}
        </ul>

        <a
          className="grado-cta"
          href={GRADO_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ir al formulario de graduandos →
        </a>
        <p className="grado-note">
          El trámite y los requisitos oficiales de grado los define el Registro
          Académico. Esta lista es solo una ayuda de seguimiento.
        </p>
      </div>
    </div>
  );
}
