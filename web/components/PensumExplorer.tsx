"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import GradoChecklist from "@/components/legacy/GradoChecklist";
import TopBar from "./explorer/TopBar";
import Toolbar, { type StatusFilter } from "./explorer/Toolbar";
import MapCanvas, { type RelacionesMode } from "./explorer/MapCanvas";
import SidePanel from "./explorer/SidePanel";
import PlannerPanel from "./explorer/PlannerPanel";
import OnboardingPanel, { HintPill } from "./explorer/OnboardingPanel";
import Tour from "./explorer/Tour";
import SetupSheet from "./explorer/SetupSheet";
import { groupOf, toSentenceCase, type CourseGroup } from "./explorer/format";
import "./explorer/tokens.css";
import styles from "./explorer/explorer.module.css";

interface Props {
  data: CatalogPayload;
  mihorarioUrl: string;
}

export default function PensumExplorer({ data, mihorarioUrl }: Props) {
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
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [onboardDismissed, setOnboardDismissed] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupSeen, setSetupSeen] = useState(true); // true until hydrated, so it never flashes
  const [setupPreviewIds, setSetupPreviewIds] = useState<string[]>([]);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [tourCompleted, setTourCompleted] = useState(true);

  useEffect(() => {
    try {
      setRelaciones((localStorage.getItem(`pensum:${slug}:relaciones`) as RelacionesMode) || "directas");
    } catch {
      /* ignore */
    }
  }, [slug]);
  useEffect(() => {
    try {
      localStorage.setItem(`pensum:${slug}:relaciones`, relaciones);
    } catch {
      /* ignore */
    }
  }, [relaciones, slug]);

  useEffect(() => {
    setApproved(loadApprovedFromHash() ?? loadApprovedFromStorage(slug));
    setAssignments(loadElectivesFromHash() ?? loadElectivesFromStorage(slug));
    setAttestationsMet(loadAttestationsFromHash() ?? loadAttestationsFromStorage(slug));
    setPlanned(new Map(Object.entries(loadPlannedFromStorage(slug))));
    try {
      setSetupSeen(localStorage.getItem(`pensum:${slug}:setup-seen`) === "1");
      setTourCompleted(localStorage.getItem("pensum:tour-completed") === "1");
    } catch {
      setSetupSeen(false);
      setTourCompleted(false);
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

  const courses = useMemo(
    () =>
      data.courses.map((c) => {
        const a = assignments[c.id];
        if (!a) return c;
        return { ...c, name: a.title, credits: a.credits ?? c.credits };
      }),
    [data.courses, assignments]
  );

  const catalogCodes = useMemo(() => catalogCodesOf(courses), [courses]);

  // §10.2 tour, step 1's spotlight target
  const tourAnchorCourse = useMemo(
    () => courses.find((c) => c.semester === 5 && !c.isPlaceholder) ?? courses.find((c) => !c.isPlaceholder) ?? null,
    [courses]
  );
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

  const { done: creditsDone, total: creditsTotal } = useMemo(() => creditsSummary(courses, effectiveApproved), [courses, effectiveApproved]);

  const ruleCtx = useMemo(() => ({ rules, attestationsMet, approvedCredits: creditsDone }), [rules, attestationsMet, creditsDone]);

  // ONB-10: while the setup sheet is open, preview its selection on the map
  // instead of the real (still-empty) approved set — nothing is saved until
  // the sheet's primary action.
  const statusApprovedSet = useMemo(
    () => (setupOpen ? new Set([...effectiveApproved, ...setupPreviewIds]) : effectiveApproved),
    [setupOpen, effectiveApproved, setupPreviewIds]
  );

  const { statusById, lockedIds } = useMemo(() => {
    const statusById = new Map<string, AvailabilityStatus>();
    const lockedIds = new Set<string>();
    for (const c of courses) {
      const a = courseAvailability(c, statusApprovedSet, catalogCodes, courses, ruleCtx);
      statusById.set(c.id, a.status);
      if (a.gateReasons.length > 0) lockedIds.add(c.id);
    }
    return { statusById, lockedIds };
  }, [courses, statusApprovedSet, catalogCodes, ruleCtx]);

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
      `${toSentenceCase(selectedCourse.name)} seleccionado. ${n} requisito${n === 1 ? "" : "s"}, desbloquea ${m}.`
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
      if (s) out[s as StatusFilter] += 1;
    }
    return out;
  }, [courses, statusById, lockedIds]);

  const unlockedNextTerm = useMemo(() => {
    if (planned.size === 0) return [];
    const out = [];
    for (const c of courses) {
      if (effectiveApprovedPlusPlanned.has(c.id)) continue;
      const before = courseAvailability(c, effectiveApproved, catalogCodes, courses, ruleCtx).status;
      if (before === "available") continue;
      const after = courseAvailability(c, effectiveApprovedPlusPlanned, catalogCodes, courses, ruleCtx).status;
      if (after === "available") out.push(c);
    }
    return out;
  }, [courses, planned, effectiveApproved, effectiveApprovedPlusPlanned, catalogCodes, ruleCtx]);

  const finishTour = useCallback(() => {
    setTourStep(null);
    setTourCompleted(true);
    try {
      localStorage.setItem("pensum:tour-completed", "1");
    } catch {
      /* ignore */
    }
  }, []);
  const startTour = useCallback(() => {
    setOnboardDismissed(true);
    setHintDismissed(true);
    setMode("explore");
    setSelectedId(null);
    setTourStep(0);
  }, []);
  const advanceTour = useCallback(
    (fromStep: number) => {
      setTourStep((cur) => {
        if (cur !== fromStep) return cur; // the real action didn't match the active step
        return cur + 1 > 3 ? null : cur + 1;
      });
      if (fromStep === 3) finishTour();
    },
    [finishTour]
  );

  const handleSelect = useCallback(
    (id: string) => {
      if (id === "") {
        if (!quickMode) setSelectedId(null);
        return;
      }
      if (quickMode) {
        const c = data.courses.find((x) => x.id === id);
        if (!c || c.isPlaceholder || approved.has(id)) return;
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
      if (tourStep === 0) advanceTour(0);
    },
    [quickMode, approved, data.courses, tourStep, advanceTour]
  );

  const handleQuickToggle = useCallback(() => {
    setQuickMode((on) => {
      if (on) {
        setStaged(new Set());
        return false;
      }
      setMode("progress");
      router.replace(`${pathname}?modo=avance`, { scroll: false });
      setSelectedId(null);
      setPanelOpen(false);
      setStaged(new Set());
      return true;
    });
  }, [router, pathname]);

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
      unlockTimer.current = setTimeout(() => setJustUnlocked(new Set()), 1900);
      // CARD-14: polite announcement of what just became available.
      const names = courses.filter((c) => unlocked.has(c.id)).map((c) => c.code);
      setLiveMessage(`Se desbloquearon ${unlocked.size} curso${unlocked.size === 1 ? "" : "s"}: ${names.join(", ")}.`);
    } else {
      setJustUnlocked(new Set());
    }
  }, [approved, effectiveApproved, staged, courses, statusById, catalogCodes, ruleCtx]);

  useEffect(() => () => { if (unlockTimer.current) clearTimeout(unlockTimer.current); }, []);

  function handleToggleApproved(id: string) {
    setApproved((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setPlanned((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  const handleTogglePlanned = useCallback((id: string, term: string | null) => {
    setPlanned((prev) => {
      const next = new Map(prev);
      if (term) next.set(id, term);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleAssignElective = useCallback((slotId: string, assignment: ElectiveAssignment | null) => {
    setAssignments((prev) => {
      const next = { ...prev };
      if (assignment) next[slotId] = assignment;
      else delete next[slotId];
      return next;
    });
  }, []);

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
    setSelectedId(null);
    setPanelOpen(false);
  }

  const planOptions = useMemo(
    () => [
      { slug, programName: data.catalog.programName, variantLabel: data.catalog.variantLabel },
      ...data.siblings.map((s) => ({ slug: s.slug, programName: s.programName, variantLabel: s.variantLabel })),
    ],
    [slug, data.catalog.programName, data.catalog.variantLabel, data.siblings]
  );

  const accent = data.catalog.accentColor ?? "#1f6fc4";
  const showCoursePanel = !quickMode && !!selectedCourse && panelOpen;
  const showEmptyPanel = !quickMode && !selectedCourse && mode === "explore" && !onboardDismissed;
  const showSetup = !quickMode && !selectedCourse && mode === "progress" && setupOpen;
  const showPlanner = !quickMode && !selectedCourse && mode === "progress" && !setupOpen;

  const markSetupSeen = useCallback(() => {
    setSetupSeen(true);
    setSetupOpen(false);
    setSetupPreviewIds([]);
    try {
      localStorage.setItem(`pensum:${slug}:setup-seen`, "1");
    } catch {
      /* ignore */
    }
  }, [slug]);

  const handleModeChange = useCallback(
    (m: "explore" | "progress") => {
      setMode(m);
      if (m === "explore") {
        setQuickMode(false);
        setStaged(new Set());
      } else if (!setupSeen && approved.size === 0 && planned.size === 0) {
        // ONB-09: first-ever switch to Mi avance with nothing saved yet
        setSetupOpen(true);
      }
      router.replace(m === "progress" ? `${pathname}?modo=avance` : pathname, { scroll: false });
      if (tourStep === 3) finishTour();
    },
    [router, pathname, setupSeen, approved, planned, tourStep]
  );

  const handleSetupConfirm = useCallback(
    (ids: string[]) => {
      const nextApproved = new Set([...approved, ...ids]);
      const nextEffective = new Set([...effectiveApproved, ...ids]);
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
        unlockTimer.current = setTimeout(() => setJustUnlocked(new Set()), 1900);
      }
    },
    [approved, effectiveApproved, courses, statusById, catalogCodes, ruleCtx, markSetupSeen]
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
        onHelp={startTour}
        onShare={handleShare}
        shareFeedback={shareFeedback}
        tourTargetMode={tourStep === 3}
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
        onRelacionesChange={(r) => {
          setRelaciones(r);
          if (tourStep === 1) advanceTour(1);
        }}
        statusCounts={statusCounts}
        hiddenStatuses={hiddenStatuses}
        onToggleStatus={handleToggleStatus}
        quickMode={quickMode}
        onQuickToggle={handleQuickToggle}
        onReset={handleReset}
        tourTargetRelaciones={tourStep === 1}
      />

      {quickMode && (
        <div style={{ padding: "8px 20px", background: "#f0fdf4", borderBottom: "1px solid #86efac", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 12.5, color: "#166534" }}>
            Marca los cursos que ya viste (aunque no dependan entre sí), luego confirma.
          </span>
          <button className={styles.btnPrimary} style={{ flex: "none", background: "#16a34a" }} disabled={staged.size === 0} onClick={handleQuickFinish}>
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
          quickMode={quickMode}
          relaciones={relaciones}
          panelOpen={showCoursePanel || showPlanner || showEmptyPanel || showSetup}
          tourAnchorId={tourStep === 0 ? tourAnchorCourse?.id ?? null : null}
          onSelect={handleSelect}
          onHover={setHoveredId}
        />

        {!hintDismissed && tourStep === null && mode === "explore" && !selectedCourse && (
          <HintPill onStartTour={startTour} />
        )}

        {tourStep !== null && (
          <Tour
            step={tourStep}
            onNext={() => advanceTour(tourStep)}
            onBack={() => setTourStep((s) => (s === null || s === 0 ? s : s - 1))}
            onSkip={finishTour}
          />
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
            assignment={selectedCourse ? assignments[selectedCourse.id] : undefined}
            attestationsMet={attestationsMet}
            onToggleAttestation={handleToggleAttestation}
            onAssignElective={handleAssignElective}
            onToggleApproved={handleToggleApproved}
            onTogglePlanned={handleTogglePlanned}
            onSelectCourse={handleSelect}
            onCollapse={() => setPanelOpen(false)}
            onClose={() => { setSelectedId(null); setPanelOpen(false); }}
            tourTargetChain={tourStep === 2}
          />
        )}

        {showEmptyPanel && (
          <OnboardingPanel onGoToProgress={() => handleModeChange("progress")} onStartTour={startTour} />
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
            />
          </>
        )}

        {showPlanner && (
          <PlannerPanel
            courses={courses}
            approved={effectiveApproved}
            planned={planned}
            statusById={statusById}
            term={data.catalog.term}
            creditsDone={creditsDone}
            creditsTotal={creditsTotal}
            unlockedNextTerm={unlockedNextTerm}
            mihorarioUrl={mihorarioUrl}
            onTogglePlanned={handleTogglePlanned}
            onSelectCourse={handleSelect}
            onShare={handleShare}
          />
        )}
      </main>
    </div>
  );
}
