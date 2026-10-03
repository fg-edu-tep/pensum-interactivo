"use client";

import { Handle, Position } from "reactflow";
import type { Course, AvailabilityStatus } from "@/lib/types";
import { groupOf, groupClass, toSentenceCase, termShort, type CourseGroup } from "./format";
import { BasketIcon, CheckIcon, LockIcon } from "./icons";
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
      aria-label={`${course.code} ${title}, ${course.credits} créditos${accessibleState ? `, ${accessibleState}` : ""}`}
      title={title}
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
      <div className={styles.cardTitle}>{title}</div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </button>
  );
}
