// utils/overlay/publicMvpDemo.ts — le TEST du sondage « coup de cœur du
// public » : un faux vote, à l'écran dans la vraie source OBS, pour régler la
// scène avant le direct (Admin › Diffusion › Overlays › « Tester »).
//
// RIEN N'EST ÉCRIT. Pas une voix, pas un scrutin : le faux vote est CALCULÉ à
// partir de l'heure de départ du test. Chaque rafraîchissement de la source
// retombe donc sur le même état au même instant — les barres montent comme
// pendant un vrai vote, sans état à nettoyer ensuite, et sans risque qu'une
// voix de test se mêle à un vrai dépouillement.
//
// DÉROULÉ : DEMO_OPEN_MS de vote (barres qui montent, compte à rebours), puis
// DEMO_RESULT_MS de résultat (l'élue en avant) — le même enchaînement qu'un
// vrai sondage, en accéléré. Pur : testé seul.

import type { OverlayPublicMvpPoll } from './publicMvpFeed';

export const DEMO_OPEN_MS = 40_000;
export const DEMO_RESULT_MS = 15_000;
export const DEMO_TOTAL_MS = DEMO_OPEN_MS + DEMO_RESULT_MS;

/** Les candidates du test : des pseudos manifestement fictifs. */
const DEMO_CANDIDATES = [
  { memberId: 'demo-1', label: 'Nova', teamName: 'Équipe Test A', target: 48 },
  { memberId: 'demo-2', label: 'Kiwi', teamName: 'Équipe Test B', target: 37 },
  { memberId: 'demo-3', label: 'Lynx', teamName: 'Équipe Test A', target: 22 },
  { memberId: 'demo-4', label: 'Mira', teamName: 'Équipe Test B', target: 15 },
  { memberId: 'demo-5', label: 'Sora', teamName: 'Équipe Test A', target: 9 },
  { memberId: 'demo-6', label: 'Echo', teamName: 'Équipe Test B', target: 4 },
] as const;

/**
 * Le faux vote à l'instant `nowMs` d'un test lancé à `startedAtMs`, ou null
 * si le test est fini (ou pas encore commencé).
 */
export function buildDemoPoll(
  startedAtMs: number,
  nowMs: number
): OverlayPublicMvpPoll | null {
  const elapsed = nowMs - startedAtMs;
  if (!(elapsed >= 0 && elapsed < DEMO_TOTAL_MS)) return null;

  const isOpen = elapsed < DEMO_OPEN_MS;
  // Montée rapide puis tassement : un vrai vote démarre fort.
  const p = Math.min(1, elapsed / DEMO_OPEN_MS);
  const progress = 1 - (1 - p) ** 2;

  const rows = DEMO_CANDIDATES.map((c) => ({
    memberId: c.memberId,
    label: c.label,
    teamName: c.teamName,
    votes: Math.round(c.target * progress),
  }));
  const total = rows.reduce((s, r) => s + r.votes, 0);
  const sorted = [...rows].sort((a, b) =>
    b.votes !== a.votes
      ? b.votes - a.votes
      : a.memberId.localeCompare(b.memberId)
  );
  const twitch = Math.round(total * 0.7);
  const winner = isOpen ? null : sorted[0];

  return {
    matchId: 'demo',
    roundName: 'Test',
    team1Name: 'Équipe Test A',
    team2Name: 'Équipe Test B',
    closesAt: new Date(startedAtMs + DEMO_OPEN_MS).toISOString(),
    isOpen,
    candidates: sorted.map((r) => ({
      ...r,
      share: total > 0 ? r.votes / total : 0,
    })),
    total,
    bySource: { twitch, discord: total - twitch },
    winnerMemberId: winner?.memberId ?? null,
    winnerLabel: winner?.label ?? null,
    isDemo: true,
  };
}
