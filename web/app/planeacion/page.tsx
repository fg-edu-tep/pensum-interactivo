import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { sortCatalogs } from "@/lib/catalogOrder";
import { FALLBACK_GUIDE_URL, GENIALLY_URL } from "@/lib/links";
import s from "./planeacion.module.css";

// "Planeación" (review of 2026-10-29, §8): the page the department site links
// to, with (1) the electives selector, (2) the planner and (3) the
// coordinator's Genially. The "Pensum" page of the site embeds the Genially
// and the electives widget, each with a link to open it full size — the
// snippets at the bottom are what the site team pastes.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Planeación — Ingeniería Eléctrica y Electrónica",
  description: "Selector de electivas, planeador del pensum y guía de transición del Departamento de Ingeniería Eléctrica y Electrónica.",
};

export default async function Planeacion() {
  const plans = sortCatalogs(
    await prisma.catalog.findMany({
      where: { status: "published" },
      select: { slug: true, programName: true, programCode: true, variantLabel: true, accentColor: true },
    })
  );
  const host = process.env.NEXT_PUBLIC_SITE_URL || "https://<este-sitio>";

  return (
    <main className={s.page}>
      <header className={s.head}>
        <span className={s.kicker}>Departamento de Ingeniería Eléctrica y Electrónica</span>
        <h1>Planeación</h1>
        <p>Elige tus electivas, planea tu próximo semestre y revisa las reglas de transición, todo desde aquí.</p>
      </header>

      <section className={s.block} aria-labelledby="p-elec">
        <div className={s.blockHead}>
          <span className={s.num}>1</span>
          <div>
            <h2 id="p-elec">Selector de electivas</h2>
            <p>Qué te vale como electiva o como curso integrador en tu programa, y qué se dicta este semestre o el próximo.</p>
          </div>
        </div>
        <iframe className={s.venn} src="/embed/electivas" title="Selector de electivas" loading="lazy" />
        <a className={s.guide} href="/embed/electivas" target="_blank" rel="noopener noreferrer">
          Abrir en grande →
        </a>
      </section>

      <section className={s.block} aria-labelledby="p-plan">
        <div className={s.blockHead}>
          <span className={s.num}>2</span>
          <div>
            <h2 id="p-plan">Planeador</h2>
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

      <section className={s.block} aria-labelledby="p-guide">
        <div className={s.blockHead}>
          <span className={s.num}>3</span>
          <div>
            <h2 id="p-guide">Guía de transición (Genially)</h2>
            <p>Las reglas de transición entre el pensum anterior y el nuevo, mientras no están en la herramienta.</p>
          </div>
        </div>
        {GENIALLY_URL ? (
          <>
            <iframe className={s.venn} src={GENIALLY_URL} title="Guía de transición" loading="lazy" allowFullScreen />
            <a className={s.guide} href={GENIALLY_URL} target="_blank" rel="noopener noreferrer">
              Abrir en grande →
            </a>
          </>
        ) : (
          <p className={s.pending}>El enlace del Genially llega pronto. Mientras tanto, la guía de Registro para armar tu horario:</p>
        )}
        <a className={s.guide} href={FALLBACK_GUIDE_URL} target="_blank" rel="noopener noreferrer">
          ¿Cómo hacer mi horario? (Registro) →
        </a>
      </section>

      <section className={s.block} aria-labelledby="p-embed">
        <div className={s.blockHead}>
          <span className={s.num}>·</span>
          <div>
            <h2 id="p-embed">Para el equipo del sitio: página “Pensum”</h2>
            <p>Pega estos bloques en la página del pensum. Cada uno lleva su enlace para abrirlo en grande en otra pestaña.</p>
          </div>
        </div>
        <pre className={s.snippet}>{`<iframe src="${host}/embed/electivas" width="100%" height="680" style="border:0" loading="lazy" title="Selector de electivas"></iframe>
<p><a href="${host}/embed/electivas" target="_blank" rel="noopener">Abrir el selector de electivas en grande</a></p>
${
  GENIALLY_URL
    ? `<iframe src="${GENIALLY_URL}" width="100%" height="600" style="border:0" loading="lazy" allowfullscreen title="Guía de transición"></iframe>
<p><a href="${GENIALLY_URL}" target="_blank" rel="noopener">Abrir la guía en grande</a></p>`
    : "<!-- Genially: pendiente del enlace (NEXT_PUBLIC_GENIALLY_URL) -->"
}`}</pre>
      </section>
    </main>
  );
}
