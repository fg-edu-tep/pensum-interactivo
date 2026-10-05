"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UserRow {
  id: number;
  username: string;
  displayName: string | null;
  disabled: boolean;
  mustReset: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function SuperPanel({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<number | "new" | "rotate" | null>(null);

  // create form
  const [nUser, setNUser] = useState("");
  const [nName, setNName] = useState("");
  const [nPass, setNPass] = useState("");

  // rotated master secret reveal
  const [newMnemonic, setNewMnemonic] = useState<string | null>(null);

  async function call(url: string, init: RequestInit): Promise<boolean> {
    setMsg(null);
    const res = await fetch(url, init);
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Error." });
      return false;
    }
    return true;
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusyId("new");
    try {
      const ok = await call("/api/admin/super/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: nUser, displayName: nName, password: nPass }),
      });
      if (ok) {
        setMsg({ ok: true, text: `Usuario "${nUser}" creado.` });
        setNUser("");
        setNName("");
        setNPass("");
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function toggleDisabled(u: UserRow) {
    setBusyId(u.id);
    try {
      const ok = await call(`/api/admin/super/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: !u.disabled }),
      });
      if (ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(u: UserRow) {
    if (!window.confirm(`¿Eliminar al usuario "${u.username}"? No se puede deshacer.`))
      return;
    setBusyId(u.id);
    try {
      const ok = await call(`/api/admin/super/users/${u.id}`, { method: "DELETE" });
      if (ok) {
        setMsg({ ok: true, text: `Usuario "${u.username}" eliminado.` });
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function resetPassword(u: UserRow) {
    const temp = window.prompt(
      `Nueva contraseña temporal para "${u.username}" (mínimo 8 caracteres).\n` +
        `Compártela con la persona; se le pedirá cambiarla al entrar.`
    );
    if (temp == null) return;
    setBusyId(u.id);
    try {
      const ok = await call(`/api/admin/super/users/${u.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: temp }),
      });
      if (ok) {
        setMsg({
          ok: true,
          text: `Contraseña de "${u.username}" restablecida. Entrégale la temporal.`,
        });
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function rotateMaster() {
    if (
      !window.confirm(
        "¿Generar una nueva frase maestra? La frase anterior dejará de funcionar inmediatamente."
      )
    )
      return;
    setBusyId("rotate");
    try {
      setMsg(null);
      const res = await fetch("/api/admin/super/master-secret", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        mnemonic?: string;
        error?: string;
      };
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "No se pudo rotar." });
        return;
      }
      setNewMnemonic(data.mnemonic ?? null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {msg && (
        <p className={msg.ok ? "admin-saved" : "admin-error"} style={{ marginTop: 8 }}>
          {msg.text}
        </p>
      )}

      <div className="admin-section">
        <h2>Usuarios</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Estado</th>
              <th>Último ingreso</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <code>{u.username}</code>
                  {u.mustReset && (
                    <div className="admin-pair warn">debe cambiar contraseña</div>
                  )}
                </td>
                <td>{u.displayName ?? "—"}</td>
                <td>
                  {u.disabled ? (
                    <span className="admin-badge archived">deshabilitado</span>
                  ) : (
                    <span className="admin-badge published">activo</span>
                  )}
                </td>
                <td className="admin-pair">
                  {u.lastLoginAt
                    ? new Date(u.lastLoginAt).toLocaleString("es-CO")
                    : "nunca"}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      className="admin-btn"
                      disabled={busyId === u.id}
                      onClick={() => resetPassword(u)}
                    >
                      Restablecer contraseña
                    </button>
                    <button
                      className="admin-btn"
                      disabled={busyId === u.id}
                      onClick={() => toggleDisabled(u)}
                    >
                      {u.disabled ? "Habilitar" : "Deshabilitar"}
                    </button>
                    <button
                      className="admin-btn danger"
                      disabled={busyId === u.id}
                      onClick={() => removeUser(u)}
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="admin-section" onSubmit={createUser} style={{ maxWidth: 560 }}>
        <h2>Nuevo usuario</h2>
        <div className="admin-form-grid">
          <div>
            <label>Usuario</label>
            <input
              className="admin-input"
              value={nUser}
              onChange={(e) => setNUser(e.target.value)}
            />
          </div>
          <div>
            <label>Nombre (opcional)</label>
            <input
              className="admin-input"
              value={nName}
              onChange={(e) => setNName(e.target.value)}
            />
          </div>
          <div>
            <label>Contraseña</label>
            <input
              className="admin-input"
              type="text"
              value={nPass}
              onChange={(e) => setNPass(e.target.value)}
            />
          </div>
        </div>
        <div className="admin-section-actions">
          <button
            className="admin-btn primary"
            disabled={busyId === "new" || !nUser || !nPass}
          >
            {busyId === "new" ? "Creando…" : "Crear usuario"}
          </button>
        </div>
      </form>

      <div className="admin-section">
        <h2>Frase maestra</h2>
        <p className="admin-note">
          Rota la frase maestra si crees que se filtró. Se mostrará la nueva frase
          una sola vez.
        </p>
        {newMnemonic ? (
          <>
            <ol className="setup-mnemonic">
              {newMnemonic.split(" ").map((w, i) => (
                <li key={i}>
                  <span className="setup-mnemonic-n">{i + 1}</span>
                  {w}
                </li>
              ))}
            </ol>
            <div className="admin-section-actions">
              <button
                className="admin-btn"
                onClick={() => navigator.clipboard?.writeText(newMnemonic)}
              >
                Copiar
              </button>
              <button className="admin-btn primary" onClick={() => setNewMnemonic(null)}>
                Ya la guardé
              </button>
            </div>
          </>
        ) : (
          <div className="admin-section-actions">
            <button
              className="admin-btn danger"
              disabled={busyId === "rotate"}
              onClick={rotateMaster}
            >
              {busyId === "rotate" ? "Generando…" : "Rotar frase maestra"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
