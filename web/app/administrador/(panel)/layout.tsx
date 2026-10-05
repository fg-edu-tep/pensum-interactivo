import { cookies } from "next/headers";
import AdminNav from "@/components/admin/AdminNav";
import { SESSION_COOKIE, sessionUsername } from "@/lib/auth/session";

// Middleware already gates /administrador/*; this layout just draws the shell.
export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await cookies();
  const username = (await sessionUsername(store.get(SESSION_COOKIE)?.value)) ?? null;
  return (
    <div className="admin-shell">
      <AdminNav username={username} />
      <main className="admin-main">{children}</main>
    </div>
  );
}
