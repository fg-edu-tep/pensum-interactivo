// Builds the human-editable coordinator import templates (PLANES.xlsx /
// ELECTIVAS.xlsx) from the current DB. Shared by the CLI
// (scripts/exportTemplates.ts) and the admin download routes
// (app/api/admin/templates/*). One row = one course/slot; `Semestre` is an
// explicit column (never inferred). Format contract: scripts/exportTemplates.md.

import ExcelJS from "exceljs";
import { prisma } from "../db";

const TYPE_LABEL: Record<string, string> = {
  nucleo: "Núcleo",
  electiva: "Electiva",
  cbu: "CBU",
  complementaria: "Libre elección",
  proyecto: "Proyecto",
};
const ROLE_LABEL: Record<string, string> = {
  obligatoria: "Obligatoria",
  electiva: "Electiva",
  area_mayor: "Área mayor",
  curso_integrador: "Curso integrador",
  proy_grado: "Proyecto de grado",
  cle: "Libre elección",
  practica: "Práctica",
  pasantia: "Pasantía",
  maestria: "Electiva de maestría",
};
const LEVEL_LABEL: Record<string, string> = {
  pregrado: "Pregrado",
  maestria: "Maestría",
  other: "—",
};

const CATALOG_ORDER = [
  "iele-cbu3",
  "iele-cbu3-pc",
  "ielc-cbu3",
  "ielc-cbu3-pc",
  "doble-cbu3",
];
const SHEET_NAME: Record<string, string> = {
  "iele-cbu3": "IELE CBU3",
  "iele-cbu3-pc": "IELE CBU3 PC",
  "ielc-cbu3": "IELC CBU3",
  "ielc-cbu3-pc": "IELC CBU3 PC",
  "doble-cbu3": "DOBLE CBU3",
};

// exceljs ships `worksheet.dataValidations` at runtime but not in its .d.ts.
function addValidation(
  ws: ExcelJS.Worksheet,
  range: string,
  rule: { type: string; allowBlank?: boolean; formulae: string[] }
) {
  (ws as unknown as { dataValidations: { add(r: string, o: unknown): void } })
    .dataValidations.add(range, rule);
}

function argb(hex: string | null | undefined): string {
  const h = (hex ?? "#1f6fc4").replace("#", "").toUpperCase();
  return `FF${h.padEnd(6, "0").slice(0, 6)}`;
}

const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } } as const;
const PLACEHOLDER_FONT = { italic: true, color: { argb: "FF6B7280" } } as const;
const BAND_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF3F6F9" },
} as const;
const TOTAL_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEAEFF3" },
} as const;

function styleHeader(row: ExcelJS.Row, accent: string) {
  row.font = HEADER_FONT;
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height = 26;
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accent } };
    c.border = { bottom: { style: "thin", color: { argb: "FF9AA5B1" } } };
  });
}

function addInstructions(wb: ExcelJS.Workbook, lines: string[]) {
  const ws = wb.addWorksheet("_INSTRUCCIONES");
  ws.getColumn(1).width = 100;
  lines.forEach((line, i) => {
    const row = ws.addRow([line]);
    if (i === 0) row.font = { bold: true, size: 14 };
    else if (line && !line.startsWith("  ") && line === line.toUpperCase())
      row.font = { bold: true };
  });
  ws.views = [{ showGridLines: false }];
}

// ---------- PLANES.xlsx ----------

export async function buildPlanesWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pensum Interactivo — plantillas";
  wb.created = new Date();

  const catalogs = await prisma.catalog.findMany({ orderBy: { slug: "asc" } });
  const bySlug = new Map(catalogs.map((c) => [c.slug, c]));

  for (const slug of CATALOG_ORDER) {
    const cat = bySlug.get(slug);
    if (!cat) continue;
    const accent = argb(cat.accentColor);

    const ws = wb.addWorksheet(SHEET_NAME[slug] ?? slug, {
      views: [{ state: "frozen", xSplit: 2, ySplit: 1 }],
      pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = [
      { header: "Semestre", key: "sem", width: 10 },
      { header: "Código", key: "code", width: 16 },
      { header: "Nombre", key: "name", width: 44 },
      { header: "Créditos", key: "cr", width: 9 },
      { header: "Tipo", key: "type", width: 15 },
      { header: "Prerrequisito (respaldo, opcional)", key: "prereq", width: 46 },
      { header: "Notas del coordinador", key: "notes", width: 30 },
    ];
    styleHeader(ws.getRow(1), accent);
    ws.getColumn("name").alignment = { wrapText: true, vertical: "top" };
    ws.getColumn("prereq").alignment = { wrapText: true, vertical: "top" };
    ws.getColumn("notes").alignment = { wrapText: true, vertical: "top" };
    ws.getColumn("sem").alignment = { horizontal: "center" };
    ws.getColumn("cr").alignment = { horizontal: "center" };
    ws.autoFilter = { from: "A1", to: "G1" };

    const rows = (
      await prisma.catalogCourse.findMany({
        where: { catalogId: cat.id },
        orderBy: { sortIndex: "asc" },
        select: {
          displayCode: true,
          name: true,
          credits: true,
          suggestedSemester: true,
          courseType: true,
          isPlaceholder: true,
          prereqText: true,
        },
      })
    )
      .map((c, i) => ({ c, i }))
      .sort((a, b) => a.c.suggestedSemester - b.c.suggestedSemester || a.i - b.i)
      .map((x) => x.c);

    let r = 2;
    const semesters = [
      ...new Set(rows.map((c) => c.suggestedSemester)),
    ].sort((a, b) => a - b);
    for (const sem of semesters) {
      const group = rows.filter((c) => c.suggestedSemester === sem);
      const first = r;
      for (const c of group) {
        const row = ws.addRow({
          sem: c.suggestedSemester,
          code: c.displayCode,
          name: c.name,
          cr: c.credits,
          type: TYPE_LABEL[c.courseType] ?? c.courseType,
          prereq: c.prereqText || "",
          notes: "",
        });
        if (sem % 2 === 0) row.eachCell((cell) => (cell.fill = BAND_FILL));
        if (c.isPlaceholder) row.font = PLACEHOLDER_FONT;
        r++;
      }
      const total = ws.addRow({
        sem: "",
        code: "",
        name: `Total Semestre ${sem}`,
        cr: { formula: `SUM(D${first}:D${r - 1})` },
        type: "",
        prereq: "",
        notes: "",
      });
      total.font = { bold: true, color: { argb: "FF475569" } };
      total.eachCell((cell) => (cell.fill = TOTAL_FILL));
      r++;
    }

    addValidation(ws, `E2:E${r + 400}`, {
      type: "list",
      allowBlank: true,
      formulae: ['"Núcleo,Electiva,CBU,Libre elección,Proyecto"'],
    });
    ws.addConditionalFormatting({
      ref: `A2:A${r + 400}`,
      rules: [
        {
          type: "expression",
          formulae: ['AND($B2<>"",$A2="")'],
          priority: 1,
          style: {
            fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } },
          },
        },
      ],
    });
  }

  // --- _CATALOGOS ---
  const wsCat = wb.addWorksheet("_CATALOGOS", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  wsCat.columns = [
    { header: "Slug", key: "slug", width: 16 },
    { header: "Programa", key: "prog", width: 24 },
    { header: "Variante", key: "var", width: 18 },
    { header: "Término objetivo", key: "term", width: 16 },
    { header: "Estado", key: "status", width: 12 },
    { header: "Color", key: "color", width: 12 },
    { header: "Tagline", key: "tagline", width: 50 },
  ];
  styleHeader(wsCat.getRow(1), "FF334155");
  for (const slug of CATALOG_ORDER) {
    const c = bySlug.get(slug);
    if (!c) continue;
    wsCat.addRow({
      slug: c.slug,
      prog: c.programName,
      var: c.variantLabel,
      term: c.term,
      status: c.status,
      color: c.accentColor ?? "",
      tagline: c.tagline ?? "",
    });
  }
  addValidation(wsCat, "E2:E20", {
    type: "list",
    allowBlank: false,
    formulae: ['"draft,published,archived"'],
  });

  // --- _REQUISITOS_GRADO ---
  const wsReq = wb.addWorksheet("_REQUISITOS_GRADO", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  wsReq.columns = [
    { header: "ID", key: "id", width: 22 },
    { header: "Etiqueta", key: "label", width: 38 },
    { header: "Descripción", key: "desc", width: 60 },
    { header: "Tipo", key: "type", width: 14 },
    { header: "Regla (solo gates)", key: "rule", width: 50 },
  ];
  styleHeader(wsReq.getRow(1), "FF334155");
  wsReq.getColumn("desc").alignment = { wrapText: true, vertical: "top" };
  wsReq.getColumn("rule").alignment = { wrapText: true, vertical: "top" };
  const rules = (bySlug.get("iele-cbu3")?.rules ?? {}) as {
    attestations?: { id: string; label: string; description?: string; autoGatePrereqRegex?: string }[];
    gates?: { id: string; label: string; appliesTo?: unknown; condition?: unknown }[];
  };
  for (const a of rules.attestations ?? []) {
    wsReq.addRow({
      id: a.id,
      label: a.label,
      desc: a.description ?? "",
      type: "atestación",
      rule: a.autoGatePrereqRegex ? `autoGatePrereqRegex: ${a.autoGatePrereqRegex}` : "",
    });
  }
  for (const g of rules.gates ?? []) {
    wsReq.addRow({
      id: g.id,
      label: g.label,
      desc: "",
      type: "gate",
      rule: JSON.stringify({ appliesTo: g.appliesTo, condition: g.condition }),
    });
  }
  addValidation(wsReq, "D2:D50", {
    type: "list",
    allowBlank: false,
    formulae: ['"atestación,gate"'],
  });

  // --- _NODOS_REQUISITO ---
  const wsNode = wb.addWorksheet("_NODOS_REQUISITO", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  wsNode.columns = [
    { header: "Key", key: "key", width: 22 },
    { header: "Etiqueta", key: "label", width: 34 },
    { header: "Semestre", key: "sem", width: 10 },
    { header: "Atestación asociada", key: "att", width: 20 },
    { header: "Auto-enlace (regex)", key: "re", width: 24 },
    { header: "Cursos que lo exigen", key: "linked", width: 34 },
    { header: "URL info", key: "url", width: 40 },
    { header: "Descripción", key: "desc", width: 60 },
  ];
  styleHeader(wsNode.getRow(1), "FF334155");
  wsNode.getColumn("desc").alignment = { wrapText: true, vertical: "top" };
  const nodes = await prisma.requirementNode.findMany({ orderBy: { key: "asc" } });
  const seenKey = new Set<string>();
  for (const n of nodes) {
    if (seenKey.has(n.key)) continue;
    seenKey.add(n.key);
    wsNode.addRow({
      key: n.key,
      label: n.label,
      sem: n.semester,
      att: n.attestationId ?? "",
      re: n.autoLinkRegex ?? "",
      linked: ((n.linkedCourseCodes as string[] | null) ?? []).join(", "),
      url: n.infoUrl ?? "",
      desc: n.description ?? "",
    });
  }
  wsNode.getColumn("sem").alignment = { horizontal: "center" };

  addInstructions(wb, [
    "PLANES.xlsx — estructura curricular",
    "",
    "Una fila = un curso o espacio del plan. Editable semestre a semestre.",
    "",
    "HOJAS DE PLAN (IELE CBU3, IELE CBU3 PC, …)",
    "  • Semestre  — OBLIGATORIO. Lo define el coordinador; el sistema nunca lo infiere.",
    "                Si lo dejas vacío, la fila se marca en rojo y falla la validación.",
    "  • Código    — 'IELE 2100' para un curso real; o un token de espacio:",
    "                CBU · ELECTIVA IELE · CLE · EFI · IELE CI · MATE (departamento).",
    "  • Nombre    — nombre del curso o etiqueta del espacio.",
    "  • Créditos  — obligatorio para espacios (CBU, electivas…). Para un curso real",
    "                puedes dejarlo vacío: lo completa la API de oferta.",
    "  • Tipo      — opcional (se infiere del código si lo dejas vacío).",
    "  • Prerrequisito — SOLO respaldo para cursos que no se ofrecen este término.",
    "                Si el curso está en la oferta, mandan los datos de la API.",
    "  • Notas     — libre; el sistema lo ignora.",
    "  • Las filas 'Total Semestre N' son informativas; el sistema las ignora.",
    "",
    "HOJAS DE CONFIGURACIÓN (empiezan con _)",
    "  _CATALOGOS        — un renglón por plan: término objetivo, estado, color, tagline.",
    "  _REQUISITOS_GRADO — atestaciones y gates de grado. Agrega/quita filas para",
    "                      agregar/quitar requisitos (idioma, internacionalización, Saber Pro…).",
    "  _NODOS_REQUISITO  — los nodos de 0 créditos del mapa (lectura en inglés).",
    "                      'Cursos que lo exigen' + 'Auto-enlace (regex)' controlan a qué",
    "                      materias se conecta.",
    "",
    "CARGA",
    "  El sistema compara este archivo contra la base y muestra un diff por campo",
    "  antes de aplicar. Las filas que un administrador ya editó a mano no se pisan",
    "  en silencio: aparecen como conflicto para confirmar.",
  ]);

  return wb;
}

// ---------- ELECTIVAS.xlsx ----------

/** "SE DICTA" values the electives parser reads back (parseFrequency). */
const FREQUENCY_TEXT: Record<string, string> = {
  s1: "Primer semestre",
  s2: "Segundo semestre",
  both: "Ambos",
  biennial: "Cada dos años",
};

export async function buildElectivasWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pensum Interactivo — plantillas";
  wb.created = new Date();

  const ws = wb.addWorksheet("ELECTIVAS", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { header: "Nombre largo del curso", key: "name", width: 46 },
    { header: "Rol Eléctrica (2024-I+)", key: "eleN", width: 18 },
    { header: "Rol Electrónica (2024-I+)", key: "elcN", width: 18 },
    { header: "Rol Eléctrica (hasta 2023-II)", key: "eleO", width: 18 },
    { header: "Rol Electrónica (hasta 2023-II)", key: "elcO", width: 18 },
    { header: "Es Curso Integrador", key: "ci", width: 16 },
    { header: "Ofertada (términos)", key: "terms", width: 18 },
    { header: "Nivel", key: "level", width: 12 },
    { header: "Ciclo (maestría)", key: "ciclo", width: 24 },
    { header: "Código (opcional)", key: "code", width: 14 },
    // blank = derived from the Registro history at seed time
    { header: "Se dicta", key: "freq", width: 18 },
  ];
  styleHeader(ws.getRow(1), "FF0E8A95");
  ws.getColumn("name").alignment = { wrapText: true, vertical: "top" };
  ws.getColumn("ci").alignment = { horizontal: "center" };
  ws.autoFilter = { from: "A1", to: "K1" };

  const electives = await prisma.elective.findMany({ orderBy: { name: "asc" } });
  const roleText = (cell: { norm: string | null; raw: string } | undefined) => {
    if (!cell) return "";
    if (cell.norm) return ROLE_LABEL[cell.norm] ?? cell.norm;
    return cell.raw || "";
  };
  for (const e of electives) {
    const roles = e.roles as unknown as {
      eleFrom2024?: { norm: string | null; raw: string };
      elcFrom2024?: { norm: string | null; raw: string };
      eleUntil2023?: { norm: string | null; raw: string };
      elcUntil2023?: { norm: string | null; raw: string };
    };
    const row = ws.addRow({
      name: e.name,
      eleN: roleText(roles.eleFrom2024),
      elcN: roleText(roles.elcFrom2024),
      eleO: roleText(roles.eleUntil2023),
      elcO: roleText(roles.elcUntil2023),
      ci: e.isCursoIntegrador ? "Sí" : "No",
      terms: ((e.offeredTerms as unknown as string[] | null) ?? []).join(", "),
      level: LEVEL_LABEL[e.level] ?? e.level,
      ciclo: e.ciclo ?? "",
      code: e.code ?? "",
      freq: e.frequencySource === "excel" && e.frequency ? FREQUENCY_TEXT[e.frequency] ?? "" : "",
    });
    if (e.isCursoIntegrador) {
      row.getCell("ci").font = { bold: true, color: { argb: "FF166534" } };
    }
  }

  const lastRow = ws.rowCount + 200;
  const roleList =
    '"Obligatoria,Electiva,Área mayor,Curso integrador,Proyecto de grado,Libre elección,Práctica,Pasantía,Electiva de maestría"';
  for (const col of ["B", "C", "D", "E"]) {
    addValidation(ws, `${col}2:${col}${lastRow}`, {
      type: "list",
      allowBlank: true,
      formulae: [roleList],
    });
  }
  addValidation(ws, `F2:F${lastRow}`, {
    type: "list",
    allowBlank: false,
    formulae: ['"Sí,No"'],
  });
  addValidation(ws, `K2:K${lastRow}`, {
    type: "list",
    allowBlank: true,
    formulae: ['"Primer semestre,Segundo semestre,Ambos,Cada dos años"'],
  });
  addValidation(ws, `H2:H${lastRow}`, {
    type: "list",
    allowBlank: true,
    formulae: ['"Pregrado,Maestría"'],
  });

  addInstructions(wb, [
    "ELECTIVAS.xlsx — bolsa de electivas",
    "",
    "Una fila = una electiva. Las 4 columnas de rol dicen para qué cuenta esa",
    "electiva en cada programa (Eléctrica / Electrónica) y en cada era del pensum",
    "(desde 2024-I / hasta 2023-II). Vacío = no aplica para ese programa/era.",
    "",
    "  • Es Curso Integrador — Sí sólo si la electiva puede llenar el espacio",
    "    'Curso Integrador' del plan.",
    "  • Ofertada (términos)  — lista separada por coma, p. ej. '202620, 202710'.",
    "  • Código               — opcional; si lo conoces, ayuda al emparejamiento.",
    "",
    "El sistema compara contra la base y muestra un diff antes de aplicar.",
  ]);

  return wb;
}

/** Serialize a workbook to a Buffer (Node route handlers + the CLI). */
export async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}
