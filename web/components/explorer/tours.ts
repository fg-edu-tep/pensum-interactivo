import type { TourStepDef } from "./Tour";

/** Steps carry only copy + a target; the state each step needs (a course
 * selected, the side panel open, the right mode) is set up by `prepare` in
 * PensumExplorer, keyed by step id. */

export type TourKind = "explore" | "avance";

export function exploreSteps(anchorId: string | null): TourStepDef[] {
  const card = anchorId ? `[data-course-id="${anchorId}"]` : undefined;
  return [
    {
      id: "welcome",
      title: "Recorrido del mapa",
      body: "En un minuto ves cómo leer el pensum, qué significa cada color y cómo se conectan los cursos. Puedes salir cuando quieras.",
    },
    {
      id: "card",
      target: card,
      title: "Cada tarjeta es un curso",
      body: "Arriba el código y los créditos; abajo el nombre. Cada columna es un semestre sugerido y el color indica el tipo de curso.",
    },
    {
      id: "groups",
      target: '[data-tour="groups"]',
      title: "Los colores son tipos de curso",
      body: "IELE, ciencias básicas, otras facultades, proyecto, electivas y CBU. Apaga un tipo para dejar solo lo que te interesa.",
    },
    {
      id: "select",
      target: card,
      title: "Toca un curso para ver su ruta",
      body: "Se iluminan los cursos que necesitas antes y los que se abren después. El resto se atenúa para que no te pierdas.",
    },
    {
      id: "relaciones",
      target: '[data-tour="relaciones"]',
      title: "¿Solo lo inmediato o todo el camino?",
      body: "Directas muestra solo lo que necesitas para inscribir el curso. Toda la cadena suma también los requisitos de esos requisitos.",
    },
    {
      id: "legend",
      target: '[data-tour="legend"]',
      title: "Líneas continuas y punteadas",
      body: "Una flecha continua es un prerrequisito: debe estar aprobado antes. Una línea punteada es un correquisito, o un prerrequisito que puedes cursar el mismo semestre.",
    },
    {
      id: "panel",
      target: '[data-tour="panel"]',
      title: "El panel del curso",
      body: "Aquí ves la ruta resumida (necesitas → este curso → desbloquea), si se dicta este periodo, los requisitos numerados y la descripción. Toca cualquier código para saltar a ese curso.",
    },
    {
      id: "search",
      target: '[data-tour="search"]',
      title: "Busca por nombre o código",
      body: "Escribe, o presiona / en cualquier momento, para atenuar todo lo que no coincide.",
    },
    {
      id: "mode",
      target: '[data-tour="mode"]',
      title: "Y ahora, tu avance",
      body: "Cambia a Mi avance para marcar lo que ya viste y saber qué puedes inscribir. Allí tienes otra guía paso a paso.",
    },
  ];
}

export function avanceSteps(): TourStepDef[] {
  return [
    {
      id: "welcome",
      title: "Mi avance, paso a paso",
      body: "Marca lo que ya viste, mira qué puedes inscribir y arma el plan del próximo semestre. Todo se guarda en este navegador.",
    },
    {
      id: "quick",
      target: '[data-tour="quick"]',
      title: "1 · Marca lo que ya viste",
      body: "Selección rápida te da dos caminos: por semestre (marcamos todo lo anterior a tu semestre y tú corriges las excepciones) o con la herramienta de selección, tocando curso por curso.",
    },
    {
      id: "states",
      target: '[data-tour="status"]',
      title: "2 · Lee los colores",
      body: "Verde con ✓: ya lo viste. Pastilla azul con el semestre: está en tu canasta. Rayado gris: aún te faltan prerrequisitos. Sin marca: lo puedes inscribir ahora. Marcar un curso no marca los anteriores: tú decides, por si tienes homologaciones.",
    },
    {
      id: "legend",
      target: '[data-tour="legend"]',
      title: "Líneas continuas y punteadas",
      body: "Al tocar un curso verás sus conexiones: línea azul continua = prerrequisito (debe estar aprobado antes); línea ámbar punteada = correquisito (se inscribe al tiempo o puede cursarse el mismo semestre).",
    },
    {
      id: "progress",
      target: '[data-tour="progress"]',
      title: "3 · Tu progreso",
      body: "Créditos aprobados sobre el total del plan. La barra suma también lo que llevas en tu plan del próximo semestre.",
    },
    {
      id: "cart",
      target: '[data-tour="cart"]',
      title: "4 · Tu canasta del próximo semestre",
      body: "Agrega cursos con “Agregar” o desde el panel de cada curso. Solo puedes planear cursos cuyos prerrequisitos ya cumples (vistos + los que ya están en tu canasta). Abajo verás qué cursos desbloquea. Si estás viendo otro panel, el botón “Mi canasta” te trae de vuelta.",
    },
    {
      id: "suggest",
      target: '[data-tour="suggest"]',
      title: "5 · Lo que ya puedes agregar",
      body: "Estos cursos tienen todos sus prerrequisitos cumplidos. Toca uno para ver su ruta en el mapa antes de agregarlo.",
    },
    {
      id: "grado",
      target: '[data-tour="grado"]',
      title: "6 · Requisitos de grado",
      body: "Lectura en inglés, internacionalización y Saber Pro no son cursos, pero también cuentan. Márcalos aquí cuando los cumplas.",
    },
    {
      id: "share",
      target: '[data-tour="share"]',
      title: "7 · Llévalo contigo",
      body: "Copia un enlace con tu avance para abrirlo en otro dispositivo o compartirlo. “Reiniciar avance” empieza de cero.",
    },
  ];
}
