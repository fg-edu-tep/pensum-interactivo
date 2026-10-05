import { cookies } from "next/headers";
import { SUPER_COOKIE, verifySuperToken } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/users";
import SuperUnlock from "./SuperUnlock";
import SuperPanel from "./SuperPanel";

export const dynamic = "force-dynamic";

export default async function SuperPage() {
  const store = await cookies();
  const unlocked = await verifySuperToken(store.get(SUPER_COOKIE)?.value);

  if (!unlocked) {
    return (
      <>
        <h1>Super-panel</h1>
        <p className="admin-sub">
          Gestión de usuarios y recuperación de contraseñas. Requiere la frase
          maestra de 12 palabras.
        </p>
        <SuperUnlock />
      </>
    );
  }

  const users = await listUsers();
  const serializable = users.map((u) => ({
    ...u,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <>
      <h1>Super-panel</h1>
      <p className="admin-sub">
        Gestión de usuarios y recuperación de contraseñas. Sesión de super-panel
        activa (expira por inactividad).
      </p>
      <SuperPanel users={serializable} />
    </>
  );
}
