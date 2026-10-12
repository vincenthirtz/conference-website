// @vitest-environment happy-dom
//
// La description « à propos » d'une carte de l'association, sur la carte.
// Target : components/tcg/TcgCard.tsx
//
// Texte brut rendu comme tel (une balise reste du texte), tronqué en vignette
// avec le texte entier au survol, entier en vue agrandie — et jamais affiché
// pour une fan art, même si on lui en passait une.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import TcgCard, { type TcgCardProps } from '@/components/tcg/TcgCard';

afterEach(cleanup);

const labels: TcgCardProps['labels'] = {
  rarity: { common: 'C', rare: 'R', epic: 'E', legendary: 'L' },
  foil: 'F',
  copies: '×{count}',
  association: 'L’association',
};

const ABOUT = 'Arukdo organise la Cup.\nSur la photo : son chat.';

function subject(
  over: Partial<Extract<TcgCardProps['subject'], { kind: 'fanart' }>> = {}
): TcgCardProps['subject'] {
  return {
    kind: 'fanart',
    fanartId: 'f1',
    name: 'Arukdo',
    imageUrl: null,
    artistName: 'Arukdo',
    artistUrl: null,
    category: 'association',
    description: ABOUT,
    ...over,
  };
}

describe('TcgCard — description de l’association', () => {
  it('vignette : tronquée, texte entier au survol', () => {
    render(<TcgCard subject={subject()} rarity="rare" labels={labels} />);
    const p = screen.getByText(/Arukdo organise la Cup/);
    expect(p.className).toContain('line-clamp-3');
    expect(p.getAttribute('title')).toBe(ABOUT);
  });

  it('vue agrandie : entière, sans troncature', () => {
    render(
      <TcgCard
        subject={subject()}
        rarity="rare"
        labels={labels}
        fullDescription
      />
    );
    const p = screen.getByText(/Arukdo organise la Cup/);
    expect(p.className).not.toContain('line-clamp-3');
    expect(p.getAttribute('title')).toBeNull();
  });

  it('une balise reste du texte, jamais du HTML', () => {
    const { container } = render(
      <TcgCard
        subject={subject({ description: '<b>gras</b>' })}
        rarity="rare"
        labels={labels}
      />
    );
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<b>gras</b>');
  });

  it('jamais pour une fan art de la communauté', () => {
    const { container } = render(
      <TcgCard
        subject={subject({ category: 'fanart', description: 'détourné' })}
        rarity="rare"
        labels={labels}
      />
    );
    expect(container.textContent).not.toContain('détourné');
  });

  it('sans description, rien de plus qu’avant', () => {
    const { container } = render(
      <TcgCard
        subject={subject({ description: null })}
        rarity="rare"
        labels={labels}
      />
    );
    expect(container.querySelector('p.whitespace-pre-line')).toBeNull();
  });
});
