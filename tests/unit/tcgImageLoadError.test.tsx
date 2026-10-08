// @vitest-environment happy-dom
//
// Une image de carte TCG qui ne charge pas — avatar Discord changé depuis,
// pièce jointe Discord expirée (le cas réel du 2026-10-08 : 2 avatars sur 16
// en 404) — retombe sur le repli, au lieu d'une icône d'image cassée.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import TcgCard, { type TcgCardProps } from '@/components/tcg/TcgCard';
import TcgThumbnailImage from '@/components/tcg/TcgThumbnailImage';

afterEach(cleanup);

const DEAD =
  'https://cdn.discordapp.com/avatars/1027928516467118120/bfd6bd2101f760e97c532130b6d4129f.png';

const labels: TcgCardProps['labels'] = {
  rarity: { common: 'C', rare: 'R', epic: 'E', legendary: 'L' },
  foil: 'F',
  copies: '×{count}',
};

function loadedImg(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector('img:not([data-testid])');
}

/** Le repli est toujours dans le HTML ; « affiché » = hors de tout `hidden`. */
function shown(el: Element | null): boolean {
  return el !== null && el.closest('[hidden]') === null;
}

describe('image de carte en échec de chargement', () => {
  it('TcgCard : avatar mort → logo de repli et initiale', () => {
    const { container } = render(
      <TcgCard
        subject={{
          kind: 'player',
          userId: 'u1',
          displayName: 'scorpiona1001',
          imageUrl: DEAD,
        }}
        rarity="common"
        labels={labels}
      />
    );
    expect(shown(screen.getByTestId('tcg-card-logo-fallback'))).toBe(false);
    const img = loadedImg(container) as HTMLImageElement;
    expect(img).not.toBeNull();
    fireEvent.error(img);
    expect(img.style.display).toBe('none');
    expect(shown(screen.getByTestId('tcg-card-logo-fallback'))).toBe(true);
    expect(container.textContent).toContain('S');
  });

  it('TcgCard : avatar mort mais figurine connue → la figurine', () => {
    const { container } = render(
      <TcgCard
        subject={{
          kind: 'player',
          userId: 'u1',
          displayName: 'Mei',
          imageUrl: DEAD,
          figure: {
            role: 'tank',
            color: null,
            heroName: null,
            heroSource: null,
          },
        }}
        rarity="common"
        labels={labels}
      />
    );
    const figureImg = container.querySelector(
      'img[src*="figure"], img[src*="tank"]'
    );
    expect(shown(figureImg)).toBe(false);
    fireEvent.error(loadedImg(container) as HTMLImageElement);
    expect(screen.queryByTestId('tcg-card-logo-fallback')).toBeNull();
    expect(shown(figureImg)).toBe(true);
  });

  it('vignette du catalogue : même repli', () => {
    const { container } = render(
      <div className="relative">
        <TcgThumbnailImage url={DEAD} name="scorpiona1001" />
      </div>
    );
    expect(shown(screen.getByTestId('tcg-card-logo-fallback'))).toBe(false);
    fireEvent.error(loadedImg(container) as HTMLImageElement);
    expect(shown(screen.getByTestId('tcg-card-logo-fallback'))).toBe(true);
  });
});
