// Messagerie entre capitaines et réseau — fonctions pures des modules du lot
// P15 (docs/PLAN-industrialisation-joueur.md) : identifiant de conversation
// (garde anti-injection de filtre PostgREST), regroupement de la boîte,
// mise à jour locale de l'annuaire après un suivi.

import { describe, expect, it } from 'vitest';
import { applyFollowChange } from '../../features/player/network/hooks/useDiscovery';

describe('annuaire : suivi local', () => {
  const page = (players: Array<{ id: string; f: boolean; n: number }>) => ({
    pageParams: [0],
    pages: [
      {
        total: players.length,
        limit: 24,
        offset: 0,
        players: players.map((p) => ({
          authUserId: p.id,
          displayName: p.id,
          avatarUrl: null,
          tagline: null,
          discordUsername: null,
          isFollowing: p.f,
          followerCount: p.n,
        })),
      },
    ],
  });

  it('« Découvrir » : compteur ajusté, la fiche reste', () => {
    const next = applyFollowChange(
      page([{ id: 'x', f: false, n: 0 }]),
      'discover',
      'x',
      true
    );
    expect(next?.pages[0].players[0]).toMatchObject({
      isFollowing: true,
      followerCount: 1,
    });
  });

  it('« Je suis » : se désabonner retire la fiche et le total', () => {
    const next = applyFollowChange(
      page([
        { id: 'x', f: true, n: 1 },
        { id: 'y', f: true, n: 4 },
      ]),
      'following',
      'x',
      false
    );
    expect(next?.pages[0].players.map((p) => p.authUserId)).toEqual(['y']);
    expect(next?.pages[0].total).toBe(1);
  });
});
