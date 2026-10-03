"use client";

// "Tu canasta" checkout, in two steps:
//   1 · Revisar   — your week at full width (what a semester of these sections
//                   feels like), how NRCs work, and every course with its real
//                   sections (teachers, days, rooms, seats) from the live API.
//   2 · Qué sigue — the practical hand-off: copy the NRCs, tune the schedule in
//                   Mi Horario, then enrol in MiBanner at your turn.
// The data is live; an unpublished term falls back to a flagged reference term.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Course } from "@/lib/types";
import {
  DAY_LONG,
  DAY_SHORT,
  fmtMinutes,
  sectionsConflict,
  summarizeMeetings,
  titleCaseName,
  type CourseSections,
  type DayIndex,
  type Meeting,
  type SectionInfo,
  type SectionsResponse,
} from "@/lib/sections";
import { termLabel } from "@/lib/term";
import { groupColor, groupOf, toSentenceCase } from "./format";
import { TypeGlyph } from "./CourseCard";
import { ArrowRightIcon, BackIcon, BasketIcon, CheckIcon, ChevronDownIcon, CloseIcon, CopyIcon, ExternalIcon, ShareIcon } from "./icons";
import styles from "./explorer.module.css";

// Official Uniandes pages (Registro). MiBanner's registration page is the one
// the Registro help article itself links to.
const MIBANNER_URL = "https://mibanner.uniandes.edu.co/StudentRegistrationSsb/ssb/registration";
const HELP_ARTICLE_URL =
  "https://registro.uniandes.edu.co/index.php/component/content/article/14-aspirantesgeneral/183-como-hacer-mi-horario";
const GENERAL_RULES_URL =
  "https://registro.uniandes.edu.co/index.php/elaboracion-de-horario/instrucciones-generales-del-proceso-de-registro-de-cursos";
const ERRORS_URL = "https://registro.uniandes.edu.co/index.php/elaboracion-de-horario/mensajes-de-error";

interface Props {
  slug: string;
  courses: Course[];
  planned: Map<string, string>; // courseId -> term
  approved: Set<string>;
  planTermCode: string;
  /** course to open expanded (e.g. the one selected when the modal was opened) */
  focusCourseId: string | null;
  unlockedNextTerm: Course[];
  mihorarioUrl: string;
  onClose: () => void;
  onRemove: (id: string) => void;
  onShare: () => void;
}

type Choice = Record<string, string>; // courseId -> nrc
type Stage = "review" | "next";
type Picked = { course: Course; cs: CourseSections | undefined; section: SectionInfo | null };

const HOUR_PX = 50;

function choiceKey(slug: string, term: string) {
  return `pensum:${slug}:sections:${term}`;
}

/** Best default per course: has seats, doesn't clash with what's already chosen. */
function suggest(list: { course: Course; cs: CourseSections | undefined }[], keep: Choice): Choice {
  const out: Choice = {};
  const chosen: SectionInfo[] = [];
  for (const { course, cs } of list) {
    const k = cs?.sections.find((x) => x.nrc === keep[course.id]);
    if (k) {
      out[course.id] = k.nrc;
      chosen.push(k);
    }
  }
  for (const { course, cs } of list) {
    if (out[course.id] || !cs || cs.sections.length === 0) continue;
    const open = cs.sections.filter((s) => s.seatsAvail > 0);
    const pool = open.length > 0 ? open : cs.sections;
    const pick = pool.find((s) => !chosen.some((c) => sectionsConflict(c, s))) ?? pool[0];
    out[course.id] = pick.nrc;
    chosen.push(pick);
  }
  return out;
}

/** The first overlapping slot between two sections, for "Cruce: Lun 7:00–8:20". */
function clashSlot(a: SectionInfo, b: SectionInfo): Meeting | null {
  for (const x of a.meetings) {
    for (const y of b.meetings) {
      if (x.day === y.day && x.start < y.end && y.start < x.end) {
        return { ...x, start: Math.max(x.start, y.start), end: Math.min(x.end, y.end) };
      }
    }
  }
  return null;
}

export default function BasketModal({
  slug,
  courses,
  planned,
  approved,
  planTermCode,
  focusCourseId,
  unlockedNextTerm,
  mihorarioUrl,
  onClose,
  onRemove,
  onShare,
}: Props) {
  const items = useMemo(() => courses.filter((c) => planned.has(c.id)), [courses, planned]);
  const credits = items.reduce((s, c) => s + c.credits, 0);
  const codesKey = items.map((c) => c.codeNormalized).sort().join(",");

  const [stage, setStage] = useState<Stage>("review");
  const [data, setData] = useState<SectionsResponse | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [choice, setChoice] = useState<Choice>({});
  const [touched, setTouched] = useState<Set<string>>(new Set()); // user-picked (vs suggested)
  const [expanded, setExpanded] = useState<string | null>(focusCourseId);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // --- live sections ---
  useEffect(() => {
    if (!codesKey) {
      setLoadState("ready");
      return;
    }
    const ctrl = new AbortController();
    setLoadState("loading");
    fetch(`/api/sections?codes=${encodeURIComponent(codesKey)}&term=${encodeURIComponent(planTermCode)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<SectionsResponse>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        setData(d);
        setLoadState("ready");
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setLoadState("error");
      });
    return () => ctrl.abort();
  }, [codesKey, planTermCode]);

  // --- remembered picks + suggestions, once data is in ---
  useEffect(() => {
    if (!data) return;
    let stored: { choice?: Choice; touched?: string[] } = {};
    try {
      stored = JSON.parse(localStorage.getItem(choiceKey(slug, planTermCode)) ?? "{}");
    } catch {
      /* ignore */
    }
    const list = items.map((course) => ({ course, cs: data.courses[course.codeNormalized] }));
    setTouched(new Set(stored.touched ?? []));
    setChoice(suggest(list, { ...(stored.choice ?? {}) }));
  }, [data, items, slug, planTermCode]);

  useEffect(() => {
    if (!data || Object.keys(choice).length === 0) return;
    try {
      localStorage.setItem(choiceKey(slug, planTermCode), JSON.stringify({ choice, touched: [...touched] }));
    } catch {
      /* ignore */
    }
  }, [choice, touched, data, slug, planTermCode]);

  // --- dialog behaviour: Esc, focus trap, scroll lock ---
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
      );
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  // --- derived ---
  const picked: Picked[] = useMemo(
    () =>
      items.map((course) => {
        const cs = data?.courses[course.codeNormalized];
        const section = cs?.sections.find((s) => s.nrc === choice[course.id]) ?? null;
        return { course, cs, section };
      }),
    [items, data, choice]
  );
  const clashes = useMemo(() => {
    const out: { a: Course; b: Course; slot: Meeting }[] = [];
    for (let i = 0; i < picked.length; i++) {
      for (let j = i + 1; j < picked.length; j++) {
        const x = picked[i].section;
        const y = picked[j].section;
        if (!x || !y) continue;
        const slot = clashSlot(x, y);
        if (slot) out.push({ a: picked[i].course, b: picked[j].course, slot });
      }
    }
    return out;
  }, [picked]);
  const clashIds = useMemo(() => new Set(clashes.flatMap((c) => [c.a.id, c.b.id])), [clashes]);
  const referenceTerm = useMemo(() => {
    if (!data) return null;
    const ref = Object.values(data.courses).find((c) => c.isReference);
    return ref ? ref.term : null;
  }, [data]);
  const missingSections = picked.filter((p) => loadState === "ready" && !p.section).length;
  const allSet = loadState === "ready" && items.length > 0 && missingSections === 0 && clashes.length === 0;
  const planLabel = termLabel(planTermCode);

  /** how many other sections of this course would fit around everything else */
  const altCount = useCallback(
    (p: Picked) => {
      if (!p.cs) return 0;
      const others = picked.filter((o) => o.course.id !== p.course.id && o.section).map((o) => o.section!);
      return p.cs.sections.filter(
        (s) => s.nrc !== p.section?.nrc && s.seatsAvail > 0 && !others.some((o) => sectionsConflict(o, s))
      ).length;
    },
    [picked]
  );

  const pick = (courseId: string, nrc: string) => {
    setChoice((c) => ({ ...c, [courseId]: nrc }));
    setTouched((t) => new Set(t).add(courseId));
  };

  const jumpToCourse = (id: string) => {
    setExpanded(id);
    setTimeout(() => {
      const el = document.getElementById(`bk-course-${id}`);
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }, 30);
  };

  const nrcLines = picked.map(({ course, section }) =>
    section
      ? `${course.code} · Sec ${section.section} · NRC ${section.nrc}${section.instructors.length ? ` · ${section.instructors.map(titleCaseName).join(", ")}` : ""}`
      : `${course.code} · (sin sección elegida)`
  );
  const copyNrcs = async () => {
    const header = `Mi plan ${planLabel} — ${credits} créditos${referenceTerm ? ` (secciones de ${termLabel(referenceTerm)} como referencia)` : ""}`;
    try {
      await navigator.clipboard.writeText([header, ...nrcLines].join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard blocked */
    }
  };

  const goStage = (s: Stage) => {
    setStage(s);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const coreqCourses = items.filter((c) => c.coreqText);

  return (
    <div className={styles.bkOverlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.bkDialog} role="dialog" aria-modal="true" aria-labelledby="bk-title" ref={dialogRef} onKeyDown={onKeyDown}>
        {/* ---------- header ---------- */}
        <header className={`${styles.bkHeader} ${allSet ? styles.bkHeaderDone : ""}`}>
          <span className={styles.bkSeal} aria-hidden>
            {allSet ? (
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path className={styles.bkSealCheck} d="M5 12.5 10 17.5 19 7" />
              </svg>
            ) : (
              <BasketIcon size={22} />
            )}
          </span>
          <div className={styles.bkHeadText}>
            <h2 id="bk-title" className={styles.bkTitle}>
              {stage === "next"
                ? "Qué sigue"
                : allSet
                  ? `Tu canasta para ${planLabel} está lista`
                  : `Tu canasta · ${planLabel}`}
            </h2>
            <p className={styles.bkSub}>
              {stage === "next"
                ? "Tres pasos para dejar tu horario inscrito"
                : `${items.length} curso${items.length === 1 ? "" : "s"} · ${credits} créditos`}
              {stage === "review" && loadState === "ready" && clashes.length > 0 && ` · ${clashes.length} cruce${clashes.length === 1 ? "" : "s"} de horario`}
              {stage === "review" && loadState === "ready" && clashes.length === 0 && missingSections > 0 && ` · ${missingSections} sin sección publicada`}
              {stage === "review" && allSet && (referenceTerm ? " · sin cruces en los horarios de referencia" : " · sin cruces")}
            </p>
          </div>
          <ol className={styles.bkStepper} aria-label="Pasos">
            <li>
              <button type="button" className={`${styles.bkStepBtn} ${stage === "review" ? styles.bkStepOn : styles.bkStepDone}`} aria-current={stage === "review" ? "step" : undefined} onClick={() => goStage("review")}>
                <span className={styles.bkStepNum}>{stage === "next" ? <CheckIcon size={10} /> : "1"}</span> Revisar
              </button>
            </li>
            <li>
              <button type="button" className={`${styles.bkStepBtn} ${stage === "next" ? styles.bkStepOn : ""}`} aria-current={stage === "next" ? "step" : undefined} onClick={() => goStage("next")} disabled={items.length === 0}>
                <span className={styles.bkStepNum}>2</span> Qué sigue
              </button>
            </li>
          </ol>
          <button ref={closeRef} type="button" className={styles.bkClose} onClick={onClose} aria-label="Cerrar">
            <CloseIcon size={18} />
          </button>
        </header>

        <div className={styles.bkScroll} ref={scrollRef}>
          {stage === "review" ? (
            <div className={styles.bkReview}>
              {referenceTerm && (
                <div className={styles.bkNotice} role="note">
                  <strong>Horarios de {termLabel(referenceTerm)} como referencia.</strong> La oferta de {planLabel} se publica
                  más cerca del semestre; las secciones, profesores y cupos pueden cambiar.
                </div>
              )}
              {loadState === "error" && (
                <div className={styles.bkNotice} role="alert">
                  No pudimos traer los horarios en este momento. Tu canasta sigue guardada; intenta de nuevo en un momento o
                  consulta Mi Horario.
                </div>
              )}

              {items.length === 0 ? (
                <div className={styles.bkEmpty}>
                  <BasketIcon size={30} />
                  <strong>Tu canasta está vacía</strong>
                  <span>Agrega cursos desde el mapa o desde “Disponibles para agregar”.</span>
                </div>
              ) : (
                <>
                  <WeekPanel picked={picked} clashes={clashes} clashIds={clashIds} loading={loadState === "loading"} referenceTerm={referenceTerm} onBlock={jumpToCourse} />
                  <NrcExplainer />

                  <h3 className={styles.bkSectionTitle}>Tus cursos</h3>
                  <div className={styles.bkList}>
                    {picked.map((p) => {
                      const { course, cs, section } = p;
                      const open = expanded === course.id;
                      const clash = clashIds.has(course.id);
                      const group = groupOf(course);
                      const alts = loadState === "ready" ? altCount(p) : 0;
                      return (
                        <article key={course.id} id={`bk-course-${course.id}`} className={`${styles.bkCourse} ${open ? styles.bkCourseOpen : ""} ${clash ? styles.bkCourseClash : ""}`}>
                          <div className={styles.bkCourseHead}>
                            <button type="button" className={styles.bkCourseToggle} aria-expanded={open} aria-controls={`bk-${course.id}`} onClick={() => setExpanded(open ? null : course.id)}>
                              <span className={styles.bkGlyph} style={{ background: groupColor(group) }}>
                                <TypeGlyph group={group} />
                              </span>
                              <span className={styles.bkCourseMain}>
                                <span className={styles.bkCourseTitle}>{toSentenceCase(course.name)}</span>
                                <span className={styles.bkCourseMeta}>
                                  <span className={styles.bkCode}>{course.code}</span>
                                  <span>{course.credits} cr</span>
                                  {section && (
                                    <>
                                      <span className={styles.bkPicked}>
                                        Sec {section.section} · {section.instructors.length > 0 ? titleCaseName(section.instructors[0]) : "Profesor por definir"}
                                        {section.instructors.length > 1 ? ` +${section.instructors.length - 1}` : ""}
                                      </span>
                                      <span className={styles.bkNrcTag}>NRC {section.nrc}</span>
                                    </>
                                  )}
                                  {loadState === "loading" && <span className={styles.bkSkeleton} aria-hidden />}
                                  {loadState === "ready" && !section && <span className={styles.bkMuted}>Sin secciones publicadas</span>}
                                  {section && alts > 0 && (
                                    <span className={styles.bkAlt}>{alts} alternativa{alts === 1 ? "" : "s"} sin cruce</span>
                                  )}
                                </span>
                              </span>
                              {clash && <span className={styles.bkBadgeWarn}>Cruce</span>}
                              <span className={`${styles.bkChevron} ${open ? styles.bkChevronOpen : ""}`} aria-hidden>
                                <ChevronDownIcon size={14} />
                              </span>
                            </button>
                            <button type="button" className={styles.bkRemove} onClick={() => onRemove(course.id)} aria-label={`Quitar ${course.code} de la canasta`} title="Quitar de la canasta">
                              <CloseIcon size={14} />
                            </button>
                          </div>

                          {open && (
                            <div className={styles.bkCourseBody} id={`bk-${course.id}`}>
                              {course.description ? <Description text={course.description} /> : <p className={`${styles.bkDesc} ${styles.bkMuted}`}>Aún no tenemos la descripción de este curso.</p>}
                              <PrereqLine course={course} courses={courses} approved={approved} planned={planned} />
                              <h3 className={styles.bkH3}>
                                Secciones{cs ? ` · ${termLabel(cs.term)}` : ""}
                                {cs?.isReference && <span className={styles.bkRefTag}>referencia</span>}
                              </h3>
                              {loadState === "loading" && <div className={styles.bkSkeletonRow} aria-hidden />}
                              {loadState === "ready" && (!cs || cs.sections.length === 0) && (
                                <p className={styles.bkMuted}>No hay secciones publicadas para este curso todavía. Revisa Mi Horario más cerca del semestre.</p>
                              )}
                              <div className={styles.bkSections} role="radiogroup" aria-label={`Secciones de ${course.code}`}>
                                {cs?.sections.map((s) => (
                                  <SectionRow key={s.nrc} s={s} selected={choice[course.id] === s.nrc} suggested={choice[course.id] === s.nrc && !touched.has(course.id)} onPick={() => pick(course.id, s.nrc)} />
                                ))}
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>

                  {unlockedNextTerm.length > 0 && (
                    <div className={styles.unlockInsight}>
                      <span>
                        Con esta canasta se desbloquean <strong>{unlockedNextTerm.length} curso(s)</strong> para más adelante: {unlockedNextTerm.map((c) => c.code).join(", ")}.
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <NextSteps
              planLabel={planLabel}
              referenceTerm={referenceTerm}
              nrcLines={picked.map((p) => ({ course: p.course, section: p.section }))}
              coreqCourses={coreqCourses}
              clashCount={clashes.length}
              mihorarioUrl={mihorarioUrl}
              copied={copied}
              onCopy={copyNrcs}
              onShare={onShare}
            />
          )}
        </div>

        {/* ---------- sticky footer ---------- */}
        <footer className={styles.bkFooter}>
          {stage === "review" ? (
            <>
              <span className={styles.bkFootNote}>
                {clashes.length > 0
                  ? "Hay cruces: cambia una sección o ajústalos luego en Mi Horario."
                  : "Tus elecciones de sección se guardan en este navegador."}
              </span>
              <button type="button" className={styles.btnGhostFooter} onClick={onClose}>
                Seguir editando
              </button>
              <button type="button" className={styles.btnGhostFooter} onClick={copyNrcs} disabled={picked.every((p) => !p.section)}>
                {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                {copied ? "NRC copiados" : "Copiar mis NRC"}
              </button>
              <button type="button" className={styles.btnPrimary} onClick={() => goStage("next")} disabled={items.length === 0}>
                Continuar: qué sigue <ArrowRightIcon size={14} />
              </button>
            </>
          ) : (
            <>
              <button type="button" className={styles.btnGhostFooter} onClick={() => goStage("review")}>
                <BackIcon size={14} /> Volver a mi canasta
              </button>
              <span className={styles.bkFootSpacer} />
              <button type="button" className={styles.btnPrimary} onClick={onClose}>
                Listo, cerrar
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Step 2 — what happens next                                                  */
/* ========================================================================== */

function NextSteps({
  planLabel,
  referenceTerm,
  nrcLines,
  coreqCourses,
  clashCount,
  mihorarioUrl,
  copied,
  onCopy,
  onShare,
}: {
  planLabel: string;
  referenceTerm: string | null;
  nrcLines: { course: Course; section: SectionInfo | null }[];
  coreqCourses: Course[];
  clashCount: number;
  mihorarioUrl: string;
  copied: boolean;
  onCopy: () => void;
  onShare: () => void;
}) {
  return (
    <div className={styles.bkNext}>
      <p className={styles.bkNextLead}>
        Tu canasta de {planLabel} está definida. Para convertirla en una inscripción real, estos son los pasos, en orden.
      </p>
      {(referenceTerm || clashCount > 0) && (
        <div className={styles.bkNotice} role="note">
          {referenceTerm && (
            <>
              Los NRC de abajo son de <strong>{termLabel(referenceTerm)}</strong> (referencia). Cuando la oferta de {planLabel} se
              publique, vuelve a esta pantalla para obtener los NRC vigentes.{" "}
            </>
          )}
          {clashCount > 0 && <>Tu selección tiene {clashCount} cruce{clashCount === 1 ? "" : "s"}; puedes resolverlos al ajustar el horario en el paso 2.</>}
        </div>
      )}

      <ol className={styles.bkSteps}>
        <li className={styles.bkStep}>
          <span className={styles.bkStepBadge}>1</span>
          <div className={styles.bkStepBody}>
            <h3>Copia tus NRC</h3>
            <p>
              El NRC es el código que te pide MiBanner para inscribir cada sección. Cópialos ahora y tenlos a la mano el día de
              tu inscripción.
            </p>
            <ul className={styles.bkNrcList}>
              {nrcLines.map(({ course, section }) => (
                <li key={course.id}>
                  <span className={styles.bkNrcCode}>{course.code}</span>
                  <span className={styles.bkNrcName}>{toSentenceCase(course.name)}</span>
                  {section ? (
                    <>
                      <span className={styles.bkNrcSec}>Sec {section.section}</span>
                      <span className={styles.bkNrcValue}>{section.nrc}</span>
                    </>
                  ) : (
                    <span className={styles.bkMuted}>sin sección</span>
                  )}
                </li>
              ))}
            </ul>
            <div className={styles.bkStepActions}>
              <button type="button" className={styles.btnPrimary} onClick={onCopy}>
                {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                {copied ? "NRC copiados" : "Copiar mis NRC"}
              </button>
              <button type="button" className={styles.btnGhostFooter} onClick={onShare}>
                <ShareIcon size={14} /> Compartir mi plan
              </button>
            </div>
          </div>
        </li>

        <li className={styles.bkStep}>
          <span className={styles.bkStepBadge}>2</span>
          <div className={styles.bkStepBody}>
            <h3>Ajusta tu horario en Mi Horario</h3>
            <p>
              Mi Horario te permite comparar combinaciones de secciones y detectar cruces. Tómate el tiempo de afinar el plan
              según tu ritmo de estudio, tus desplazamientos y tus horas de descanso: un horario sostenible rinde más que uno
              apretado. Si cambias de sección, anota el nuevo NRC.
            </p>
            <div className={styles.bkStepActions}>
              {mihorarioUrl && (
                <a href={mihorarioUrl} target="_blank" rel="noopener noreferrer" className={styles.btnPrimary}>
                  Abrir Mi Horario <ExternalIcon size={13} />
                </a>
              )}
            </div>
          </div>
        </li>

        <li className={styles.bkStep}>
          <span className={styles.bkStepBadge}>3</span>
          <div className={styles.bkStepBody}>
            <h3>Inscribe tus materias en MiBanner</h3>
            <p>
              A la hora de tu turno de inscripción, ingresa a MiBanner, agrega cada materia con su NRC y confirma en «¿Cómo va
              mi horario?» que quedó inscrita. Si el sistema rechaza alguna, te indicará el motivo.
            </p>
            <div className={styles.bkStepActions}>
              <a href={MIBANNER_URL} target="_blank" rel="noopener noreferrer" className={styles.btnPrimary}>
                Ir a MiBanner <ExternalIcon size={13} />
              </a>
            </div>
          </div>
        </li>
      </ol>

      <div className={styles.bkTips}>
        <h3 className={styles.bkH3}>Antes del día de inscripción</h3>
        <ul>
          <li>Consulta tu turno de inscripción en Registro: entre más temprano ingreses, más opciones de horario tendrás.</li>
          <li>Ten a la mano un NRC de respaldo por materia, por si un cupo se agota mientras inscribes.</li>
          <li>Revisa los prerrequisitos y restricciones de cada sección en la Oferta de cursos.</li>
          {coreqCourses.length > 0 && (
            <li>
              Algunos cursos de tu canasta tienen correquisito (
              {coreqCourses.map((c) => `${c.code} → ${c.coreqText}`).join("; ")}): se inscriben al tiempo, cada uno con su propio NRC.
            </li>
          )}
          <li>Si no logras inscribir una materia, puedes solicitarlo por el Sistema de Conflicto de Horario (SCH) cuando esté habilitado.</li>
        </ul>
      </div>

      <div className={styles.bkHelp}>
        <h3 className={styles.bkH3}>Guías oficiales de Registro</h3>
        <a href={HELP_ARTICLE_URL} target="_blank" rel="noopener noreferrer">
          ¿Cómo hacer mi horario? <ExternalIcon size={12} />
        </a>
        <a href={GENERAL_RULES_URL} target="_blank" rel="noopener noreferrer">
          Instrucciones generales del registro de cursos <ExternalIcon size={12} />
        </a>
        <a href={ERRORS_URL} target="_blank" rel="noopener noreferrer">
          Mensajes de error de MiBanner <ExternalIcon size={12} />
        </a>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Step 1 pieces                                                               */
/* ========================================================================== */

function NrcExplainer() {
  const [open, setOpen] = useState(false);
  return (
    <section className={styles.bkNrcExplain} aria-label="Cómo funcionan los NRC">
      <button type="button" className={styles.bkNrcExplainHead} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={styles.bkNrcIcon} aria-hidden>NRC</span>
        <span className={styles.bkNrcExplainTitle}>
          <strong>¿Cómo funcionan los NRC?</strong>
          <span>Cada sección tiene el suyo: elegir un NRC es elegir horario y profesor.</span>
        </span>
        <span className={`${styles.bkChevron} ${open ? styles.bkChevronOpen : ""}`} aria-hidden>
          <ChevronDownIcon size={14} />
        </span>
      </button>
      {open && (
        <div className={styles.bkNrcExplainBody}>
          <div>
            <strong>Qué es</strong>
            <p>El NRC (número de referencia del curso) identifica una sección concreta: el curso, el grupo, el profesor y el horario.</p>
          </div>
          <div>
            <strong>Por qué importa</strong>
            <p>Un mismo curso tiene varias secciones y cada una tiene un NRC distinto. Dos NRC del mismo curso pueden diferir en días, horas y cupos.</p>
          </div>
          <div>
            <strong>Cómo lo usas</strong>
            <p>En MiBanner inscribes cada materia con su NRC. Si el curso tiene laboratorio o sección complementaria, esa parte tiene su propio NRC y se inscribe al tiempo.</p>
          </div>
          <div>
            <strong>Para planear mejor</strong>
            <p>Elige la sección que mejor encaje con tu semana y guarda un NRC de respaldo: los cupos cambian hasta el último momento.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function SeatsPill({ s }: { s: SectionInfo }) {
  if (s.seatsAvail <= 0) return <span className={`${styles.bkSeats} ${styles.bkSeatsFull}`}>Sin cupos</span>;
  if (s.seatsAvail <= 5) return <span className={`${styles.bkSeats} ${styles.bkSeatsLow}`}>{s.seatsAvail} cupo{s.seatsAvail === 1 ? "" : "s"}</span>;
  return <span className={`${styles.bkSeats} ${styles.bkSeatsOk}`}>{s.seatsAvail} cupos</span>;
}

function Description({ text }: { text: string }) {
  const [more, setMore] = useState(false);
  const long = text.length > 260;
  return (
    <div>
      <p className={`${styles.bkDesc} ${long && !more ? styles.bkDescClamp : ""}`}>{text}</p>
      {long && (
        <button type="button" className={styles.bkLink} onClick={() => setMore((m) => !m)}>
          {more ? "Leer menos" : "Leer más"}
        </button>
      )}
    </div>
  );
}

function SectionRow({ s, selected, suggested, onPick }: { s: SectionInfo; selected: boolean; suggested: boolean; onPick: () => void }) {
  const groups = summarizeMeetings(s.meetings);
  return (
    <button type="button" role="radio" aria-checked={selected} className={`${styles.bkSection} ${selected ? styles.bkSectionOn : ""}`} onClick={onPick}>
      <span className={styles.bkRadio} aria-hidden>{selected && <CheckIcon size={10} />}</span>
      <span className={styles.bkSectionMain}>
        <span className={styles.bkSectionTop}>
          <strong>Sección {s.section}</strong>
          <span className={styles.bkNrc}>NRC {s.nrc}</span>
          {suggested && <span className={styles.bkSuggested}>sugerida</span>}
        </span>
        <span className={styles.bkTeacher}>{s.instructors.length > 0 ? s.instructors.map(titleCaseName).join(" · ") : "Profesor por definir"}</span>
        {groups.map((g, i) => (
          <span key={i} className={styles.bkMeeting}>
            <span className={styles.bkDays}>{g.days.map((d) => DAY_SHORT[d]).join(" · ")}</span>
            <span className={styles.bkTime}>{fmtMinutes(g.start)}–{fmtMinutes(g.end)}</span>
            {g.room && <span className={styles.bkRoom}>{g.room}</span>}
          </span>
        ))}
        {groups.length === 0 && <span className={styles.bkMuted}>Horario por definir</span>}
      </span>
      <SeatsPill s={s} />
    </button>
  );
}

function PrereqLine({ course, courses, approved, planned }: { course: Course; courses: Course[]; approved: Set<string>; planned: Map<string, string> }) {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const pre = course.prereqCourseIds.map((id) => byId.get(id)).filter((c): c is Course => !!c);
  if (pre.length === 0 && !course.coreqText) return null;
  return (
    <div className={styles.bkReqs}>
      {pre.length > 0 && (
        <div className={styles.bkReqRow}>
          <span className={styles.bkReqLabel}>Requisitos</span>
          <span className={styles.bkReqChips}>
            {pre.map((p) => {
              const done = approved.has(p.id);
              const inBasket = planned.has(p.id);
              return (
                <span key={p.id} className={`${styles.bkReqChip} ${done ? styles.bkReqDone : ""}`} title={toSentenceCase(p.name)}>
                  {done && <CheckIcon size={10} />}
                  {p.code}
                  {!done && inBasket && <em> · en tu canasta</em>}
                </span>
              );
            })}
          </span>
        </div>
      )}
      {course.coreqText && (
        <div className={styles.bkReqRow}>
          <span className={styles.bkReqLabel}>Correquisito</span>
          <span className={styles.bkReqChips}>
            <span className={styles.bkReqChip}>{course.coreqText}</span>
            <span className={styles.bkMuted}>se inscribe al tiempo, con su propio NRC</span>
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------- the week, at full width ---------- */

function fmtHours(minutes: number): string {
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h} h` : `${h.toFixed(1).replace(/\.0$/, "")} h`;
}

function WeekPanel({
  picked,
  clashes,
  clashIds,
  loading,
  referenceTerm,
  onBlock,
}: {
  picked: Picked[];
  clashes: { a: Course; b: Course; slot: Meeting }[];
  clashIds: Set<string>;
  loading: boolean;
  referenceTerm: string | null;
  onBlock: (courseId: string) => void;
}) {
  const blocks = picked.flatMap(({ course, section }) =>
    section ? section.meetings.map((m) => ({ course, section, m })) : []
  );

  const stats = useMemo(() => {
    if (blocks.length === 0) return null;
    const total = blocks.reduce((s, b) => s + (b.m.end - b.m.start), 0);
    const earliest = blocks.reduce((a, b) => (b.m.start < a.m.start ? b : a));
    const latest = blocks.reduce((a, b) => (b.m.end > a.m.end ? b : a));
    const days = new Set(blocks.map((b) => b.m.day));
    const freeDays = ([0, 1, 2, 3, 4] as DayIndex[]).filter((d) => !days.has(d));
    const daysAt = (start: number) => [...new Set(blocks.filter((b) => b.m.start === start).map((b) => b.m.day))].sort();
    return {
      total,
      earliest: earliest.m.start,
      earliestDays: daysAt(earliest.m.start),
      latest: latest.m.end,
      latestDays: [...new Set(blocks.filter((b) => b.m.end === latest.m.end).map((b) => b.m.day))].sort(),
      freeDays,
      dayCount: days.size,
    };
  }, [blocks]);

  if (blocks.length === 0) {
    return (
      <section className={styles.bkWeekPanel}>
        <div className={styles.bkWeekTop}>
          <h3 className={styles.bkSectionTitle}>Tu semana</h3>
        </div>
        <div className={styles.bkWeekEmpty}>{loading ? "Armando tu semana…" : "Elige una sección para ver cómo se ve tu semana."}</div>
      </section>
    );
  }

  const minH = Math.max(6, Math.floor(Math.min(...blocks.map((b) => b.m.start)) / 60));
  const maxH = Math.min(22, Math.ceil(Math.max(...blocks.map((b) => b.m.end)) / 60));
  const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i);
  const hasSat = blocks.some((b) => b.m.day === 5);
  const hasSun = blocks.some((b) => b.m.day === 6);
  const days = hasSun ? 7 : hasSat ? 6 : 5;
  const dayList = (ds: DayIndex[]) => ds.map((d) => DAY_SHORT[d]).join(", ");
  const colTemplate = `44px repeat(${days}, minmax(0, 1fr))`;
  const courseColors = picked.filter((p) => p.section);

  return (
    <section className={styles.bkWeekPanel} aria-label="Vista semanal de tus secciones elegidas">
      <div className={styles.bkWeekTop}>
        <h3 className={styles.bkSectionTitle}>Tu semana</h3>
        {referenceTerm && <span className={styles.bkRefTag}>horario de referencia · {termLabel(referenceTerm)}</span>}
      </div>

      {stats && (
        <div className={styles.bkStats}>
          <div className={styles.bkStat}>
            <span className={styles.bkStatValue}>{fmtHours(stats.total)}</span>
            <span className={styles.bkStatLabel}>de clase por semana · {stats.dayCount} día{stats.dayCount === 1 ? "" : "s"}</span>
          </div>
          <div className={styles.bkStat}>
            <span className={styles.bkStatValue}>{fmtMinutes(stats.earliest)}</span>
            <span className={styles.bkStatLabel}>tu clase más temprana · {dayList(stats.earliestDays as DayIndex[])}</span>
          </div>
          <div className={styles.bkStat}>
            <span className={styles.bkStatValue}>{fmtMinutes(stats.latest)}</span>
            <span className={styles.bkStatLabel}>sales más tarde · {dayList(stats.latestDays as DayIndex[])}</span>
          </div>
          <div className={styles.bkStat}>
            <span className={styles.bkStatValue}>{stats.freeDays.length === 0 ? "—" : dayList(stats.freeDays)}</span>
            <span className={styles.bkStatLabel}>{stats.freeDays.length === 0 ? "sin días libres entre semana" : `día${stats.freeDays.length === 1 ? "" : "s"} libre${stats.freeDays.length === 1 ? "" : "s"} entre semana`}</span>
          </div>
        </div>
      )}

      {clashes.length > 0 && (
        <ul className={styles.bkClashList} role="alert">
          {clashes.map((c, i) => (
            <li key={i}>
              <strong>Cruce:</strong> {c.a.code} y {c.b.code} coinciden el {DAY_LONG[c.slot.day].toLowerCase()} de {fmtMinutes(c.slot.start)} a {fmtMinutes(c.slot.end)}.
              <button type="button" className={styles.bkLink} onClick={() => onBlock(c.a.id)}>Cambiar sección de {c.a.code}</button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.bkWeek}>
        <div className={styles.bkWeekHead} style={{ gridTemplateColumns: colTemplate }}>
          <span />
          {DAY_LONG.slice(0, days).map((d, i) => (
            <span key={d} title={d}>{DAY_SHORT[i]}</span>
          ))}
        </div>
        <div className={styles.bkWeekBody} style={{ height: hours.length * HOUR_PX, gridTemplateColumns: colTemplate }}>
          <div className={styles.bkHours}>
            {hours.map((h) => (
              <span key={h} style={{ top: (h - minH) * HOUR_PX }}>{h}:00</span>
            ))}
          </div>
          {Array.from({ length: days }, (_, d) => (
            <div key={d} className={styles.bkDayCol}>
              {hours.map((h) => (
                <i key={h} style={{ top: (h - minH) * HOUR_PX }} />
              ))}
              {blocks
                .filter((b) => b.m.day === d)
                .map((b, i) => {
                  const h = ((b.m.end - b.m.start) / 60) * HOUR_PX - 2;
                  const clash = clashIds.has(b.course.id);
                  return (
                    <button
                      type="button"
                      key={i}
                      className={`${styles.bkBlock} ${clash ? styles.bkBlockClash : ""}`}
                      style={{ top: ((b.m.start - minH * 60) / 60) * HOUR_PX, height: Math.max(20, h), background: groupColor(groupOf(b.course)) }}
                      onClick={() => onBlock(b.course.id)}
                      title={`${b.course.code} · ${toSentenceCase(b.course.name)} · Sec ${b.section.section} · NRC ${b.section.nrc} · ${fmtMinutes(b.m.start)}–${fmtMinutes(b.m.end)}${b.m.room ? ` · ${b.m.room}` : ""}`}
                    >
                      <span className={styles.bkBlockCode}>{b.course.code} · {b.section.section}</span>
                      {h >= 44 && <span className={styles.bkBlockName}>{toSentenceCase(b.course.name)}</span>}
                      {h >= 30 && (
                        <span className={styles.bkBlockMeta}>
                          {fmtMinutes(b.m.start)}–{fmtMinutes(b.m.end)}
                          {b.m.room ? ` · ${b.m.room}` : ""}
                        </span>
                      )}
                      {h >= 62 && <span className={styles.bkBlockMeta}>NRC {b.section.nrc}</span>}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.bkLegend}>
        {courseColors.map(({ course, section }) => (
          <button type="button" key={course.id} className={styles.bkLegendItem} onClick={() => onBlock(course.id)}>
            <i style={{ background: groupColor(groupOf(course)) }} />
            <span className={styles.bkCode}>{course.code}</span>
            <span>{toSentenceCase(course.name)}</span>
            <span className={styles.bkNrcTag}>NRC {section!.nrc}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
