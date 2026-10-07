"use client";

// Presentational React Flow node/edge types for the admin canvas. Separate from the
// student explorer (MapCanvas / CourseCard), which is never imported or modified.

import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, Handle, Position, getBezierPath, type EdgeProps, type NodeProps } from "reactflow";
import { GEO } from "@/lib/mapEditor/geometry";
import type { EdgeSpec } from "@/lib/mapEditor/edges";
import s from "./map.module.css";

export interface CardData {
  id: number;
  code: string | null;
  displayCode: string;
  name: string;
  credits: number;
  courseType: string;
  isPlaceholder: boolean;
  selected: boolean;
  related: boolean;
  dimmed: boolean;
  pending: boolean;
  linkFrom: boolean;
  governor: "api" | "document" | null;
  warn: boolean;
  issue: boolean;
  pinned: string[];
  onSelect: (id: number) => void;
}

function CourseCardBase({ data }: NodeProps<CardData>) {
  const cls = [
    s.card,
    data.selected && s.sel,
    data.related && s.rel,
    data.dimmed && s.dim,
    data.pending && s.pending,
    data.linkFrom && s.linkFrom,
    data.isPlaceholder && s.placeholder,
  ].filter(Boolean).join(" ");
  return (
    <div
      className={cls}
      role="button"
      tabIndex={0}
      aria-pressed={data.selected}
      aria-label={`${data.displayCode} ${data.name}, ${data.credits} créditos`}
      data-course-id={data.id}
      data-code={data.code ?? ""}
      onClick={() => data.onSelect(data.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          data.onSelect(data.id);
        }
      }}
    >
      <Handle type="target" position={Position.Left} id="in" className={s.handle} />
      <div className={s.cardTop}>
        <span>{data.displayCode}</span>
        <span>{data.credits}</span>
      </div>
      <div className={s.cardName}>{data.name}</div>
      <div className={s.cardBadges}>
        {data.pinned.length > 0 && <span className={s.b} title={`Fijado: ${data.pinned.join(", ")}`}>🔒</span>}
        {data.governor && (
          <span
            className={`${s.b} ${data.governor === "api" ? s.api : ""}`}
            title={data.governor === "api" ? "Los estudiantes ven el requisito oficial (API)" : "Sin datos oficiales: los estudiantes ven el documento"}
          >
            {data.governor === "api" ? "API" : "Doc"}
          </span>
        )}
        {data.warn && <span className={`${s.b} ${s.warn}`} title="El documento difiere de la API">⚠</span>}
        {data.issue && <span className={`${s.b} ${s.bad}`} title="Problema en el plan">!</span>}
      </div>
      <Handle type="source" position={Position.Right} id="out" className={s.handle} />
    </div>
  );
}
export const CourseCard = memo(CourseCardBase);

export interface BandData {
  height: number;
  alt: boolean;
  spare: boolean;
}
export const Band = memo(function Band({ data }: NodeProps<BandData>) {
  return (
    <div
      className={`${s.band} ${data.alt ? s.alt : ""} ${data.spare ? s.spare : ""}`}
      style={{ width: GEO.CARD_W + 16, height: data.height }}
    />
  );
});

export interface BandHeaderData {
  semester: number;
  credits: number;
  spare: boolean;
}
export const BandHeader = memo(function BandHeader({ data }: NodeProps<BandHeaderData>) {
  return (
    <div className={s.bandHeader}>
      {data.spare ? (
        <span>Nuevo semestre</span>
      ) : (
        <>
          <span>Semestre {data.semester}</span>
          <small>{data.credits} cr</small>
        </>
      )}
    </div>
  );
});

export const DropIndicator = memo(function DropIndicator() {
  return <div className={s.drop} aria-hidden="true" />;
});

export interface EdgeData {
  spec: EdgeSpec;
  picked: boolean;
  onPick: (id: string, additive: boolean) => void;
  label: string;
}

export const COLORS = { prereq: "#2563eb", coreq: "#d97706", or: "#7c3aed", api: "#98a2b3" };

function ReqEdgeBase(p: EdgeProps<EdgeData>) {
  const d = p.data!;
  const [path, lx, ly] = getBezierPath({
    sourceX: p.sourceX, sourceY: p.sourceY, targetX: p.targetX, targetY: p.targetY,
    sourcePosition: p.sourcePosition, targetPosition: p.targetPosition,
  });
  const { spec } = d;
  const isApi = spec.layer === "api";
  const inOr = spec.groupSize > 1;
  const color = isApi ? COLORS.api : inOr ? COLORS.or : spec.kind === "coreq" ? COLORS.coreq : COLORS.prereq;
  const circleCls = [
    s.circle,
    spec.kind === "coreq" && s.coreq,
    inOr && s.or,
    spec.complex && s.complex,
    isApi && s.api,
    d.picked && s.picked,
  ].filter(Boolean).join(" ");
  return (
    <>
      <BaseEdge
        id={p.id}
        path={path}
        markerEnd={spec.kind === "prereq" ? p.markerEnd : undefined}
        style={{
          stroke: color,
          strokeWidth: d.picked ? 3 : 1.8,
          strokeDasharray: isApi ? "2 5" : spec.kind === "coreq" ? "7 4" : spec.soft ? "3 3" : undefined,
          opacity: isApi ? 0.8 : 1,
        }}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={circleCls}
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          data-edge-id={p.id}
          data-layer={spec.layer}
          data-kind={spec.kind}
          aria-pressed={d.picked}
          aria-label={d.label}
          title={d.label}
          disabled={isApi}
          onClick={(e) => {
            e.stopPropagation();
            d.onPick(spec.id, e.shiftKey || e.ctrlKey || e.metaKey);
          }}
        >
          {spec.complex ? "≡" : inOr ? "O" : spec.kind === "coreq" ? "C" : "Y"}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
export const ReqEdge = memo(ReqEdgeBase);

export const nodeTypes = { card: CourseCard, band: Band, bandHeader: BandHeader, drop: DropIndicator };
export const edgeTypes = { req: ReqEdge };
