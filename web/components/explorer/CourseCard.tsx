"use client";

import { Handle, Position } from "reactflow";
import type { Course, AvailabilityStatus } from "@/lib/types";
import { groupOf, groupClass, toSentenceCase, termShort } from "./format";
import { CheckIcon, LockIcon } from "./icons";
import styles from "./explorer.module.css";

export type RelationState =
  | "selected"
  | "directPrereq"
  | "chainIndirect"
  | "chainIndirectFull"
  | "unlockSole"
  | "unlockAmong"
  | "unrelated"
  | "hovered"
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
  onHover: (id: string | null) => void;
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
    mode === "progress" && status === "one-away" ? styles.stOneAway : "",
    mode === "progress" && status === "blocked" && !isLocked ? styles.stBlocked : "",
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
      onMouseEnter={() => onHover(course.id)}
      onMouseLeave={() => onHover(null)}
      aria-label={`${course.code} ${title}, ${course.credits} créditos${accessibleState ? `, ${accessibleState}` : ""}`}
      title={title}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      {reqNumber != null && <span className={styles.numberBadge}>{reqNumber}</span>}
      {mode === "progress" && isPlanned && plannedTerm && (
        <span className={`${styles.tag}`}>{termShort(plannedTerm)}</span>
      )}
      {mode === "progress" && !isPlanned && status === "one-away" && (
        <span className={`${styles.tag} ${styles.tagOne}`}>falta 1</span>
      )}
      <div className={styles.cardTop}>
        <span className={styles.cardCode}>
          {mode === "progress" && status === "approved" && <CheckIcon />}
          {mode === "progress" && isLocked && <LockIcon />}
          {course.code}
        </span>
        <span className={styles.cardCredits}>{course.credits > 0 ? `${course.credits} cr` : "—"}</span>
      </div>
      <div className={styles.cardTitle}>{title}</div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </button>
  );
}
