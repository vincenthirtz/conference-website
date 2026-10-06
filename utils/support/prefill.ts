// utils/support/prefill.ts
//
// Pré-remplissage du formulaire /support par la query string.
//
// Pourquoi : un écran qui renvoie vers le staff (check-in manqué, …) sait DE
// QUOI il s'agit — le match, l'équipe, l'heure. L'envoyer vers un /support
// vierge, c'est demander à la joueuse de retaper ce que la page connaît déjà,
// et au staff de deviner de quel match on parle. Le ticket reste envoyé par la
// joueuse elle-même (relecture, e-mail de réponse) : rien n'est soumis à sa
// place.
//
// La query est une entrée NON FIABLE (un lien se forge) : catégorie bornée à
// la liste connue, textes tronqués aux limites de /api/support/ticket. Rien
// n'est interprété comme du HTML — React échappe les valeurs des champs.

export const SUPPORT_CATEGORIES = [
  'dispute',
  'behavior',
  'technical',
  'other',
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

/** Limites de /api/support/ticket (sujet 200, message 5000). */
export const SUPPORT_SUBJECT_MAX = 200;
export const SUPPORT_MESSAGE_MAX = 5000;

export type SupportPrefill = {
  category?: SupportCategory;
  subject?: string;
  message?: string;
};

function isSupportCategory(value: unknown): value is SupportCategory {
  return (
    typeof value === 'string' &&
    (SUPPORT_CATEGORIES as readonly string[]).includes(value)
  );
}

/** Première valeur d'un paramètre Next (`string | string[] | undefined`). */
function firstString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

function clean(value: unknown, max: number): string | undefined {
  const raw = firstString(value);
  if (raw === null) return undefined;
  const trimmed = raw.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Lit la query de /support. Ce qui est invalide est ignoré, jamais rejeté. */
export function parseSupportPrefill(
  query: Record<string, unknown>
): SupportPrefill {
  const out: SupportPrefill = {};
  const category = firstString(query.category);
  if (isSupportCategory(category)) out.category = category;
  const subject = clean(query.subject, SUPPORT_SUBJECT_MAX);
  if (subject) out.subject = subject;
  const message = clean(query.message, SUPPORT_MESSAGE_MAX);
  if (message) out.message = message;
  return out;
}

/** Lien vers /support pré-rempli (mêmes bornes que la lecture). */
export function buildSupportHref(prefill: SupportPrefill): string {
  const params = new URLSearchParams();
  if (prefill.category && isSupportCategory(prefill.category)) {
    params.set('category', prefill.category);
  }
  const subject = clean(prefill.subject, SUPPORT_SUBJECT_MAX);
  if (subject) params.set('subject', subject);
  const message = clean(prefill.message, SUPPORT_MESSAGE_MAX);
  if (message) params.set('message', message);
  const qs = params.toString();
  return qs ? `/support?${qs}` : '/support';
}
