"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface PlanOption {
  slug: string;
  programName: string;
  variantLabel: string;
}

interface Props {
  current: string; // slug
  options: PlanOption[];
}

export default function PlanSwitcher({ current, options }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const currentOpt = options.find((o) => o.slug === current);
  const label = currentOpt
    ? `${currentOpt.programName}${currentOpt.variantLabel ? ` · ${currentOpt.variantLabel}` : ""}`
    : "Elegir plan";

  // group by program, preserving first-seen order
  const groups: { programName: string; items: PlanOption[] }[] = [];
  for (const o of options) {
    let g = groups.find((x) => x.programName === o.programName);
    if (!g) {
      g = { programName: o.programName, items: [] };
      groups.push(g);
    }
    g.items.push(o);
  }

  return (
    <div className="plan-switcher" ref={rootRef}>
      <button
        type="button"
        className="plan-switcher-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="plan-switcher-label">{label}</span>
        <span className="plan-switcher-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="plan-switcher-menu" role="listbox">
          {groups.map((g) => (
            <div className="plan-switcher-group" key={g.programName}>
              <div className="plan-switcher-group-name">{g.programName}</div>
              {g.items.map((o) => (
                <button
                  type="button"
                  key={o.slug}
                  role="option"
                  aria-selected={o.slug === current}
                  className={`plan-switcher-item${o.slug === current ? " is-current" : ""}`}
                  onClick={() => {
                    setOpen(false);
                    if (o.slug !== current) router.push(`/p/${o.slug}`);
                  }}
                >
                  {o.variantLabel || "Plan estándar"}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
