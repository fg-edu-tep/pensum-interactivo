import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import ElectiveTable, {
  type EditorElective,
} from "@/components/admin/ElectiveTable";

export const dynamic = "force-dynamic";

export default async function ElectivasPage() {
  const rows = await prisma.elective.findMany({ orderBy: { name: "asc" } });
  const electives: EditorElective[] = rows.map((e) => ({
    id: e.id,
    name: e.name,
    code: e.code ?? "",
    nextOfferingTerm: e.nextOfferingTerm ?? "",
    level: e.level,
    ciclo: e.ciclo ?? "",
    isCursoIntegrador: e.isCursoIntegrador,
    offeredTerms: ((e.offeredTerms as unknown as string[] | null) ?? []).join(", "),
    roles: (e.roles as unknown as EditorElective["roles"]) ?? {
      eleFrom2024: { norm: null, raw: "" },
      elcFrom2024: { norm: null, raw: "" },
      eleUntil2023: { norm: null, raw: "" },
      elcUntil2023: { norm: null, raw: "" },
    },
  }));

  // absolute URL for the copy-paste iframe snippet
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const embedUrl = `${proto}://${host}/embed/electivas`;

  return (
    <>
      <h1>Electivas</h1>
      <p className="admin-sub">
        Bolsa de electivas ({electives.length}). Los 4 roles indican para qué
        cuenta cada electiva por programa y era del pensum.
      </p>
      <ElectiveTable electives={electives} />

      <details className="admin-section" style={{ marginTop: 28 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
          Diagrama de Venn para incrustar (Eléctrica · Electrónica)
        </summary>
        <p className="admin-note">
          Página pública e incrustable en otros sitios. Se arma con esta bolsa: rol 2024-I+ de cada programa
          (sin obligatorias) y maestría = sección MAESTRÍA o código 4000. Agrega <code>?oferta=1</code> para
          abrirla filtrada a las que se dictan este semestre.
        </p>
        <input
          className="admin-input"
          readOnly
          style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
          value={`<iframe src="${embedUrl}" width="100%" height="560" style="border:0" title="Electivas IELE / IELC / Maestría"></iframe>`}
        />
        <iframe
          src="/embed/electivas"
          title="Vista previa del diagrama de Venn de electivas"
          style={{ width: "100%", height: 560, border: "1px solid #e5e7eb", borderRadius: 8, marginTop: 12 }}
        />
      </details>
    </>
  );
}
