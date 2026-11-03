"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CatalogDiff,
  CourseDiff,
  EntityDiff,
  FieldChange,
  PlanesDiff,
} from "@/lib/import/diffPlanes";

function val(v: unknown): string {
  if (v == null || v === "") return "∅";
  if (Array.isArray(v)) return v.join(", ") || "∅";
  return String(v);
}

function ChangeTable({ changes, conflicts }: { changes: FieldChange[]; conflicts: string[] }) {
  return (
    <table className="review-table">
      <thead>
        <tr>
          <th>Campo</th>
          <th>Antes</th>
          <th>Después</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {changes.map((c) => (
          <tr key={c.field}>
            <td>{c.field}</td>
            <td className="diff-before">{val(c.before)}</td>
            <td className="diff-after">{val(c.after)}</td>
            <td>{conflicts.includes(c.field) && <span className="tag">🔒 bloqueado</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface Props {
  jobId: number;
  status: string;
  diff: PlanesDiff;
}

export default function ImportReview({ jobId, status, diff }: Props) {
  const router = useRouter();
  const [confirmRemovals, setConfirmRemovals] = useState(false);
  const [forceConflicts, setForceConflicts] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"apply" | "discard" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(status === "applied");

  const conflictRows = useMemo(() => {
    const out: { slug: string; programName: string; c: CourseDiff }[] = [];
    for (const cd of diff.catalogs) {
      for (const c of cd.courses) {
        if (c.conflictFields.length > 0 || (c.kind === "removed" && c.manuallyEdited)) {
          out.push({ slug: cd.slug, programName: cd.programName, c });
        }
      }
    }
    return out;
  }, [diff]);

  function toggle(key: string) {
    setExcluded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function run(kind: "apply" | "discard") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/admin/imports/${jobId}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "apply"
            ? { confirmRemovals, forceConflicts, excludeKeys: [...excluded] }
            : {}
        ),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Falló la operación.");
        return;
      }
      if (kind === "apply") setApplied(true);
      else router.push("/administrador/importar");
      router.refresh();
    } catch {
      setError("Error de red.");
    } finally {
      setBusy(null);
    }
  }

  if (applied) {
    return (
      <div className="import-applied">
        Import aplicado. Los cursos nuevos quedan como <b>por revisar</b> — usa
        “Re-sync” en Catálogos para traer la oferta.
      </div>
    );
  }
  if (status === "discarded") {
    return <div className="admin-note">Este import fue descartado.</div>;
  }

  return (
    <>
      {diff.warnings.length > 0 && (
        <div className="diff-warnings">
          {diff.warnings.length} advertencia(s):
          <ul>
            {diff.warnings.slice(0, 40).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="diff-counts">
        <span className="add">
          <b>{diff.counts.added}</b> nuevos
        </span>
        <span className="mod">
          <b>{diff.counts.modified}</b> modificados
        </span>
        <span className="del">
          <b>{diff.counts.removed}</b> eliminados
        </span>
        <span className="conf">
          <b>{diff.counts.conflicts}</b> conflictos
        </span>
      </div>

      {conflictRows.length > 0 && (
        <div className="review-conflicts">
          <h3>Requieren tu confirmación ({conflictRows.length})</h3>
          <p className="admin-note">
            Estas filas fueron editadas a mano o tienen campos bloqueados. No se
            aplican salvo que marques “sobrescribir”.
          </p>
          {conflictRows.map(({ slug, programName, c }) => {
            const key = `${slug}::${c.key}`;
            return (
              <div key={key} className="review-course">
                <label>
                  <input
                    type="checkbox"
                    checked={!excluded.has(key)}
                    onChange={() => toggle(key)}
                  />
                </label>
                <div className="review-course-body">
                  <b>{programName}</b> · <code>{c.code}</code> {c.name}{" "}
                  <span className="admin-note">
                    ({c.kind === "removed" ? "eliminación" : "modificación"})
                  </span>
                  {c.changes.length > 0 && (
                    <ChangeTable changes={c.changes} conflicts={c.conflictFields} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {diff.catalogs.map((cd) => (
        <CatalogSection
          key={cd.slug}
          cd={cd}
          excluded={excluded}
          toggle={toggle}
        />
      ))}

      <EntitySection title="Nodos de requisito" rows={diff.requirementNodes} />
      <EntitySection title="Requisitos de grado" rows={diff.gradRules} />

      {status !== "review-only" && <div className="import-actions">
        {diff.counts.removed > 0 && (
          <label>
            <input
              type="checkbox"
              checked={confirmRemovals}
              onChange={(e) => setConfirmRemovals(e.target.checked)}
            />
            Eliminar los {diff.counts.removed} curso(s) que ya no están en el Excel
          </label>
        )}
        {diff.counts.conflicts > 0 && (
          <label>
            <input
              type="checkbox"
              checked={forceConflicts}
              onChange={(e) => setForceConflicts(e.target.checked)}
            />
            Sobrescribir los {diff.counts.conflicts} campo(s) bloqueado(s) / editado(s) a mano
          </label>
        )}
        {excluded.size > 0 && (
          <span className="admin-note">{excluded.size} fila(s) excluida(s)</span>
        )}
        <button
          className="admin-btn primary"
          disabled={busy !== null}
          onClick={() => run("apply")}
        >
          {busy === "apply" ? "Aplicando…" : "Aplicar"}
        </button>
        <button
          className="admin-btn danger"
          disabled={busy !== null}
          onClick={() => run("discard")}
        >
          Descartar
        </button>
        {error && <span className="admin-error">{error}</span>}
      </div>}
    </>
  );
}

function CatalogSection({
  cd,
  excluded,
  toggle,
}: {
  cd: CatalogDiff;
  excluded: Set<string>;
  toggle: (key: string) => void;
}) {
  const added = cd.courses.filter((c) => c.kind === "added");
  const modified = cd.courses.filter((c) => c.kind === "modified");
  const removed = cd.courses.filter((c) => c.kind === "removed");
  const empty =
    !cd.isNew && !cd.metaChanges.length && !added.length && !modified.length && !removed.length;
  const [open, setOpen] = useState(!empty);

  return (
    <details
      className="review-cat"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        {cd.programName}
        {cd.isNew && <span className="admin-badge draft">NUEVO</span>}
        <span className="admin-note">
          {empty
            ? `sin cambios (${cd.unchangedCount} cursos)`
            : `${added.length} nuevos · ${modified.length} mod · ${removed.length} elim · ${cd.unchangedCount} sin cambios`}
        </span>
      </summary>
      {!empty && (
        <div className="review-body">
          {cd.metaChanges.length > 0 && (
            <>
              <h4>Identidad del plan</h4>
              <ChangeTable changes={cd.metaChanges} conflicts={[]} />
            </>
          )}

          {added.length > 0 && (
            <>
              <h4>Cursos nuevos ({added.length})</h4>
              {added.map((c) => {
                const key = `${cd.slug}::${c.key}`;
                return (
                  <div key={key} className="review-course">
                    <label>
                      <input
                        type="checkbox"
                        checked={!excluded.has(key)}
                        onChange={() => toggle(key)}
                      />
                    </label>
                    <div className="review-course-body">
                      <span className="diff-after">+ </span>
                      <code>{c.code}</code> {c.name}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {modified.length > 0 && (
            <>
              <h4>Cursos modificados ({modified.length})</h4>
              {modified.map((c) => {
                const key = `${cd.slug}::${c.key}`;
                return (
                  <div
                    key={key}
                    className={`review-course${excluded.has(key) ? " review-row-off" : ""}`}
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={!excluded.has(key)}
                        onChange={() => toggle(key)}
                      />
                    </label>
                    <div className="review-course-body">
                      <code>{c.code}</code> {c.name}
                      {c.manuallyEdited && (
                        <span className="diff-field"> · editado a mano</span>
                      )}
                      <ChangeTable changes={c.changes} conflicts={c.conflictFields} />
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {removed.length > 0 && (
            <>
              <h4>Cursos eliminados ({removed.length})</h4>
              {removed.map((c) => {
                const key = `${cd.slug}::${c.key}`;
                return (
                  <div key={key} className="review-course">
                    <label>
                      <input
                        type="checkbox"
                        checked={!excluded.has(key)}
                        onChange={() => toggle(key)}
                      />
                    </label>
                    <div className="review-course-body">
                      <span className="diff-before">− </span>
                      <code>{c.code}</code> {c.name}
                      {c.manuallyEdited && <span className="tag"> 🔒 editado a mano</span>}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </details>
  );
}

function EntitySection({ title, rows }: { title: string; rows: EntityDiff[] }) {
  if (!rows.length) return null;
  return (
    <details className="review-cat" open>
      <summary>{title}</summary>
      <div className="review-body">
        {rows.map((r) => (
          <div key={r.id} className="review-course">
            <div className="review-course-body">
              {r.kind === "added" ? (
                <span className="diff-after">+ </span>
              ) : r.kind === "removed" ? (
                <span className="diff-before">− </span>
              ) : null}
              <code>{r.id}</code> {r.label}
              {r.changes.length > 0 && (
                <ChangeTable changes={r.changes} conflicts={[]} />
              )}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
