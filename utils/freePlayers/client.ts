// utils/freePlayers/client.ts — appels navigateur du parcours « joueuse libre »
// sans compte, hors composant : l'URL et la forme de la réponse vivent ici, une
// seule fois, plutôt qu'en dur dans chaque écran.

const RESEND_LINK_URL = '/api/public/free-players/resend-link';

export type GuardPayload = {
  honeypot: string;
  captchaToken?: string;
  captchaAnswer: string;
};

/**
 * Demande le renvoi des liens (retrait, prolongation) à l'adresse d'une fiche.
 * Lève une `Error` portant le message du serveur en cas de refus. Un succès ne
 * dit PAS qu'une fiche existe — la route répond pareil dans les deux cas.
 */
export async function requestFreePlayerLinks(
  email: string,
  guard: GuardPayload
): Promise<void> {
  const res = await fetch(RESEND_LINK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, ...guard }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(typeof data?.error === 'string' ? data.error : '');
  }
}
