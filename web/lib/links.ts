// External links shared by several screens.

/** Fallback guide while the course API is down (section 7 of the 2026-10-29
 * review). Until the department publishes its pensum guide, the Registro
 * article "¿Cómo hacer mi horario?". Override with NEXT_PUBLIC_FALLBACK_GUIDE_URL. */
export const FALLBACK_GUIDE_URL =
  process.env.NEXT_PUBLIC_FALLBACK_GUIDE_URL ||
  "https://registro.uniandes.edu.co/index.php/component/content/article/14-aspirantesgeneral/183-como-hacer-mi-horario";
