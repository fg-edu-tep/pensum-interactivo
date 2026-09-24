"use client";

import { useEffect, useRef, useState } from "react";
import type { Attestation } from "@/lib/types";

interface Props {
  mode: "explore" | "progress";
  onModeChange: (mode: "explore" | "progress") => void;
  creditsDone: number;
  creditsTotal: number;
  criticalPath: number;
  onShare: () => void;
  shareFeedback: string | null;
  searchOpen: boolean;
  onToggleSearch: () => void;
  filterActive: boolean;
  attestations: Attestation[];
  attestationsMet: Set<string>;
  onToggleAttestation: (id: string) => void;
  onReset: () => void;
  quickMode: boolean;
  stagedCount: number;
  onQuickToggle: () => void;
  onQuickFinish: () => void;
  onQuickCancel: () => void;
}

export default function SummaryBar({
  mode,
  onModeChange,
  creditsDone,
  creditsTotal,
  criticalPath,
  onShare,
  shareFeedback,
  searchOpen,
  onToggleSearch,
  filterActive,
  attestations,
  attestationsMet,
  onToggleAttestation,
  onReset,
  quickMode,
  stagedCount,
  onQuickToggle,
  onQuickFinish,
  onQuickCancel,
}: Props) {
  const [reqOpen, setReqOpen] = useState(false);
  const reqRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reqOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!reqRef.current?.contains(e.target as Node)) setReqOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [reqOpen]);

  const metCount = attestations.filter((a) => attestationsMet.has(a.id)).length;

  return (
    <div className="summary-bar">
      <button
        className={`icon-toggle${searchOpen ? " active" : ""}${
          filterActive ? " has-dot" : ""
        }`}
        onClick={onToggleSearch}
        aria-pressed={searchOpen}
        aria-label="Buscar y filtrar"
        title="Buscar y filtrar"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <div className="mode-toggle">
        <button
          className={mode === "explore" ? "active" : ""}
          onClick={() => onModeChange("explore")}
        >
          Explorar
        </button>
        <button
          className={mode === "progress" ? "active" : ""}
          onClick={() => onModeChange("progress")}
        >
          Mi avance
        </button>
      </div>

      {mode === "progress" && quickMode && (
        <div className="quick-select-bar">
          <span className="quick-select-hint">
            Marca los cursos que ya viste (aunque no dependan entre sí), luego
            confirma.
          </span>
          <button
            className="quick-finish"
            onClick={onQuickFinish}
            disabled={stagedCount === 0}
          >
            Terminar{stagedCount > 0 ? ` (${stagedCount})` : ""}
          </button>
          <button className="quick-cancel" onClick={onQuickCancel}>
            Cancelar
          </button>
        </div>
      )}

      {mode === "progress" && !quickMode && (
        <div className="summary-stats">
          <div className="stat">
            <span className="stat-value">
              {creditsDone} / {creditsTotal}
            </span>
            <span className="stat-label">créditos aprobados</span>
          </div>
          <div className="stat">
            <span className="stat-value">{criticalPath}</span>
            <span className="stat-label">semestres mínimos restantes</span>
          </div>

          {attestations.length > 0 && (
            <div className="req-menu" ref={reqRef}>
              <button
                className={`chip-button${metCount === attestations.length ? " done" : ""}`}
                onClick={() => setReqOpen((v) => !v)}
                aria-expanded={reqOpen}
              >
                Requisitos {metCount}/{attestations.length} ▾
              </button>
              {reqOpen && (
                <div className="req-menu-panel">
                  <p className="req-menu-title">Marca lo que ya cumpliste</p>
                  {attestations.map((a) => (
                    <label className="req-menu-item" key={a.id}>
                      <input
                        type="checkbox"
                        checked={attestationsMet.has(a.id)}
                        onChange={() => onToggleAttestation(a.id)}
                      />
                      <span>
                        {a.label}
                        {a.description ? (
                          <span className="req-menu-desc">{a.description}</span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <button className="quick-select-button" onClick={onQuickToggle}>
            Selección rápida
          </button>
          <button className="share-button" onClick={onShare}>
            {shareFeedback ?? "Copiar enlace de mi avance"}
          </button>
          <button className="reset-button" onClick={onReset}>
            Reiniciar avance
          </button>
        </div>
      )}
    </div>
  );
}
