"use client";

import { groupColor, GROUP_LABEL, type CourseGroup } from "./format";
import { PointerIcon } from "./icons";
import styles from "./explorer.module.css";

const STEPS = [
  { title: "Toca un curso", body: "Aquí verás qué necesitas aprobar antes y qué te desbloquea." },
  {
    title: "Directas o toda la cadena",
    body: "Directas para saber si puedes inscribirla; la cadena completa para planear desde lejos.",
  },
  { title: "Pasa a Mi avance", body: "Marca lo que ya aprobaste y el mapa te muestra qué puedes ver el próximo semestre." },
];

const KEY_GROUPS: CourseGroup[] = ["iele", "cb", "otr", "pro"];

export default function OnboardingPanel({
  onGoToProgress,
  onStartTour,
}: {
  onGoToProgress: () => void;
  onStartTour: () => void;
}) {
  return (
    <aside className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.lbl}>Empieza aquí</span>
        <h2 className={styles.panelTitle} style={{ fontSize: 18 }}>
          Cómo leer este mapa
        </h2>
      </div>
      <div className={styles.panelBody}>
        <div className={styles.onboardBody}>
          <p className={styles.onboardLead}>
            Cada columna es un semestre sugerido y cada tarjeta, un curso. Todo lo demás aparece cuando lo necesitas.
          </p>
          {STEPS.map((s, i) => (
            <div className={styles.stepBox} key={s.title}>
              <span className={styles.stepNum}>{i + 1}</span>
              <div>
                <div className={styles.stepTitle}>{s.title}</div>
                <div className={styles.stepBody}>{s.body}</div>
              </div>
            </div>
          ))}
          <div className={styles.box}>
            <span className={styles.lbl}>El color es el tipo de curso</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {KEY_GROUPS.map((g) => (
                <div key={g} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: groupColor(g), flexShrink: 0 }} />
                  {GROUP_LABEL[g]}
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, border: "1.5px dashed var(--t-ele)", flexShrink: 0 }} />
                Electivas y otros espacios por definir (borde punteado)
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.panelFooter}>
        <button className={styles.btnPrimary} onClick={onStartTour}>
          Hacer el recorrido
        </button>
        <button className={styles.btnGhostFooter} onClick={onGoToProgress}>
          Ir a Mi avance
        </button>
      </div>
    </aside>
  );
}

export function HintPill({ onStartTour }: { onStartTour: () => void }) {
  return (
    <div className={styles.hintPill}>
      <PointerIcon />
      Toca un curso para ver qué necesitas y qué te abre
      <button className={styles.hintPillCta} onClick={onStartTour}>
        Recorrido de 1 min
      </button>
    </div>
  );
}
