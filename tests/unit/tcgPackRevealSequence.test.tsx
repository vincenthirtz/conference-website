// @vitest-environment happy-dom
//
// Unit tests — la séquence d'ouverture JOUÉE par le composant.
//
// `tcgPackReveal.test.ts` fige le premier rendu (serveur) ; ce fichier rejoue
// la suite, horloge simulée : sachet → déchirure → éventail → retournements,
// « tout révéler » qui saute TOUT, et le mouvement réduit qui n'affiche ni
// sachet ni animation. Le contenu des cartes doit être lisible à chaque étape.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';

import TcgPackReveal, {
  type TcgRevealCard,
} from '../../components/tcg/TcgPackReveal';
import {
  BURST_MS,
  TEAR_MS,
  flipTimeline,
} from '../../utils/tcg/packRevealSequence';
import { RARITY_ORDER } from '../../utils/tcg/rarity';

// La célébration charge `canvas-confetti` à la demande : hors sujet ici.
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
// happy-dom irait chercher l'image du sachet sur localhost:3000 : sans objet
// pour la séquence, et bruyant (ECONNREFUSED) dans la sortie des tests.
vi.mock('next/image', () => ({ default: () => null }));

const labels = {
  title: 'Ton paquet',
  subtitle: 'Les cartes que tu viens d’obtenir.',
  summary: null,
  duplicateHint: null,
  dismiss: 'Fermer',
  revealAll: 'Tout révéler',
  openPack: 'Ouvrir le paquet',
  openPackHint: 'Touche le sachet ou glisse pour le déchirer',
  newCard: 'Nouvelle',
  duplicate: 'Doublon',
  card: {
    rarity: {
      common: 'Commune',
      rare: 'Rare',
      epic: 'Épique',
      legendary: 'Légendaire',
    },
    foil: 'Brillante',
    copies: '×{count}',
  },
};

function cards(): TcgRevealCard[] {
  return RARITY_ORDER.map((rarity, i) => ({
    key: String(i),
    subject: {
      kind: 'player' as const,
      userId: `00000000-0000-4000-8000-00000000000${i}`,
      displayName: `Joueuse ${i}`,
      imageUrl: null,
    },
    rarity,
    isFoil: false,
    isNew: true,
  }));
}

function mockReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function mount() {
  return render(
    <TcgPackReveal cards={cards()} onDismiss={() => {}} labels={labels} />
  );
}

const stage = (c: HTMLElement) =>
  c.querySelector('.tcg-pack-stage') as HTMLElement;
const revealedCount = (c: HTMLElement) =>
  c.querySelectorAll('.tcg-flip-inner[data-revealed="true"]').length;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TcgPackReveal — séquence', () => {
  it('sachet → déchirure → éventail → retournement', () => {
    mockReducedMotion(false);
    const { container } = mount();
    const heading = screen.getByRole('heading', { name: 'Ton paquet' });
    expect(document.activeElement).toBe(heading);

    // Scellé : le sachet est là, les cartes (déjà lisibles) attendent dessous.
    expect(stage(container).dataset.phase).toBe('sealed');
    expect(screen.getByText('Joueuse 3')).toBeTruthy();
    const sachet = screen.getByRole('button', { name: 'Ouvrir le paquet' });

    fireEvent.click(sachet);
    expect(stage(container).dataset.phase).toBe('tearing');
    // Le bouton qui disparaît rend le focus au titre.
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(document.activeElement).toBe(heading);

    act(() => {
      vi.advanceTimersByTime(TEAR_MS);
    });
    expect(stage(container).dataset.phase).toBe('burst');
    expect(container.querySelector('.tcg-sachet')).toBeNull();
    expect(revealedCount(container)).toBe(0);

    act(() => {
      vi.advanceTimersByTime(BURST_MS);
    });
    expect(stage(container).dataset.phase).toBe('flipping');

    const steps = flipTimeline(RARITY_ORDER);
    act(() => {
      vi.advanceTimersByTime(steps[0].flipAt);
    });
    expect(revealedCount(container)).toBe(1);

    act(() => {
      vi.advanceTimersByTime(steps[steps.length - 1].flipAt);
    });
    expect(revealedCount(container)).toBe(RARITY_ORDER.length);
    expect(stage(container).dataset.phase).toBe('done');
    expect(screen.queryByRole('button', { name: 'Tout révéler' })).toBeNull();
  });

  it('fait trembler une carte rare AVANT de la retourner', () => {
    mockReducedMotion(false);
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le paquet' }));
    // Une phase à la fois : la minuterie suivante n'est posée qu'au rendu.
    act(() => {
      vi.advanceTimersByTime(TEAR_MS);
    });
    act(() => {
      vi.advanceTimersByTime(BURST_MS);
    });
    const items = container.querySelectorAll<HTMLElement>('.tcg-flip');
    const [, rare] = flipTimeline(RARITY_ORDER);
    act(() => {
      vi.advanceTimersByTime(rare.tenseAt ?? 0);
    });
    // La commune n'a pas tremblé ; la rare tremble, encore face cachée.
    expect(items[0].dataset.tense).toBe('false');
    expect(items[1].dataset.tense).toBe('true');
    expect(revealedCount(container)).toBe(1);
    act(() => {
      vi.advanceTimersByTime(rare.flipAt - (rare.tenseAt ?? 0));
    });
    expect(items[1].dataset.tense).toBe('false');
    expect(revealedCount(container)).toBe(2);
    // La durée de la tension est portée par la carte, pour le CSS.
    expect(items[3].style.getPropertyValue('--tension-ms')).toBe('1050ms');
  });

  it('ouvre aussi d’un glissé horizontal', () => {
    mockReducedMotion(false);
    const { container } = mount();
    const sachet = screen.getByRole('button', { name: 'Ouvrir le paquet' });
    fireEvent.pointerDown(sachet, { clientX: 10, button: 0, pointerId: 1 });
    fireEvent.pointerMove(sachet, { clientX: 400, pointerId: 1 });
    expect(stage(container).dataset.phase).toBe('tearing');
  });

  it('« Tout révéler » saute TOUTE la séquence, déchirure comprise', () => {
    mockReducedMotion(false);
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Tout révéler' }));
    expect(stage(container).dataset.phase).toBe('done');
    expect(container.querySelector('.tcg-sachet')).toBeNull();
    expect(revealedCount(container)).toBe(RARITY_ORDER.length);
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Ton paquet' })
    );
    // Plus aucune minuterie ne doit rien changer ensuite.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(revealedCount(container)).toBe(RARITY_ORDER.length);
  });

  it('mouvement réduit : ni sachet ni séquence, cartes posées face visible', () => {
    mockReducedMotion(true);
    const { container } = mount();
    expect(stage(container).dataset.phase).toBe('done');
    expect(container.querySelector('.tcg-sachet')).toBeNull();
    expect(revealedCount(container)).toBe(RARITY_ORDER.length);
    expect(screen.queryByRole('button', { name: 'Tout révéler' })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Ton paquet' })
    );
    // Aucune lueur de célébration, même avec une légendaire dans le paquet.
    expect(container.querySelector('.tcg-legendary-flash')).toBeNull();
  });
});
