// tests/unit/playerAvatarRatingChart.test.ts
//
// Deux composants de la fiche joueuse, testés sans DOM :
//
//   - PlayerAvatar : un avatar sur un hôte hors `remotePatterns` passait par
//     `next/image` et s'affichait cassé (400 de l'optimiseur). Il doit sortir
//     en `<img>` nu, et la cascade avatar → logo → initiales doit sauter une
//     image en échec.
//   - RatingChart : la projection de la courbe (point de départ, bornes, delta).

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import PlayerAvatar, {
  pickAvatarSource,
} from '../../components/player/PlayerAvatar';
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  projectRatingSeries,
} from '../../components/player/RatingChart';
import type { PlayerProfileHistoryPoint } from '../../types/rating';

const SUPABASE =
  'https://abcd.supabase.co/storage/v1/object/public/avatars/camille.png';
const IMGUR = 'https://i.imgur.com/abcd.png';
const LOGO = 'https://cdn.discordapp.com/icons/1/logo.png';

function render(props: Partial<React.ComponentProps<typeof PlayerAvatar>>) {
  return renderToStaticMarkup(
    React.createElement(PlayerAvatar, {
      avatarUrl: null,
      teamName: null,
      teamSlug: null,
      teamLogoUrl: null,
      label: 'Camille',
      ...props,
    })
  );
}

describe('PlayerAvatar', () => {
  it('un avatar sur un hôte non déclaré sort en <img> nu, pas via /_next/image', () => {
    const html = render({ avatarUrl: IMGUR });
    expect(html).toContain(`src="${IMGUR}"`);
    expect(html).not.toContain('/_next/image');
  });

  it('un avatar sur un hôte déclaré passe par l’optimiseur', () => {
    const html = render({ avatarUrl: SUPABASE });
    expect(html).toContain('/_next/image');
  });

  it('sans image : les initiales', () => {
    const html = render({});
    expect(html).toContain('>C</span>');
  });

  it('pickAvatarSource : cascade avatar → logo → initiales, en sautant les échecs', () => {
    expect(pickAvatarSource(IMGUR, LOGO, new Set())).toEqual({
      url: IMGUR,
      kind: 'avatar',
    });
    expect(pickAvatarSource(IMGUR, LOGO, new Set([IMGUR]))).toEqual({
      url: LOGO,
      kind: 'teamLogo',
    });
    expect(pickAvatarSource(IMGUR, LOGO, new Set([IMGUR, LOGO]))).toBeNull();
    expect(pickAvatarSource(null, null, new Set())).toBeNull();
    expect(pickAvatarSource('  ', null, new Set())).toBeNull();
  });
});

function point(before: number, after: number): PlayerProfileHistoryPoint {
  return {
    matchId: `m-${before}-${after}`,
    tournamentId: null,
    occurredAt: '2026-09-01T00:00:00Z',
    ratingBefore: before,
    ratingAfter: after,
    result: after >= before ? 'win' : 'loss',
    opponentAvgRating: null,
  };
}

describe('projectRatingSeries', () => {
  it('moins de deux matchs : pas de courbe', () => {
    expect(projectRatingSeries([])).toBeNull();
    expect(projectRatingSeries([point(1500, 1520)])).toBeNull();
  });

  it('part du rating AVANT le premier match, puis suit chaque rating après', () => {
    const p = projectRatingSeries([
      point(1500, 1520),
      point(1520, 1490),
      point(1490, 1560),
    ]);
    expect(p?.values).toEqual([1500, 1520, 1490, 1560]);
    expect(p?.min).toBe(1490);
    expect(p?.max).toBe(1560);
    expect(p?.delta).toBe(60);
    // Extrémités horizontales dans les marges, bornes verticales respectées.
    expect(p?.points[0].x).toBe(8);
    expect(p?.points.at(-1)?.x).toBe(CHART_WIDTH - 8);
    const ys = p?.points.map((q) => q.y) ?? [];
    expect(Math.min(...ys)).toBe(16); // le max en haut
    expect(Math.max(...ys)).toBe(CHART_HEIGHT - 16); // le min en bas
    expect(p?.linePath.startsWith('M 8.0 ')).toBe(true);
    expect(p?.areaPath.endsWith(' Z')).toBe(true);
  });

  it('série plate : pas de division par zéro', () => {
    const p = projectRatingSeries([point(1500, 1500), point(1500, 1500)]);
    expect(p?.delta).toBe(0);
    expect(p?.points.every((q) => Number.isFinite(q.y))).toBe(true);
  });
});
