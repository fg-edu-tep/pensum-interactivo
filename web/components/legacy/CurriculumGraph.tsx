"use client";

import { useEffect, useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  Panel,
  useReactFlow,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import type { Course, AvailabilityStatus, UnlockRelation } from "@/lib/types";
import { upstreamOf, downstreamOf, unlockRelation } from "@/lib/availability";
import CourseNode from "./CourseNode";

const COL_WIDTH = 260;
const ROW_HEIGHT = 130;
const NODE_PAD = (COL_WIDTH - 210) / 2; // node is 210px wide
const HEADER_H = 46;

const PREREQ_COLOR = "#2563eb"; // solid blue arrow — "must pass before"
const COREQ_COLOR = "#d97706"; // dashed amber — "same term (or earlier)"
const UNLOCK_SOLE_COLOR = "#16a34a"; // green — selected course is the only prereq
const UNLOCK_AMONG_COLOR = "#d97706"; // amber — one of several prereqs

const ROMAN = [
  "",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
  "XIII",
  "XIV",
];
function toRoman(n: number): string {
  return ROMAN[n] ?? String(n);
}

function SemesterHeader({ data }: { data: { roman: string; sem: number } }) {
  return (
    <div className="semester-header">
      <span className="semester-header-roman">{data.roman}</span>
      <span className="semester-header-sub">Semestre {data.sem}</span>
    </div>
  );
}

function SemesterBand({ data }: { data: { alt: boolean; height: number } }) {
  return (
    <div
      className={`semester-band${data.alt ? " alt" : ""}`}
      style={{ width: COL_WIDTH, height: data.height }}
    />
  );
}

const nodeTypes = {
  courseNode: CourseNode,
  semesterHeader: SemesterHeader,
  semesterBand: SemesterBand,
};

/** Refit the viewport when the side panel opens/closes (container resizes). */
function RefitOnResize({ dep }: { dep: unknown }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 200 }), 220);
    return () => clearTimeout(t);
  }, [dep, fitView]);
  return null;
}

interface Props {
  courses: Course[];
  mode: "explore" | "progress";
  selectedId: string | null;
  matchedIds: Set<string> | null; // from search/filter; null = no filter active
  statusById: Map<string, AvailabilityStatus>;
  lockedIds: Set<string>; // locked by an admin progression rule
  stagedIds: Set<string>; // quick multi-select staging
  justUnlockedIds: Set<string>; // freshly unlocked by the last "Terminar" — glow
  quickMode: boolean;
  panelOpen: boolean;
  onSelect: (id: string) => void;
}

export default function CurriculumGraph({
  courses,
  mode,
  selectedId,
  matchedIds,
  statusById,
  lockedIds,
  stagedIds,
  justUnlockedIds,
  quickMode,
  panelOpen,
  onSelect,
}: Props) {
  const upstream = useMemo(
    () => (selectedId ? upstreamOf(courses, selectedId) : new Set<string>()),
    [courses, selectedId]
  );
  const downstream = useMemo(
    () => (selectedId ? downstreamOf(courses, selectedId) : new Set<string>()),
    [courses, selectedId]
  );

  // When a course is selected, classify every *direct* dependent as unlocked
  // "sole" (this is its only prerequisite) or "among" (one of several).
  const unlockById = useMemo(() => {
    const map = new Map<string, UnlockRelation>();
    if (!selectedId) return map;
    const selected = courses.find((c) => c.id === selectedId);
    if (!selected) return map;
    const catalogCodes = new Set(courses.map((c) => c.codeNormalized));
    for (const c of courses) {
      if (!c.prereqCourseIds.includes(selectedId)) continue;
      map.set(c.id, unlockRelation(c, selected.codeNormalized, catalogCodes));
    }
    return map;
  }, [courses, selectedId]);

  // courses directly corequisite-linked to the selected one (either direction) —
  // so their (dashed) edge shows on selection even though coreqs aren't part of
  // the upstream/downstream prerequisite chain.
  const coreqNeighbors = useMemo(() => {
    const set = new Set<string>();
    if (!selectedId) return set;
    for (const c of courses) {
      if (c.id === selectedId) {
        for (const id of c.coreqCourseIds) set.add(id);
      } else if (c.coreqCourseIds.includes(selectedId)) {
        set.add(c.id);
      }
    }
    return set;
  }, [courses, selectedId]);

  const nodes: Node[] = useMemo(() => {
    const bySemester = new Map<number, Course[]>();
    for (const c of courses) {
      if (!bySemester.has(c.semester)) bySemester.set(c.semester, []);
      bySemester.get(c.semester)!.push(c);
    }
    const semesters = [...bySemester.keys()].sort((a, b) => a - b);
    const maxRows = Math.max(1, ...[...bySemester.values()].map((l) => l.length));
    const bandHeight = maxRows * ROW_HEIGHT + 80;

    const out: Node[] = [];

    // semester bands + Roman-numeral headers (behind the course nodes)
    for (const semester of semesters) {
      const x = (semester - 1) * COL_WIDTH;
      out.push({
        id: `band-${semester}`,
        type: "semesterBand",
        position: { x: x - NODE_PAD, y: -HEADER_H },
        data: { alt: semester % 2 === 0, height: bandHeight },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -1,
      });
      out.push({
        id: `hdr-${semester}`,
        type: "semesterHeader",
        position: { x: x - NODE_PAD, y: -HEADER_H },
        data: { roman: toRoman(semester), sem: semester },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: 0,
      });
    }

    for (const semester of semesters) {
      const list = bySemester.get(semester)!;
      list.forEach((course, row) => {
        const isDimmed =
          // no selection-based dimming while quick-selecting
          (!quickMode &&
            selectedId !== null &&
            course.id !== selectedId &&
            !upstream.has(course.id) &&
            !downstream.has(course.id) &&
            !coreqNeighbors.has(course.id)) ||
          (matchedIds !== null && !matchedIds.has(course.id));
        out.push({
          id: course.id,
          type: "courseNode",
          position: { x: (semester - 1) * COL_WIDTH, y: row * ROW_HEIGHT },
          data: {
            course,
            mode,
            status: statusById.get(course.id) ?? null,
            isLocked: lockedIds.has(course.id),
            isSelected: !quickMode && course.id === selectedId,
            isUpstream: !quickMode && upstream.has(course.id),
            isDownstream: !quickMode && downstream.has(course.id),
            isStaged: stagedIds.has(course.id),
            isJustUnlocked: justUnlockedIds.has(course.id),
            unlock: quickMode ? null : unlockById.get(course.id) ?? null,
            isDimmed,
            onClick: onSelect,
          },
          draggable: false,
          zIndex: 1,
        });
      });
    }
    return out;
  }, [courses, selectedId, upstream, downstream, coreqNeighbors, matchedIds, mode, statusById, lockedIds, stagedIds, justUnlockedIds, quickMode, unlockById, onSelect]);

  // Edges only appear once a course is selected — then only the ones on that
  // course's prerequisite / dependent chain (plus its direct coreqs) are drawn.
  // Prerequisite = solid blue arrow ("pass before"). Corequisite = dashed amber,
  // no arrow ("same term or earlier").
  const edges: Edge[] = useMemo(() => {
    if (selectedId === null) return [];
    const inFocus = (id: string) =>
      id === selectedId ||
      upstream.has(id) ||
      downstream.has(id) ||
      coreqNeighbors.has(id);

    const out: Edge[] = [];
    for (const c of courses) {
      for (const prereqId of c.prereqCourseIds) {
        if (!inFocus(c.id) || !inFocus(prereqId)) continue;
        // Edges leaving the selected course take the semaphore colour of what
        // they unlock; every other prereq edge stays blue.
        const rel = prereqId === selectedId ? unlockById.get(c.id) ?? null : null;
        const color =
          rel === "sole"
            ? UNLOCK_SOLE_COLOR
            : rel === "among"
              ? UNLOCK_AMONG_COLOR
              : PREREQ_COLOR;
        out.push({
          id: `${prereqId}->${c.id}`,
          source: prereqId,
          target: c.id,
          type: "smoothstep",
          animated: false,
          style: { stroke: color, strokeWidth: rel ? 2.5 : 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 16,
            height: 16,
          },
        });
      }
      for (const coreqId of c.coreqCourseIds) {
        if (!inFocus(c.id) && !inFocus(coreqId)) continue;
        out.push({
          id: `coreq-${coreqId}--${c.id}`,
          source: coreqId,
          target: c.id,
          type: "straight",
          style: {
            stroke: COREQ_COLOR,
            strokeDasharray: "5 4",
            strokeWidth: 2,
          },
        });
      }
    }
    return out;
  }, [courses, selectedId, upstream, downstream, coreqNeighbors, unlockById]);

  return (
    <div className="graph-wrapper">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        onPaneClick={() => onSelect("")}
      >
        <Background gap={24} color="#e5e7eb" />
        <Controls showInteractive={false} />
        <RefitOnResize dep={panelOpen} />
        <Panel position="top-right" className="graph-legend">
          <div className="graph-legend-row">
            <svg width="34" height="10" aria-hidden>
              <line x1="1" y1="5" x2="24" y2="5" stroke={PREREQ_COLOR} strokeWidth="2" />
              <path d="M24 1 L32 5 L24 9 Z" fill={PREREQ_COLOR} />
            </svg>
            <span>
              <strong>Prerrequisito</strong> · aprobar antes
            </span>
          </div>
          <div className="graph-legend-row">
            <svg width="34" height="10" aria-hidden>
              <line
                x1="1"
                y1="5"
                x2="33"
                y2="5"
                stroke={COREQ_COLOR}
                strokeWidth="2"
                strokeDasharray="5 4"
              />
            </svg>
            <span>
              <strong>Correquisito</strong> · al tiempo o antes
            </span>
          </div>

          <div className="graph-legend-sep" />

          <div className="graph-legend-row">
            <span className="legend-swatch swatch-green" aria-hidden />
            <span>
              <strong>Verde</strong> ·{" "}
              {mode === "progress"
                ? "disponible, o se desbloquea solo con el curso elegido"
                : "se desbloquea solo con el curso elegido"}
            </span>
          </div>
          <div className="graph-legend-row">
            <span className="legend-swatch swatch-amber" aria-hidden />
            <span>
              <strong>Amarillo</strong> ·{" "}
              {mode === "progress"
                ? "te falta un curso, o el elegido es uno de varios prerrequisitos"
                : "el curso elegido es uno de varios prerrequisitos"}
            </span>
          </div>
          {mode === "progress" && (
            <div className="graph-legend-row">
              <span className="legend-swatch swatch-grey" aria-hidden />
              <span>
                <strong>Gris</strong> · te faltan varios cursos
              </span>
            </div>
          )}
        </Panel>
      </ReactFlow>
    </div>
  );
}
