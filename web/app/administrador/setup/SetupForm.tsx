"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, displayName }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        mnemonic?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "No se pudo completar la configuración.");
        return;
      }
      setMnemonic(data.mnemonic ?? null);
    } catch {
      setError("Error de red.");
    } finally {
      setBusy(false);
    }
  }

  // Step 2 — reveal the master secret once, require explicit acknowledgement.
  if (mnemonic) {
    const words = mnemonic.split(" ");
    return (
      <div className="admin-login">
        <div className="admin-login-card" style={{ maxWidth: 560 }}>
          <h1>Guarda tu frase maestra</h1>
          <p>
            Estas <strong>12 palabras</strong> son el <strong>secreto maestro</strong> del
            super-panel: con ellas se gestionan usuarios y se recuperan contraseñas.
            Se muestran <strong>una sola vez</strong> y no se pueden recuperar. Guárdalas
            en un lugar seguro (gestor de contraseñas / papel bajo llave).
          </p>
          <ol className="setup-mnemonic">
            {words.map((w, i) => (
              <li key={i}>
                <span className="setup-mnemonic-n">{i + 1}</span>
                {w}
              </li>
            ))}
          </ol>
          <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
            <button
              type="button"
              className="admin-btn"
              onClick={() => navigator.clipboard?.writeText(mnemonic)}
            >
              Copiar frase
            </button>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
            />
            Ya guardé la frase en un lugar seguro.
          </label>
          <button
            type="button"
            disabled={!saved}
            onClick={() => {
              router.replace("/administrador");
              router.refresh();
            }}
            style={{ marginTop: 12 }}
          >
            Entrar al panel
          </button>
        </div>
      </div>
    );
  }

  // Step 1 — create the first user.
  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={onSubmit} style={{ maxWidth: 460 }}>
        <h1>Configuración inicial</h1>
        <p>
          Primer arranque: crea el primer usuario administrador. Al terminar
          recibirás una <strong>frase maestra de 12 palabras</strong> para el
          super-panel. Esta pantalla se cierra para siempre una vez configurado.
        </p>
        <label htmlFor="user">Usuario</label>
        <input
          id="user"
          type="text"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <label htmlFor="name">Nombre a mostrar (opcional)</label>
        <input
          id="name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <label htmlFor="pw">Contraseña</label>
        <input
          id="pw"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label htmlFor="pw2">Confirmar contraseña</label>
        <input
          id="pw2"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <button type="submit" disabled={busy || !username || !password}>
          {busy ? "Configurando…" : "Crear y continuar"}
        </button>
        {error && <div className="admin-login-error">{error}</div>}
      </form>
    </div>
  );
}
