"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CourseRow from "./CourseRow";
import type { EditorCourse } from "./editorTypes";

interface Props {
  slug: string;
  courses: EditorCourse[];
}

export default function CourseTable({ slug, courses }: Props) {
  const router = useRouter();
  const [addingSem, setAddingSem] = useState<number | null>(null);
  const [draft, setDraft] = useState({ displayCode: "", name: "", credits: "", courseType: "nucleo" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const groups = useMemo(() => {
    const bySem = new Map<number, EditorCourse[]>();
    for (const c of courses) {
      const arr = bySem.get(c.suggestedSemester) ?? [];
      arr.push(c);
      bySem.set(c.suggestedSemester, arr);
    }
    return [...bySem.entries()].sort((a, b) => a[0] - b[0]);
  }, [courses]);

  const maxSem = groups.length ? groups[groups.length - 1][0] : 0;
  const totalCredits = courses.reduce((s, c) => s + (c.credits || 0), 0);

  async function resyncAll() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch(`/api/admin/catalogs/${slug}/resync`, { method: "POST" });
      const d = (await res.json()) as {
        error?: string;
        courses?: number;
        offered?: number;
        notOffered?: number;
        failed?: number;
        aborted?: boolean;
      };
      if (!res.ok) {
        setSyncMsg({ ok: false, text: d.error ?? "No se pudo sincronizar." });
        return;
      }
      setSyncMsg({
        ok: !d.failed,
        text: d.aborted
          ? `La API no responde: se interrumpió la sincronización (${d.failed} con error).`
          : `${d.courses} cursos consultados: ${d.offered} ofertados, ${d.notOffered} no ofertados este semestre${d.failed ? `, ${d.failed} con error` : ""}.`,
      });
      router.refresh();
    } catch {
      setSyncMsg({ ok: false, text: "Error de red." });
    } finally {
      setSyncing(false);
    }
  }

  async function addCourse(sem: number) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/catalogs/${slug}/courses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestedSemester: sem,
          displayCode: draft.displayCode,
          name: draft.name,
          credits: draft.credits ? Number(draft.credits) : 0,
          courseType: draft.courseType,
        }),
      });
      const d = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(d.error ?? "No se pudo agregar.");
        return;
      }
      setDraft({ displayCode: "", name: "", credits: "", courseType: "nucleo" });
      setAddingSem(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-section">
      <h2>
        Cursos del plan{" "}
        <span className="admin-note">
          ({courses.length} filas · {totalCredits} créditos)
        </span>
      </h2>
      <div className="er-actions" style={{ marginBottom: 12 }}>
        <button className="admin-btn" disabled={syncing} onClick={resyncAll}>
          {syncing ? "Consultando la API… (puede tardar un minuto)" : "Sincronizar todo el plan con la API"}
        </button>
        {syncMsg && <span className={syncMsg.ok ? "admin-saved" : "admin-error"}>{syncMsg.text}</span>}
      </div>

      {groups.map(([sem, rows]) => (
        <div key={sem} className="course-sem-group">
          <header>
            <span>Semestre {sem}</span>
            <span className="admin-note">
              {rows.reduce((s, c) => s + (c.credits || 0), 0)} créd.
            </span>
          </header>
          {rows.map((c, i) => (
            <CourseRow
              key={c.id}
              slug={slug}
              course={c}
              prevId={i > 0 ? rows[i - 1].id : null}
              nextId={i < rows.length - 1 ? rows[i + 1].id : null}
            />
          ))}
          <div className="er-actions" style={{ padding: "8px 12px" }}>
            {addingSem === sem ? (
              <>
                <input
                  className="admin-input"
                  style={{ maxWidth: 120 }}
                  placeholder="Código"
                  value={draft.displayCode}
                  onChange={(e) => setDraft({ ...draft, displayCode: e.target.value })}
                />
                <input
                  className="admin-input"
                  style={{ maxWidth: 240 }}
                  placeholder="Nombre"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <input
                  className="admin-input"
                  style={{ maxWidth: 70 }}
                  placeholder="Créd."
                  value={draft.credits}
                  onChange={(e) => setDraft({ ...draft, credits: e.target.value })}
                />
                <button
                  className="admin-btn primary"
                  disabled={busy}
                  onClick={() => addCourse(sem)}
                >
                  {busy ? "…" : "Agregar"}
                </button>
                <button className="admin-btn" onClick={() => setAddingSem(null)}>
                  Cancelar
                </button>
                {err && <span className="admin-error">{err}</span>}
              </>
            ) : (
              <button className="admin-btn" onClick={() => setAddingSem(sem)}>
                + Agregar curso a semestre {sem}
              </button>
            )}
          </div>
        </div>
      ))}

      {addingSem != null && !groups.some(([s]) => s === addingSem) ? (
        <div className="course-sem-group">
          <header>
            <span>Semestre {addingSem} (nuevo)</span>
          </header>
          <div className="er-actions" style={{ padding: "8px 12px" }}>
            <input
              className="admin-input"
              style={{ maxWidth: 120 }}
              placeholder="Código"
              value={draft.displayCode}
              onChange={(e) => setDraft({ ...draft, displayCode: e.target.value })}
            />
            <input
              className="admin-input"
              style={{ maxWidth: 240 }}
              placeholder="Nombre"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <input
              className="admin-input"
              style={{ maxWidth: 70 }}
              placeholder="Créd."
              value={draft.credits}
              onChange={(e) => setDraft({ ...draft, credits: e.target.value })}
            />
            <button
              className="admin-btn primary"
              disabled={busy}
              onClick={() => addCourse(addingSem)}
            >
              {busy ? "…" : "Agregar"}
            </button>
            <button className="admin-btn" onClick={() => setAddingSem(null)}>
              Cancelar
            </button>
            {err && <span className="admin-error">{err}</span>}
          </div>
        </div>
      ) : (
        <button
          className="admin-btn"
          disabled={busy}
          onClick={() => setAddingSem(maxSem + 1)}
        >
          + Agregar semestre {maxSem + 1}
        </button>
      )}
    </div>
  );
}
