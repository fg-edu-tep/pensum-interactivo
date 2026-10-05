import { redirect } from "next/navigation";
import { isInitialized } from "@/lib/auth/users";
import SetupForm from "./SetupForm";

export const dynamic = "force-dynamic";

// First-visitor-wins: once the app is initialized this page is closed for good.
export default async function SetupPage() {
  if (await isInitialized()) {
    redirect("/administrador/login");
  }
  return <SetupForm />;
}
