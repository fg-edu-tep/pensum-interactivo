"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DiscrepancyAlert from "./DiscrepancyAlert";
import {
  COURSE_TYPES,
  PAIRING_LABEL,
  PLACEHOLDER_KINDS,
  type EditorCourse,
} from "./editorTypes";

const LOCKABLE = [
  "name",
  "credits",
  "suggestedSemester",
  "courseType",
  "placeholderLabel",
  "prereqText",
] as const;

interface Props {
  slug: string;
  course: EditorCourse;
  prevId: number | null;
  nextId: number | null;
}

export default function CourseRow({ slug, course, prevId, nextId }: Props) {
  const router = useRouter();
  const [f, setF] = useState({
    displayCode: course.displayCode,
    name: course.name,
    credits: String(course.credits),
    suggestedSemester: String(course.suggestedSemester),
    courseType: course.courseType,
    isPlaceholder: course.isPlaceholder,
    placeholderKind: course.placeholderKind,
    placeholderLabel: course.placeholderLabel,
    prereqText: course.prereqText,
    description: course.description,
  });
  const [locked, setLocked] = useState<string[]>(course.lockedFields);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const orig = {
    displayCode: course.displayCode,
    name: course.name,
    credits: String(course.credits),
    suggestedSemester: String(course.suggestedSemester),
    courseType: course.courseType,
    isPlaceholder: course.isPlaceholder,
    placeholderKind: course.placeholderKind,
    placeholderLabel: course.placeholderLabel,
    prereqText: course.prereqText,
    description: course.description,
  };
  const scalarDirty = (Object.keys(orig) as (keyof typeof orig)[]).some(
    (k) => k !== "description" && f[k] !== orig[k]
  );
  const descDirty = f.description !== orig.description;
  const locksDirty =
    JSON.stringify([...locked].sort()) !==
    JSON.stringify([...course.lockedFields].sort());
  const dirty = scalarDirty || descDirty || locksDirty;

  function toggleLock(field: string) {
    setLocked((cur) =>
      cur.includes(field) ? cur.filter((x) => x !== field) : [...cur, field]
    );
  }

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      if (scalarDirty || locksDirty) {
        const body: Record<string, unknown> = { lockedFields: locked };
        if (f.displayCode !== orig.displayCode) body.displayCode = f.displayCode;
        if (f.name !== orig.name) body.name = f.name;
        if (f.credits !== orig.credits) body.credits = Number(f.credits);
        if (f.suggestedSemester !== orig.suggestedSemester)
          body.suggestedSemester = Number(f.suggestedSemester);
        if (f.courseType !== orig.courseType) body.courseType = f.courseType;
        if (f.isPlaceholder !== orig.isPlaceholder) body.isPlaceholder = f.isPlaceholder;
        if (f.placeholderKind !== orig.placeholderKind)
          body.placeholderKind = f.placeholderKind || null;
        if (f.placeholderLabel !== orig.placeholderLabel)
          body.placeholderLabel = f.placeholderLabel || null;
        if (f.prereqText !== orig.prereqText) body.prereqText = f.prereqText;
        const res = await fetch(
          `/api/admin/catalogs/${slug}/courses/${course.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        const d = (await res.json()) as { error?: string };
        if (!res.ok) {
          setMsg({ ok: false, text: d.error ?? "No se pudo guardar." });
          return;
        }
      }
      if (descDirty && course.normalizedCode) {
        const res = await fetch(
          `/api/admin/courses/${encodeURIComponent(course.normalizedCode)}/description`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: f.description }),
          }
        );
        if (!res.ok) {
          const d = (await res.json()) as { error?: string };
          setMsg({ ok: false, text: d.error ?? "No se pudo guardar la descripción." });
          return;
        }
      }
      setMsg({ ok: true, text: "Guardado." });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "Error de red." });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(`¿Eliminar "${course.displayCode} ${course.name}"?`)) return;
    setBusy("del");
    try {
      const res = await fetch(
        `/api/admin/catalogs/${slug}/courses/${course.id}`,
        { method: "DELETE" }
      );
      if (res.ok) router.refresh();
      else setMsg({ ok: false, text: "No se pudo eliminar." });
    } finally {
      setBusy(null);
    }
  }

  async function reorder(otherId: number) {
    setBusy("move");
    try {
      const res = await fetch(`/api/admin/catalogs/${slug}/courses/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aId: course.id, bId: otherId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function scrapeDesc() {
    if (!course.normalizedCode) return;
    setBusy("scrape");
    setMsg(null);
    try {
      const res = await fetch(
        `/api/admin/courses/${encodeURIComponent(course.normalizedCode)}/description`,
        { method: "POST" }
      );
      const d = (await res.json()) as { description?: string; error?: string };
      if (!res.ok || !d.description) {
        setMsg({ ok: false, text: d.error ?? "No se encontró descripción." });
        return;
      }
      setF((cur) => ({ ...cur, description: d.description! }));
      setMsg({ ok: true, text: "Descripción traída — revísala y guarda." });
    } catch {
      setMsg({ ok: false, text: "Error de red." });
    } finally {
      setBusy(null);
    }
  }

  const Lock = ({ field }: { field: string }) => (
    <button
      type="button"
      className={`lock-toggle${locked.includes(field) ? " locked" : ""}`}
      title={locked.includes(field) ? "Campo bloqueado ante importaciones" : "Bloquear ante importaciones"}
      onClick={() => toggleLock(field)}
    >
      {locked.includes(field) ? "🔒" : "🔓"}
    </button>
  );

  return (
    <div className={`editor-row${dirty ? " is-dirty" : ""}`}>
      <div className="er-field">
        <span>Sem</span>
        <input
          className="admin-input"
          value={f.suggestedSemester}
          inputMode="numeric"
          onChange={(e) => setF({ ...f, suggestedSemester: e.target.value })}
        />
      </div>
      <div className="er-field">
        <span>Código</span>
        <input
          className="admin-input"
          value={f.displayCode}
          onChange={(e) => setF({ ...f, displayCode: e.target.value })}
        />
      </div>
      <div className="er-field">
        <span>
          Nombre <Lock field="name" />
        </span>
        <input
          className="admin-input"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
      </div>
      <div className="er-field">
        <span>
          Créd. <Lock field="credits" />
        </span>
        <input
          className="admin-input"
          value={f.credits}
          inputMode="decimal"
          onChange={(e) => setF({ ...f, credits: e.target.value })}
        />
      </div>
      <div className="er-field">
        <span>
          Tipo <Lock field="courseType" />
        </span>
        <select
          className="admin-select"
          value={f.courseType}
          onChange={(e) => setF({ ...f, courseType: e.target.value })}
        >
          {COURSE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="er-field er-wide">
        <span>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={f.isPlaceholder}
              onChange={(e) => setF({ ...f, isPlaceholder: e.target.checked })}
            />
            Espacio (placeholder)
          </label>
        </span>
        {f.isPlaceholder && (
          <div style={{ display: "flex", gap: 8 }}>
            <select
              className="admin-select"
              style={{ maxWidth: 140 }}
              value={f.placeholderKind}
              onChange={(e) => setF({ ...f, placeholderKind: e.target.value })}
            >
              <option value="">— tipo —</option>
              {PLACEHOLDER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              className="admin-input"
              placeholder="Etiqueta del espacio"
              value={f.placeholderLabel}
              onChange={(e) => setF({ ...f, placeholderLabel: e.target.value })}
            />
            <Lock field="placeholderLabel" />
          </div>
        )}
      </div>

      <div className="er-field er-wide">
        <span>
          Prerrequisito (respaldo) <Lock field="prereqText" />
        </span>
        <textarea
          className="admin-textarea"
          rows={2}
          value={f.prereqText}
          onChange={(e) => setF({ ...f, prereqText: e.target.value })}
        />
        {course.discrepancy && course.discrepancy.prereq.status !== "match" && (
          <DiscrepancyAlert field={course.discrepancy.prereq} compact={course.discrepancy.prereq.status === "unverified"} />
        )}
        {course.discrepancy && course.discrepancy.coreq.severity === "warn" && (
          <DiscrepancyAlert field={course.discrepancy.coreq} />
        )}
        {f.prereqText !== orig.prereqText && course.discrepancy?.prereq.governor === "api" && (
          <div className="disc-alert warn" role="status">
            ⚠ Este curso tiene datos oficiales de la API: aunque guardes este cambio, los estudiantes seguirán viendo los
            de la API. Solo se usa este valor si la API no tiene datos del curso.
          </div>
        )}
      </div>

      {!course.isPlaceholder && course.normalizedCode && (
        <div className="er-field er-wide">
          <span>
            Descripción del curso{" "}
            {course.descriptionSyncedAt ? (
              <span className="er-tag">catálogo</span>
            ) : course.description ? (
              <span className="er-tag manual">manual</span>
            ) : null}
          </span>
          <textarea
            className="admin-textarea"
            rows={3}
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
          <button
            type="button"
            className="admin-btn"
            style={{ alignSelf: "flex-start", marginTop: 4 }}
            disabled={busy != null}
            onClick={scrapeDesc}
          >
            {busy === "scrape" ? "Buscando…" : "Traer descripción del catálogo"}
          </button>
        </div>
      )}

      <div className="er-actions">
        <button
          className="admin-btn primary"
          disabled={!dirty || busy != null}
          onClick={save}
        >
          {busy === "save" ? "Guardando…" : "Guardar"}
        </button>
        {dirty && (
          <button
            className="admin-btn"
            disabled={busy != null}
            onClick={() => {
              setF(orig);
              setLocked(course.lockedFields);
              setMsg(null);
            }}
          >
            Deshacer
          </button>
        )}
        <button
          className="admin-btn"
          disabled={busy != null || prevId == null}
          onClick={() => prevId != null && reorder(prevId)}
          title="Subir"
        >
          ↑
        </button>
        <button
          className="admin-btn"
          disabled={busy != null || nextId == null}
          onClick={() => nextId != null && reorder(nextId)}
          title="Bajar"
        >
          ↓
        </button>
        <button
          className="admin-btn danger"
          disabled={busy != null}
          onClick={remove}
        >
          Eliminar
        </button>
        <span className={`er-tag ${course.pairingStatus === "auto_paired" || course.pairingStatus === "manual_resolved" ? "paired" : "needs"}`}>
          {PAIRING_LABEL[course.pairingStatus] ?? course.pairingStatus}
        </span>
        {course.manuallyEdited && <span className="er-tag manual">editado a mano</span>}
        {msg && (
          <span className={msg.ok ? "admin-saved" : "admin-error"}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}
