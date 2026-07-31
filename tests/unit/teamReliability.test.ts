// Unit tests — réputation de fiabilité d'équipe (R10).
//
// L'enjeu de ces tests est autant statistique qu'algorithmique : un indicateur
// de réputation qui se trompe est PIRE que pas d'indicateur. On vérifie donc
// surtout ce qu'il refuse d'afficher.

import { describe, it, expect } from 'vitest';

import {
  computeReliability,
  MIN_SAMPLE,
  IGNORED_AFTER_DAYS,
} from '../../utils/teams/reliability';

const NOW = new Date('2026-07-31T12:00:00.000Z');

/** Demande reçue il y a `daysAgo`, traitée `answeredAfterHours` plus tard. */
function demande(
  daysAgo: number,
  status: 'pending' | 'approved' | 'rejected',
  answeredAfterHours?: number
) {
  const created = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const processed =
    status === 'pending' || answeredAfterHours === undefined
      ? null
      : new Date(
          created.getTime() + answeredAfterHours * 60 * 60 * 1000
        ).toISOString();
  return {
    team_id: 'team-1',
    status,
    created_at: created.toISOString(),
    processed_at: processed,
  };
}

describe('computeReliability', () => {
  it("n'affiche AUCUN taux sous le seuil d'échantillon", () => {
    // Une seule demande ignorée donnerait « 0 % de réponse » : techniquement
    // vrai, totalement trompeur. On préfère ne rien dire.
    const r = computeReliability([demande(10, 'pending')], NOW);
    expect(r.received).toBe(1);
    expect(r.responseRate).toBeNull();
    expect(r.medianResponseHours).toBeNull();
    // Le comptage brut reste exact, lui.
    expect(r.ignored).toBe(1);
  });

  it('calcule le taux de réponse au-dessus du seuil', () => {
    const rows = [
      demande(10, 'approved', 2),
      demande(9, 'rejected', 4),
      demande(8, 'pending'),
    ];
    expect(rows).toHaveLength(MIN_SAMPLE);

    const r = computeReliability(rows, NOW);
    expect(r.received).toBe(3);
    expect(r.answered).toBe(2);
    // 2/3 arrondi.
    expect(r.responseRate).toBe(67);
  });

  it('prend la MÉDIANE des délais, pas la moyenne', () => {
    // Une réponse très tardive ne doit pas écraser deux réponses rapides.
    const rows = [
      demande(20, 'approved', 1),
      demande(19, 'approved', 2),
      demande(18, 'approved', 200),
    ];
    const r = computeReliability(rows, NOW);
    expect(r.medianResponseHours).toBe(2);
  });

  it('ne compte « ignorée » qu’au-delà du délai de grâce', () => {
    const rows = [
      // Reçue hier, toujours pending : ce n'est pas de la négligence.
      demande(1, 'pending'),
      demande(IGNORED_AFTER_DAYS + 1, 'pending'),
      demande(5, 'approved', 3),
    ];
    const r = computeReliability(rows, NOW);
    expect(r.ignored).toBe(1);
  });

  it('ignore une horodate incohérente au lieu de fausser la médiane', () => {
    const created = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000);
    const rows = [
      demande(10, 'approved', 4),
      demande(9, 'approved', 6),
      // processed_at AVANT created_at : donnée corrompue, écartée du calcul.
      {
        team_id: 'team-1',
        status: 'approved',
        created_at: created.toISOString(),
        processed_at: new Date(created.getTime() - 3600_000).toISOString(),
      },
    ];
    const r = computeReliability(rows, NOW);
    expect(r.answered).toBe(3);
    expect(r.medianResponseHours).toBe(5); // médiane de [4, 6]
  });

  it('renvoie des compteurs à zéro sans aucune demande', () => {
    const r = computeReliability([], NOW);
    expect(r).toMatchObject({
      received: 0,
      answered: 0,
      ignored: 0,
      responseRate: null,
      medianResponseHours: null,
    });
  });
});
