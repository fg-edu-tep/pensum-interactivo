"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/administrador";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { mustReset?: boolean };
        if (data.mustReset) {
          router.replace("/administrador/cuenta?reset=1");
        } else {
          router.replace(next.startsWith("/administrador") ? next : "/administrador");
        }
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        needsSetup?: boolean;
      };
      if (data.needsSetup) {
        router.replace("/administrador/setup");
        return;
      }
      setError(data.error ?? "No se pudo iniciar sesión.");
    } catch {
      setError("Error de red.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={onSubmit}>
        <h1>Administración</h1>
        <p>Panel del coordinador académico.</p>
        <label htmlFor="user">Usuario</label>
        <input
          id="user"
          type="text"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <label htmlFor="pw">Contraseña</label>
        <input
          id="pw"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" disabled={busy || !username || !password}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
        {error && <div className="admin-login-error">{error}</div>}
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
