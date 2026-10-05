"use client";

// Admin visual pensum editor (Phase B). A separate canvas: the student explorer
// (PensumExplorer / MapCanvas / CourseCard) and lib/catalogPayload.ts are untouched.
//
// State model: the server rows are immutable props; every edit is a MapOp appended to
// `ops`. The working plan is planBatch(rows, ops) — the SAME pure function the server
// runs — so the preview can never disagree with what Save will write.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactFlow, {
  Background, MarkerType, ReactFlowProvider, applyNodeChanges, getRectOfNodes, useReactFlow,
  type Connection, type Edge, type Node, type NodeChange,
} from "reactflow";
import "reactflow/dist/style.css";
import { reportCourse, reportField, summarize, type CourseInput, type CourseReport } from "@/lib/discrepancy/report";
import { detailsFetched } from "@/lib/discrepancy/report";
import { GEO, cardX, cardY, layoutPlan, slotFromPoint, type Slot } from "@/lib/mapEditor/geometry";
import { docEdges, mergeApiEdges, type EdgeSpec } from "@/lib/mapEditor/edges";
import {
  ModelError, addRequirement, groupAsAlternatives, removeAlt, treeToModel, ungroup, type ReqModel,
} from "@/lib/mapEditor/model";
import type { MapOp, RequirementKind } from "@/lib/mapEditor/ops";
import { planBatch, planNodes, type PlanRow } from "@/lib/mapEditor/plan";
import { findPrereqCycle, validatePlan, type Issue } from "@/lib/mapEditor/validate";
import type { ReqNode } from "@/lib/types";
import { COLORS, edgeTypes, nodeTypes, type CardData, type EdgeData } from "./MapNodes";
import MapSidePanel from "./MapSidePanel";
import s from "./map.module.css";

export interface MapRowDTO {
  id: number;
  code: string | null;
  displayCode: string;
  name: string;
  credits: number;
  courseType: string;
  isPlaceholder: boolean;
  semester: number;
  sortIndex: number;
  prereqText: string | null;
  coreqText: string | null;
  prereqTree: ReqNode | null;
  coreqTree: ReqNode | null;
  lockedFields: string[];
  version: string;
  prereqUnparsed: boolean;
  coreqUnparsed: boolean;
}
export interface EditDTO { id: number; actor: string; status: string; createdAt: string; ops: unknown }
export interface DictionaryDTO {
  importId: number | null;
  period: string | null;
  planTerm: string;
  coversCurrentTerm: boolean;
  entries: { code: string; name: string }[];
}
export interface MapEditorProps {
  slug: string;
  title: string;
  backHref: string;
  classicHref: string;
  rows: MapRowDTO[];
  orderVersion: string;
  inputs: CourseInput[];
  dictionary: DictionaryDTO;
  edits: EditDTO[];
}

const toPlanRow = (r: MapRowDTO): PlanRow => ({
  id: r.id, code: r.code, semester: r.semester, sortIndex: r.sortIndex,
  prereqText: r.prereqText, coreqText: r.coreqText, prereqTree: r.prereqTree, coreqTree: r.coreqTree,
  lockedFields: r.lockedFields,
});

// React Flow sets pointer-events:none on nodes that are neither draggable, selectable nor have a click
// handler (connect mode makes them non-draggable) — this no-op keeps the cards clickable.
const noopNodeClick = () => {};

function Editor(props: MapEditorProps) {
  const { slug, rows, inputs, dictionary } = props;
  const router = useRouter();
  const [ops, setOps] = useState<MapOp[]>([]);
  const [history, setHistory] = useState<MapOp[][]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [reqKind, setReqKind] = useState<RequirementKind>("prereq");
  const [connectMode, setConnectMode] = useState(false);
  const [linkFrom, setLinkFrom] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showApi, setShowApi] = useState(true);
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "err" | "info" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [unknownAsk, setUnknownAsk] = useState<string[] | null>(null);
  const [allowUnknown, setAllowUnknown] = useState<string[]>([]);
  const [drop, setDrop] = useState<Slot | null>(null);
  const [layoutKey, setLayoutKey] = useState(0);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [popover, setPopover] = useState<"issues" | "history" | "keys" | null>(null);
  const rf = useReactFlow();
  const fitted = useRef(false);

  // reset local state whenever the server hands us fresh rows (after save / undo)
  useEffect(() => {
    setOps([]); setHistory([]); setPicked([]); setUnknownAsk(null); setAllowUnknown([]);
  }, [rows]);

  const planRows = useMemo(() => rows.map(toPlanRow), [rows]);
  const result = useMemo(() => {
    if (!ops.length) return null;
    try {
      return planBatch(planRows, ops);
    } catch {
      return null;
    }
  }, [planRows, ops]);
  const work = result?.rows ?? planRows;
  // "changed" also lists rows whose sortIndex merely shifted to make room; the admin only edited the
  // courses they touched or whose fields really changed, so only those count as pending
  const dirtyIds = useMemo(() => {
    if (!result) return new Set<number>();
    const touched = new Set(ops.map((o) => o.courseId));
    return new Set([...result.changed].filter(([id, fields]) => fields.length > 0 || touched.has(id)).map(([id]) => id));
  }, [result, ops]);
  const dirtyCount = dirtyIds.size;
  const meta = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const workById = useMemo(() => new Map(work.map((r) => [r.id, r])), [work]);

  const note = useCallback((text: string, tone: "ok" | "err" | "info" = "info") => setMsg({ text, tone }), []);

  // transient messages fade; errors stay until the next action
  useEffect(() => {
    if (!msg || msg.tone === "err") return;
    const t = setTimeout(() => setMsg(null), 7000);
    return () => clearTimeout(t);
  }, [msg]);

  // ---- ops -------------------------------------------------------------
  const pushOps = useCallback((next: MapOp[]) => {
    setHistory((h) => [...h, ops]);
    setOps(next);
    setPicked([]);
  }, [ops]);

  const currentModels = useCallback((id: number): { prereq: ReqModel; coreq: ReqModel } => {
    const r = workById.get(id)!;
    return { prereq: treeToModel(r.prereqTree), coreq: treeToModel(r.coreqTree) };
  }, [workById]);

  const setRequirement = useCallback((courseId: number, kind: RequirementKind, model: ReqModel) => {
    // validate against the end state first: self-reference and prerequisite cycles are refused here too
    const row = workById.get(courseId);
    if (!row?.code) return note("Este espacio no tiene curso concreto.", "err");
    let trial: PlanRow[];
    try {
      trial = planBatch(work, [{ op: "setRequirement", courseId, kind, model }]).rows;
    } catch (e) {
      return note((e as Error).message, "err");
    }
    const mine = planNodes(trial).find((n) => n.code === row.code);
    if (mine && [...mine.prereqs, ...mine.coreqs].includes(row.code))
      return note(`${row.code} no puede ser requisito de sí mismo.`, "err");
    const before = findPrereqCycle(planNodes(work));
    const after = findPrereqCycle(planNodes(trial));
    if (after && !before) return note(`Crearía un ciclo de prerrequisitos: ${after.join(" → ")}`, "err");
    const keep = ops.filter((o) => !(o.op === "setRequirement" && o.courseId === courseId && o.kind === kind));
    pushOps([...keep, { op: "setRequirement", courseId, kind, model }]);
    setMsg(null);
  }, [ops, pushOps, note, work, workById]);

  const moveTo = useCallback((courseId: number, semester: number, position: number) => {
    pushOps([...ops, { op: "move", courseId, semester, position }]);
    setMsg(null);
  }, [ops, pushOps]);

  const undoLocal = () => {
    setMsg(null);
    setHistory((h) => {
      if (!h.length) return h;
      setOps(h[h.length - 1]);
      return h.slice(0, -1);
    });
    setPicked([]);
  };
  const discard = () => { setMsg(null); setOps([]); setHistory([]); setPicked([]); setLayoutKey((k) => k + 1); };

  // ---- derived views ---------------------------------------------------
  const layout = useMemo(() => layoutPlan(work, { spare: true }), [work]);

  const reportById = useMemo(() => {
    const m = new Map<number, CourseReport>();
    for (const inp of inputs) {
      const w = workById.get(inp.catalogCourseId);
      if (!w) continue;
      m.set(inp.catalogCourseId, reportCourse({
        ...inp, docPrereqText: w.prereqText, docPrereqTree: w.prereqTree,
        docCoreqText: w.coreqText, docCoreqTree: w.coreqTree, lockedFields: w.lockedFields,
      }));
    }
    return m;
  }, [inputs, workById]);

  // same counting rule as the catalog-list badge and the Discrepancias page (fields, not courses)
  const warnFields = useMemo(() => summarize([...reportById.values()]).warn, [reportById]);

  const dictMap = useMemo(
    () => (dictionary.importId ? new Map(dictionary.entries.map((e) => [e.code, e.name])) : null),
    [dictionary]
  );
  const dictSet = useMemo(() => (dictMap ? new Set(dictMap.keys()) : null), [dictMap]);
  const planCodes = useMemo(
    () => new Map(rows.filter((r) => r.code).map((r) => [r.code!, r.name])),
    [rows]
  );

  const issuesAll = useMemo(
    () => validatePlan(planNodes(work), { dictionary: dictSet, sortIndexes: work.map((r) => r.sortIndex) }),
    [work, dictSet]
  );
  const issuesBase = useMemo(() => new Set(validatePlan(planNodes(planRows), { dictionary: dictSet }).map((i) => i.message)), [planRows, dictSet]);
  const issuesNew = useMemo(() => issuesAll.filter((i) => !issuesBase.has(i.message)), [issuesAll, issuesBase]);
  const hasNewErrors = issuesNew.some((i) => i.severity === "error");
  const issueCodes = useMemo(() => new Set(issuesNew.map((i) => i.code).filter(Boolean) as string[]), [issuesNew]);

  const edgeRows = useMemo(
    () => work.map((r) => ({ id: r.id, code: r.code, prereq: treeToModel(r.prereqTree), coreq: treeToModel(r.coreqTree) })),
    [work]
  );
  const { docList, apiList } = useMemo(() => {
    const doc = docEdges(edgeRows);
    const api = new Map<number, { prereq: ReqNode | null; coreq: ReqNode | null }>();
    for (const inp of inputs) {
      if (detailsFetched(inp.offering)) api.set(inp.catalogCourseId, { prereq: inp.offering!.apiPrereqTree, coreq: inp.offering!.apiCoreqTree });
    }
    const merged = mergeApiEdges(doc, edgeRows, api);
    return { docList: merged.doc, apiList: merged.api };
  }, [edgeRows, inputs]);
  const edgeById = useMemo(() => new Map(docList.map((e) => [e.id, e])), [docList]);

  // ---- canvas edges ------------------------------------------------------
  const onPick = useCallback((id: string, additive: boolean) => {
    setPicked((p) => (additive ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : p.length === 1 && p[0] === id ? [] : [id]));
  }, []);

  const edges: Edge<EdgeData>[] = useMemo(() => {
    const visible = (e: EdgeSpec) => showAll || (selected !== null && (e.source === selected || e.target === selected)) || picked.includes(e.id);
    const list = [...docList.filter(visible), ...(showApi ? apiList.filter(visible) : [])];
    const name = (id: number) => workById.get(id) && meta.get(id)?.displayCode;
    return list.map((spec) => ({
      id: spec.id,
      type: "req",
      source: String(spec.source),
      target: String(spec.target),
      sourceHandle: "out",
      targetHandle: "in",
      markerEnd: { type: MarkerType.ArrowClosed, color: spec.layer === "api" ? COLORS.api : spec.groupSize > 1 ? COLORS.or : COLORS.prereq },
      data: {
        spec, picked: picked.includes(spec.id), onPick,
        label: `${spec.layer === "api" ? "Oficial (API): " : ""}${spec.kind === "prereq" ? "Prerrequisito" : "Correquisito"} ${name(spec.source)} → ${name(spec.target)}${spec.groupSize > 1 ? " (alternativa O)" : ""}${spec.complex ? " (expresión compuesta: edítala en la lista)" : ""}`,
      },
    }));
  }, [docList, apiList, showAll, showApi, selected, picked, onPick, workById, meta]);

  // ---- nodes ---------------------------------------------------------------
  const related = useMemo(() => {
    const out = new Set<number>();
    if (selected === null) return out;
    for (const e of docList) {
      if (e.source === selected) out.add(e.target);
      if (e.target === selected) out.add(e.source);
    }
    return out;
  }, [docList, selected]);

  // addLink closes over the latest ops / work / reqKind; the node callbacks must never see a stale copy
  const addLinkRef = useRef<(p: number, d: number) => void>(() => {});
  const onSelect = useCallback((id: number) => {
    if (connectMode) {
      if (linkFrom === null) { setLinkFrom(id); note("Ahora haz clic en el curso que lo requiere.", "info"); return; }
      const from = linkFrom;
      setLinkFrom(null);
      if (from !== id) addLinkRef.current(from, id);
      return;
    }
    setSelected(id);
    setPicked([]);
  }, [connectMode, linkFrom, note]);

  const layoutNodes = useMemo(() => {
    const out: Node[] = [];
    const credits = new Map<number, number>();
    for (const r of work) credits.set(r.semester, (credits.get(r.semester) ?? 0) + (meta.get(r.id)?.credits ?? 0));
    layout.semesters.forEach((sem, i) => {
      const spare = i === layout.semesters.length - 1 && !work.some((r) => r.semester === sem);
      out.push({
        id: `band-${sem}`, type: "band", position: { x: cardX(sem) - 8, y: GEO.INSET_TOP }, draggable: false, selectable: false,
        focusable: false, zIndex: -1, data: { height: layout.bandHeight, alt: sem % 2 === 0, spare },
      });
      out.push({
        id: `hdr-${sem}`, type: "bandHeader", position: { x: cardX(sem) - 8, y: GEO.INSET_TOP + 6 }, draggable: false,
        selectable: false, focusable: false, zIndex: 0, data: { semester: sem, credits: credits.get(sem) ?? 0, spare },
      });
    });
    for (const r of work) {
      const pos = layout.positions.get(r.id)!;
      const m = meta.get(r.id)!;
      const rep = reportById.get(r.id);
      const dimmed = selected !== null && r.id !== selected && !related.has(r.id) && !showAll;
      out.push({
        id: String(r.id), type: "card", position: { x: pos.x, y: pos.y }, zIndex: 1, draggable: !connectMode,
        data: {
          id: r.id, code: r.code, displayCode: m.displayCode, name: m.name, credits: m.credits, courseType: m.courseType,
          isPlaceholder: m.isPlaceholder, selected: r.id === selected, related: related.has(r.id), dimmed,
          pending: dirtyIds.has(r.id), linkFrom: linkFrom === r.id,
          governor: rep ? rep.prereq.governor : null,
          warn: !!rep && (rep.prereq.severity === "warn" || rep.coreq.severity === "warn"),
          issue: !!r.code && issueCodes.has(r.code),
          pinned: r.lockedFields,
          onSelect,
        } satisfies CardData,
      });
    }
    if (drop) {
      out.push({
        id: "drop", type: "drop", position: { x: cardX(drop.semester), y: cardY(drop.row) }, draggable: false,
        selectable: false, focusable: false, zIndex: 0, data: {},
      });
    }
    return out;
  }, [work, layout, meta, reportById, selected, related, showAll, connectMode, linkFrom, dirtyIds, issueCodes, onSelect, drop]);

  // Local node state only exists so a card can follow the cursor while dragging;
  // any change to the plan (or an explicit reset) snaps everything back to the grid.
  useEffect(() => { setNodes(layoutNodes); }, [layoutNodes, layoutKey]);

  // fit once the first real nodes exist (fitView at mount ran on an empty canvas), and when the inspector toggles
  // fit to the screen, then pin the grid to the top (fitView alone centres it vertically and wastes space)
  const fit = useCallback(() => {
    void rf.fitView({ padding: 0.04, duration: 0 });
    requestAnimationFrame(() => {
      const vp = rf.getViewport();
      const b = getRectOfNodes(rf.getNodes());
      void rf.setViewport({ x: vp.x, y: 12 - b.y * vp.zoom, zoom: vp.zoom }, { duration: 200 });
    });
  }, [rf]);
  useEffect(() => {
    if (!fitted.current && nodes.some((n) => n.type === "card")) {
      fitted.current = true;
      const t = setTimeout(fit, 60);
      return () => clearTimeout(t);
    }
  }, [nodes, fit]);
  useEffect(() => { const t = setTimeout(fit, 80); return () => clearTimeout(t); }, [inspectorOpen, fit]);
  useEffect(() => {
    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fit]);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((ns) => applyNodeChanges(changes.filter((c) => c.type === "position" || c.type === "dimensions"), ns));
  }, []);

  const rowsForSlots = useMemo(() => work.map((r) => ({ id: r.id, semester: r.semester, sortIndex: r.sortIndex })), [work]);
  const onNodeDrag = useCallback((_e: unknown, node: Node) => {
    if (node.type !== "card") return;
    setDrop(slotFromPoint(rowsForSlots, Number(node.id), node.position.x, node.position.y));
  }, [rowsForSlots]);
  const onNodeDragStop = useCallback((_e: unknown, node: Node) => {
    setDrop(null);
    if (node.type !== "card") return;
    const id = Number(node.id);
    const slot = slotFromPoint(rowsForSlots, id, node.position.x, node.position.y);
    const cur = layout.positions.get(id);
    if (cur && cur.semester === slot.semester && cur.row === slot.row) { setLayoutKey((k) => k + 1); return; }
    moveTo(id, slot.semester, slot.row);
    setLayoutKey((k) => k + 1);
  }, [rowsForSlots, layout, moveTo]);

  // ---- connect --------------------------------------------------------------
  function addLink(prereqId: number, dependentId: number) {
    const pre = workById.get(prereqId), dep = workById.get(dependentId);
    if (!pre?.code) return note("Un espacio sin curso concreto no puede ser requisito.", "err");
    if (!dep?.code) return note("Un espacio sin curso concreto no puede tener requisitos.", "err");
    try {
      setRequirement(dependentId, reqKind, addRequirement(currentModels(dependentId)[reqKind], pre.code));
      setSelected(dependentId);
    } catch (e) {
      if (e instanceof ModelError) note(e.message, "err"); else throw e;
    }
  }
  addLinkRef.current = addLink;
  const onConnect = useCallback((c: Connection) => {
    if (c.source && c.target) addLinkRef.current(Number(c.source), Number(c.target));
  }, []);

  // ---- circle actions ----------------------------------------------------------
  const pickedSpecs = picked.map((id) => edgeById.get(id)).filter((e): e is EdgeSpec => !!e);
  const sameTarget = pickedSpecs.length > 0 && pickedSpecs.every((e) => e.target === pickedSpecs[0].target && e.kind === pickedSpecs[0].kind);
  const canGroup = sameTarget && !pickedSpecs.some((e) => e.complex) && new Set(pickedSpecs.map((e) => e.group)).size >= 2;
  const canUngroup = pickedSpecs.length === 1 && pickedSpecs[0].groupSize > 1 && !pickedSpecs[0].complex;
  const canDelete = pickedSpecs.length > 0 && !pickedSpecs.some((e) => e.complex);

  const act = (f: () => void) => { try { f(); } catch (e) { if (e instanceof ModelError) note(e.message, "err"); else throw e; } };
  const doGroup = () => act(() => {
    const t = pickedSpecs[0];
    setRequirement(t.target, t.kind, groupAsAlternatives(currentModels(t.target)[t.kind], pickedSpecs.map((e) => e.group)));
  });
  const doUngroup = () => act(() => {
    const t = pickedSpecs[0];
    setRequirement(t.target, t.kind, ungroup(currentModels(t.target)[t.kind], t.group));
  });
  const doDelete = () => act(() => {
    if (!canDelete) return;
    const t = pickedSpecs[0];
    let model = currentModels(t.target)[t.kind];
    // remove from the back so earlier indexes stay valid
    for (const e of [...pickedSpecs].sort((a, b) => b.group - a.group || b.alt - a.alt)) model = removeAlt(model, e.group, e.alt);
    setRequirement(t.target, t.kind, model);
  });

  // keyboard: Delete removes picked circles, Esc clears, Alt+arrows move the selected card
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (typing) return;
      if ((e.key === "Delete" || e.key === "Backspace") && picked.length) { e.preventDefault(); doDelete(); }
      else if (e.key === "Escape") { setPicked([]); setLinkFrom(null); setConnectMode(false); setPopover(null); }
      else if (e.key === "f" || e.key === "F") { if (!e.ctrlKey && !e.metaKey && !e.altKey) fit(); }
      else if (e.key === "?") setPopover((p) => (p === "keys" ? null : "keys"));
      else if (e.altKey && selected !== null && e.key.startsWith("Arrow")) {
        const cur = layout.positions.get(selected);
        if (!cur) return;
        e.preventDefault();
        if (e.key === "ArrowUp" && cur.row > 0) moveTo(selected, cur.semester, cur.row - 1);
        if (e.key === "ArrowDown") moveTo(selected, cur.semester, cur.row + 1);
        if (e.key === "ArrowLeft" && cur.semester > 1) moveTo(selected, cur.semester - 1, cur.row);
        if (e.key === "ArrowRight") moveTo(selected, cur.semester + 1, cur.row);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- save / undo ------------------------------------------------------------
  async function save(allow = allowUnknown) {
    if (!ops.length || saving) return;
    setSaving(true);
    try {
      const touched = new Set<number>();
      for (const o of ops) touched.add(o.courseId);
      const res = await fetch(`/api/admin/catalogs/${slug}/map/apply`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          catalogSlug: slug, ops, orderVersion: props.orderVersion, allowUnknown: allow,
          versions: Object.fromEntries([...touched].map((id) => [id, meta.get(id)!.version])),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        const w: string[] = body.warnings ?? [];
        note(`Guardado: ${body.changedRows} curso(s). Puedes deshacerlo desde el historial.${w.length ? ` Avisos (${w.length}): ${w.slice(0, 2).join("; ")}${w.length > 2 ? "…" : ""}` : ""}`, "ok");
        router.refresh();
      } else if (res.status === 409 && body.detail?.unknownCodes) {
        setUnknownAsk(body.detail.unknownCodes);
      } else {
        note(body.error ?? "No se pudo guardar; no se cambió nada.", "err");
      }
    } catch {
      note("Sin conexión: no se guardó nada.", "err");
    } finally {
      setSaving(false);
    }
  }

  async function undoEdit(id: number, force = false) {
    const res = await fetch(`/api/admin/map-edits/${id}/undo`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) { note("Edición deshecha.", "ok"); router.refresh(); }
    else if (res.status === 409 && body.detail?.conflicts && !force) {
      if (window.confirm(`${body.error}\n\n¿Forzar de todos modos?`)) await undoEdit(id, true);
    } else note(body.error ?? "No se pudo deshacer.", "err");
  }

  // ---- panel data ---------------------------------------------------------------
  const sel = selected !== null ? workById.get(selected) : undefined;
  const selMeta = selected !== null ? meta.get(selected) : undefined;
  const nameOfId = (id: number) => meta.get(id)?.name ?? "";
  const codeOfId = (id: number) => workById.get(id)?.code ?? "";
  const panel = sel && selMeta ? (() => {
    const pos = layout.positions.get(sel.id)!;
    const rep = reportById.get(sel.id);
    const strip = (f: ReturnType<typeof reportField>) => { const { visible: _v, ...rest } = f; void _v; return rest; };
    return (
      <MapSidePanel
        key={sel.id}
        slug={slug}
        course={{
          id: sel.id, code: sel.code, displayCode: selMeta.displayCode, name: selMeta.name, credits: selMeta.credits,
          semester: sel.semester, row: pos.row, rowsInSemester: work.filter((r) => r.semester === sel.semester).length,
          lockedFields: sel.lockedFields, isPlaceholder: selMeta.isPlaceholder,
          prereqUnparsed: selMeta.prereqUnparsed && !dirtyIds.has(sel.id), coreqUnparsed: selMeta.coreqUnparsed && !dirtyIds.has(sel.id),
          dirty: dirtyIds.has(sel.id),
        }}
        models={currentModels(sel.id)}
        planCodes={planCodes}
        dictionary={dictMap}
        alerts={rep ? { prereq: strip(rep.prereq), coreq: strip(rep.coreq) } : null}
        requires={docList.filter((e) => e.target === sel.id).map((e) => ({ code: codeOfId(e.source), name: nameOfId(e.source), kind: e.kind }))}
        gates={docList.filter((e) => e.source === sel.id).map((e) => ({ code: codeOfId(e.target), name: nameOfId(e.target), kind: e.kind }))}
        issues={issuesAll.filter((i) => i.code === sel.code)}
        onEdit={(kind, model) => setRequirement(sel.id, kind, model)}
        onMove={(semester, position) => moveTo(sel.id, semester, position)}
        onMessage={(t) => note(t, "err")}
      />
    );
  })() : null;

  const reason = !picked.length ? "Elige círculos en las aristas (Mayús/Ctrl para varios)."
    : !sameTarget ? "Los círculos deben ser del mismo curso y tipo."
    : "";
  const errCount = issuesNew.filter((i) => i.severity === "error").length;
  const warnCount = issuesNew.length - errCount;
  const togglePop = (p: "issues" | "history" | "keys") => setPopover((cur) => (cur === p ? null : p));

  const tool = (o: { label: string; hint?: string; on?: boolean; disabled?: boolean; danger?: boolean; onClick: () => void; icon: string }) => (
    <button
      className={`${s.tool} ${o.on ? s.on : ""} ${o.danger ? s.danger : ""}`} disabled={o.disabled} onClick={o.onClick}
      title={o.hint ?? o.label} aria-pressed={o.on} aria-label={o.label}
    >
      <span aria-hidden="true" className={s.toolIcon}>{o.icon}</span>
      <span className={s.toolLabel}>{o.label}</span>
    </button>
  );

  return (
    <div className={s.root} data-testid="map-editor">
      {/* ---- top bar ---- */}
      <header className={s.topbar}>
        <a
          className={s.back} href={props.backHref}
          onClick={(e) => { if (dirtyCount && !window.confirm("Hay cambios sin guardar. ¿Salir de todos modos?")) e.preventDefault(); }}
        >
          ← Catálogos
        </a>
        <h1 className={s.title}>{props.title}</h1>
        <a className={s.classic} href={props.classicHref}>Editor clásico</a>
        <span className={s.grow} />
        <span className={`${s.pill} ${dirtyCount ? s.pillDirty : ""}`} data-testid="dirty-pill">
          {dirtyCount ? `${dirtyCount} curso(s) con cambios sin guardar` : "Sin cambios"}
        </span>
        <button className={s.btn} disabled={!history.length} onClick={undoLocal} title="Deshacer el último cambio (aún sin guardar)">↶ Deshacer</button>
        <button className={s.btn} disabled={!ops.length} onClick={discard}>Descartar</button>
        <button
          className={`${s.btn} ${s.primary}`} disabled={!dirtyCount || saving || hasNewErrors} onClick={() => save()}
          title={hasNewErrors ? "Hay errores nuevos: corrígelos antes de guardar" : "Guardar cambios"}
        >
          {saving ? "Guardando…" : `Guardar${dirtyCount ? ` (${dirtyCount})` : ""}`}
        </button>
      </header>

      {dictionary.importId === null && (
        <div className={`${s.banner} ${s.info}`}>No hay un Registro aplicado: los códigos no se validan contra el diccionario.</div>
      )}
      {dictionary.importId !== null && !dictionary.coversCurrentTerm && (
        <div className={s.banner}>
          El diccionario del Registro llega hasta {dictionary.period}, pero el plan usa {dictionary.planTerm}. Importa el Registro del periodo actual para validar los códigos.
        </div>
      )}
      {unknownAsk && (
        <div className={`${s.banner} ${s.ask}`} role="alert" data-testid="unknown-ask">
          <div className={s.row}>
            <span>Códigos fuera del Registro: <strong>{unknownAsk.join(", ")}</strong>. ¿Agregarlos de todos modos?</span>
            <button className={`${s.btn} ${s.primary}`} onClick={() => { const a = [...new Set([...allowUnknown, ...unknownAsk])]; setAllowUnknown(a); setUnknownAsk(null); void save(a); }}>Sí, agregar</button>
            <button className={s.btn} onClick={() => setUnknownAsk(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ---- workspace ---- */}
      <div className={`${s.work} ${inspectorOpen ? "" : s.inspectorClosed}`}>
        <div className={s.stage}>
      {/* tool row */}
      <div className={s.toolrow} role="toolbar" aria-label="Herramientas del mapa">
        <div className={s.group} role="group" aria-label="Tipo de requisito al conectar">
          <span className={s.groupLabel}>Conectar como</span>
          <span className={s.seg}>
            <button className={`${s.segBtn} ${reqKind === "prereq" ? s.on : ""}`} aria-pressed={reqKind === "prereq"} onClick={() => setReqKind("prereq")}>
              <i className={s.dot} style={{ background: COLORS.prereq }} />Prerrequisito
            </button>
            <button className={`${s.segBtn} ${reqKind === "coreq" ? s.on : ""}`} aria-pressed={reqKind === "coreq"} onClick={() => setReqKind("coreq")}>
              <i className={s.dot} style={{ background: COLORS.coreq }} />Correquisito
            </button>
          </span>
        </div>
        <span className={s.vsep} />
        {tool({
          icon: "⤳", label: "Conectar por clic", on: connectMode, hint: "Haz clic en el requisito y luego en el curso que lo necesita",
          onClick: () => { setConnectMode(!connectMode); setLinkFrom(null); if (!connectMode) note("Haz clic en el requisito y luego en el curso que lo necesita (o arrastra del punto derecho al izquierdo).", "info"); },
        })}
        {tool({ icon: "◯", label: "Alternativas (O)", disabled: !canGroup, hint: canGroup ? "Agrupar los círculos elegidos como alternativas" : reason || "Elige círculos de grupos distintos", onClick: doGroup })}
        {tool({ icon: "⋮", label: "Separar", disabled: !canUngroup, hint: "Separar un grupo de alternativas", onClick: doUngroup })}
        {tool({ icon: "✕", label: "Eliminar", danger: true, disabled: !canDelete, hint: "Eliminar los círculos elegidos (Supr)", onClick: doDelete })}
        <span className={s.vsep} />
        <label className={s.check}><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Todas las aristas</label>
        <label className={s.check}><input type="checkbox" checked={showApi} onChange={(e) => setShowApi(e.target.checked)} /> Capa oficial (API)</label>
        <span className={`${s.chip} ${warnFields ? s.warn : ""}`} data-testid="warn-count" title="Diferencias entre el documento y la API (mismo conteo que Discrepancias)">⚠ {warnFields}</span>
      </div>

        <div className={s.canvas} data-testid="canvas">
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            onNodesChange={onNodesChange} onNodeClick={noopNodeClick} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop} onConnect={onConnect}
            onPaneClick={() => { setSelected(null); setPicked([]); setLinkFrom(null); setPopover(null); }}
            nodesConnectable={!connectMode} elementsSelectable={false} deleteKeyCode={null} selectionKeyCode={null}
            minZoom={0.25} maxZoom={1.8} fitView fitViewOptions={{ padding: 0.06 }} proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} color="#e8ebf0" />
          </ReactFlow>

          {/* view controls */}
          <div className={s.viewCtl}>
            <button className={s.iconBtn} onClick={() => void rf.zoomIn({ duration: 150 })} aria-label="Acercar" title="Acercar">+</button>
            <button className={s.iconBtn} onClick={() => void rf.zoomOut({ duration: 150 })} aria-label="Alejar" title="Alejar">−</button>
            <button className={s.iconBtn} onClick={fit} aria-label="Ajustar a la pantalla" title="Ajustar a la pantalla (F)">⤢</button>
          </div>

          {!inspectorOpen && (
            <button className={s.openInspector} onClick={() => setInspectorOpen(true)} aria-label="Mostrar panel del curso">‹ Panel</button>
          )}

          {msg ? (
            <div className={`${s.toast} ${msg.tone === "err" ? s.err : msg.tone === "ok" ? s.ok : ""}`} role="status" aria-live="polite" data-testid="status">
              <span>{msg.text}</span>
              <button className={s.toastX} onClick={() => setMsg(null)} aria-label="Cerrar mensaje">✕</button>
            </div>
          ) : (
            <span className={s.srOnly} role="status" aria-live="polite" data-testid="status">
              {dirtyCount ? `${dirtyCount} curso(s) con cambios sin guardar` : "Sin cambios"}
            </span>
          )}
        </div>
        </div>

        {inspectorOpen && (
          <div className={s.inspector}>
            <button className={s.collapse} onClick={() => setInspectorOpen(false)} aria-label="Ocultar panel del curso" title="Ocultar panel">›</button>
            {panel ?? (
              <aside className={s.panel} aria-label="Ayuda">
                <h2>Empieza aquí</h2>
                <p className={s.muted}>Haz clic en un curso para ver y editar sus requisitos.</p>
                <ul className={s.help}>
                  <li><b>Mover:</b> arrastra una tarjeta a otro semestre o fila.</li>
                  <li><b>Conectar:</b> arrastra del punto derecho de un curso al punto izquierdo de otro, o usa «Conectar por clic».</li>
                  <li><b>Alternativas (O):</b> elige dos círculos de las aristas de un curso (Mayús para varios) y pulsa «Alternativas».</li>
                  <li><b>Casos complejos:</b> edítalos en la lista o como texto, desde este panel.</li>
                </ul>
                <p className={s.muted}>Selecciona un curso para ver su panel. Pulsa <kbd>?</kbd> para ver los atajos de teclado.</p>
              </aside>
            )}
          </div>
        )}
      </div>

      {/* ---- bottom bar ---- */}
      <footer className={s.bottombar}>
        <div className={s.legend} aria-label="Leyenda">
          <span><i style={{ borderColor: COLORS.prereq }} />Prerrequisito (Y)</span>
          <span><i style={{ borderColor: COLORS.or }} />Alternativas (O)</span>
          <span><i style={{ borderColor: COLORS.coreq, borderTopStyle: "dashed" }} />Correquisito</span>
          <span><i style={{ borderColor: COLORS.api, borderTopStyle: "dotted" }} />Oficial (API), solo lectura</span>
          <span>≡ compuesta</span>
        </div>
        <span className={s.grow} />
        <div className={s.popWrap}>
          <button className={`${s.btn} ${s.small} ${errCount ? s.danger : ""}`} onClick={() => togglePop("issues")} aria-expanded={popover === "issues"}>
            {errCount ? `✕ ${errCount} error(es)` : warnCount ? `⚠ ${warnCount} aviso(s) nuevos` : "✓ Sin problemas nuevos"}
          </button>
          {popover === "issues" && (
            <div className={s.popover} role="dialog" aria-label="Problemas">
              <h3>Problemas nuevos</h3>
              {issuesNew.length === 0 ? <p className={s.muted}>Ningún problema nuevo.</p> : (
                <ul className={s.issues} data-testid="issues">{issuesNew.map((i, k) => <li key={k} className={i.severity}>{i.message}</li>)}</ul>
              )}
            </div>
          )}
        </div>
        <div className={s.popWrap}>
          <button className={`${s.btn} ${s.small}`} onClick={() => togglePop("history")} aria-expanded={popover === "history"}>Historial ({props.edits.length})</button>
          {popover === "history" && (
            <div className={s.popover} role="dialog" aria-label="Historial">
              <h3>Historial de ediciones</h3>
              {props.edits.length === 0 ? <p className={s.muted}>Sin ediciones del mapa.</p> : (
                <div className={s.history} data-testid="history">
                  {props.edits.slice(0, 10).map((e) => (
                    <div className={s.h} key={e.id}>
                      <span>#{e.id} · {e.actor} · {new Date(e.createdAt).toISOString().slice(0, 16).replace("T", " ")}</span>
                      {e.status === "applied" ? <button className={s.link} onClick={() => undoEdit(e.id)}>Deshacer</button> : <span className={s.muted}>deshecha</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className={s.popWrap}>
          <button className={`${s.btn} ${s.small}`} onClick={() => togglePop("keys")} aria-expanded={popover === "keys"} aria-label="Atajos de teclado">?</button>
          {popover === "keys" && (
            <div className={s.popover} role="dialog" aria-label="Atajos">
              <h3>Atajos</h3>
              <ul className={s.keys}>
                <li><kbd>Enter</kbd> seleccionar la tarjeta enfocada</li>
                <li><kbd>Alt</kbd> + <kbd>←↑↓→</kbd> mover el curso seleccionado</li>
                <li><kbd>Mayús</kbd>/<kbd>Ctrl</kbd> + clic en círculos: elegir varios</li>
                <li><kbd>Supr</kbd> eliminar los círculos elegidos</li>
                <li><kbd>Esc</kbd> cancelar selección / modo conectar</li>
                <li><kbd>F</kbd> ajustar a la pantalla</li>
              </ul>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

export default function MapEditor(props: MapEditorProps) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}
