// utils/tournament/clipsWindow.ts
//
// LA FENÊTRE DE CLIPS D'UN TOURNOI — onglet /tournament/[id]/clips.
//
// Les clips appartiennent à la CHAÎNE, pas au tournoi : on retient ceux créés
// entre le premier jour et le lendemain du dernier. Une fenêtre fixe, et non
// « les 30 derniers jours » : un tournoi terminé garde SES clips, et ceux du
// tournoi suivant sur la même chaîne n'y entrent pas.
//
// `start_date` / `end_date` sont des colonnes `date` (« 2026-09-18 »). On les
// lit à minuit UTC — 1 h ou 2 h du matin à Paris, heures sans diffusion — et
// la fin s'étend au lendemain : les clips de la soirée de finale, coupés
// après 22 h, y entrent.

const DAY_MS = 86_400_000;

function dayStartUtc(value: string | null | undefined): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec((value ?? '').trim());
  if (!m) return null;
  const at = Date.parse(`${m[1]}T00:00:00.000Z`);
  return Number.isNaN(at) ? null : at;
}

/**
 * `{ from, to }` à passer à `fetchTwitchClips`, ou `null` quand il n'y a rien
 * à chercher : pas de date de début, ou tournoi pas encore commencé. Sans
 * date de fin, la fenêtre court jusqu'à maintenant. PURE.
 */
export function tournamentClipsWindow(
  t: { start_date?: string | null; end_date?: string | null },
  now: Date
): { from: Date; to: Date } | null {
  const start = dayStartUtc(t.start_date);
  if (start === null || start >= now.getTime()) return null;
  const end = dayStartUtc(t.end_date);
  const to =
    end === null ? now.getTime() : Math.min(now.getTime(), end + DAY_MS);
  if (to <= start) return null;
  return { from: new Date(start), to: new Date(to) };
}
