// One presentational alert used by every surface that talks about a
// document-vs-API discrepancy (course editor, Discrepancias page, wizard) so the
// wording never diverges. No hooks / no browser APIs: safe in server and client
// components, and the date is a fixed ISO slice so SSR and hydration agree.

import {
  CAUSE_LABEL,
  STATUS_LABEL,
  headlineFor,
  type FieldReport,
} from "@/lib/discrepancy/report";

export type FieldAlertData = Omit<FieldReport, "visible">;

const expr = (s: string) => (s.trim() ? s : "— (ninguno)");
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
export default function DiscrepancyAlert({
  field,
  compact = false,
}: {
  field: FieldAlertData;
  /** compact = one line (used for "match"/"unverified" where detail adds noise) */
  compact?: boolean;
}) {
  const f = field;
  const detailed = !compact && (f.status === "differs" || f.status === "doc-hidden" || f.status === "api-only" || f.status === "soft-only");
  return (
    <div className={`disc-alert ${f.severity}`} role={f.severity === "warn" ? "alert" : "status"} data-status={f.status}>
      <div className="disc-head">
        <span aria-hidden="true">{f.severity === "warn" ? "⚠" : f.severity === "ok" ? "✓" : "ℹ"}</span>{" "}
        <strong>{STATUS_LABEL[f.status]}.</strong> {headlineFor(f)}
      </div>
      {detailed && (
        <dl className="disc-detail">
          <dt>Oficial (API){day(f.apiSyncedAt) ? `, sincronizado ${day(f.apiSyncedAt)}` : ""} — lo que ven los estudiantes</dt>
          <dd>
            <code>{expr(f.governor === "api" ? f.apiText : f.visibleText)}</code>
          </dd>
          <dt>Documento (respaldo: seed, Registro o edición manual)</dt>
          <dd>
            <code>{expr(f.documentText)}</code>
          </dd>
          {(f.onlyInApi.length > 0 || f.onlyInDocument.length > 0) && (
            <>
              <dt>Diferencia</dt>
              <dd>
                {f.onlyInApi.length > 0 && (
                  <span>
                    solo en la API: <code>{f.onlyInApi.join(", ")}</code>{" "}
                  </span>
                )}
                {f.onlyInDocument.length > 0 && (
                  <span>
                    solo en el documento: <code>{f.onlyInDocument.join(", ")}</code>
                  </span>
                )}
              </dd>
            </>
          )}
          <dt>Origen del valor del documento</dt>
          <dd>{CAUSE_LABEL[f.cause]}</dd>
        </dl>
      )}
    </div>
  );
}
