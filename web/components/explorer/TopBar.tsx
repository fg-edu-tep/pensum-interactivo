"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Attestation } from "@/lib/types";
import { BackIcon, ChevronDownIcon, SearchIcon, HelpIcon, ShareIcon } from "./icons";
import styles from "./explorer.module.css";

export interface PlanOption {
  slug: string;
  programName: string;
  variantLabel: string;
}

interface Props {
  slug: string;
  programName: string;
  variantLabel: string;
  planOptions: PlanOption[];
  mode: "explore" | "progress";
  onModeChange: (m: "explore" | "progress") => void;
  query: string;
  onQueryChange: (q: string) => void;
  attestations: Attestation[];
  attestationsMet: Set<string>;
  onOpenGrado: () => void;
  onHelp: () => void;
  onShare: () => void;
  shareFeedback: string | null;
  tourTargetMode?: boolean;
}

export default function TopBar({
  slug,
  programName,
  variantLabel,
  planOptions,
  mode,
  onModeChange,
  query,
  onQueryChange,
  attestations,
  attestationsMet,
  onOpenGrado,
  onHelp,
  onShare,
  shareFeedback,
  tourTargetMode,
}: Props) {
  const [planOpen, setPlanOpen] = useState(false);
  const planRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!planOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!planRef.current?.contains(e.target as Node)) setPlanOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [planOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const grouped = new Map<string, PlanOption[]>();
  for (const o of planOptions) {
    const key = o.programName;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(o);
  }

  const metCount = attestations.filter((a) => attestationsMet.has(a.id)).length;

  return (
    <div className={styles.topBar}>
      <Link href="/" className={styles.iconBtn} aria-label="Volver a planes" title="Volver a planes">
        <BackIcon />
      </Link>

      <div ref={planRef} style={{ position: "relative" }}>
        <button type="button" className={styles.planBtn} onClick={() => setPlanOpen((v) => !v)} aria-expanded={planOpen}>
          <span className={styles.kicker}>Pensum · {variantLabel || "estándar"}</span>
          <span className={styles.planName}>
            {programName}
            <ChevronDownIcon />
          </span>
        </button>
        {planOpen && (
          <div className={styles.planMenu}>
            {[...grouped.entries()].map(([group, opts]) => (
              <div className={styles.planMenuGroup} key={group}>
                <div className={styles.planMenuGroupName}>{group}</div>
                {opts.map((o) => (
                  <Link
                    key={o.slug}
                    href={`/p/${o.slug}`}
                    className={`${styles.planMenuItem} ${o.slug === slug ? styles.isCurrent : ""}`}
                    onClick={() => setPlanOpen(false)}
                  >
                    {o.variantLabel || "Plan estándar"}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className={styles.modeToggle}
        role="group"
        aria-label="Modo"
        data-tour-target={tourTargetMode ? "true" : undefined}
      >
        <button
          type="button"
          className={`${styles.modeBtn} ${mode === "explore" ? styles.active : ""}`}
          aria-pressed={mode === "explore"}
          onClick={() => onModeChange("explore")}
        >
          Explorar
        </button>
        <button
          type="button"
          className={`${styles.modeBtn} ${mode === "progress" ? styles.active : ""}`}
          aria-pressed={mode === "progress"}
          onClick={() => onModeChange("progress")}
        >
          Mi avance
        </button>
      </div>

      <div className={styles.spacer} />

      <div className={styles.searchField}>
        <span className={styles.searchIcon}>
          <SearchIcon />
        </span>
        <input
          ref={searchRef}
          type="text"
          placeholder="Buscar curso o código"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {!query && <span className={styles.searchKbd}>/</span>}
      </div>

      {attestations.length > 0 && (
        <button type="button" className={styles.accentGhost} onClick={onOpenGrado}>
          Checklist de grado <span className={styles.counterPill}>{metCount}/{attestations.length}</span>
        </button>
      )}

      <button type="button" className={styles.iconBtn} onClick={onHelp} aria-label="Ver guía de uso" title="Ver guía de uso">
        <HelpIcon />
      </button>
      <button type="button" className={styles.iconBtn} onClick={onShare} aria-label="Compartir" title={shareFeedback ?? "Compartir"}>
        <ShareIcon />
      </button>

      <Link href={`/v1/p/${slug}`} className={styles.versionLink} title="Comparar con el diseño anterior">
        Ver v1
      </Link>
    </div>
  );
}
