"use client";

import { useMemo, useState } from "react";
import type { Resolution, UnresolvedItem } from "@/lib/registro/types";
import { api, type StepProps } from "./RegistroWizard";

const KIND_TITLE: Record<UnresolvedItem["kind"], string> = {
  "bound-missing": "Cursos del plan sin fila en el registro",
  "ref-missing": "Requisitos que apuntan a un código sin fila en el registro",
  "token-nocourse": "Marcadores de examen o equivalencia (no son cursos)",
  "name-drift": "El nombre del registro difiere del plan",
  "credits-drift": "Los créditos del registro difieren del plan",
  "placeholder-slot": "Casillas comodín (CBU, electivas…): no se tocan",
};
const KIND_HELP: Partial<Record<UnresolvedItem["kind"], string>> = {
  "bound-missing":
    "El plan usa este código pero el registro no lo tiene en la ventana (renombrado, retirado o aún no abierto). Déjalo como está o reasígnalo a su código actual.",
  "ref-missing":
    "Un curso del departamento lo pide como requisito, pero el registro no lo tiene en la ventana de semestres. Eso NO significa que esté retirado: puede simplemente no haberse dictado en esos 3 semestres (la API oficial a veces lo sigue listando — se avisa abajo). Lo más seguro es dejarlo como está; reemplazarlo solo si sabes que es equivalente; quitarlo hace el requisito más estricto.",
  "token-nocourse": "Se conservan literalmente, como en el registro.",
  "name-drift": "Por defecto se conserva el nombre del plan.",
  "credits-drift": "Por defecto se conservan los créditos del plan.",
};
const ACTION_LABEL: Record<Resolution["action"], string> = {
  keep: "Dejar como está",
  rebind: "Reasignar a otro código…",
  replace: "Reemplazar por…",
  drop: "Quitar de la expresión",
  accept: "Aceptar tal cual",
  "use-registro": "Usar el valor del registro",
};
const ORDER: UnresolvedItem["kind"][] = [
  "bound-missing", "ref-missing", "name-drift", "credits-drift", "token-nocourse", "placeholder-slot",
];
const NEEDS_CODE = new Set<Resolution["action"]>(["rebind", "replace"]);

type Draft = Record<string, Resolution | undefined>;

function describe(it: UnresolvedItem): string {
  const d = it.detail as Record<string, unknown>;
  switch (it.kind) {
    case "bound-missing":
      return `${d.displayCode} · ${d.name}`;
    case "ref-missing":
    case "token-nocourse":
      return `pedido por ${(d.coreReferencedBy as string[] | undefined)?.length ? (d.coreReferencedBy as string[]).join(", ") : (d.referencedBy as string[]).join(", ")}`;
    case "name-drift":
      return `registro: “${d.registro}” · plan: ${(d.catalog as string[]).map((n) => `“${n}”`).join(", ")}`;
    case "credits-drift":
      return `registro: ${d.registro} · plan: ${(d.catalog as number[]).join(", ")}`;
    case "placeholder-slot":
      return `${d.count} casilla(s): ${Object.entries(d.byKind as Record<string, number>).map(([k, n]) => `${k} ×${n}`).join(", ")}`;
  }
}

export default function StepResolve({ view, reload, go }: StepProps) {
  const [draft, setDraft] = useState<Draft>(view.resolutions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const grouped = useMemo(() => {
    const m = new Map<UnresolvedItem["kind"], UnresolvedItem[]>();
    for (const it of view.items) (m.get(it.kind) ?? m.set(it.kind, []).get(it.kind)!).push(it);
    return ORDER.filter((k) => m.has(k)).map((k) => [k, m.get(k)!] as const);
  }, [view.items]);

  const clean = (d: Draft) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) as Record<string, Resolution>;
  // MySQL re-orders JSON keys, so compare order-independently
  const canon = (r: Record<string, Resolution>) =>
    JSON.stringify(
      Object.keys(r)
        .sort()
        .map((k) => [k, Object.entries(r[k]).sort(([a], [b]) => (a < b ? -1 : 1))])
    );
  const dirty = canon(clean(draft)) !== canon(view.resolutions);
  const pendingNow = view.items.filter((i) => i.severity === "action" && !draft[i.key]).length;

  function setAction(it: UnresolvedItem, action: string) {
    setSaved(false);
    if (!action) return setDraft((d) => ({ ...d, [it.key]: undefined }));
    const a = action as Resolution["action"];
    setDraft((d) => ({
      ...d,
      [it.key]: (NEEDS_CODE.has(a) ? { action: a, code: "" } : { action: a }) as Resolution,
    }));
  }
  function setCode(it: UnresolvedItem, code: string) {
    setSaved(false);
    setDraft((d) => {
      const cur = d[it.key];
      return cur && NEEDS_CODE.has(cur.action) ? { ...d, [it.key]: { ...cur, code } as Resolution } : d;
    });
  }

  async function save(): Promise<boolean> {
    setBusy(true);
    setError(null);
    const r = await api(`/api/admin/registro/${view.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolutions: clean(draft) }),
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.data.error ?? "No se pudo guardar.");
      return false;
    }
    await reload();
    setSaved(true);
    return true;
  }

  return (
    <>
      <datalist id="registro-codes">
        {view.entries.map((e) => (
          <option key={e.code} value={e.code}>
            {e.name}
          </option>
        ))}
      </datalist>

      {dirty ? (
        <div className="diff-warnings" role="status">
          Tienes cambios sin guardar. Guarda para que cuenten (quedarían {pendingNow} decisión(es) obligatoria(s) sin
          tomar).
        </div>
      ) : view.pending.length > 0 ? (
        <div className="diff-warnings" role="status">
          Faltan <b>{view.pending.length}</b> decisión(es) marcadas con “requiere decisión”. Las demás tienen un valor
          por defecto seguro (dejar como está).
        </div>
      ) : (
        <div className="import-applied" role="status">
          Todas las decisiones obligatorias están tomadas.
        </div>
      )}

      {grouped.map(([kind, items]) => (
        <section key={kind} className="admin-card">
          <h2>
            {KIND_TITLE[kind]} <span className="admin-pair">({items.length})</span>
          </h2>
          {KIND_HELP[kind] && <p className="admin-note">{KIND_HELP[kind]}</p>}
          {items.map((it) => {
            const cur = draft[it.key];
            const needsDecision = it.severity === "action" && !cur;
            const effective = cur ?? ({ action: it.allowed[0] } as Resolution);
            const sugg = (it.detail.suggestions as { code: string; displayCode: string; name: string }[] | undefined) ?? [];
            return (
              <div key={it.key} className={`wiz-item${needsDecision ? " needs" : ""}`}>
                <div className="wiz-item-head">
                  <div>
                    {it.code && <code>{it.code}</code>}{" "}
                    {needsDecision && <span className="er-tag manual">requiere decisión</span>}
                    <div className="admin-pair">
                      {describe(it)} · en {it.catalogs.join(", ")}
                    </div>
                  </div>
                  {it.allowed.length > 1 ? (
                    <div className="wiz-item-ctl">
                      <select
                        className={`admin-select${cur ? "" : needsDecision ? " dirty" : ""}`}
                        aria-label={`Decisión para ${it.key}`}
                        value={cur?.action ?? ""}
                        onChange={(e) => setAction(it, e.target.value)}
                      >
                        <option value="">
                          {needsDecision ? "— elegir —" : `Por defecto: ${ACTION_LABEL[it.allowed[0]].toLowerCase()}`}
                        </option>
                        {it.allowed.map((a) => (
                          <option key={a} value={a}>
                            {ACTION_LABEL[a]}
                          </option>
                        ))}
                      </select>
                      {cur && NEEDS_CODE.has(cur.action) && (
                        <input
                          className="admin-input"
                          list="registro-codes"
                          placeholder="Código, p. ej. IELE1118"
                          aria-label={`Código destino para ${it.key}`}
                          value={(cur as { code: string }).code}
                          onChange={(e) => setCode(it, e.target.value)}
                        />
                      )}
                    </div>
                  ) : (
                    <span className="admin-pair">{ACTION_LABEL[effective.action]}</span>
                  )}
                </div>
                {it.kind === "ref-missing" && (view.apiMentions[it.key]?.length ?? 0) > 0 && (
                  <div className="disc-alert warn" role="status">
                    ⚠ La API oficial de este semestre <b>todavía lista <code>{it.code}</code></b> en los requisitos de{" "}
                    {view.apiMentions[it.key].join(", ")}. No está retirado: solo no tiene fila en la ventana del
                    registro. “Quitar” o “Reemplazar” haría que el documento difiera de lo que ven los estudiantes.
                  </div>
                )}
                {sugg.length > 0 && (
                  <div className="admin-pair">
                    Parecidos en el registro:{" "}
                    {sugg.map((s) => (
                      <button
                        key={s.code}
                        type="button"
                        className="wiz-chip"
                        onClick={() => {
                          setAction(it, "rebind");
                          setCode(it, s.code);
                        }}
                      >
                        {s.displayCode} · {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}

      <div className="import-actions">
        <button type="button" className="admin-btn primary" onClick={save} disabled={!dirty || busy}>
          {busy ? "Guardando…" : "Guardar decisiones"}
        </button>
        <button
          type="button"
          className="admin-btn"
          disabled={busy || dirty}
          onClick={() => go("vincular")}
          title={dirty ? "Guarda antes de continuar" : undefined}
        >
          Continuar → Vincular
        </button>
        {saved && !dirty && <span className="admin-saved">Guardado</span>}
        {dirty && <span className="admin-note">Hay cambios sin guardar.</span>}
      </div>
      {error && (
        <div className="admin-error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
