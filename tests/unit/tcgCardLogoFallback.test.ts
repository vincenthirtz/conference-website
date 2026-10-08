// tests/unit/tcgCardLogoFallback.test.ts — une carte TCG sans visuel n'est
// jamais vide : le logo du site (celui de la navbar, donc le logo d'événement
// du moment) passe en fond, sous l'initiale.
//
// Au rendu serveur, le logo d'événement n'est pas encore connu (il est résolu
// dans le navigateur, cf. useSeasonalLogo) : la carte part avec le logo par
// défaut, comme la navbar, puis bascule.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import TcgCard, { type TcgCardProps } from '@/components/tcg/TcgCard';
import { DEFAULT_SITE_LOGO_SRC } from '@/lib/branding/useSiteLogo';

const labels: TcgCardProps['labels'] = {
  rarity: {
    common: 'Commune',
    rare: 'Rare',
    epic: 'Épique',
    legendary: 'Légendaire',
  },
  foil: 'Brillante',
  copies: '×{count}',
};

function render(subject: TcgCardProps['subject']): string {
  return renderToString(
    createElement(TcgCard, { subject, rarity: 'common', labels })
  );
}

describe('TcgCard — fond de repli', () => {
  it('joueuse sans photo ni figurine : logo du site en fond et initiale', () => {
    const html = render({
      kind: 'player',
      userId: 'u1',
      displayName: 'Mei',
      imageUrl: null,
    });
    expect(html).toContain('data-testid="tcg-card-logo-fallback"');
    expect(html).toContain(DEFAULT_SITE_LOGO_SRC);
    expect(html).toContain('>M<');
  });

  it('équipe sans logo ni illustration : même repli', () => {
    const html = render({
      kind: 'team',
      teamId: 't1',
      name: 'Alpha',
      slug: 'alpha',
      logoUrl: null,
      cardImageUrl: null,
    } as TcgCardProps['subject']);
    expect(html).toContain('data-testid="tcg-card-logo-fallback"');
  });

  it('carte avec photo : pas de logo de repli', () => {
    const html = render({
      kind: 'player',
      userId: 'u1',
      displayName: 'Mei',
      imageUrl: 'https://example.supabase.co/storage/v1/object/public/a.png',
    });
    expect(html).not.toContain('tcg-card-logo-fallback');
  });
});
