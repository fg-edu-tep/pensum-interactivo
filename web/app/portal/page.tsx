import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { sortCatalogs } from "@/lib/catalogOrder";
import { FALLBACK_GUIDE_URL } from "@/lib/links";
import s from "./portal.module.css";

// Layout PROPOSAL for the department portal (section 7 of the 2026-10-29
// review): one entry point with three blocks — the planner, the electives
// Venn (the same /embed/electivas the department site can iframe) and the
// fallback guide. To be reviewed with the coordinator; not linked from the app.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portal del pensum — propuesta",
  description: "Planeador, electivas y guía del pensum de Ingeniería Eléctrica y Electrónica en un solo lugar.",
  robots: { index: false },
};

export default async function PortalProposal() {
  const plans = sortCatalogs(
    await prisma.catalog.findMany({
      where: { status: "published" },
      select: { slug: true, programName: true, programCode: true, variantLabel: true, accentColor: true },
    })
  );

  return (
    <main className={s.page}>
      <header className={s.head}>
        <span className={s.kicker}>Propuesta de portal · Departamento de Ingeniería Eléctrica y Electrónica</span>
        <h1>Tu pensum, en un solo lugar</h1>
        <p>Planea tu semestre, explora las electivas de tu programa y, si lo necesitas, consulta la guía paso a paso.</p>
      </header>

      <section className={s.block} aria-labelledby="p-plan">
        <div className={s.blockHead}>
          <span className={s.num}>1</span>
          <div>
            <h2 id="p-plan">Planea tu semestre</h2>
            <p>Marca lo que ya viste, arma tu canasta y mira qué se te habilita este semestre y el próximo.</p>
          </div>
        </div>
        <ul className={s.plans}>
          {plans.map((p) => (
            <li key={p.slug}>
              <Link href={`/p/${p.slug}`} style={{ ["--accent" as string]: p.accentColor ?? "#1f6fc4" }}>
                <strong>{p.programName}</strong>
                <span>{p.variantLabel || "Plan estándar"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.block} aria-labelledby="p-elec">
        <div className={s.blockHead}>
          <span className={s.num}>2</span>
          <div>
            <h2 id="p-elec">Electivas por programa</h2>
            <p>Cuáles valen para Eléctrica, cuáles para Electrónica y cuáles para ambas. Toca un curso para ver qué necesitas.</p>
          </div>
        </div>
        <iframe className={s.venn} src="/embed/electivas" title="Diagrama de Venn de electivas" loading="lazy" />
      </section>

      <section className={s.block} aria-labelledby="p-guide">
        <div className={s.blockHead}>
          <span className={s.num}>3</span>
          <div>
            <h2 id="p-guide">Guía del pensum</h2>
            <p>
              Las reglas de transición (pensum anterior y nuevo) y el paso a paso para inscribir. Úsala también si el planeador
              no está disponible.
            </p>
          </div>
        </div>
        <a className={s.guide} href={FALLBACK_GUIDE_URL} target="_blank" rel="noopener noreferrer">
          Abrir la guía →
        </a>
      </section>
    </main>
  );
}
