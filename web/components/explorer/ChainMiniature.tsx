"use client";

import type { Course } from "@/lib/types";
import { groupClass, groupOf, toSentenceCase } from "./format";
import { CheckIcon } from "./icons";
import styles from "./explorer.module.css";

const MAX_SHOWN = 4;

function MiniChip({
  course,
  onSelect,
  mode,
  approved,
}: {
  course: Course;
  onSelect: (id: string) => void;
  mode: "explore" | "progress";
  approved: Set<string>;
}) {
  return (
    <button type="button" className={styles.miniChip} onClick={() => onSelect(course.id)} title={toSentenceCase(course.name)}>
      {mode === "progress" && approved.has(course.id) && <CheckIcon size={10} />}
      {course.code}
    </button>
  );
}

interface Props {
  course: Course;
  allCourses: Course[];
  directDependentIds: string[];
  chainExtraCount: number; // ancestors beyond the direct ones, only shown in "toda la cadena"
  mode: "explore" | "progress";
  approved: Set<string>;
  onSelect: (id: string) => void;
}

export default function ChainMiniature({
  course,
  allCourses,
  directDependentIds,
  chainExtraCount,
  mode,
  approved,
  onSelect,
}: Props) {
  const byId = new Map(allCourses.map((c) => [c.id, c]));
  const directAncestors = course.prereqCourseIds.map((id) => byId.get(id)).filter((c): c is Course => !!c);
  const dependents = directDependentIds.map((id) => byId.get(id)).filter((c): c is Course => !!c);

  return (
    <div className={styles.box}>
      <div className={styles.chain}>
        <div className={styles.chainCol}>
          <span className={styles.lbl}>Necesitas</span>
          {directAncestors.length === 0 ? (
            <span className={styles.chainNone}>Ninguno</span>
          ) : (
            <>
              {directAncestors.slice(0, MAX_SHOWN).map((c) => (
                <MiniChip key={c.id} course={c} onSelect={onSelect} mode={mode} approved={approved} />
              ))}
              {directAncestors.length > MAX_SHOWN && (
                <span className={styles.chainMore}>+ {directAncestors.length - MAX_SHOWN} más</span>
              )}
            </>
          )}
          {chainExtraCount > 0 && <span className={styles.chainMore}>+ {chainExtraCount} antes en la cadena</span>}
        </div>
        <span className={styles.chainArrow}>→</span>
        <div className={styles.chainColCenter}>
          <span className={styles.lbl}>Esta</span>
          <span className={`${styles.miniChip} ${styles.chainEsta} ${styles[groupClass(groupOf(course))]}`}>
            {course.code}
          </span>
        </div>
        <span className={styles.chainArrow}>→</span>
        <div className={styles.chainCol}>
          <span className={styles.lbl}>Desbloquea</span>
          {dependents.length === 0 ? (
            <span className={styles.chainNone}>Nada, es fin de cadena</span>
          ) : (
            <>
              {dependents.slice(0, MAX_SHOWN).map((c) => (
                <MiniChip key={c.id} course={c} onSelect={onSelect} mode={mode} approved={approved} />
              ))}
              {dependents.length > MAX_SHOWN && (
                <span className={styles.chainMore}>+ {dependents.length - MAX_SHOWN} más</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
