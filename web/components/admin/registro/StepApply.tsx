"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type StepProps } from "./RegistroWizard";
import { impactCounts } from "./StepLink";

interface ApplyView {
  perCatalog: { slug: string; changed: number; skipped: number; snapshotId: number | null }[];
  fieldsChanged: Record<string, number>;
  rebinds: number;
  lockedPinned: number;
  undoRows: number;
  undoneAt?: string;
}

const FIELD_NAMES: Record<string, string> = {
  prereqText: "prerrequisitos",
  coreqText: "correquisitos",
  name: "nombres",
  credits: "créditos",
  binding: "reasignaciones de código",
};

export default function StepApply(props: StepProps) {
  const { view } = props;
  if (view.status === "parsed") return <ApplyStep {...props} />;
  return <ResultStep {...props} />;
}

// --------------------------------------------------------------------- before apply

function ApplyStep({ view, reload, go, sel }: StepProps) {
  const router = useRouter();
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = view.plan.courses.filter((c) => sel.slugs.includes(c.slug));
  const impact = impactCounts(view, sel.slugs);
  const changed = mine.filter((c) => c.changes.length);
  const skipped = mine.filter((c) => c.skipped);
  const blocked = view.pending.length > 0;
  const nothing = changed.length === 0;

  async function apply() {
    setBusy(true);
    setError(null);
    const r = await api(`/api/admin/registro/${view.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: sel.slugs, force: sel.force }),
    });
    if (!r.ok) {
      setBusy(false);
      setError(r.data.error ?? "No se pudo aplicar.");
      return;
    }
    await reload();
    setBusy(false);
  }

  async function discard() {
    if (!window.confirm("¿Descartar esta ejecución? Se borra el archivo y el diccionario; los planes no cambian.")) return;
    setBusy(true);
    const r = await api(`/api/admin/registro/${view.id}`, { method: "DELETE" });
    if (!r.ok) {
      setBusy(false);
      setError(r.data.error ?? "No se pudo descartar.");
      return;
    }
    router.push("/administrador/registro");
    router.refresh();
  }

  return (
    <>
      <div className="admin-card">
        <h2>Resumen</h2>
        <ul className="wiz-summary">
          <li>
            <b>{changed.length}</b> curso(s) cambian en <b>{sel.slugs.length}</b> catálogo(s):{" "}
            {sel.slugs.map((s) => (
              <code key={s} style={{ marginRight: 6 }}>
                {s}
              </code>
            ))}
          </li>
          <li>
            <b>{skipped.length}</b> protegido(s) {sel.force ? "(forzar activado: se pisan)" : "(no se tocan)"}
          </li>
          <li>
            Se guarda una copia (<code>pre-registro</code>) de cada catálogo que cambie, y el estado exacto de cada fila
            para poder <b>deshacer</b>.
          </li>
          {(impact.visible + impact.agree + impact.differ) > 0 && (
            <li>
              Visibilidad para estudiantes: <b>{impact.visible}</b> cambio(s) de requisitos se verán (sin datos de la
              API), <b>{impact.agree}</b> coinciden con la API oficial
              {impact.differ > 0 ? (
                <>
                  , y <b style={{ color: "#b45309" }}>{impact.differ}</b> difieren de la API y <b>no</b> se verán — quedarán
                  como una discrepancia en <Link href="/administrador/discrepancias">Discrepancias</Link>
                </>
              ) : (
                "."
              )}
            </li>
          )}
          <li>Las ediciones que fijaste (reemplazar / quitar / reasignar) quedan 🔒 protegidas de futuras importaciones.</li>
        </ul>
        {blocked && (
          <div className="admin-error" role="alert">
            Faltan {view.pending.length} decisión(es) obligatorias.{" "}
            <button type="button" className="admin-btn" onClick={() => go("resolver")}>
              Ir a Resolver
            </button>
          </div>
        )}
        {!blocked && nothing && (
          <p className="admin-note" role="status">
            No hay nada que escribir: los planes seleccionados ya coinciden con el registro.
          </p>
        )}
        <label className="wiz-check">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={blocked || nothing} />
          Entiendo que esto modifica los planes seleccionados.
        </label>
        <div className="admin-section-actions">
          <button type="button" className="admin-btn primary" onClick={apply} disabled={!ack || blocked || nothing || busy}>
            {busy ? "Aplicando…" : "Aplicar"}
          </button>
          <button type="button" className="admin-btn" onClick={() => go("vincular")} disabled={busy}>
            ← Vincular
          </button>
          <button type="button" className="admin-btn danger" onClick={discard} disabled={busy}>
            Descartar ejecución
          </button>
        </div>
        {error && (
          <div className="admin-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </>
  );
}

// --------------------------------------------------------------------- after apply

function ResultStep({ view, reload }: StepProps) {
  const r = view.applyResult as ApplyView | null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<{ id: number; slug: string; displayCode: string }[]>([]);
  const [force, setForce] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (view.status === "discarded") {
    return <p className="admin-note">Esta ejecución fue descartada. No cambió ningún plan.</p>;
  }

  async function undo() {
    if (!window.confirm("¿Deshacer? Cada curso vuelve exactamente a como estaba antes de aplicar.")) return;
    setBusy(true);
    setError(null);
    setConflicts([]);
    const res = await api<{ restored?: number; conflicts?: typeof conflicts }>(`/api/admin/registro/${view.id}/undo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.data.error ?? "No se pudo deshacer.");
      setConflicts(res.data.conflicts ?? []);
      return;
    }
    setDone(`Se restauraron ${res.data.restored} curso(s).`);
    await reload();
  }

  const undone = !!r?.undoneAt;
  return (
    <>
      <div className={undone ? "admin-card" : "import-applied"} role="status">
        {undone
          ? `Esta ejecución fue deshecha el ${new Date(r!.undoneAt!).toLocaleString("es-CO")}. Los planes volvieron a su estado anterior.`
          : `Aplicada el ${view.appliedAt ? new Date(view.appliedAt).toLocaleString("es-CO") : ""}`}
        {done && <div>{done}</div>}
      </div>

      {r && (
        <div className="admin-card">
          <h2>Resultado</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Catálogo</th>
                <th>Cursos cambiados</th>
                <th>Protegidos</th>
                <th>Copia</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {r.perCatalog.map((c) => (
                <tr key={c.slug}>
                  <td>
                    <code>{c.slug}</code>
                  </td>
                  <td>{c.changed}</td>
                  <td>{c.skipped}</td>
                  <td>{c.snapshotId ? `#${c.snapshotId}` : "—"}</td>
                  <td>
                    <Link className="admin-btn" href={`/administrador/catalogos/${c.slug}`}>
                      Editar
                    </Link>{" "}
                    <a className="admin-btn" href={`/p/${c.slug}`} target="_blank" rel="noreferrer">
                      Ver ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="admin-note">
            Campos escritos:{" "}
            {Object.entries(r.fieldsChanged)
              .map(([k, n]) => `${n} ${FIELD_NAMES[k] ?? k}`)
              .join(" · ") || "ninguno"}
            {r.lockedPinned > 0 && ` · ${r.lockedPinned} campo(s) fijado(s) 🔒`}.
          </p>
          <p className="admin-note">
            Nota: la vista de estudiante prefiere los requisitos en vivo de la API de oferta de cursos cuando existen;
            lo escrito aquí es la fuente de respaldo (cursos sin oferta este semestre o sin datos de la API).
          </p>
        </div>
      )}

      {view.status === "applied" && !undone && r && r.undoRows > 0 && (
        <div className="admin-card">
          <h2>Deshacer</h2>
          <p className="admin-note">
            Restaura exactamente los {r.undoRows} curso(s) modificados. Si alguno se editó después de aplicar, no se
            deshace nada y se te avisa.
          </p>
          <label className="wiz-check">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            Forzar: restaurar aunque se hayan editado después
          </label>
          <div className="admin-section-actions">
            <button type="button" className="admin-btn danger" onClick={undo} disabled={busy}>
              {busy ? "Deshaciendo…" : "Deshacer esta importación"}
            </button>
          </div>
          {error && (
            <div className="admin-error" role="alert">
              {error}
              {conflicts.length > 0 && (
                <ul>
                  {conflicts.map((c) => (
                    <li key={c.id}>
                      <code>{c.slug}</code> · {c.displayCode}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
