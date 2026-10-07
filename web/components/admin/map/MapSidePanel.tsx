"use client";

// Side panel of the admin canvas: the selected course's requirements as a readable,
// keyboard-operable LIST editor (the canvas and the list edit the same model), what it
// gates, discrepancy alerts with the "students will / won't see this" statement, and
// move controls. Every change goes up through onEdit / onMove; validation is the parent's.

import Link from "next/link";
import { useMemo, useState } from "react";
import DiscrepancyAlert from "@/components/admin/DiscrepancyAlert";
import { parseRequirement } from "@/lib/import/requirementParser";
import type { FieldReport } from "@/lib/discrepancy/report";
import {
  ModelError, addAlternative, addRequirement, groupAsAlternatives, modelToText, removeAlt,
  setSoft, treeToModel, ungroup, type ReqModel,
} from "@/lib/mapEditor/model";
import { isTokenCode, parseCoreq, renderRegistroExpr } from "@/lib/registro/requirements";
import type { RequirementKind } from "@/lib/mapEditor/ops";
import type { Issue } from "@/lib/mapEditor/validate";
import s from "./map.module.css";

export interface PanelCourse {
  id: number;
  code: string | null;
  displayCode: string;
  name: string;
  credits: number;
  semester: number;
  row: number;
  rowsInSemester: number;
  lockedFields: string[];
  isPlaceholder: boolean;
  prereqUnparsed: boolean;
  coreqUnparsed: boolean;
  dirty: boolean;
}
type Alert = Omit<FieldReport, "visible">;

export interface PanelProps {
  course: PanelCourse;
  models: { prereq: ReqModel; coreq: ReqModel };
  planCodes: Map<string, string>; // code -> name
  dictionary: Map<string, string> | null; // code -> name, null = none
  alerts: { prereq: Alert; coreq: Alert } | null;
  requires: { code: string; name: string; kind: RequirementKind }[];
  gates: { code: string; name: string; kind: RequirementKind }[];
  issues: Issue[];
  slug: string;
  onEdit: (kind: RequirementKind, model: ReqModel) => void;
  onMove: (semester: number, position: number) => void;
  onMessage: (msg: string) => void;
}

const label = (code: string) => code.replace(/^([A-ZÑ]+)(\d)/, "$1 $2");
const KIND_TITLE: Record<RequirementKind, string> = { prereq: "Prerrequisitos", coreq: "Correquisitos" };

function ListEditor({
  kind, model, props,
}: { kind: RequirementKind; model: ReqModel; props: PanelProps }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [code, setCode] = useState("");
  const [altCode, setAltCode] = useState<Record<number, string>>({});
  const [text, setText] = useState<string | null>(null);
  const listId = `codes-${kind}`;

  const guard = (f: () => ReqModel) => {
    try {
      props.onEdit(kind, f());
      setChecked(new Set());
    } catch (e) {
      if (e instanceof ModelError) props.onMessage(e.message);
      else throw e;
    }
  };
  const nameOf = (c: string) => props.planCodes.get(c) ?? props.dictionary?.get(c) ?? "";
  const unparsed = kind === "prereq" ? props.course.prereqUnparsed : props.course.coreqUnparsed;
  const current = modelToText(model);

  const applyText = () => {
    const raw = text ?? "";
    const tree = kind === "prereq" ? parseRequirement(raw) : parseCoreq(raw);
    if (raw.trim() && !tree) return props.onMessage(`No se pudo interpretar "${raw}". Usa códigos como IELE 2100 con Y / O y paréntesis.`);
    props.onEdit(kind, treeToModel(tree));
    setText(null);
  };

  return (
    <section aria-label={KIND_TITLE[kind]} data-kind={kind}>
      <h3>{KIND_TITLE[kind]}</h3>
      {unparsed && (
        <div className={`${s.banner} ${s.err}`} role="alert">
          El texto guardado no se pudo interpretar y por eso aparece vacío. Reemplázalo desde «Editar como texto».
        </div>
      )}
      {model.groups.length === 0 && !unparsed && <p className={s.muted}>Sin {KIND_TITLE[kind].toLowerCase()}.</p>}
      {model.groups.map((g, gi) => (
        <div key={gi}>
          {gi > 0 && <div className={s.and}>Y</div>}
          <div className={`${s.grp} ${checked.has(gi) ? s.picked : ""}`} data-group={gi}>
            <div className={s.grpHead}>
              {model.groups.length > 1 && (
                <label className={s.check}>
                  <input
                    type="checkbox"
                    checked={checked.has(gi)}
                    aria-label={`Seleccionar grupo ${gi + 1} para agrupar`}
                    onChange={(e) => {
                      const n = new Set(checked);
                      if (e.target.checked) n.add(gi); else n.delete(gi);
                      setChecked(n);
                    }}
                  />
                </label>
              )}
              <span>{g.alts.length > 1 ? "Alternativas (O)" : "Requisito"}</span>
              {g.alts.length > 1 && (
                <button type="button" className={`${s.btn} ${s.small}`} onClick={() => guard(() => ungroup(model, gi))}>
                  Separar
                </button>
              )}
            </div>
            {g.alts.map((a, ai) => (
              <div className={s.alt} key={ai} data-alt={`${gi}.${ai}`}>
                <span className={s.or}>{ai > 0 ? "O" : ""}</span>
                {a.kind === "leaf" ? (
                  <>
                    <span className={s.grow} title={nameOf(a.code)}>
                      <code>{label(a.code)}</code>{a.soft ? "*" : ""} <span className={s.muted}>{nameOf(a.code)}</span>
                    </span>
                    <label className={s.check} title="Marcar como blando (*): puede cursarse a la vez">
                      <input
                        type="checkbox" checked={a.soft} aria-label={`${label(a.code)} blando`}
                        onChange={(e) => guard(() => setSoft(model, gi, ai, e.target.checked))}
                      />
                      *
                    </label>
                  </>
                ) : (
                  <span className={s.grow} title="Expresión compuesta">
                    <code>({renderRegistroExpr(a.tree)})</code> <span className={s.muted}>compuesta</span>
                  </span>
                )}
                <button
                  type="button" className={`${s.btn} ${s.small} ${s.danger}`}
                  aria-label={`Quitar ${a.kind === "leaf" ? label(a.code) : "expresión compuesta"}`}
                  onClick={() => guard(() => removeAlt(model, gi, ai))}
                >
                  ✕
                </button>
              </div>
            ))}
            <div className={s.addRow}>
              <input
                list={listId} placeholder="+ alternativa (O)" aria-label={`Agregar alternativa al grupo ${gi + 1}`}
                value={altCode[gi] ?? ""} onChange={(e) => setAltCode({ ...altCode, [gi]: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (altCode[gi] ?? "").trim()) {
                    guard(() => addAlternative(model, gi, altCode[gi]));
                    setAltCode({ ...altCode, [gi]: "" });
                  }
                }}
              />
            </div>
          </div>
        </div>
      ))}
      {checked.size >= 2 && (
        <button type="button" className={`${s.btn} ${s.primary}`} style={{ marginTop: 6 }}
          onClick={() => guard(() => groupAsAlternatives(model, [...checked]))}>
          Agrupar seleccionados como alternativas (O)
        </button>
      )}
      <div className={s.addRow}>
        <input
          list={listId} value={code} placeholder={`+ ${kind === "prereq" ? "prerrequisito" : "correquisito"} (Y): código o nombre`}
          aria-label={`Agregar ${kind === "prereq" ? "prerrequisito" : "correquisito"}`}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && code.trim()) {
              guard(() => addRequirement(model, code.trim().split(/\s+—\s+/)[0]));
              setCode("");
            }
          }}
        />
        <button type="button" className={s.btn} disabled={!code.trim()}
          onClick={() => { guard(() => addRequirement(model, code.trim().split(/\s+—\s+/)[0])); setCode(""); }}>
          Agregar
        </button>
      </div>
      <datalist id={listId}>
        {[...props.planCodes.entries()].map(([c, n]) => <option key={c} value={c}>{`${c} — ${n}`}</option>)}
        {props.dictionary && [...props.dictionary.entries()].filter(([c]) => !props.planCodes.has(c)).map(([c, n]) => (
          <option key={c} value={c}>{`${c} — ${n}`}</option>
        ))}
      </datalist>

      <div style={{ marginTop: 6 }}>
        {text === null ? (
          <button type="button" className={`${s.btn} ${s.small}`} onClick={() => setText(current)}>Editar como texto</button>
        ) : (
          <>
            <textarea className={s.textarea} value={text} aria-label={`Texto de ${KIND_TITLE[kind]}`} onChange={(e) => setText(e.target.value)} />
            <div className={s.addRow}>
              <button type="button" className={s.btn} onClick={applyText}>Aplicar texto</button>
              <button type="button" className={s.btn} onClick={() => setText(null)}>Cancelar</button>
            </div>
          </>
        )}
      </div>
      <ExternalCodes model={model} props={props} />
      {props.alerts && (
        <>
          <p className={s.muted} style={{ margin: "8px 0 4px" }} data-testid={`students-see-${kind}`}>
            {props.alerts[kind].governor === "api"
              ? "Los estudiantes verán el requisito oficial (API); lo que edites aquí es un respaldo."
              : "No hay datos oficiales para este curso: los estudiantes verán tu cambio."}
          </p>
          <DiscrepancyAlert field={props.alerts[kind]} compact={props.alerts[kind].status === "match"} />
        </>
      )}
    </section>
  );
}

function ExternalCodes({ model, props }: { model: ReqModel; props: PanelProps }) {
  const ext = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const walk = (n: { op: string; code?: string; items?: unknown[] }) => {
      if (n.op === "COURSE") {
        if (n.code && !props.planCodes.has(n.code) && !seen.has(n.code)) { seen.add(n.code); out.push(n.code); }
      } else (n.items as typeof n[] | undefined)?.forEach(walk);
    };
    for (const g of model.groups) for (const a of g.alts)
      a.kind === "leaf" ? walk({ op: "COURSE", code: a.code }) : walk(a.tree);
    return out;
  }, [model, props.planCodes]);
  if (!ext.length) return null;
  return (
    <p className={s.muted} style={{ margin: "6px 0 0" }}>
      Fuera de este plan:{" "}
      {ext.map((c) => {
        const unknown = !!props.dictionary && !props.dictionary.has(c) && !isTokenCode(c);
        return (
          <span key={c} className={`${s.chip} ${unknown ? s.warn : ""}`} title={unknown ? "No está en el Registro" : props.dictionary?.get(c) ?? ""}>
            {label(c)}{unknown ? " ⚠" : ""}
          </span>
        );
      })}
    </p>
  );
}

export default function MapSidePanel(props: PanelProps) {
  const c = props.course;
  return (
    <aside className={s.panel} aria-label="Curso seleccionado" data-testid="side-panel">
      <h2>{c.displayCode}</h2>
      <div>{c.name} · {c.credits} cr</div>
      <div className={s.muted}>
        Semestre {c.semester} · fila {c.row + 1} de {c.rowsInSemester}
        {c.dirty ? " · con cambios sin guardar" : ""}
      </div>
      {c.lockedFields.length > 0 && (
        <div className={s.pins} title="Campos fijados: una importación no los sobrescribe">
          {c.lockedFields.map((f) => <span key={f} className={`${s.chip} ${s.pin}`}>🔒 {f}</span>)}
        </div>
      )}

      <h3>Ubicación</h3>
      <div className={s.addRow} style={{ alignItems: "center" }}>
        <label className={s.check}>
          Semestre
          <input
            className={s.numInput} type="number" min={1} value={c.semester} aria-label="Semestre"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 1) props.onMove(n, Math.min(c.row, 99));
            }}
          />
        </label>
        <button type="button" className={s.btn} disabled={c.row === 0} aria-label="Subir una fila"
          onClick={() => props.onMove(c.semester, c.row - 1)}>↑</button>
        <button type="button" className={s.btn} disabled={c.row >= c.rowsInSemester - 1} aria-label="Bajar una fila"
          onClick={() => props.onMove(c.semester, c.row + 1)}>↓</button>
      </div>

      {c.isPlaceholder || !c.code ? (
        <p className={s.muted}>Espacio sin curso concreto: no tiene requisitos editables aquí.</p>
      ) : (
        <>
          <ListEditor kind="prereq" model={props.models.prereq} props={props} />
          <ListEditor kind="coreq" model={props.models.coreq} props={props} />
        </>
      )}

      <h3>Habilita</h3>
      {props.gates.length === 0 ? <p className={s.muted}>No es requisito de ningún curso del plan.</p> : (
        <ul className={s.issues} data-testid="gates">
          {props.gates.map((g, i) => <li key={`${g.kind}${g.code}${i}`}><code>{label(g.code)}</code> {g.name} {g.kind === "coreq" ? "(correquisito)" : ""}</li>)}
        </ul>
      )}
      {props.requires.length > 0 && (
        <>
          <h3>Requiere (en el plan)</h3>
          <ul className={s.issues}>
            {props.requires.map((g, i) => <li key={`${g.kind}${g.code}${i}`}><code>{label(g.code)}</code> {g.name} {g.kind === "coreq" ? "(correquisito)" : ""}</li>)}
          </ul>
        </>
      )}
      {props.issues.length > 0 && (
        <>
          <h3>Problemas de este curso</h3>
          <ul className={s.issues}>{props.issues.map((i, k) => <li key={k} className={i.severity}>{i.message}</li>)}</ul>
        </>
      )}
      <p className={s.muted} style={{ marginTop: 14 }}>
        <Link href={`/administrador/catalogos/${props.slug}`}>Abrir en el editor clásico →</Link>
      </p>
    </aside>
  );
}
