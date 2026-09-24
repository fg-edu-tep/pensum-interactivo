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

const PREREQ_COLOR = "#1f6fc4";
const CHAIN_COLOR = "#8fb1dd";
const COREQ_COLOR = "#d97706";
const UNLOCK_SOLE_COLOR = "#16a34a";
const UNLOCK_AMONG_COLOR = "#d97706";

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
  panelOpen: boolean;
  tourAnchorId?: string | null;
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
  panelOpen,
  tourAnchorId = null,
  onSelect,
  onHover,
}: Props) {
  const catalogCodes = useMemo(() => new Set(courses.map((c) => c.codeNormalized)), [courses]);
  const byId = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const focusId = selectedId ?? hoveredId;
  const focusCourse = selectedId ? selected : focusId ? byId.get(focusId) ?? null : null;

  // ONB-02: hover tooltip, shown ~250ms after entering a card while nothing
  // is selected (progressive disclosure — matches EDGE-05's hover preview).
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleHover = useCallback(
    (id: string | null, rect?: DOMRect) => {
      onHover(id);
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (id && rect && !selectedId) {
        hoverTimer.current = setTimeout(() => setHoverRect(rect), 250);
      } else {
        setHoverRect(null);
      }
    },
    [onHover, selectedId]
  );
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

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
        const inFocusSet =
          course.id === focusId ||
          (relaciones === "cadena" ? upstreamAll.has(course.id) : directAncestors.has(course.id)) ||
          downstream.has(course.id) ||
          unlockById.has(course.id) ||
          coreqNeighbors.has(course.id);

        let relation: RelationState = null;
        if (focusId) {
          if (course.id === focusId) relation = selectedId ? "selected" : "hovered";
          else if (unlockById.has(course.id)) relation = unlockById.get(course.id)!;
          else if (directAncestors.has(course.id)) relation = "directPrereq";
          else if (relaciones === "cadena" && upstreamAll.has(course.id)) relation = "chainIndirectFull";
          else if (relaciones === "directas" && upstreamAll.has(course.id) && !directAncestors.has(course.id))
            relation = null; // hidden in Directas — falls through to dimmed below
        }

        const isDimmed =
          (!quickMode && focusId !== null && !inFocusSet) ||
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
            reqNumber: selectedId ? reqNumberByCourseId.get(course.id) ?? null : null,
            isStaged: stagedIds.has(course.id),
            isJustUnlocked: justUnlockedIds.has(course.id),
            isDimmed,
            isTourAnchor: tourAnchorId === course.id,
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
    focusId,
    selectedId,
    relaciones,
    upstreamAll,
    downstream,
    directAncestors,
    unlockById,
    coreqNeighbors,
    matchedIds,
    statusById,
    lockedIds,
    plannedIds,
    stagedIds,
    justUnlockedIds,
    quickMode,
    reqNumberByCourseId,
    tourAnchorId,
    onSelect,
    handleHover,
  ]);

  const edges: Edge[] = useMemo(() => {
    if (!focusId) return [];
    const ancestorSet = relaciones === "cadena" ? upstreamAll : directAncestors;
    const inAncestorEdges = (id: string) => id === focusId || ancestorSet.has(id);

    const out: Edge[] = [];
    for (const c of courses) {
      for (const prereqId of c.prereqCourseIds) {
        const touchesFocus = c.id === focusId || prereqId === focusId;
        const withinChain = relaciones === "cadena" && inAncestorEdges(c.id) && inAncestorEdges(prereqId);
        if (!touchesFocus && !withinChain) continue;

        const isDirect = prereqId === focusId || c.id === focusId;
        const unlockRel = prereqId === focusId ? unlockById.get(c.id) : null;
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
  }, [courses, focusId, relaciones, upstreamAll, directAncestors, unlockById]);

  const [selectionSummary, setSelectionSummary] = useState("");
  useEffect(() => {
    if (!selected) {
      setSelectionSummary("");
      return;
    }
    const directCount = selected.prereqCourseIds.length;
    const unlockCount = [...unlockById.values()].filter(Boolean).length;
    if (relaciones === "directas") {
      setSelectionSummary(
        `${directCount} requisito${directCount === 1 ? "" : "s"} directo${directCount === 1 ? "" : "s"} · ${
          unlockCount === 0 ? "nada depende de ella" : `desbloquea ${unlockCount}`
        }`
      );
    } else {
      const chainCount = upstreamAll.size;
      setSelectionSummary(`${chainCount} requisito${chainCount === 1 ? "" : "s"} en la cadena · ${directCount} directo${directCount === 1 ? "" : "s"}`);
    }
  }, [selected, unlockById, relaciones, upstreamAll]);

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
        <Panel position="top-right" className={styles.legendPanel}>
          <div className={styles.legendRow}>
            <svg width="24" height="8" aria-hidden>
              <line x1="1" y1="4" x2="18" y2="4" stroke={PREREQ_COLOR} strokeWidth="2" />
              <path d="M18 1 L23 4 L18 7 Z" fill={PREREQ_COLOR} />
            </svg>
            <span>Prerrequisito</span>
          </div>
          <div className={styles.legendRow}>
            <svg width="24" height="8" aria-hidden>
              <line x1="1" y1="4" x2="23" y2="4" stroke={COREQ_COLOR} strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            <span>Correquisito</span>
          </div>
        </Panel>
      </ReactFlow>
      {selected && (
        <div className={styles.selectionBar}>
          <span className={styles.selectionCode}>{selected.code}</span>
          <span className={styles.selectionSummary}>{selectionSummary}</span>
          <button className={styles.selectionClear} onClick={() => onSelect("")}>
            Limpiar Esc
          </button>
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
