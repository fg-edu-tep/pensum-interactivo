"use client";

import type { Course } from "@/lib/types";
import { renderRequirement } from "@/lib/requirementText";
import { numberRequirementGroups } from "./reqGroups";
import { spaceCode } from "./format";
import { CheckIcon } from "./icons";
import styles from "./explorer.module.css";

interface Props {
  course: Course;
  allCourses: Course[];
  catalogCodes: Set<string>;
  mode: "explore" | "progress";
  approved: Set<string>;
  onSelectCourse: (id: string) => void;
}

export default function RequirementTree({ course, allCourses, catalogCodes, mode, approved, onSelectCourse }: Props) {
  if (!course.prereqTree && course.prereqCourseIds.length === 0) {
    return <p className={styles.reqFallbackNote}>Sin prerrequisitos.</p>;
  }

  const groups = numberRequirementGroups(course, allCourses, catalogCodes);
  const byNormalized = new Map(allCourses.map((c) => [c.codeNormalized, c]));

  if (!groups) {
    // parsing gave up on a shape it doesn't model — fall back to the text render
    return (
      <>
        <p className={styles.reqSingle}>{renderRequirement(course.prereqTree, allCourses)}</p>
        <p className={styles.reqFallbackNote}>Formato no reconocido — mostrando el texto original.</p>
      </>
    );
  }

  const total = groups.length;
  const met = (g: (typeof groups)[number]): boolean => {
    if (mode !== "progress") return false;
    if (g.kind === "course") return approved.has(byNormalized.get(g.code)?.id ?? "");
    if (g.kind === "requirement") return approved.has(g.key);
    return g.options.some((o) => approved.has(byNormalized.get(o.code)?.id ?? ""));
  };
  const metCount = groups.filter(met).length;

  return (
    <>
      <div className={styles.reqHeading}>
        <h3>Para inscribirla necesitas</h3>
        <span className={styles.reqHint}>
          {mode === "progress" ? `${total - metCount} de ${total} pendientes` : "aprobar antes"}
        </span>
      </div>
      {groups.map((g, i) => (
        <div key={i}>
          {i > 0 && <div className={styles.andConnector}>Y</div>}
          <div className={styles.reqRow}>
            <span className={styles.reqRowNum}>{g.number}</span>
            <div className={styles.reqBox}>
              {g.kind === "course" &&
                (g.inPensum ? (
                  <button type="button" className={styles.reqSingle} onClick={() => onSelectCourse(byNormalized.get(g.code)!.id)} style={{ border: "none", background: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
                    <span className="code">{byNormalized.get(g.code)?.code ?? spaceCode(g.code)}</span> {g.label}
                  </button>
                ) : (
                  <span className={styles.reqSingle}>{spaceCode(g.code)} · fuera de este pensum</span>
                ))}
              {g.kind === "requirement" && <span className={styles.reqSingle}>{g.label} · requisito de grado</span>}
              {g.kind === "or" && (
                <>
                  <span className={styles.orLabel}>Uno de estos</span>
                  <div className={styles.orWrap}>
                    {g.options.map((o) =>
                      o.inPensum ? (
                        <button
                          key={o.code}
                          type="button"
                          className={styles.orPill}
                          onClick={() => onSelectCourse(byNormalized.get(o.code)!.id)}
                        >
                          {byNormalized.get(o.code)?.code ?? spaceCode(o.code)}
                        </button>
                      ) : (
                        <span key={o.code} className={styles.orPillOut} title="fuera de este pensum">
                          {spaceCode(o.code)}
                        </span>
                      )
                    )}
                  </div>
                </>
              )}
            </div>
            {mode === "progress" && (
              <span className={styles.reqStatus}>
                {met(g) ? <CheckIcon /> : <span style={{ display: "inline-block", width: 11, height: 11, border: "1.5px solid var(--line-control)", borderRadius: "999px" }} />}
              </span>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
