"use client";

import { useCallback, useEffect, useState } from "react";
import type { ImportView } from "@/lib/registro/service";
import StepScope from "./StepScope";
import StepResolve from "./StepResolve";
import StepLink from "./StepLink";
import StepApply from "./StepApply";

export type StepId = "alcance" | "resolver" | "vincular" | "aplicar";

const STEPS: { id: StepId; label: string }[] = [
  { id: "alcance", label: "2 · Alcance" },
  { id: "resolver", label: "3 · Resolver" },
  { id: "vincular", label: "4 · Vincular" },
  { id: "aplicar", label: "5 · Aplicar" },
];

/** What the admin chose to apply; shared by the Vincular and Aplicar steps. */
export interface Selection {
  slugs: string[];
  setSlugs: (s: string[]) => void;
  force: boolean;
  setForce: (f: boolean) => void;
}

export interface StepProps {
  view: ImportView;
  /** re-fetch the wizard state (the plan is always computed with the current `force`) */
  reload: () => Promise<void>;
  go: (s: StepId) => void;
  id: number;
  sel: Selection;
}

export async function api<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  try {
    const res = await fetch(url, init);
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Error de red." } as T & { error?: string } };
  }
}

export default function RegistroWizard({ id }: { id: number }) {
  const [view, setView] = useState<ImportView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<StepId>("alcance");
  const [force, setForce] = useState(false);
  const [slugs, setSlugs] = useState<string[] | null>(null); // null until the first load → "all"

  const reload = useCallback(async () => {
    const r = await api<ImportView>(`/api/admin/registro/${id}${force ? "?force=1" : ""}`);
    if (!r.ok) {
      setError(r.data.error ?? "No se pudo cargar.");
      return;
    }
    setError(null);
    const v = r.data as ImportView;
    setView(v);
    setSlugs((cur) => cur ?? Object.keys(v.plan.perCatalog));
  }, [id, force]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (error) {
    return (
      <div className="admin-error" role="alert">
        {error}
      </div>
    );
  }
  if (!view || !slugs) return <p className="admin-note">Cargando…</p>;

  const sel: Selection = { slugs, setSlugs, force, setForce };
  const props: StepProps = { view, reload, go: setStep, id, sel };

  // finished runs (applied / discarded) only show the outcome
  if (view.status !== "parsed") {
    return (
      <>
        <h1>Registro · {view.filename}</h1>
        <StepApply {...props} />
      </>
    );
  }

  const pending = view.pending.length;

  return (
    <>
      <h1>Registro · {view.filename}</h1>
      <p className="admin-sub">
        Ventana: {view.window?.selectedRegular.slice().reverse().join(", ")} · {view.entries.length} cursos en el
        diccionario · {pending > 0 ? `${pending} decisión(es) pendiente(s)` : "sin decisiones pendientes"}
      </p>

      <ol className="wiz-steps" aria-label="Pasos del asistente">
        <li className="wiz-step done">1 · Subir</li>
        {STEPS.map((s) => (
          <li key={s.id} className={`wiz-step${step === s.id ? " current" : ""}`}>
            <button type="button" onClick={() => setStep(s.id)} aria-current={step === s.id ? "step" : undefined}>
              {s.label}
              {s.id === "resolver" && pending > 0 && <span className="wiz-count">{pending}</span>}
            </button>
          </li>
        ))}
      </ol>

      {step === "alcance" && <StepScope {...props} />}
      {step === "resolver" && <StepResolve {...props} />}
      {step === "vincular" && <StepLink {...props} />}
      {step === "aplicar" && <StepApply {...props} />}
    </>
  );
}
