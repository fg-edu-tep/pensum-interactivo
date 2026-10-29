"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { planTerm } from "@/lib/term";
import { sortCatalogs } from "@/lib/catalogOrder";
import { FALLBACK_GUIDE_URL } from "@/lib/links";
import { useOfertaStatus } from "./explorer/useOfertaStatus";
import { planner, stepZero, wouldEnable, type PlanContext } from "@/lib/planning";
import { slotOpenMap } from "@/lib/electiveAvailability";
import { takesPregradoDefaults } from "@/lib/creditUnlocks";
import { boxCredits, boxHalves, boxesOf, electiveBoxIds, migrateAssignments, ownerOf, placeHalves } from "@/lib/electiveBoxes";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AvailabilityStatus, CatalogPayload, ElectiveAssignment } from "@/lib/types";
import {
  catalogCodesOf,
  courseAvailability,
  creditsSummary,
  downstreamOf,
  upstreamOf,
} from "@/lib/availability";
import {
  buildShareUrl,
  loadApprovedFromHash,
  loadApprovedFromStorage,
  loadAttestationsFromHash,
  loadAttestationsFromStorage,
  loadElectivesFromHash,
  loadElectivesFromStorage,
  loadPlannedFromStorage,
  resetProgress,
  saveApprovedToStorage,
  saveAttestationsToStorage,
  saveElectivesToStorage,
  savePlannedToStorage,
  type ElectiveAssignments,
} from "@/lib/persistence";
import GradoChecklist from "./explorer/GradoChecklist";
import TopBar from "./explorer/TopBar";
import Toolbar, { type StatusFilter } from "./explorer/Toolbar";
import MapCanvas, { type RelacionesMode } from "./explorer/MapCanvas";
import SidePanel from "./explorer/SidePanel";
import PlannerPanel from "./explorer/PlannerPanel";
import BasketModal from "./explorer/BasketModal";
import AvanceWelcome from "./explorer/AvanceWelcome";
import { DEFAULT_REL_VIEW, deriveUnlockView, readStoredRelView, writeStoredRelView, type RelView } from "./explorer/UnlockViewControl";
import { HintPill } from "./explorer/OnboardingPanel";
import Tour from "./explorer/Tour";
import IntroModal from "./explorer/IntroModal";
import RefresherToast from "./explorer/RefresherToast";
import QuickChooser from "./explorer/QuickChooser";
import { BasketIcon } from "./explorer/icons";
import { exploreSteps, avanceSteps, TOUR_INTRO, TOUR_LABEL, type TourKind } from "./explorer/tours";
import SetupSheet from "./explorer/SetupSheet";
import { groupOf, toSentenceCase, type CourseGroup } from "./explorer/format";
import "./explorer/tokens.css";
import styles from "./explorer/explorer.module.css";

interface Props {
  data: CatalogPayload;
  mihorarioUrl: string;
}

const INTRO_KEY = "pensum:intro-seen";
const REFRESHER_KEY = "pensum:refresher-shown"; // sessionStorage: once per browser session

const EMPTY_IDS: Set<string> = new Set();

export default function PensumExplorer({ data, mihorarioUrl }: Props) {
  // API preflight: when the course API errors, planning is disabled rather
  // than giving partial or wrong answers (it unblocks itself when it returns)
  const oferta = useOfertaStatus();
  const planningBlocked = oferta === "down";
  const slug = data.catalog.slug;
  const rules = data.rules;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<"explore" | "progress">(() =>
    searchParams.get("modo") === "avance" ? "progress" : "explore"
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [gradoOpen, setGradoOpen] = useState(false);
  const [relaciones, setRelaciones] = useState<RelacionesMode>("directas");
  // forward direction (what a course unlocks): a preference, OFF by default
  const [relView, setRelView] = useState<RelView>(DEFAULT_REL_VIEW);
  const [hiddenGroups, setHiddenGroups] = useState<Set<CourseGroup>>(new Set());
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<StatusFilter>>(new Set());
  const [quickMode, setQuickMode] = useState(false);
  const [staged, setStaged] = useState<Set<string>>(new Set());
  const [justUnlocked, setJustUnlocked] = useState<Set<string>>(new Set());
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [assignments, setAssignments] = useState<ElectiveAssignments>({});
  const [attestationsMet, setAttestationsMet] = useState<Set<string>>(new Set());
  const [planned, setPlanned] = useState<Map<string, string>>(new Map());
  // what the last "selección rápida por semestre" marked, so the next one replaces it
  const [quickMarked, setQuickMarkedState] = useState<Set<string>>(new Set());
  const setQuickMarked = useCallback(
    (s: Set<string>) => {
      setQuickMarkedState(s);
      try {
        localStorage.setItem(`pensum:${slug}:quick-marked`, JSON.stringify([...s]));
      } catch {
        /* ignore */
      }
    },
    [slug]
  );
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  // first visit: a centred welcome that leads into the Mi avance guide;
  // returning students: a timed "¿necesitas un repaso?" once per session
  const [introOpen, setIntroOpen] = useState(false);
  const [refresherOpen, setRefresherOpen] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupSeen, setSetupSeen] = useState(true); // true until hydrated, so it never flashes
  const [setupPreviewIds, setSetupPreviewIds] = useState<string[]>([]);
  const [tour, setTour] = useState<{ kind: TourKind; step: number } | null>(null);
  const [exploreTourDone, setExploreTourDone] = useState(true); // true until hydrated, so it never flashes
  const [avanceTourDone, setAvanceTourDone] = useState(true);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [setupSemester, setSetupSemester] = useState<number | null>(null);
  const [basketOpen, setBasketOpen] = useState(false);
  const [basketFocusId, setBasketFocusId] = useState<string | null>(null);
  const [setupFirstTime, setSetupFirstTime] = useState(true);

  useEffect(() => {
    try {
      setRelaciones((localStorage.getItem(`pensum:${slug}:relaciones`) as RelacionesMode) || "directas");
    } catch {
      /* ignore */
    }
  }, [slug]);
  useEffect(() => {
    setRelView(readStoredRelView());
  }, []);
  const handleRelViewChange = useCallback((v: RelView) => {
    setRelView(v);
    writeStoredRelView(v);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(`pensum:${slug}:relaciones`, relaciones);
    } catch {
      /* ignore */
    }
  }, [relaciones, slug]);

  useEffect(() => {
    setApproved(loadApprovedFromHash() ?? loadApprovedFromStorage(slug));
    // older saves (one box = one course) get half-box positions
    setAssignments(migrateAssignments(electiveBoxIds(data.courses), loadElectivesFromHash() ?? loadElectivesFromStorage(slug)));
    setAttestationsMet(loadAttestationsFromHash() ?? loadAttestationsFromStorage(slug));
    // drop plans for terms that have already started — a plan only makes sense
    // for the upcoming semester (plan codes sort chronologically)
    const upcoming = planTerm();
    setPlanned(
      new Map(Object.entries(loadPlannedFromStorage(slug)).filter(([, t]) => t >= upcoming))
    );
    try {
      setSetupSeen(localStorage.getItem(`pensum:${slug}:setup-seen`) === "1");
      setQuickMarkedState(new Set(JSON.parse(localStorage.getItem(`pensum:${slug}:quick-marked`) ?? "[]") as string[]));
      const exploreDone = localStorage.getItem("pensum:tour-completed") === "1";
      const avanceDone = localStorage.getItem("pensum:avance-tour-completed") === "1";
      setExploreTourDone(exploreDone);
      setAvanceTourDone(avanceDone);
      const newcomer = localStorage.getItem(INTRO_KEY) !== "1" && !exploreDone && !avanceDone;
      if (newcomer) setIntroOpen(true);
      else if (sessionStorage.getItem(REFRESHER_KEY) !== "1") {
        sessionStorage.setItem(REFRESHER_KEY, "1");
        setRefresherOpen(true);
      }
    } catch {
      setSetupSeen(false);
      setExploreTourDone(false);
      setAvanceTourDone(false);
    }
    setHydrated(true);
  }, [slug]);

  useEffect(() => {
    if (hydrated) saveApprovedToStorage(slug, approved);
  }, [approved, hydrated, slug]);
  useEffect(() => {
    if (hydrated) saveElectivesToStorage(slug, assignments);
  }, [assignments, hydrated, slug]);
  useEffect(() => {
    if (hydrated) saveAttestationsToStorage(slug, attestationsMet);
  }, [attestationsMet, hydrated, slug]);
  useEffect(() => {
    if (hydrated) savePlannedToStorage(slug, Object.fromEntries(planned));
  }, [planned, hydrated, slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // half-box electives (lib/electiveBoxes.ts): elective boxes keep "2 cr" and
  // their name; what fills each half is drawn on the card. Other slots (EFI,
  // CI…) take the chosen course's name and credits, as before.
  const boxIds = useMemo(() => electiveBoxIds(data.courses), [data.courses]);
  const boxSet = useMemo(() => new Set(boxIds), [boxIds]);
  const halvesByBox = useMemo(() => boxHalves(boxIds, assignments), [boxIds, assignments]);
  const courses = useMemo(
    () =>
      data.courses.map((c) => {
        const a = assignments[c.id];
        if (!a || boxSet.has(c.id)) return c;
        return { ...c, name: a.title, credits: a.credits ?? c.credits };
      }),
    [data.courses, assignments, boxSet]
  );
  // credit accounting: a box counts what fills it (1 per occupied half, plus
  // the course's overflow on its first box; 2 when empty) — so a course's real
  // credits count once, and boxes still read "2 cr"
  const creditCourses = useMemo(() => {
    const cr = boxCredits(boxIds, assignments);
    return courses.map((c) => (cr.has(c.id) ? { ...c, credits: cr.get(c.id)! } : c));
  }, [courses, boxIds, assignments]);
  // the cart / checkout see a NAMED elective as the real course (its code →
  // live sections); a box that only continues a course is listed with its first box
  const basketCourses = useMemo(
    () =>
      courses.flatMap((c) => {
        if (!c.isPlaceholder) return [c];
        const owner = ownerOf(c.id, assignments);
        const a = owner ? assignments[owner] : undefined;
        if (!a) return [c];
        if (boxSet.has(c.id) && (boxesOf(a)[0] ?? owner) !== c.id) return [];
        const named = { ...c, name: a.title, credits: a.credits ?? c.credits };
        if (!a.code) return [named];
        return [
          {
            ...named,
            isPlaceholder: false,
            code: a.code.replace(/^([A-Z]+)(\d)/, "$1 $2"),
            codeNormalized: a.code,
            prereqTree: null,
            prereqCourseIds: [],
            coreqExternal: [],
            coreqText: "",
          },
        ];
      }),
    [courses, assignments, boxSet]
  );
  /** the boxes a box shares a course with (itself included) */
  const boxGroup = useCallback(
    (id: string): string[] => {
      if (!boxSet.has(id)) return [id];
      const owner = ownerOf(id, assignments);
      return owner ? boxesOf(assignments[owner]) : [id];
    },
    [boxSet, assignments]
  );

  const catalogCodes = useMemo(() => catalogCodesOf(courses), [courses]);

  // the tour's example course: the real course most others lean on, so
  // "qué necesito / se me habilita / depende" all have something to show
  const tourAnchorCourse = useMemo(() => {
    const dependents = new Map<string, number>();
    for (const c of courses) for (const p of c.prereqCourseIds) dependents.set(p, (dependents.get(p) ?? 0) + 1);
    let best: (typeof courses)[number] | null = null;
    for (const c of courses) {
      if (c.isPlaceholder || c.prereqCourseIds.length === 0) continue;
      const n = dependents.get(c.id) ?? 0;
      if (!best || n > (dependents.get(best.id) ?? 0)) best = c;
    }
    return best ?? courses.find((c) => !c.isPlaceholder) ?? null;
  }, [courses]);
  const selectedCourse = useMemo(() => courses.find((c) => c.id === selectedId) ?? null, [courses, selectedId]);

  const effectiveApproved = useMemo(() => {
    const extra = courses.filter((c) => c.requirementAttestationId && attestationsMet.has(c.requirementAttestationId));
    if (extra.length === 0) return approved;
    return new Set([...approved, ...extra.map((c) => c.id)]);
  }, [approved, attestationsMet, courses]);

  const effectiveApprovedPlusPlanned = useMemo(
    () => new Set([...effectiveApproved, ...planned.keys()]),
    [effectiveApproved, planned]
  );

  const creditsDone = useMemo(() => creditsSummary(creditCourses, effectiveApproved).done, [creditCourses, effectiveApproved]);
  const creditsTotal = useMemo(() => creditsSummary(courses, effectiveApproved).total, [courses, effectiveApproved]);

  const ruleCtx = useMemo(() => ({ rules, attestationsMet, approvedCredits: creditsDone }), [rules, attestationsMet, creditsDone]);

  // ONB-10: while the setup sheet is open, preview its selection on the map
  // instead of the real (still-empty) approved set — nothing is saved until
  // the sheet's primary action.
  const statusApprovedSet = useMemo(() => {
    if (!setupOpen) return effectiveApproved;
    // preview of a replacing quick selection: drop what the last one marked
    const keep = new Set(setupPreviewIds);
    return new Set([...[...effectiveApproved].filter((id) => !quickMarked.has(id) || keep.has(id)), ...setupPreviewIds]);
  }, [setupOpen, effectiveApproved, setupPreviewIds, quickMarked]);

  const plannedSet = useMemo(() => new Set(planned.keys()), [planned]);
  // lib/planning.ts: "available now" = prerequisites approved, corequisites
  // (and "*" prerequisites) approved or in the cart. The market reads it live,
  // so putting Variable Compleja in the cart opens Elementos right away.
  const planCtx = useMemo<PlanContext>(
    () => ({ approved: statusApprovedSet, cart: plannedSet, courses: creditCourses, catalogCodes, rules, attestationsMet }),
    [statusApprovedSet, plannedSet, creditCourses, catalogCodes, rules, attestationsMet]
  );
  const plan = useMemo(() => planner(planCtx), [planCtx]);
  // the same context with the REAL approved set (not the setup-sheet preview)
  const realPlanCtx = useMemo<PlanContext>(() => ({ ...planCtx, approved: effectiveApproved }), [planCtx, effectiveApproved]);
  // elective slots: enabled when one of their courses can be taken now
  const slotOpen = useMemo(
    () =>
      slotOpenMap(courses, data.electives, data.catalog.programCode, {
        approved: statusApprovedSet,
        cart: plannedSet,
        catalogCodes,
        approvedCredits: plan.creditsA,
        pregrado: takesPregradoDefaults(data.catalog),
      }),
    [courses, data.electives, data.catalog.programCode, statusApprovedSet, plannedSet, catalogCodes, plan.creditsA]
  );

  const { statusById, lockedIds } = useMemo(() => {
    const statusById = new Map<string, AvailabilityStatus>();
    const lockedIds = new Set<string>();
    for (const c of courses) {
      // Mi avance is two-state for the student (variant A of F-6)
      const s = plan.stateIgnoringCart(c);
      statusById.set(c.id, s === "approved" ? "approved" : s === "now" ? "available" : "blocked");
      if (s !== "approved" && plan.now(c).gateReasons.length > 0) lockedIds.add(c.id);
    }
    for (const [id, open] of slotOpen) if (!open && statusById.get(id) !== "approved") statusById.set(id, "blocked");
    return { statusById, lockedIds };
  }, [courses, plan, slotOpen]);

  const matchedIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hasQuery = q.length > 0;
    const hasGroupFilter = mode === "explore" && hiddenGroups.size > 0;
    const hasStatusFilter = mode === "progress" && hiddenStatuses.size > 0;
    if (!hasQuery && !hasGroupFilter && !hasStatusFilter) return null;

    const set = new Set<string>();
    for (const c of courses) {
      if (hasQuery) {
        const hit = c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
        if (!hit) continue;
      }
      if (hasGroupFilter && hiddenGroups.has(groupOf(c))) continue;
      if (hasStatusFilter) {
        const status = statusById.get(c.id);
        const asFilter: StatusFilter | null = lockedIds.has(c.id) ? "admin" : (status as StatusFilter) ?? null;
        if (asFilter && hiddenStatuses.has(asFilter)) continue;
      }
      set.add(c.id);
    }
    return set;
  }, [courses, query, mode, hiddenGroups, hiddenStatuses, statusById, lockedIds]);

  const selectedAvailability = useMemo(() => {
    if (!selectedCourse) return null;
    return courseAvailability(selectedCourse, effectiveApproved, catalogCodes, courses, ruleCtx);
  }, [selectedCourse, effectiveApproved, catalogCodes, courses, ruleCtx]);

  // A course may go in the cart without its requirements (homologations):
  // the panel warns ("Ojo: no has aprobado …") instead of refusing. Only an
  // admin gate keeps it out.
  const selectedPlannable = !!selectedCourse;
  const selectedPlanWarning = useMemo(() => {
    if (!selectedCourse || selectedCourse.isPlaceholder) return [];
    const chk = plan.now(selectedCourse);
    if (chk.ok) return [];
    const byCode = new Map(courses.map((c) => [c.codeNormalized, c]));
    const names = [...chk.missing, ...chk.coMissing.map((id) => courses.find((c) => c.id === id)?.codeNormalized ?? id)].map(
      (code) => byCode.get(code)?.name ?? code
    );
    if (chk.creditsShort > 0) names.push(`${selectedCourse.minCredits} créditos aprobados`);
    return names;
  }, [selectedCourse, plan, courses]);

  // "Qué se me habilita": the selected course added to approved ∪ cart
  const habilita = useMemo(() => {
    if (!selectedCourse || selectedCourse.isPlaceholder) return undefined;
    const w = wouldEnable(selectedCourse, realPlanCtx);
    const m = new Map<string, "now" | "next">();
    for (const x of w.sameSemester) m.set(x.course.id, "now");
    for (const x of w.nextSemester) m.set(x.course.id, "next");
    return m;
  }, [selectedCourse, realPlanCtx]);

  const directDependentIds = useMemo(() => {
    if (!selectedCourse) return [];
    return courses.filter((c) => c.prereqCourseIds.includes(selectedCourse.id)).map((c) => c.id);
  }, [courses, selectedCourse]);

  // A11Y-05: polite live-region announcement on selection.
  const [liveMessage, setLiveMessage] = useState("");
  useEffect(() => {
    if (!selectedCourse) return;
    const n = selectedCourse.prereqCourseIds.length;
    const m = directDependentIds.length;
    setLiveMessage(
      `${toSentenceCase(selectedCourse.name)} seleccionado. ${n} requisito${n === 1 ? "" : "s"}, lo piden ${m}.`
    );
  }, [selectedCourse, directDependentIds]);

  const chainExtraCount = useMemo(() => {
    if (!selectedCourse || relaciones !== "cadena") return 0;
    const all = upstreamOf(courses, selectedCourse.id);
    return Math.max(0, all.size - selectedCourse.prereqCourseIds.length);
  }, [courses, selectedCourse, relaciones]);

  const statusCounts = useMemo(() => {
    const out: Record<StatusFilter, number> = { approved: 0, available: 0, "one-away": 0, blocked: 0, admin: 0 };
    for (const c of courses) {
      if (c.isPlaceholder) continue;
      if (lockedIds.has(c.id)) {
        out.admin += 1;
        continue;
      }
      const s = statusById.get(c.id);
      if (s) out[s === "one-away" ? "blocked" : (s as StatusFilter)] += 1;
    }
    return out;
  }, [courses, statusById, lockedIds]);

  // checkout step 0 (lib/planning.ts): same-semester (by corequisite) and
  // next-semester courses for the current cart
  const zero = useMemo(() => (planned.size === 0 ? { sameSemester: [], nextSemester: [] } : stepZero(realPlanCtx)), [planned.size, realPlanCtx]);

  // "La vas a poder ver" markers: set when checkout step 0 is shown, tied to
  // the cart that produced them, so they never show a stale result.
  const cartKey = useMemo(() => [...plannedSet].sort().join(","), [plannedSet]);
  const [nextMarks, setNextMarks] = useState<{ cartKey: string; ids: Set<string> } | null>(null);
  const nextIds = useMemo(() => (nextMarks && nextMarks.cartKey === cartKey ? nextMarks.ids : EMPTY_IDS), [nextMarks, cartKey]);
  const handleStepZeroShown = useCallback(() => {
    setNextMarks({ cartKey, ids: new Set(zero.nextSemester.map((x) => x.course.id)) });
  }, [cartKey, zero]);

  const tourSteps = useMemo(
    () => (!tour ? [] : tour.kind === "explore" ? exploreSteps(tourAnchorCourse?.id ?? null) : avanceSteps()),
    [tour?.kind, tourAnchorCourse] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const finishTour = useCallback(() => {
    const kind = tour?.kind;
    try {
      if (kind === "avance") localStorage.setItem("pensum:avance-tour-completed", "1");
      else localStorage.setItem("pensum:tour-completed", "1");
    } catch {
      /* ignore */
    }
    if (kind === "avance") setAvanceTourDone(true);
    else setExploreTourDone(true);
    setTour(null);
    // the guide showed what to do; now the student picks where to start
    if (kind === "avance" && !setupSeen && approved.size === 0 && planned.size === 0) {
      setSetupFirstTime(true);
      setWelcomeOpen(true);
    }
  }, [tour?.kind, setupSeen, approved, planned]);
  const startTour = useCallback((kind: TourKind) => {
    setRefresherOpen(false);
    setHintDismissed(true);
    setChooserOpen(false);
    setWelcomeOpen(false);
    setTour({ kind, step: 0 });
  }, []);
  const closeRefresher = useCallback(() => setRefresherOpen(false), []);
  const jumpTour = useCallback((step: number) => {
    setTour((cur) => (cur ? { ...cur, step } : cur));
  }, []);
  const nextTour = useCallback(() => {
    if (!tour) return;
    if (tour.step + 1 >= tourSteps.length) finishTour();
    else setTour({ ...tour, step: tour.step + 1 });
  }, [tour, tourSteps.length, finishTour]);
  const prevTour = useCallback(() => {
    setTour((cur) => (cur && cur.step > 0 ? { ...cur, step: cur.step - 1 } : cur));
  }, []);

  // Each step puts the UI in the state it spotlights (a course selected, the
  // side panel open, the right mode...), so it works no matter what the user had
  // open - the tour never depends on them opening the panel themselves.
  useEffect(() => {
    if (!tour) return;
    const id = tourSteps[tour.step]?.id;
    setChooserOpen(false);
    setQuickMode(false);
    setStaged(new Set());
    setSetupOpen(false);
    setSetupPreviewIds([]);
    const wantMode = tour.kind === "explore" ? "explore" : "progress";
    setMode(wantMode);
    router.replace(wantMode === "progress" ? `${pathname}?modo=avance` : pathname, { scroll: false });
    if (tour.kind === "explore") {
      const anchor = tourAnchorCourse?.id ?? null;
      const withCourse = id === "select" || id === "reltoggle" || id === "relaciones" || id === "legend" || id === "panel";
      setSelectedId(withCourse ? anchor : null);
      setPanelOpen(id === "panel");
    } else {
      // the relation selector only exists while a course is selected
      setSelectedId(id === "reltoggle" ? (tourAnchorCourse?.id ?? null) : null);
      setPanelOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour?.kind, tour?.step]);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === "") {
        if (!quickMode) setSelectedId(null);
        return;
      }
      if (quickMode) {
        const c = data.courses.find((x) => x.id === id);
        if (!c || c.requirementAttestationId || approved.has(id)) return;
        setStaged((prev) => {
          const next = new Set(prev);
          next.has(id) ? next.delete(id) : next.add(id);
          return next;
        });
        return;
      }
      setSelectedId((prev) => (prev === id ? null : id));
      setPanelOpen(true);
      setHintDismissed(true);
    },
    [quickMode, approved, data.courses]
  );

  // Seleccion rapida has two paths. The button opens a chooser; "por semestre"
  // reuses the setup sheet, "herramienta" is the click-each-course staging mode.
  const startQuickTool = useCallback(() => {
    setChooserOpen(false);
    setMode("progress");
    router.replace(`${pathname}?modo=avance`, { scroll: false });
    setSelectedId(null);
    setPanelOpen(false);
    setStaged(new Set());
    setQuickMode(true);
  }, [router, pathname]);

  const handleQuickToggle = useCallback(() => {
    if (quickMode) {
      setStaged(new Set());
      setQuickMode(false);
    } else {
      setChooserOpen(true);
    }
  }, [quickMode]);

  const startQuickBySemester = useCallback(() => {
    setChooserOpen(false);
    setSelectedId(null);
    setPanelOpen(false);
    setSetupFirstTime(false);
    setSetupSemester(null);
    setSetupOpen(true);
  }, []);

  const handleQuickFinish = useCallback(() => {
    const nextApproved = new Set([...approved, ...staged]);
    const nextEffective = new Set([...effectiveApproved, ...staged]);
    const unlocked = new Set<string>();
    for (const c of courses) {
      if (nextEffective.has(c.id)) continue;
      if (statusById.get(c.id) === "available") continue;
      const now = courseAvailability(c, nextEffective, catalogCodes, courses, ruleCtx).status;
      if (now === "available") unlocked.add(c.id);
    }
    setApproved(nextApproved);
    setStaged(new Set());
    setQuickMode(false);
    if (unlockTimer.current) clearTimeout(unlockTimer.current);
    if (unlocked.size > 0) {
      setJustUnlocked(unlocked);
      unlockTimer.current = setTimeout(() => setJustUnlocked(new Set()), 5600);
      // CARD-14: polite announcement of what just became available.
      const names = courses.filter((c) => unlocked.has(c.id)).map((c) => c.code);
      setLiveMessage(`Se desbloquearon ${unlocked.size} curso${unlocked.size === 1 ? "" : "s"}: ${names.join(", ")}.`);
    } else {
      setJustUnlocked(new Set());
    }
  }, [approved, effectiveApproved, staged, courses, statusById, catalogCodes, ruleCtx]);

  useEffect(() => () => { if (unlockTimer.current) clearTimeout(unlockTimer.current); }, []);

  // a course spanning several elective boxes is seen / planned as a whole
  function handleToggleApproved(id: string) {
    const group = boxGroup(id);
    setApproved((prev) => {
      const next = new Set(prev);
      const on = !next.has(id);
      for (const g of group) on ? next.add(g) : next.delete(g);
      return next;
    });
    setPlanned((prev) => {
      if (!group.some((g) => prev.has(g))) return prev;
      const next = new Map(prev);
      for (const g of group) next.delete(g);
      return next;
    });
  }

  const handleTogglePlanned = useCallback(
    (id: string, term: string | null) => {
      const group = boxGroup(id);
      setPlanned((prev) => {
        const next = new Map(prev);
        for (const g of group) term ? next.set(g, term) : next.delete(g);
        return next;
      });
    },
    [boxGroup]
  );

  const handleAssignElective = useCallback(
    (slotId: string, assignment: ElectiveAssignment | null) => {
      setAssignments((prev) => {
        const next = { ...prev };
        if (!boxSet.has(slotId)) {
          if (assignment) next[slotId] = assignment;
          else delete next[slotId];
          return next;
        }
        // elective box: replace whatever covers it, then fill halves from here
        const owner = ownerOf(slotId, prev);
        const anchor = owner ?? slotId;
        if (owner) delete next[owner];
        if (assignment) {
          const { halves, overflow } = placeHalves(boxIds, next, anchor, assignment.credits ?? 2);
          next[anchor] = { ...assignment, halves, overflow };
        }
        return next;
      });
    },
    [boxSet, boxIds]
  );

  const handleToggleAttestation = useCallback((id: string) => {
    setAttestationsMet((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  function handleToggleGroup(g: CourseGroup) {
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }
  function handleToggleStatus(s: StatusFilter) {
    setHiddenStatuses((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }

  async function handleShare() {
    const url = buildShareUrl(approved, assignments, attestationsMet);
    try {
      await navigator.clipboard.writeText(url);
      setShareFeedback("¡Enlace copiado!");
    } catch {
      setShareFeedback("No se pudo copiar");
    }
    setTimeout(() => setShareFeedback(null), 2000);
  }

  function handleReset() {
    const ok = window.confirm(
      "¿Reiniciar todo tu avance en este plan? Se borran las materias marcadas, las electivas asignadas, tu plan de semestre y los requisitos marcados."
    );
    if (!ok) return;
    setApproved(new Set());
    setAssignments({});
    setAttestationsMet(new Set());
    setPlanned(new Map());
    setJustUnlocked(new Set());
    resetProgress(slug);
    setQuickMarked(new Set());
    setSelectedId(null);
    setPanelOpen(false);
  }

  // the switcher lists every plan in the shared order (the current one included)
  const planOptions = useMemo(
    () =>
      sortCatalogs([
        { slug, programName: data.catalog.programName, variantLabel: data.catalog.variantLabel },
        ...data.siblings.map((s) => ({ slug: s.slug, programName: s.programName, variantLabel: s.variantLabel })),
      ]),
    [slug, data.catalog.programName, data.catalog.variantLabel, data.siblings]
  );

  const accent = data.catalog.accentColor ?? "#1f6fc4";
  const showCoursePanel = !quickMode && !!selectedCourse && panelOpen;
  const showSetup = !quickMode && !selectedCourse && mode === "progress" && setupOpen;
  const showPlanner = !quickMode && !selectedCourse && mode === "progress" && !setupOpen;

  // Landing straight on Mi avance (e.g. a shared ?modo=avance link) with nothing
  // saved is also a first visit — the student never saw the Explorar tour.
  useEffect(() => {
    if (hydrated && !introOpen && mode === "progress" && !setupSeen && approved.size === 0 && planned.size === 0 && tour === null) {
      setSetupFirstTime(true);
      setWelcomeOpen(true);
    }
    // only on hydration; later changes are handled by handleModeChange
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // welcome -> chosen path. Any dismissal counts as "seen" so it never nags.
  const closeWelcome = useCallback(() => {
    setWelcomeOpen(false);
    setSetupSeen(true);
    try {
      localStorage.setItem(`pensum:${slug}:setup-seen`, "1");
    } catch {
      /* ignore */
    }
  }, [slug]);

  const markSetupSeen = useCallback(() => {
    const wasFirst = setupFirstTime;
    setSetupSeen(true);
    setSetupOpen(false);
    setSetupPreviewIds([]);
    if (wasFirst && !avanceTourDone) setTimeout(() => startTour("avance"), 350);
    try {
      localStorage.setItem(`pensum:${slug}:setup-seen`, "1");
    } catch {
      /* ignore */
    }
  }, [slug, setupFirstTime, avanceTourDone, startTour]);

  const handleModeChange = useCallback(
    (m: "explore" | "progress") => {
      setMode(m);
      if (m === "explore") {
        setQuickMode(false);
        setStaged(new Set());
      } else if (!setupSeen && approved.size === 0 && planned.size === 0) {
        // ONB-09: first-ever switch to Mi avance with nothing saved yet: a clear
        // welcome modal first (the sidebar setup only follows a chosen path)
        setSetupFirstTime(true);
        setWelcomeOpen(true);
      } else if (!avanceTourDone && tour === null) {
        // returning student's first look at Mi avance: offer the step-by-step guide
        setTimeout(() => startTour("avance"), 350);
      }
      router.replace(m === "progress" ? `${pathname}?modo=avance` : pathname, { scroll: false });
    },
    [router, pathname, setupSeen, approved, planned, avanceTourDone, tour, startTour]
  );

  const handleSetupConfirm = useCallback(
    (ids: string[]) => {
      // a quick selection REPLACES the previous one: what it marked and the
      // new one doesn't is unmarked; manual unmarks inside the range are
      // re-marked; marks it never made (courses seen out of order) are kept
      const selection = new Set(ids);
      const dropped = [...quickMarked].filter((id) => !selection.has(id));
      const nextApproved = new Set([...approved].filter((id) => !dropped.includes(id)));
      for (const id of ids) nextApproved.add(id);
      const nextEffective = new Set([...[...effectiveApproved].filter((id) => !dropped.includes(id)), ...ids]);
      setQuickMarked(selection);
      const unlocked = new Set<string>();
      for (const c of courses) {
        if (nextEffective.has(c.id)) continue;
        if (statusById.get(c.id) === "available") continue;
        const now = courseAvailability(c, nextEffective, catalogCodes, courses, ruleCtx).status;
        if (now === "available") unlocked.add(c.id);
      }
      setApproved(nextApproved);
      markSetupSeen();
      if (unlockTimer.current) clearTimeout(unlockTimer.current);
      if (unlocked.size > 0) {
        setJustUnlocked(unlocked);
        unlockTimer.current = setTimeout(() => setJustUnlocked(new Set()), 5600);
      }
    },
    [approved, effectiveApproved, courses, statusById, catalogCodes, ruleCtx, markSetupSeen, quickMarked, setQuickMarked]
  );

  return (
    <div className={styles.shell} style={{ ["--accent" as string]: accent }}>
      <div aria-live="polite" className={styles.srOnly}>
        {liveMessage}
      </div>
      <TopBar
        slug={slug}
        programName={data.catalog.programName}
        variantLabel={data.catalog.variantLabel}
        planOptions={planOptions}
        mode={mode}
        onModeChange={handleModeChange}
        query={query}
        onQueryChange={setQuery}
        attestations={rules.attestations}
        attestationsMet={attestationsMet}
        onOpenGrado={() => setGradoOpen(true)}
        onHelp={() => startTour(mode === "progress" ? "avance" : "explore")}
        onShare={handleShare}
        shareFeedback={shareFeedback}
      />

      {gradoOpen && (
        <GradoChecklist
          attestations={rules.attestations}
          attestationsMet={attestationsMet}
          onToggle={handleToggleAttestation}
          onClose={() => setGradoOpen(false)}
        />
      )}

      <Toolbar
        mode={mode}
        hiddenGroups={hiddenGroups}
        onToggleGroup={handleToggleGroup}
        relaciones={relaciones}
        unlockView={deriveUnlockView(relView)}
        onRelacionesChange={setRelaciones}
        statusCounts={statusCounts}
        hiddenStatuses={hiddenStatuses}
        onToggleStatus={handleToggleStatus}
        quickMode={quickMode}
        onQuickToggle={handleQuickToggle}
        onReset={handleReset}
      />

      {oferta === "down" && (
        <div className={styles.ofertaDown} role="alert">
          <strong>La oferta en línea no está disponible en este momento.</strong>{" "}
          {mode === "progress"
            ? "Para no darte información errónea, la planeación (canasta, horarios y qué se te habilita) está deshabilitada por ahora. Puedes seguir marcando lo que ya viste."
            : "Estás viendo los datos guardados del programa y de Registro; la planeación en Mi avance vuelve sola cuando la oferta responda."}{" "}
          <a href={FALLBACK_GUIDE_URL} target="_blank" rel="noopener noreferrer">
            Ver la guía para armar tu horario →
          </a>
        </div>
      )}

      {quickMode && (
        <div style={{ padding: "8px 20px", background: "#f0fdf4", borderBottom: "1px solid #86efac", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 12.5, color: "#166534" }}>
            Marca los cursos que ya viste (aunque no dependan entre sí), luego confirma.
          </span>
          <button className={styles.btnPrimary} style={{ flex: "none", background: "var(--st-ok)" }} disabled={staged.size === 0} onClick={handleQuickFinish}>
            Terminar{staged.size > 0 ? ` (${staged.size})` : ""}
          </button>
          <button className={styles.btnGhostFooter} style={{ flex: "none" }} onClick={() => { setStaged(new Set()); setQuickMode(false); }}>
            Cancelar
          </button>
        </div>
      )}

      <main className={styles.main}>
        <MapCanvas
          courses={courses}
          mode={mode}
          selectedId={selectedId}
          hoveredId={hoveredId}
          matchedIds={matchedIds}
          statusById={statusById}
          lockedIds={lockedIds}
          plannedIds={planned}
          stagedIds={staged}
          justUnlockedIds={justUnlocked}
          nextIds={nextIds}
          habilita={habilita}
          halvesByBox={halvesByBox}
          quickMode={quickMode}
          relaciones={relaciones}
          view={relView}
          onViewChange={handleRelViewChange}
          panelOpen={showCoursePanel || showPlanner || showSetup}
          onSelect={handleSelect}
          onHover={setHoveredId}
        />

        {!hintDismissed && !introOpen && !refresherOpen && tour === null && mode === "explore" && !selectedCourse && (
          <HintPill onStartTour={() => startTour("explore")} />
        )}

        {tour !== null && (
          <Tour
            steps={tourSteps}
            step={tour.step}
            label={TOUR_LABEL[tour.kind]}
            intro={TOUR_INTRO[tour.kind]}
            onNext={nextTour}
            onBack={prevTour}
            onJump={jumpTour}
            onSkip={finishTour}
          />
        )}

        {introOpen && (
          <IntroModal
            programName={data.catalog.programName}
            onStart={() => {
              try {
                localStorage.setItem(INTRO_KEY, "1");
              } catch {
                /* ignore */
              }
              setIntroOpen(false);
              startTour("avance");
            }}
          />
        )}

        {refresherOpen && tour === null && (
          <RefresherToast
            onTour={() => startTour(mode === "progress" ? "avance" : "explore")}
            onClose={closeRefresher}
          />
        )}

        {mode === "progress" && !quickMode && !setupOpen && !showPlanner && (
          <button
            type="button"
            className={styles.basketFab}
            onClick={() => {
              if (planned.size > 0 && !planningBlocked) {
                // the commitment moment: open the full checkout, focused on the
                // selected course when it's one of the basket's
                setBasketFocusId(selectedId && planned.has(selectedId) ? selectedId : null);
                setBasketOpen(true);
                return;
              }
              setSelectedId(null);
              setPanelOpen(false);
            }}
            aria-label={
              planned.size > 0
                ? `Revisar mi canasta: ${planned.size} curso${planned.size === 1 ? "" : "s"}`
                : "Ver mi canasta"
            }
            title={planned.size > 0 ? "Revisar y confirmar mi canasta" : "Ver mi canasta"}
          >
            <BasketIcon size={20} />
            <span className={styles.basketFabText}>
              <strong>{planned.size > 0 ? "Revisar mi canasta" : "Mi canasta"}</strong>
              <span>
                {planned.size} curso{planned.size === 1 ? "" : "s"} ·{" "}
                {courses.filter((c) => planned.has(c.id)).reduce((s, c) => s + c.credits, 0)} cr
              </span>
            </span>
            {planned.size > 0 && (
              <span key={planned.size} className={styles.basketCount}>
                {planned.size}
              </span>
            )}
          </button>
        )}

        {welcomeOpen && (
          <AvanceWelcome
            courses={courses}
            onStartFresh={closeWelcome}
            onPickSemester={(n) => {
              closeWelcome();
              setSetupSemester(n);
              setSetupFirstTime(true);
              setSetupOpen(true);
            }}
            onByCourse={() => {
              closeWelcome();
              startQuickTool();
            }}
            onLookAround={closeWelcome}
            onTour={() => {
              // keep "setup not seen": the welcome comes back after the guide
              setWelcomeOpen(false);
              startTour("avance");
            }}
          />
        )}

        {chooserOpen && (
          <QuickChooser onBySemester={startQuickBySemester} onByTool={startQuickTool} onClose={() => setChooserOpen(false)} />
        )}

        {selectedCourse && !panelOpen && (
          <button className={styles.panelReopen} onClick={() => setPanelOpen(true)} aria-label="Mostrar detalles" title="Mostrar detalles">
            ‹
          </button>
        )}

        {showCoursePanel && (
          <SidePanel
            course={selectedCourse}
            allCourses={courses}
            catalogCodes={catalogCodes}
            mode={mode}
            status={selectedAvailability?.status ?? null}
            plannable={selectedPlannable}
            planningBlocked={planningBlocked}
            cart={plannedSet}
            approvedCredits={plan.creditsA}
            planWarning={selectedPlanWarning}
            gateReasons={selectedAvailability?.gateReasons ?? []}
            directDependentIds={directDependentIds}
            chainExtraCount={chainExtraCount}
            approved={approved}
            isPlanned={selectedCourse ? planned.has(selectedCourse.id) : false}
            offering={selectedCourse ? data.offerings[selectedCourse.codeNormalized] : undefined}
            term={data.catalog.term}
            mihorarioUrl={mihorarioUrl}
            electives={data.electives}
            programCode={data.catalog.programCode}
            assignment={selectedCourse ? assignments[ownerOf(selectedCourse.id, assignments) ?? selectedCourse.id] : undefined}
            attestationsMet={attestationsMet}
            onToggleAttestation={handleToggleAttestation}
            onAssignElective={handleAssignElective}
            onToggleApproved={handleToggleApproved}
            onTogglePlanned={handleTogglePlanned}
            onOpenBasket={(id) => {
              setBasketFocusId(id);
              setBasketOpen(true);
            }}
            onSelectCourse={handleSelect}
            onCollapse={() => setPanelOpen(false)}
            onClose={() => { setSelectedId(null); setPanelOpen(false); }}
          />
        )}

        {showSetup && (
          <>
            <div className={styles.setupPreviewPill}>Vista previa: así quedaría tu mapa</div>
            <SetupSheet
              courses={courses}
              approved={effectiveApproved}
              onConfirm={handleSetupConfirm}
              onSkip={markSetupSeen}
              onBlank={markSetupSeen}
              onPreviewChange={setSetupPreviewIds}
              firstTime={setupFirstTime}
              initialSemester={setupSemester}
              onUseTool={() => {
                setSetupSeen(true);
                setSetupOpen(false);
                setSetupPreviewIds([]);
                startQuickTool();
              }}
            />
          </>
        )}

        {showPlanner && (
          <PlannerPanel
            planningBlocked={planningBlocked}
            courses={courses}
            approved={effectiveApproved}
            planned={planned}
            statusById={statusById}
            term={data.catalog.term}
            creditsDone={creditsDone}
            creditsTotal={creditsTotal}
            mihorarioUrl={mihorarioUrl}
            onTogglePlanned={handleTogglePlanned}
            onOpenBasket={() => {
              setBasketFocusId(null);
              setBasketOpen(true);
            }}
            onSelectCourse={handleSelect}
            onShare={handleShare}
          />
        )}
      </main>

      {basketOpen && !planningBlocked && (
        <BasketModal
          slug={slug}
          courses={basketCourses}
          planned={planned}
          approved={effectiveApproved}
          planTermCode={planTerm()}
          focusCourseId={basketFocusId}
          zero={zero}
          onAdd={(id) => handleTogglePlanned(id, planTerm())}
          onStepZeroShown={handleStepZeroShown}
          mihorarioUrl={mihorarioUrl}
          onClose={() => setBasketOpen(false)}
          onRemove={(id) => handleTogglePlanned(id, null)}
          onShare={handleShare}
        />
      )}
    </div>
  );
}
