// Images de l'espace joueuse servies à la bonne taille — et jamais cassées.
//
// Deux risques opposés, que ces tests tiennent ensemble :
//   - servir une photo de 2 Mio dans une vignette de 180 px (`unoptimized`
//     inconditionnel sur les cartes TCG, `<img>` nus sur les pastilles) : la
//     collection entière descendait en pleine résolution sur mobile ;
//   - à l'inverse, passer par `next/image` une URL hors `remotePatterns` — un
//     logo d'équipe hébergé n'importe où — qui ÉCHOUE AU RENDU.
//
// Rendu SSR via react-dom/server (pas de jsdom dans ce repo). Une image
// optimisée se reconnaît à son `src` en `/_next/image?url=…`.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import TcgCard, {
  shouldOptimizeCardImage,
  type TcgCardProps,
} from '@/components/tcg/TcgCard';
import TeamPicker from '@/components/player/TeamPicker';

const SUPABASE_PHOTO =
  'https://yhfdhpqgmazfxyyklomp.supabase.co/storage/v1/object/public/teams-images/tcg/photo.jpg';
const FOREIGN_LOGO = 'https://i.imgur.com/logo.png';

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

function renderCard(subject: TcgCardProps['subject']): string {
  return renderToString(
    createElement(TcgCard, { subject, rarity: 'rare', labels })
  );
}

describe('shouldOptimizeCardImage', () => {
  it('optimise une photo du stockage public Supabase', () => {
    expect(shouldOptimizeCardImage(SUPABASE_PHOTO)).toBe(true);
  });

  it('laisse brut un logo sur un hôte non déclaré', () => {
    expect(shouldOptimizeCardImage(FOREIGN_LOGO)).toBe(false);
  });

  it('laisse brut le SVG, même local : rien à réduire dans un vectoriel', () => {
    expect(shouldOptimizeCardImage('/img/maps/overwatch/hanamura.svg')).toBe(
      false
    );
    expect(shouldOptimizeCardImage(`${SUPABASE_PHOTO}.svg?v=2`)).toBe(false);
  });

  it('refuse une URL absente ou vide', () => {
    expect(shouldOptimizeCardImage(null)).toBe(false);
    expect(shouldOptimizeCardImage('  ')).toBe(false);
  });
});

describe('TcgCard — image', () => {
  it('passe une photo Supabase par l’optimiseur, avec son srcset', () => {
    const html = renderCard({
      kind: 'player',
      userId: 'u1',
      displayName: 'Akira',
      imageUrl: SUPABASE_PHOTO,
    });
    expect(html).toContain('/_next/image?url=');
    expect(html).toContain('srcSet=');
  });

  it('sert tel quel le logo d’une équipe hébergé ailleurs', () => {
    const html = renderCard({
      kind: 'team',
      teamId: 't1',
      name: 'Chocomates',
      slug: 'chocomates',
      logoUrl: FOREIGN_LOGO,
    });
    expect(html).not.toContain('/_next/image');
    expect(html).toContain(`src="${FOREIGN_LOGO}"`);
  });

  it('sert tel quel la maquette SVG d’une map', () => {
    const html = renderCard({
      kind: 'map',
      slug: 'hanamura',
      name: 'Hanamura',
      imageUrl: '/img/maps/overwatch/hanamura.svg',
    });
    expect(html).not.toContain('/_next/image');
    expect(html).toContain('src="/img/maps/overwatch/hanamura.svg"');
  });
});

describe('TeamPicker — pastilles de logo', () => {
  function renderPicker(logoUrl: string | null): string {
    return renderToString(
      createElement(TeamPicker, {
        teams: [{ id: 't1', name: 'Chocomates', logo_url: logoUrl }],
        value: '',
        onChange: () => {},
        label: 'Équipe',
        emptyLabel: 'Aucune équipe',
      })
    );
  }

  it('optimise un logo du stockage public', () => {
    expect(renderPicker(SUPABASE_PHOTO)).toContain('/_next/image?url=');
  });

  it('retombe sur <img> brut pour un hôte non déclaré', () => {
    const html = renderPicker(FOREIGN_LOGO);
    expect(html).not.toContain('/_next/image');
    expect(html).toContain(`src="${FOREIGN_LOGO}"`);
  });

  it('garde le monogramme sans logo', () => {
    const html = renderPicker(null);
    expect(html).not.toContain('<img');
    expect(html).toContain('CH');
  });
});
