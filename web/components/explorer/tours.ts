import type { TourStepDef } from "./Tour";

/** Steps carry only copy + a target; the state each step needs (a course
 * selected, the side panel open, the right mode) is set up by PensumExplorer,
 * keyed by step id.
 *
 * Wording rule: the guide SHOWS where things are, it never asks for an action
 * now ("aquí puedes…", "cuando quieras…", not "toca…", "marca…"). The page is
 * locked while it runs; nothing needs to be clicked to follow along. */

export type TourKind = "explore" | "avance";

export const TOUR_INTRO: Record<TourKind, string> = {
  explore: "Te mostramos cómo leer el mapa, punto por punto. Es solo un recorrido: no tienes que hacer nada todavía.",
  avance: "Te mostramos qué puedes hacer en Mi avance. Es solo un recorrido: no tienes que hacer nada todavía; al final lo usas a tu ritmo.",
};

export const TOUR_LABEL: Record<TourKind, string> = {
  explore: "Recorrido del mapa",
  avance: "Guía de Mi avance",
};

export function exploreSteps(anchorId: string | null): TourStepDef[] {
  const card = anchorId ? `[data-course-id="${anchorId}"]` : undefined;
  return [
    {
      id: "card",
      target: card,
      marker: "Un curso",
      title: "Cada tarjeta es un curso",
      body: "Arriba van el código y los créditos; abajo, el nombre. Cada columna es un semestre sugerido y el color indica el tipo de curso.",
    },
    {
      id: "groups",
      target: '[data-tour="groups"]',
      marker: "Tipos de curso",
      title: "Los colores son tipos de curso",
      body: "IELE, ciencias básicas, otras facultades, proyecto, electivas y CBU. Desde aquí se puede ocultar un tipo para dejar solo lo que te interesa.",
    },
    {
      id: "select",
      target: card,
      marker: "Curso seleccionado",
      title: "Un curso seleccionado muestra su ruta",
      body: "Al seleccionar un curso se iluminan los que necesitas antes y los que se abren después; el resto se atenúa. Aquí ves un ejemplo ya seleccionado.",
    },
    {
      id: "reltoggle",
      target: '[data-tour="reltoggle"]',
      marker: "Qué mostrar",
      title: "Tres preguntas, una a la vez",
      body: "«Qué necesito» responde ¿qué debo aprobar antes de inscribirlo? «Qué se me habilita» responde ¿qué podré ver si apruebo o inscribo este curso?, según tu avance: lo que se abre este mismo semestre (por correquisito) o el próximo. «Qué depende de él» responde ¿qué cursos lo piden, aunque pidan otros más?",
    },
    {
      id: "relaciones",
      target: '[data-tour="relaciones"]',
      marker: "Directas o cadena",
      title: "Solo lo inmediato, o todo el camino",
      body: "«Directas» muestra solo lo que necesitas para inscribir el curso. «Toda la cadena» suma también los requisitos de esos requisitos.",
    },
    {
      id: "legend",
      target: '[data-tour="legend"]',
      marker: "Leyenda",
      title: "Líneas continuas y punteadas",
      body: "Una flecha continua es un prerrequisito: debe estar aprobado antes. Una línea punteada es un correquisito, o un prerrequisito que se puede cursar el mismo semestre.",
    },
    {
      id: "panel",
      target: '[data-tour="panel"]',
      marker: "Panel del curso",
      title: "El panel del curso",
      body: "Reúne la ruta resumida (necesitas → este curso → lo que lo pide), si se dicta este periodo, los requisitos numerados, de dónde salen y la descripción. Cada código del panel lleva a ese curso.",
    },
    {
      id: "search",
      target: '[data-tour="search"]',
      marker: "Buscar",
      title: "Buscar por nombre o código",
      body: "Escribir aquí (o presionar / en cualquier momento) atenúa todo lo que no coincide.",
    },
    {
      id: "mode",
      target: '[data-tour="mode"]',
      marker: "Mi avance",
      title: "Y luego, tu avance",
      body: "En Mi avance llevas lo que ya viste y ves qué puedes inscribir. Allí hay otra guía como esta.",
    },
  ];
}

export function avanceSteps(): TourStepDef[] {
  return [
    {
      id: "quick",
      target: '[data-tour="quick"]',
      marker: "Selección rápida",
      title: "Dónde se marca lo que ya viste",
      body: "«Selección rápida» ofrece dos caminos: por semestre (se marca todo lo anterior a tu semestre y luego corriges las excepciones) o curso por curso. Cuando quieras; nada se marca solo.",
    },
    {
      id: "states",
      target: '[data-tour="status"]',
      marker: "Estados",
      title: "Qué significa cada color",
      body: "Verde con ✓: ya lo viste. Pastilla azul con el semestre: está en tu canasta. Rayado gris: aún te faltan prerrequisitos. Sin marca: lo puedes inscribir. Marcar un curso no marca los anteriores, por si tienes homologaciones.",
    },
    {
      id: "reltoggle",
      target: '[data-tour="reltoggle"]',
      marker: "Qué mostrar",
      title: "Qué necesito, qué se me habilita, qué depende",
      body: "Con un curso seleccionado, este selector responde una pregunta a la vez. «Qué necesito»: ¿qué debo aprobar antes? «Qué se me habilita»: ¿qué podré ver si apruebo o inscribo este curso? — este mismo semestre o el próximo. «Qué depende de él»: ¿qué cursos lo piden, aunque pidan otros más?",
    },
    {
      id: "legend",
      target: '[data-tour="legend"]',
      marker: "Leyenda",
      title: "Líneas continuas y punteadas",
      body: "Las conexiones de un curso seleccionado: línea azul continua = prerrequisito (debe estar aprobado antes); línea ámbar punteada = correquisito (se inscribe al tiempo o puede cursarse el mismo semestre).",
    },
    {
      id: "progress",
      target: '[data-tour="progress"]',
      marker: "Tu progreso",
      title: "Tu progreso",
      body: "Créditos aprobados sobre el total del plan. La barra también suma lo que lleves en la canasta del próximo semestre.",
    },
    {
      id: "cart",
      target: '[data-tour="cart"]',
      marker: "Tu canasta",
      title: "La canasta del próximo semestre",
      body: "Aquí se arma el plan del próximo semestre, con «Agregar» o desde el panel de cada curso (si te falta un requisito, te avisamos; puedes agregarlo igual por homologaciones). Al revisar la canasta, el primer paso te muestra qué se te habilita este semestre y el próximo.",
    },
    {
      id: "suggest",
      target: '[data-tour="suggest"]',
      marker: "Lo que ya puedes ver",
      title: "Lo que ya puedes agregar",
      body: "Cursos con todos sus prerrequisitos cumplidos. Cada uno abre su ruta en el mapa, para revisarla antes de decidir.",
    },
    {
      id: "grado",
      target: '[data-tour="grado"]',
      marker: "Requisitos de grado",
      title: "Requisitos de grado",
      body: "Lectura en inglés, internacionalización y Saber Pro no son cursos, pero también cuentan. Aquí se registran cuando los cumplas.",
    },
    {
      id: "share",
      target: '[data-tour="share"]',
      marker: "Compartir",
      title: "Llévalo contigo",
      body: "Un enlace con tu avance, para abrirlo en otro dispositivo o compartirlo. «Reiniciar avance» empieza de cero.",
    },
  ];
}
