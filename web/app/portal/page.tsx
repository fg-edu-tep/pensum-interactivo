import { redirect } from "next/navigation";

// The 2026-10-29 portal proposal became /planeacion (review §8).
export default function PortalRedirect() {
  redirect("/planeacion");
}
