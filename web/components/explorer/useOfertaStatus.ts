"use client";

// Client side of the API preflight (/api/oferta/health): "unknown" until the
// first answer, then re-checked periodically — every 30 s while down, so the
// planner unblocks itself when the API returns, every 5 min while up.

import { useEffect, useState } from "react";

export type OfertaStatus = "unknown" | "up" | "down";

export function useOfertaStatus(): OfertaStatus {
  const [status, setStatus] = useState<OfertaStatus>("unknown");
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      let ok = true;
      try {
        const r = await fetch("/api/oferta/health", { cache: "no-store" });
        ok = r.ok ? ((await r.json()) as { ok: boolean }).ok : false;
      } catch {
        ok = false;
      }
      if (!alive) return;
      setStatus(ok ? "up" : "down");
      timer = setTimeout(check, ok ? 5 * 60_000 : 30_000);
    };
    check();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  return status;
}
