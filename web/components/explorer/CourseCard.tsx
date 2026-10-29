"use client";

import type { BoxHalf } from "@/lib/electiveBoxes";
import { Handle, Position } from "reactflow";
import type { Course, AvailabilityStatus } from "@/lib/types";
import { groupOf, groupClass, toSentenceCase, termShort, type CourseGroup } from "./format";
import { ArrowRightIcon, BasketIcon, CheckIcon, LockIcon } from "./icons";
import styles from "./explorer.module.css";

export type RelationState =
  | "selected"
  | "directPrereq"
  | "chainIndirect"
  | "chainIndirectFull"
  | "unlockSole"
  | "unlockAmong"
  | "downstream"
  | "unrelated"
  | null;

export interface CourseCardData {
  course: Course;
  mode: "explore" | "progress";
  status: AvailabilityStatus | null;
  isLocked: boolean;
  isPlanned: boolean;
  plannedTerm: string | null;
  relation: RelationState;
  reqNumber: number | null; // matches the side-panel requirement row (CARD-07)
  isStaged: boolean;
  isJustUnlocked: boolean;
  /** next semester per the last checkout step 0 — an outline, never a fill */
  isNext?: boolean;
  /** elective box: the course filling each 1-credit half (lib/electiveBoxes.ts) */
  halves?: [BoxHalf | null, BoxHalf | null] | null;
  isDimmed: boolean;
  onClick: (id: string) => void;
  onHover: (id: string | null, rect?: DOMRect) => void;
}

/** Second channel for course type (shape, not just hue): Proyecto/CBU and
 * Otras/IELE sit close in colour at card size, and colour alone fails for
 * colour-blind users. 8×8, drawn in the card's secondary text colour. */
export function TypeGlyph({ group }: { group: CourseGroup }) {
  const common = { width: 8, height: 8, viewBox: "0 0 8 8", "aria-hidden": true as const, className: styles.typeGlyph };
  switch (group) {
    case "iele": // circle
      return <svg {...common}><circle cx="4" cy="4" r="3.5" fill="currentColor" /></svg>;
    case "cb": // square
      return <svg {...common}><rect x=".5" y=".5" width="7" height="7" fill="currentColor" /></svg>;
    case "otr": // diamond
      return <svg {...common}><path d="M4 0 8 4 4 8 0 4z" fill="currentColor" /></svg>;
    case "pro": // triangle
      return <svg {...common}><path d="M4 .5 7.8 7.5H.2z" fill="currentColor" /></svg>;
    case "ele": // hollow ring
      return <svg {...common}><circle cx="4" cy="4" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;
    case "cbu": // half circle
      return (
        <svg {...common}>
          <circle cx="4" cy="4" r="3.25" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M4 .75a3.25 3.25 0 0 0 0 6.5z" fill="currentColor" />
        </svg>
      );
    default: // requisito: bar
      return <svg {...common}><rect x="0" y="3" width="8" height="2" fill="currentColor" /></svg>;
  }
}

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
  approved: "aprobada",
  available: "disponible",
  "one-away": "le falta 1",
  blocked: "bloqueada",
};

export default function CourseCard({ data }: { data: CourseCardData }) {
  const {
    course,
    mode,
    status,
    isLocked,
    isPlanned,
    plannedTerm,
    relation,
    reqNumber,
    isStaged,
    isJustUnlocked,
    isNext,
    halves,
    isDimmed,
    onClick,
    onHover,
  } = data;

  const group = groupOf(course);
  const isSlot = course.isPlaceholder;

  const classNames = [
    styles.card,
    isSlot ? styles.slotCard : "",
    styles[groupClass(group)],
    relation ? styles[relation] : "",
    isStaged ? styles.staged : "",
    isJustUnlocked ? styles.justUnlocked : "",
    isNext && status !== "approved" && !isPlanned ? styles.stNext : "",
    isDimmed ? styles.dimmed : "",
    mode === "progress" && status === "approved" ? styles.stApproved : "",
    mode === "progress" && isPlanned ? styles.stPlanned : "",
    mode === "progress" && !isPlanned && status === "available" ? styles.stAvailable : "",
    mode === "progress" && !isPlanned && status !== "approved" && status !== "available" && !isLocked ? styles.stBlocked : "",
    mode === "progress" && isLocked ? styles.stAdmin : "",
  ]
    .filter(Boolean)
    .join(" ");

  const title = toSentenceCase(course.name);
  const accessibleState =
    mode === "progress" && status ? STATUS_LABEL[status] : relation ? relation : "";

  return (
    <button
      type="button"
      className={classNames}
      onClick={() => onClick(course.id)}
      onMouseEnter={(e) => onHover(course.id, e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => onHover(null)}
      onFocus={(e) => onHover(course.id, e.currentTarget.getBoundingClientRect())}
      onBlur={() => onHover(null)}
      aria-label={`${course.code} ${title}, ${course.credits} créditos${accessibleState ? `, ${accessibleState}` : ""}${isNext && status !== "approved" && !isPlanned ? ", la vas a poder ver el próximo semestre" : ""}`}
      title={
        halves && (halves[0] || halves[1])
          ? halvesTooltip(halves)
          : isNext && status !== "approved" && !isPlanned
            ? `${title} · La vas a poder ver`
            : title
      }
      data-course-id={course.id}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      {reqNumber != null && <span className={styles.numberBadge}>{reqNumber}</span>}
      {mode === "progress" && isPlanned && plannedTerm && (
        <span className={`${styles.tag}`}>
          <BasketIcon size={10} />
          {termShort(plannedTerm)}
        </span>
      )}
      {isNext && status !== "approved" && !isPlanned && (
        <span className={styles.nextBadge} aria-hidden>
          <ArrowRightIcon size={10} />
        </span>
      )}
      {mode === "progress" && status === "approved" && (
        <span className={styles.seenBadge} aria-hidden>
          <CheckIcon size={12} />
        </span>
      )}
      {mode === "progress" && isLocked && status !== "approved" && (
        <span className={styles.lockBadge} aria-hidden>
          <LockIcon size={10} />
        </span>
      )}
      {isSlot && <span className={styles.slotDash} aria-hidden />}
      <div className={styles.cardTop}>
        <span className={styles.cardCode}>
          <TypeGlyph group={group} />
          {course.code}
        </span>
        <span className={styles.cardCredits}>{course.credits > 0 ? `${course.credits} cr` : "—"}</span>
      </div>
      {halves && (halves[0] || halves[1]) ? <HalvesTitle halves={halves} /> : <div className={styles.cardTitle}>{title}</div>}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </button>
  );
}

/** "Esta materia vale 4 créditos y ocupa 2 casillas" for every course in the box */
function halvesTooltip(halves: [BoxHalf | null, BoxHalf | null]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const h of halves) {
    if (!h || seen.has(h.key)) continue;
    seen.add(h.key);
    const boxes = Math.ceil(h.credits / 2);
    parts.push(
      h.credits > 2 || h.cont
        ? `${toSentenceCase(h.title)}: esta materia vale ${h.credits} créditos y ocupa ${boxes === 1 ? "1 casilla y media" : `${boxes} casillas`}`
        : `${toSentenceCase(h.title)} (${h.credits} créditos)`
    );
  }
  if (!halves[0] || !halves[1]) parts.push("Medio espacio libre (1 crédito)");
  return parts.join(" · ");
}

/** An elective box drawn as two 1-credit halves: one name when one course
 * fills it, two when it's shared; continuation halves carry "(cont.)". */
function HalvesTitle({ halves }: { halves: [BoxHalf | null, BoxHalf | null] }) {
  const [a, b] = halves;
  if (a && b && a.key === b.key) {
    return (
      <div className={styles.cardTitle}>
        {toSentenceCase(a.title)}
        {a.cont && <span className={styles.halfCont}> (cont.)</span>}
      </div>
    );
  }
  return (
    <div className={styles.halfRows}>
      {[a, b].map((h, i) => (
        <span key={i} className={`${styles.halfRow} ${h ? "" : styles.halfEmpty}`}>
          {h ? (
            <>
              {toSentenceCase(h.title)}
              {h.cont && <span className={styles.halfCont}> (cont.)</span>}
            </>
          ) : (
            "Libre · 1 cr"
          )}
        </span>
      ))}
    </div>
  );
}

