"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  MarkerType,
  Panel,
  useReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
  type Viewport,
} from "reactflow";
import "reactflow/dist/style.css";
import type { Course, AvailabilityStatus } from "@/lib/types";
import { upstreamOf, downstreamOf, unlockRelation } from "@/lib/availability";
import { numberRequirementGroups } from "./reqGroups";
import { toSentenceCase } from "./format";
import CourseCard, { type RelationState } from "./CourseCard";
import RelationToggles, { deriveUnlockView, type RelView } from "./UnlockViewControl";
import { PlusIcon, MinusIcon, FitIcon } from "./icons";
import styles from "./explorer.module.css";

// §5.1 grid geometry
const COL_PITCH = 168;
const ROW_PITCH = 70;
const CARD_W = 148;
const CARD_H = 60;
const BAND_HEADER_H = 52;
const INSET_X = 20;
const INSET_TOP = 16;

// Edge colours are SVG props, so they can't be `var()`s — read the tokens
// (tokens.css) at runtime instead of hard-coding literals. The defaults only
// cover the first server render.
const EDGE_DEFAULTS = {
  PREREQ_COLOR: "#1f6fc4",
  CHAIN_COLOR: "#8fb1dd",
  COREQ_COLOR: "#b45309",
  UNLOCK_SOLE_COLOR: "#15803d",
  UNLOCK_AMONG_COLOR: "#b45309",
};
function useEdgeColors() {
  const [colors, setColors] = useState(EDGE_DEFAULTS);
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    setColors({
      PREREQ_COLOR: v("--edge-prereq", EDGE_DEFAULTS.PREREQ_COLOR),
      CHAIN_COLOR: v("--accent-soft", EDGE_DEFAULTS.CHAIN_COLOR),
      COREQ_COLOR: v("--edge-coreq", EDGE_DEFAULTS.COREQ_COLOR),
      UNLOCK_SOLE_COLOR: v("--st-ok", EDGE_DEFAULTS.UNLOCK_SOLE_COLOR),
      UNLOCK_AMONG_COLOR: v("--st-warn", EDGE_DEFAULTS.UNLOCK_AMONG_COLOR),
    });
  }, []);
  return colors;
}

const EMPTY_SET: Set<string> = new Set();
const EMPTY_MAP: Map<string, RelationState> = new Map();

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV"];
const toRoman = (n: number) => ROMAN[n] ?? String(n);

function Band({ data }: { data: { alt: boolean; height: number } }) {
  return (
    <div
      className={`${styles.band} ${data.alt ? styles.bandAlt : ""}`}
      style={{ width: CARD_W + 16, height: data.height }}
    />
  );
}

function BandHeader({
  data,
}: {
  data: { roman: string; sem: number; mode: "explore" | "progress"; done: number; total: number };
}) {
  const pct = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
  return (
    <div className={styles.bandHeader}>
      <span className={styles.bandRoman}>{data.roman}</span>
      {data.mode === "progress" ? (
        <>
          <span className={styles.bandCredits}>
            {data.done} / {data.total} cr
          </span>
          <span className={styles.bandProgress}>
            <span className={styles.bandProgressFill} style={{ width: `${pct}%` }} />
          </span>
        </>
      ) : (
        <span className={styles.bandCredits}>{data.total} créditos</span>
      )}
    </div>
  );
}

const nodeTypes = { courseCard: CourseCard, band: Band, bandHeader: BandHeader };

function FitOnResize({ dep }: { dep: unknown }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.12, duration: 200 }), 220);
    return () => clearTimeout(t);
  }, [dep, fitView]);
  return null;
}

function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  return (
    <div className={styles.zoomStack}>
      <button className={styles.zoomBtn} onClick={() => zoomIn({ duration: 150 })} aria-label="Acercar" title="Acercar">
        <PlusIcon />
      </button>
      <button className={styles.zoomBtn} onClick={() => zoomOut({ duration: 150 })} aria-label="Alejar" title="Alejar">
        <MinusIcon />
      </button>
      <button
        className={styles.zoomBtn}
        onClick={() => fitView({ padding: 0.12, duration: 200 })}
        aria-label="Ajustar a la pantalla"
        title="Ajustar a la pantalla"
      >
        <FitIcon />
      </button>
    </div>
  );
}

export type RelacionesMode = "directas" | "cadena";

interface Props {
  courses: Course[];
  mode: "explore" | "progress";
  selectedId: string | null;
  hoveredId: string | null;
  matchedIds: Set<string> | null;
  statusById: Map<string, AvailabilityStatus>;
  lockedIds: Set<string>;
  plannedIds: Map<string, string>; // courseId -> term
  stagedIds: Set<string>;
  justUnlockedIds: Set<string>;
  quickMode: boolean;
  relaciones: RelacionesMode;
  /** which relations to draw around the selected course (forward ones are opt-in) */
  view: RelView;
  onViewChange: (v: RelView) => void;
  panelOpen: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

export default function MapCanvas({
  courses,
  mode,
  selectedId,
  hoveredId,
  matchedIds,
  statusById,
  lockedIds,
  plannedIds,
  stagedIds,
  justUnlockedIds,
  quickMode,
  relaciones,
  view,
  onViewChange,
  panelOpen,
  onSelect,
  onHover,
}: Props) {
  const { PREREQ_COLOR, CHAIN_COLOR, COREQ_COLOR, UNLOCK_SOLE_COLOR, UNLOCK_AMONG_COLOR } = useEdgeColors();
  const unlockView = deriveUnlockView(view);
  const showNeeds = view.needs;
  const catalogCodes = useMemo(() => new Set(courses.map((c) => c.codeNormalized)), [courses]);
  const byId = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const focusId = selectedId ?? hoveredId;
  const focusCourse = selectedId ? selected : focusId ? byId.get(focusId) ?? null : null;

  // ONB-02: hover tooltip, shown ~250ms after entering a card while nothing
  // is selected (progressive disclosure — matches EDGE-05's hover preview).
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `onHover(id)` drives the full upstream/downstream/edge recompute below,
  // so firing it on every card the cursor passes over (sweeping the grid can
  // cross a dozen cards a second) remounts the highlighted-edge set at the
  // same rate — that remount churn is what reads as "flicker". Debounce the
  // highlight commit so only a brief pause on a card triggers it; clearing
  // still happens immediately so a stale highlight never lingers.
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read hover/selection through refs so `handleHover` keeps a stable identity —
  // it's passed into every card's data, and a new identity on each hover commit
  // would re-render all of them.
  const hoveredRef = useRef(hoveredId);
  const selectedRef = useRef(selectedId);
  hoveredRef.current = hoveredId;
  selectedRef.current = selectedId;
  const handleHover = useCallback(
    (id: string | null, rect?: DOMRect) => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
      if (id === null) {
        if (hoveredRef.current !== null) onHover(null);
      } else {
        focusTimer.current = setTimeout(() => {
          if (id !== hoveredRef.current) onHover(id);
        }, 70);
      }
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (id && rect && !selectedRef.current) {
        hoverTimer.current = setTimeout(() => setHoverRect(rect), 250);
      } else {
        setHoverRect(null);
      }
    },
    [onHover]
  );
  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (focusTimer.current) clearTimeout(focusTimer.current);
    },
    []
  );

  const upstreamAll = useMemo(
    () => (focusId ? upstreamOf(courses, focusId) : new Set<string>()),
    [courses, focusId]
  );
  const downstream = useMemo(
    () => (focusId ? downstreamOf(courses, focusId) : new Set<string>()),
    [courses, focusId]
  );
  const directAncestors = useMemo(() => new Set(focusCourse?.prereqCourseIds ?? []), [focusCourse]);

  // direct dependents of the focused course, classified sole/among
  const unlockById = useMemo(() => {
    const map = new Map<string, RelationState>();
    if (!focusCourse) return map;
    for (const c of courses) {
      if (!c.prereqCourseIds.includes(focusCourse.id)) continue;
      const rel = unlockRelation(c, focusCourse.codeNormalized, catalogCodes);
      map.set(c.id, rel === "sole" ? "unlockSole" : rel === "among" ? "unlockAmong" : null);
    }
    return map;
  }, [courses, focusCourse, catalogCodes]);

  const coreqNeighbors = useMemo(() => {
    const set = new Set<string>();
    if (!focusCourse) return set;
    for (const c of courses) {
      if (c.id === focusCourse.id) for (const id of c.coreqCourseIds) set.add(id);
      else if (c.coreqCourseIds.includes(focusCourse.id)) set.add(c.id);
    }
    return set;
  }, [courses, focusCourse]);

  // The cards only care about the SELECTED course's relations. Hover feeds the
  // edge preview + tooltip above, but must not touch these (a changed set
  // identity rebuilds every card's data). With no selection they collapse to
  // one shared constant so the nodes memo below stays put while hovering.
  // What the user asked to SEE of the forward direction. "off" hides every
  // dependent — ring, edge and un-dimming; "sole" keeps only the dependents this
  // course unlocks BY ITSELF; "all" shows every dependent plus the whole chain.
  const unlockShown = useMemo(() => {
    if (unlockView === "off") return EMPTY_MAP;
    if (unlockView === "all") return unlockById;
    const m = new Map<string, RelationState>();
    for (const [id, rel] of unlockById) if (rel === "unlockSole") m.set(id, rel);
    return m;
  }, [unlockView, unlockById]);
  const downstreamShown = useMemo(() => (unlockView === "all" ? downstream : EMPTY_SET), [unlockView, downstream]);

  const selUpstream = useMemo(() => (selectedId ? upstreamAll : EMPTY_SET), [selectedId, upstreamAll]);
  const selDownstream = useMemo(() => (selectedId ? downstreamShown : EMPTY_SET), [selectedId, downstreamShown]);
  const selDirectAncestors = useMemo(() => (selectedId ? directAncestors : EMPTY_SET), [selectedId, directAncestors]);
  const selUnlockById = useMemo(() => (selectedId ? unlockShown : EMPTY_MAP), [selectedId, unlockShown]);
  const selCoreqNeighbors = useMemo(() => (selectedId ? coreqNeighbors : EMPTY_SET), [selectedId, coreqNeighbors]);

  // requirement numbers for the SELECTED course's direct ancestors (CARD-07/08)
  const reqNumberByCourseId = useMemo(() => {
    const map = new Map<string, number>();
    if (!selected) return map;
    const groups = numberRequirementGroups(selected, courses, catalogCodes);
    if (!groups) return map;
    for (const g of groups) {
      if (g.kind === "course" && g.inPensum) {
        const c = courses.find((x) => x.codeNormalized === g.code);
        if (c) map.set(c.id, g.number);
      } else if (g.kind === "or") {
        const opt = g.options.find((o) => o.inPensum);
        if (opt) {
          const c = courses.find((x) => x.codeNormalized === opt.code);
          if (c) map.set(c.id, g.number);
        }
      }
    }
    return map;
  }, [selected, courses, catalogCodes]);

  const nodes: Node[] = useMemo(() => {
    const bySemester = new Map<number, Course[]>();
    for (const c of courses) {
      if (!bySemester.has(c.semester)) bySemester.set(c.semester, []);
      bySemester.get(c.semester)!.push(c);
    }
    const semesters = [...bySemester.keys()].sort((a, b) => a - b);
    const maxRows = Math.max(1, ...[...bySemester.values()].map((l) => l.length));
    const bandHeight = BAND_HEADER_H + maxRows * ROW_PITCH + 16;

    const out: Node[] = [];
    for (const semester of semesters) {
      const x = INSET_X + (semester - 1) * COL_PITCH;
      const list = bySemester.get(semester)!;
      const total = list.reduce((s, c) => s + c.credits, 0);
      const done =
        mode === "progress"
          ? list
              .filter((c) => statusById.get(c.id) === "approved")
              .reduce((s, c) => s + c.credits, 0)
          : 0;
      out.push({
        id: `band-${semester}`,
        type: "band",
        position: { x: x - 8, y: INSET_TOP },
        data: { alt: semester % 2 === 0, height: bandHeight },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -1,
      });
      out.push({
        id: `hdr-${semester}`,
        type: "bandHeader",
        position: { x: x - 8, y: INSET_TOP + 6 },
        data: { roman: toRoman(semester), sem: semester, mode, done, total },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: 0,
      });
    }

    for (const semester of semesters) {
      bySemester.get(semester)!.forEach((course, row) => {
        // Relation styling + map-wide dimming only depend on the SELECTION.
        // Hover never reaches the nodes: the hovered ring is plain CSS
        // (`.card:hover`) and the preview edges are built separately, so
        // sweeping the cursor never rebuilds a card.
        const inFocusSet =
          course.id === selectedId ||
          (showNeeds && (relaciones === "cadena" ? selUpstream.has(course.id) : selDirectAncestors.has(course.id))) ||
          selDownstream.has(course.id) ||
          selUnlockById.has(course.id) ||
          selCoreqNeighbors.has(course.id);

        let relation: RelationState = null;
        if (selectedId) {
          if (course.id === selectedId) relation = "selected";
          else if (selUnlockById.has(course.id)) relation = selUnlockById.get(course.id)!;
          else if (showNeeds && selDirectAncestors.has(course.id)) relation = "directPrereq";
          else if (showNeeds && relaciones === "cadena" && selUpstream.has(course.id)) relation = "chainIndirectFull";
          else if (selDownstream.has(course.id)) relation = "downstream";
        }

        const isDimmed =
          (!quickMode && selectedId !== null && !inFocusSet) ||
          (matchedIds !== null && !matchedIds.has(course.id));

        out.push({
          id: course.id,
          type: "courseCard",
          position: { x: INSET_X + (semester - 1) * COL_PITCH, y: INSET_TOP + BAND_HEADER_H + row * ROW_PITCH },
          data: {
            course,
            mode,
            status: statusById.get(course.id) ?? null,
            isLocked: lockedIds.has(course.id),
            isPlanned: plannedIds.has(course.id),
            plannedTerm: plannedIds.get(course.id) ?? null,
            relation: quickMode ? null : relation,
            reqNumber: selectedId && showNeeds ? reqNumberByCourseId.get(course.id) ?? null : null,
            isStaged: stagedIds.has(course.id),
            isJustUnlocked: justUnlockedIds.has(course.id),
            isDimmed,
            onClick: onSelect,
            onHover: handleHover,
          },
          draggable: false,
          zIndex: 1,
        });
      });
    }
    return out;
  }, [
    courses,
    mode,
    selectedId,
    showNeeds,
    relaciones,
    selUpstream,
    selDownstream,
    selDirectAncestors,
    selUnlockById,
    selCoreqNeighbors,
    matchedIds,
    statusById,
    lockedIds,
    plannedIds,
    stagedIds,
    justUnlockedIds,
    quickMode,
    reqNumberByCourseId,
    onSelect,
    handleHover,
  ]);

  const edges: Edge[] = useMemo(() => {
    if (!focusId) return [];
    // EDGE-05: a real selection draws the full Directas/Toda-la-cadena set;
    // pure hover (nothing selected) only draws a lightweight dashed preview
    // for the hovered course's own direct edges — no chain traversal.
    const isHoverPreview = !selectedId;
    const ancestorSet = !isHoverPreview && relaciones === "cadena" ? upstreamAll : directAncestors;
    const inAncestorEdges = (id: string) => id === focusId || ancestorSet.has(id);
    const inForward = (id: string) => id === focusId || downstream.has(id);

    const out: Edge[] = [];
    for (const c of courses) {
      for (const prereqId of c.prereqCourseIds) {
        // forward edges (focus -> dependent) only exist for what the user asked
        // to see; upstream edges (prerequisites of the focus) always do
        const forwardShown = prereqId === focusId && unlockShown.has(c.id);
        const touchesFocus = (showNeeds && c.id === focusId) || forwardShown;
        const withinChain = showNeeds && !isHoverPreview && relaciones === "cadena" && inAncestorEdges(c.id) && inAncestorEdges(prereqId);
        const withinForward = !isHoverPreview && unlockView === "all" && inForward(c.id) && inForward(prereqId);
        if (!touchesFocus && !withinChain && !withinForward) continue;

        const isDirect = prereqId === focusId || c.id === focusId;
        // "*" prerequisites (can be taken the same term) read as corequisites:
        // dashed amber, no arrowhead — same as a real coreq edge.
        if (c.concurrentPrereqIds?.includes(prereqId)) {
          out.push({
            id: `${prereqId}->${c.id}`,
            source: prereqId,
            target: c.id,
            type: "smoothstep",
            style: { stroke: COREQ_COLOR, strokeDasharray: "4 3", strokeWidth: 2 },
          });
          continue;
        }
        if (isHoverPreview) {
          out.push({
            id: `${prereqId}->${c.id}`,
            source: prereqId,
            target: c.id,
            type: "smoothstep",
            style: { stroke: CHAIN_COLOR, strokeWidth: 1.75, strokeDasharray: "5 4" },
            markerEnd: { type: MarkerType.ArrowClosed, color: CHAIN_COLOR, width: 14, height: 14 },
          });
          continue;
        }
        const unlockRel = prereqId === focusId ? unlockShown.get(c.id) : null;
        const color = unlockRel === "unlockSole" ? UNLOCK_SOLE_COLOR : unlockRel === "unlockAmong" ? UNLOCK_AMONG_COLOR : isDirect ? PREREQ_COLOR : CHAIN_COLOR;
        out.push({
          id: `${prereqId}->${c.id}`,
          source: prereqId,
          target: c.id,
          type: "smoothstep",
          style: { stroke: color, strokeWidth: isDirect ? 2 : 1.75 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        });
      }
      for (const coreqId of c.coreqCourseIds) {
        if (c.id !== focusId && coreqId !== focusId) continue;
        out.push({
          id: `coreq-${coreqId}--${c.id}`,
          source: coreqId,
          target: c.id,
          type: "straight",
          style: { stroke: COREQ_COLOR, strokeDasharray: "4 3", strokeWidth: 2 },
        });
      }
    }
    return out;
  }, [courses, focusId, selectedId, showNeeds, relaciones, unlockView, upstreamAll, downstream, directAncestors, unlockShown, PREREQ_COLOR, CHAIN_COLOR, COREQ_COLOR, UNLOCK_SOLE_COLOR, UNLOCK_AMONG_COLOR]);

  // numbers shown next to the three relation toggles + one quiet sentence
  const relCounts = useMemo(() => {
    if (!selected) return { needs: 0, unlocks: 0, depends: 0 };
    const sole = [...unlockById.values()].filter((r) => r === "unlockSole").length;
    return {
      needs: relaciones === "cadena" ? upstreamAll.size : selected.prereqCourseIds.length,
      unlocks: sole,
      depends: downstream.size,
    };
  }, [selected, unlockById, relaciones, upstreamAll, downstream]);
  const relNote = !selected
    ? ""
    : relCounts.depends === 0
      ? "Ningún curso del pensum depende de este."
      : relCounts.unlocks === 0
        ? `Por sí solo no desbloquea ninguno, pero ${relCounts.depends} curso${relCounts.depends === 1 ? "" : "s"} del pensum dependen de él.`
        : `Aprobarlo basta para desbloquear ${relCounts.unlocks} curso${relCounts.unlocks === 1 ? "" : "s"}; ${relCounts.depends} dependen de él en total.`;

  // MAP-05: fade + pan-to-hidden-semester chips at each edge that's cut off.
  const semesterCount = useMemo(() => new Set(courses.map((c) => c.semester)).size, [courses]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [viewport, setViewportState] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const rfInstance = useRef<ReactFlowInstance | null>(null);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);
  const leftContentX = INSET_X - 8;
  const rightContentX = INSET_X - 8 + (semesterCount - 1) * COL_PITCH + (CARD_W + 16);
  const screenX = (x: number) => x * viewport.zoom + viewport.x;
  const leftCut = containerWidth > 0 && screenX(leftContentX) < -4;
  const rightCut = containerWidth > 0 && screenX(rightContentX) > containerWidth + 4;
  const panColumns = (delta: number) => {
    rfInstance.current?.setViewport(
      { x: viewport.x - delta * COL_PITCH * viewport.zoom, y: viewport.y, zoom: viewport.zoom },
      { duration: 250 }
    );
  };

  return (
    <div className={styles.canvasWrap} ref={wrapRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(inst) => (rfInstance.current = inst)}
        onMove={(_, vp) => setViewportState(vp)}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.4}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onPaneClick={() => onSelect("")}
        panOnScroll
        zoomOnDoubleClick={false}
      >
        <Background gap={16} size={1} color="#e2e5ea" />
        <FitOnResize dep={panelOpen} />
        <Panel position="bottom-left">
          <ZoomControls />
        </Panel>
      </ReactFlow>
      {selected && (
        // The dock keeps clear of the lower-left controls (zoom + basket button)
        // however wide the card gets; only the card itself takes clicks.
        <div className={styles.selDock}>
          <div className={styles.selCard} role="region" aria-label={`Selección: ${selected.code}`}>
            <div className={styles.selHead}>
              <span className={styles.selCode}>{selected.code}</span>
              <span className={styles.selName}>{toSentenceCase(selected.name)}</span>
              <button type="button" className={styles.selClear} onClick={() => onSelect("")}>
                Limpiar <kbd>Esc</kbd>
              </button>
            </div>
            <RelationToggles view={view} onChange={onViewChange} counts={relCounts} />
            <p className={styles.selNote}>{relNote}</p>
          </div>
        </div>
      )}
      {!selectedId && hoveredId && hoverRect && focusCourse && (
        <div
          className={styles.tooltip}
          style={{ left: Math.min(hoverRect.left, window.innerWidth - 280), top: hoverRect.bottom + 8 }}
        >
          <div className={styles.tooltipTitle}>{toSentenceCase(focusCourse.name)}</div>
          <div className={styles.tooltipMeta}>
            {directAncestors.size} requisito{directAncestors.size === 1 ? "" : "s"} · Desbloquea{" "}
            {[...unlockById.values()].filter(Boolean).length} · {focusCourse.credits} cr
          </div>
          <div className={styles.tooltipHint}>Clic para ver su ruta completa</div>
        </div>
      )}
      {leftCut && (
        <>
          <div className={`${styles.edgeFade} ${styles.edgeFadeLeft}`} />
          <button className={`${styles.hiddenChip} ${styles.hiddenChipLeft}`} onClick={() => panColumns(-3)}>
            ← anteriores
          </button>
        </>
      )}
      {rightCut && (
        <>
          <div className={`${styles.edgeFade} ${styles.edgeFadeRight}`} />
          <button className={`${styles.hiddenChip} ${styles.hiddenChipRight}`} onClick={() => panColumns(3)}>
            siguientes →
          </button>
        </>
      )}
    </div>
  );
}
