"use client";

import { Handle, Position } from "reactflow";
import type { Course, AvailabilityStatus, UnlockRelation } from "@/lib/types";

export interface CourseNodeData {
  course: Course;
  mode: "explore" | "progress";
  status: AvailabilityStatus | null; // null when mode === "explore"
  isLocked: boolean; // locked by an admin progression rule
  isSelected: boolean;
  isUpstream: boolean;
  isDownstream: boolean;
  isDimmed: boolean;
  isStaged: boolean; // marked in the quick multi-select flow
  isJustUnlocked: boolean; // freshly unlocked by "Terminar" — one-shot glow
  /** when another course is selected: does approving it unlock this one? */
  unlock: UnlockRelation;
  onClick: (id: string) => void;
}

const TYPE_LABEL: Record<Course["type"], string> = {
  nucleo: "Núcleo",
  electiva: "Electiva",
  cbu: "CBU",
  complementaria: "Libre elección",
  proyecto: "Proyecto",
};

export default function CourseNode({ data }: { data: CourseNodeData }) {
  const {
    course,
    status,
    isLocked,
    isSelected,
    isUpstream,
    isDownstream,
    isDimmed,
    isStaged,
    isJustUnlocked,
    unlock,
    onClick,
  } = data;

  const classNames = [
    "course-node",
    `type-${course.type}`,
    course.placeholderKind === "REQING" ? "kind-reqing" : "",
    course.isPlaceholder ? "is-placeholder" : "",
    status ? `status-${status}` : "",
    isLocked ? "is-locked" : "",
    isSelected ? "is-selected" : "",
    isUpstream ? "is-upstream" : "",
    isDownstream ? "is-downstream" : "",
    unlock ? `unlock-${unlock}` : "",
    isStaged ? "is-staged" : "",
    isJustUnlocked ? "is-just-unlocked" : "",
    isDimmed ? "is-dimmed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames} onClick={() => onClick(course.id)}>
      <Handle type="target" position={Position.Left} />
      <div className="course-node-top">
        <span className="course-code">
          {isLocked && (
            <span className="course-lock" title="Bloqueado por una regla del plan">
              🔒{" "}
            </span>
          )}
          {course.code}
        </span>
        <span className="course-credits">{course.credits} cr</span>
      </div>
      <div className="course-name">{course.name}</div>
      <div className="course-node-bottom">
        <span className="course-type-tag">
          {isLocked
            ? "Bloqueada por regla"
            : course.placeholderKind === "REQING"
              ? "Requisito de grado"
              : TYPE_LABEL[course.type]}
        </span>
        {isStaged && <span className="course-staged-check">✓ marcada</span>}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
