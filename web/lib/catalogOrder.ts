// The one order every catalog list follows (landing picker, plan switcher,
// /api/catalogs): Electrónica, Eléctrica, Doble programa, then the Maestrías.
// Inside a family the standard plan comes before its variants (con
// Precálculo), then by slug so the order is stable.

export interface OrderableCatalog {
  slug: string;
  programName?: string | null;
  programCode?: string | null;
  variantLabel?: string | null;
}

function fold(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** 0 Electrónica · 1 Eléctrica · 2 Doble programa · 3 Maestrías · 4 anything else */
export function catalogFamilyRank(c: OrderableCatalog): number {
  const slug = fold(c.slug);
  const name = fold(c.programName);
  const code = fold(c.programCode);
  // maestrías first: their slugs/codes also contain "iele"
  if (slug.startsWith("m-") || name.includes("maestr") || code.startsWith("m")) return 3;
  if (slug.startsWith("doble") || code === "doble" || name.includes("doble")) return 2;
  if (slug.startsWith("ielc") || code === "ielc" || name.includes("electronica")) return 0;
  if (slug.startsWith("iele") || code === "iele" || name.includes("electrica")) return 1;
  return 4;
}

function variantRank(c: OrderableCatalog): number {
  return c.variantLabel && c.variantLabel.trim() ? 1 : 0;
}

export function compareCatalogs(a: OrderableCatalog, b: OrderableCatalog): number {
  return (
    catalogFamilyRank(a) - catalogFamilyRank(b) ||
    variantRank(a) - variantRank(b) ||
    a.slug.localeCompare(b.slug)
  );
}

export function sortCatalogs<T extends OrderableCatalog>(list: T[]): T[] {
  return [...list].sort(compareCatalogs);
}
