"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RoleCell {
  norm: string | null;
  raw: string;
}
export interface EditorElective {
  id: number;
  name: string;
  code: string;
  level: string;
  ciclo: string;
  isCursoIntegrador: boolean;
  offeredTerms: string;
  /** next planned offering, YYYYPP (department planning file / admin) */
  nextOfferingTerm: string;
  roles: {
    eleFrom2024: RoleCell;
    elcFrom2024: RoleCell;
    eleUntil2023: RoleCell;
    elcUntil2023: RoleCell;
  };
}

const ROLE_OPTS: { v: string; label: string }[] = [
  { v: "", label: "—" },
  { v: "obligatoria", label: "Obligatoria" },
  { v: "electiva", label: "Electiva" },
  { v: "area_mayor", label: "Área mayor" },
  { v: "curso_integrador", label: "Curso integrador" },
  { v: "proy_grado", label: "Proyecto de grado" },
  { v: "cle", label: "Libre elección" },
  { v: "practica", label: "Práctica" },
  { v: "pasantia", label: "Pasantía" },
  { v: "maestria", label: "Electiva de maestría" },
];
const ROLE_KEYS = [
  ["eleFrom2024", "Eléctrica 2024-I+"],
  ["elcFrom2024", "Electrónica 2024-I+"],
  ["eleUntil2023", "Eléctrica ≤2023-II"],
  ["elcUntil2023", "Electrónica ≤2023-II"],
] as const;

export default function ElectiveTable({
  electives,
}: {
  electives: EditorElective[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/electivas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const d = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(d.error ?? "No se pudo crear.");
        return;
      }
      setNewName("");
      setAdding(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-section">
      {electives.map((e) => (
        <ElectiveRow key={e.id} elective={e} />
      ))}

      {adding ? (
        <div className="er-actions" style={{ marginTop: 12 }}>
          <input
            className="admin-input"
            style={{ maxWidth: 360 }}
            placeholder="Nombre largo del curso"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            className="admin-btn primary"
            disabled={busy || !newName.trim()}
            onClick={create}
          >
            {busy ? "…" : "Crear"}
          </button>
          <button className="admin-btn" onClick={() => setAdding(false)}>
            Cancelar
          </button>
          {err && <span className="admin-error">{err}</span>}
        </div>
      ) : (
        <button
          className="admin-btn"
          style={{ marginTop: 12 }}
          onClick={() => setAdding(true)}
        >
          + Nueva electiva
        </button>
      )}
    </div>
  );
}

function ElectiveRow({ elective }: { elective: EditorElective }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: elective.name,
    code: elective.code,
    level: elective.level,
    ciclo: elective.ciclo,
    isCursoIntegrador: elective.isCursoIntegrador,
    offeredTerms: elective.offeredTerms,
    nextOfferingTerm: elective.nextOfferingTerm,
    roles: JSON.parse(JSON.stringify(elective.roles)) as EditorElective["roles"],
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = JSON.stringify(f) !== JSON.stringify({
    name: elective.name,
    code: elective.code,
    level: elective.level,
    ciclo: elective.ciclo,
    isCursoIntegrador: elective.isCursoIntegrador,
    offeredTerms: elective.offeredTerms,
    nextOfferingTerm: elective.nextOfferingTerm,
    roles: elective.roles,
  });

  function setRole(key: keyof EditorElective["roles"], patch: Partial<RoleCell>) {
    setF({ ...f, roles: { ...f.roles, [key]: { ...f.roles[key], ...patch } } });
  }

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/electivas/${elective.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const d = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: d.error ?? "No se pudo guardar." });
        return;
      }
      setMsg({ ok: true, text: "Guardado." });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(`¿Eliminar "${elective.name}"?`)) return;
    setBusy("del");
    const res = await fetch(`/api/admin/electivas/${elective.id}`, {
      method: "DELETE",
    });
    if (res.ok) router.refresh();
    setBusy(null);
  }

  return (
    <div className={`course-sem-group${dirty ? " is-dirty" : ""}`}>
      <div className="admin-form-grid" style={{ padding: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label>Nombre</label>
          <input
            className="admin-input"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </div>
        {ROLE_KEYS.map(([k, label]) => (
          <div key={k}>
            <label>{label}</label>
            <select
              className="admin-select"
              value={f.roles[k]?.norm ?? ""}
              onChange={(e) => setRole(k, { norm: e.target.value || null })}
            >
              {ROLE_OPTS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div>
          <label>Curso integrador</label>
          <select
            className="admin-select"
            value={f.isCursoIntegrador ? "1" : "0"}
            onChange={(e) =>
              setF({ ...f, isCursoIntegrador: e.target.value === "1" })
            }
          >
            <option value="0">No</option>
            <option value="1">Sí</option>
          </select>
        </div>
        <div>
          <label>Nivel</label>
          <select
            className="admin-select"
            value={f.level}
            onChange={(e) => setF({ ...f, level: e.target.value })}
          >
            <option value="pregrado">pregrado</option>
            <option value="maestria">maestria</option>
            <option value="other">other</option>
          </select>
        </div>
        <div>
          <label>Ciclo (maestría)</label>
          <input
            className="admin-input"
            value={f.ciclo}
            onChange={(e) => setF({ ...f, ciclo: e.target.value })}
          />
        </div>
        <div>
          <label>Ofertada (términos, coma)</label>
          <input
            className="admin-input"
            value={f.offeredTerms}
            onChange={(e) => setF({ ...f, offeredTerms: e.target.value })}
          />
        </div>
        <div>
          <label>Código (opcional)</label>
          <input
            className="admin-input"
            value={f.code}
            onChange={(e) => setF({ ...f, code: e.target.value })}
          />
        </div>
        <div>
          <label>Próxima oferta planeada (AAAAPP)</label>
          <input
            className="admin-input"
            placeholder="p. ej. 202710"
            value={f.nextOfferingTerm}
            onChange={(e) => setF({ ...f, nextOfferingTerm: e.target.value })}
          />
        </div>
      </div>
      <div className="er-actions" style={{ padding: "8px 12px" }}>
        <button
          className="admin-btn primary"
          disabled={!dirty || busy != null}
          onClick={save}
        >
          {busy === "save" ? "…" : "Guardar"}
        </button>
        {dirty && (
          <button
            className="admin-btn"
            onClick={() =>
              setF({
                name: elective.name,
                code: elective.code,
                level: elective.level,
                ciclo: elective.ciclo,
                isCursoIntegrador: elective.isCursoIntegrador,
                offeredTerms: elective.offeredTerms,
                nextOfferingTerm: elective.nextOfferingTerm,
                roles: JSON.parse(JSON.stringify(elective.roles)),
              })
            }
          >
            Deshacer
          </button>
        )}
        <button className="admin-btn danger" disabled={busy != null} onClick={remove}>
          Eliminar
        </button>
        {msg && (
          <span className={msg.ok ? "admin-saved" : "admin-error"}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}
