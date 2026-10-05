import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, sessionUsername } from "@/lib/auth/session";
import { normalizeUsername } from "@/lib/auth/users";
import ChangePasswordForm from "./ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function CuentaPage() {
  const store = await cookies();
  const username = await sessionUsername(store.get(SESSION_COOKIE)?.value);
  const user = username
    ? await prisma.adminUser.findUnique({
        where: { username: normalizeUsername(username) },
        select: { username: true, displayName: true, mustReset: true, lastLoginAt: true },
      })
    : null;

  return (
    <>
      <h1>Mi cuenta</h1>
      <p className="admin-sub">
        {user ? (
          <>
            <code>{user.username}</code>
            {user.displayName ? ` · ${user.displayName}` : ""}
          </>
        ) : (
          "Sesión no reconocida."
        )}
      </p>
      {user?.mustReset && (
        <p className="admin-error">
          Tu contraseña fue restablecida por un administrador. Cámbiala ahora.
        </p>
      )}
      <ChangePasswordForm />
    </>
  );
}
