"use client";

import { useMemo, useState } from "react";
import { termLabel } from "@/lib/term";
import { api, type StepProps } from "./RegistroWizard";

export default function StepScope({ view, reload, go }: StepProps) {
  const win = view.window!;
  const [terms, setTerms] = useState<string[]>(win.selectedRegular);
  const [levels, setLevels] = useState<string[]>(view.scope.levels);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showOld, setShowOld] = useState(false);

  const dirty =
    [...terms].sort().join() !== [...win.selectedRegular].sort().join() ||
    [...levels].sort().join() !== [...view.scope.levels].sort().join();

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function recompute() {
    setBusy(true);
    setError(null);
    const r = await api(`/api/admin/registro/${view.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: { selectedRegularTerms: terms, levels } }),
    });
    if (!r.ok) setError(r.data.error ?? "No se pudo recalcular.");
    else await reload();
    setBusy(false);
  }

  const rows = useMemo(() => {
    const needle = q.trim().toUpperCase();
    return view.entries
      .filter((e) => !needle || e.code.includes(needle.replace(/[^A-Z0-9]/g, "")) || e.name.toUpperCase().includes(needle))
      .sort((a, b) => Number(b.isCore) - Number(a.isCore) || a.code.localeCompare(b.code));
  }, [view.entries, q]);

  const recent = win.availableRegular.slice(0, 8);
  const older = win.availableRegular.slice(8);
  const ps = view.parseStats;
  const rs = view.reduceStats;

  return (
    <>
      <div className="admin-card">
        <h2>Lo que se leyó</h2>
        <p className="admin-note" style={{ marginTop: 0 }}>
          {ps && (
            <>
              {ps.keptRows.toLocaleString("es-CO")} filas válidas de {ps.totalRows.toLocaleString("es-CO")}
              {ps.droppedBadPeriod > 0 && ` (${ps.droppedBadPeriod} fila(s) de pie de página ignorada(s))`}.{" "}
            </>
          )}
          {rs && (
            <>
              {rs.rowsInWindow.toLocaleString("es-CO")} caen dentro de la ventana → <b>{rs.coreCodes}</b> cursos del
              departamento + <b>{rs.closureCodes}</b> referenciados por ellos
              {rs.closureMisses > 0 && ` (${rs.closureMisses} referenciados sin fila en la ventana)`}.
            </>
          )}
        </p>
      </div>

      <div className="admin-card">
        <h2>Semestres regulares (ventana de 3 por defecto)</h2>
        <p className="admin-note">
          Se detectan en el propio archivo, solo con filas del departamento (un semestre futuro sin cursos del
          departamento no cuenta). Los períodos intermedios (intersemestral, sub-períodos) que caen dentro del rango
          se incluyen. Para cada curso manda el período más reciente de la ventana.
        </p>
        <fieldset className="wiz-fieldset">
          <legend className="admin-note">Semestres</legend>
          {recent.map((t) => (
            <label key={t} className="wiz-check">
              <input type="checkbox" checked={terms.includes(t)} onChange={() => setTerms(toggle(terms, t))} />
              {termLabel(t)} <code>{t}</code>
            </label>
          ))}
          {older.length > 0 && (
            <button type="button" className="admin-btn" onClick={() => setShowOld((v) => !v)}>
              {showOld ? "Ocultar anteriores" : `Ver ${older.length} anteriores`}
            </button>
          )}
          {showOld &&
            older.map((t) => (
              <label key={t} className="wiz-check">
                <input type="checkbox" checked={terms.includes(t)} onChange={() => setTerms(toggle(terms, t))} />
                {termLabel(t)} <code>{t}</code>
              </label>
            ))}
        </fieldset>
        <fieldset className="wiz-fieldset">
          <legend className="admin-note">Nivel</legend>
          {[
            ["PREG", "Pregrado"],
            ["POST", "Posgrado"],
          ].map(([v, label]) => (
            <label key={v} className="wiz-check">
              <input type="checkbox" checked={levels.includes(v)} onChange={() => setLevels(toggle(levels, v))} />
              {label}
            </label>
          ))}
        </fieldset>
        <p className="admin-note">
          Departamento: <code>INGEN. ELECTRICA Y ELECTRONICA</code> (y el histórico <code>INGENIERIA ELECTRONICA</code>).
          Ing. Eléctrica y Electrónica comparten departamento y prefijo <code>IELE</code>; el archivo no las distingue.
        </p>
        <div className="admin-section-actions">
          <button
            type="button"
            className="admin-btn"
            onClick={recompute}
            disabled={!dirty || busy || terms.length === 0 || levels.length === 0 || !view.canRescope}
          >
            {busy ? "Recalculando… (≈10 s)" : "Recalcular"}
          </button>
          {dirty && !busy && <span className="admin-note">Cambios sin aplicar al diccionario.</span>}
          {!view.canRescope && <span className="admin-note">El archivo original ya no está disponible.</span>}
        </div>
        {error && (
          <div className="admin-error" role="alert">
            {error}
          </div>
        )}
      </div>

      <div className="admin-card">
        <h2>Diccionario ({view.entries.length})</h2>
        <input
          className="admin-input"
          style={{ maxWidth: 320, marginBottom: 10 }}
          placeholder="Buscar por código o nombre"
          aria-label="Buscar en el diccionario"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="wiz-scroll">
          <table className="review-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Cr.</th>
                <th>Período</th>
                <th>Prerrequisitos</th>
                <th>Correquisitos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.code} className={e.isCore ? "" : "review-row-off"}>
                  <td>
                    <code>{e.displayCode}</code>
                    {!e.isCore && <div className="admin-pair">referenciado</div>}
                  </td>
                  <td>{e.name}</td>
                  <td>{e.credits ?? "—"}</td>
                  <td>{e.period}</td>
                  <td>{e.prereqText || "—"}</td>
                  <td>{e.coreqText || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="import-actions">
        <button type="button" className="admin-btn primary" onClick={() => go("resolver")} disabled={dirty}>
          Continuar → Resolver
        </button>
        {dirty && <span className="admin-note">Recalcula antes de continuar.</span>}
      </div>
    </>
  );
}
