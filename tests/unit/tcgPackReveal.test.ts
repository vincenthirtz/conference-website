// Unit tests — la révélation d'un paquet TCG.
//
// CE QUI EST TESTÉ ICI EST LE PREMIER RENDU, et c'est le plus important à
// tenir. La séquence de retournement est pilotée par des minuteries dans un
// `useEffect`, qui ne tourne pas en rendu serveur : ce que ce fichier voit est
// donc exactement ce qu'une joueuse voit à la première frame, avant que le
// moindre JavaScript d'animation s'exécute.
//
// DEUX PROMESSES OPPOSÉES, ET IL FAUT LES DEUX :
//
//   1. L'ŒIL NE DOIT RIEN VOIR. Si le premier rendu sortait les cartes face
//      visible, l'animation ne serait qu'un retournement DÉCORATIF joué après
//      coup sur des cartes déjà lues — la surprise serait vendue avant de
//      commencer. C'est ce qui arriverait si l'état initial de `flipped`
//      passait un jour à `cards.length`, ou si le CSS du dos disparaissait.
//
//   2. LE LECTEUR D'ÉCRAN DOIT TOUT AVOIR. Le contenu des cartes est dans le
//      DOM dès ce premier rendu. Retarder le texte pour « préserver le
//      suspense » reviendrait à faire payer l'animation à celles qui ne la
//      voient pas : elles attendraient deux secondes un contenu qui existe
//      déjà. Le suspense est visuel, et seulement visuel.
//
// Le dos est donc `aria-hidden` : il cache à l'œil sans exister pour la voix.

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

import TcgPackReveal, {
  type TcgRevealCard,
} from '../../components/tcg/TcgPackReveal';
import { RARITY_ORDER } from '../../utils/tcg/rarity';

const labels = {
  title: 'Ton paquet',
  subtitle: 'Les cartes que tu viens d’obtenir.',
  summary: null,
  duplicateHint: null,
  dismiss: 'Fermer',
  revealAll: 'Tout révéler',
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
    // Une brillante parmi les quatre : le reflet ne doit exister que pour elle.
    isFoil: i === 2,
    isNew: i % 2 === 0,
  }));
}

function render(list = cards()) {
  return renderToString(
    React.createElement(TcgPackReveal, {
      cards: list,
      onDismiss: () => {},
      labels,
    })
  );
}

describe('TcgPackReveal — premier rendu', () => {
  it('sort toutes les cartes FACE CACHÉE', () => {
    const html = render();
    // Le marqueur que lit le CSS pour retourner la carte.
    expect(html).toContain('data-revealed="false"');
    expect(html).not.toContain('data-revealed="true"');
  });

  it('pose un dos par carte, invisible pour un lecteur d’écran', () => {
    const html = render();
    const dos = html.match(/tcg-flip-back/g) ?? [];
    expect(dos).toHaveLength(RARITY_ORDER.length);
    // Le dos ne doit ni être annoncé, ni intercepter un clic destiné au lien
    // de la carte qu'il recouvre.
    expect(html).toContain('pointer-events-none');
    expect(html).toContain('aria-hidden');
  });

  it('met malgré tout le contenu des cartes dans le DOM', () => {
    const html = render();
    // La promesse n°2 : ce que l'œil ne voit pas encore, la voix le dit déjà.
    for (let i = 0; i < RARITY_ORDER.length; i += 1) {
      expect(html).toContain(`Joueuse ${i}`);
    }
    expect(html).toContain('Commune');
    expect(html).toContain('Légendaire');
  });

  it('garde les badges dans le DOM mais les masque à l’œil', () => {
    const html = render();
    // Lu par un lecteur d'écran, invisible pendant que la carte est retournée :
    // afficher « Nouvelle » avant le retournement vendrait la mèche.
    expect(html).toContain('Nouvelle');
    expect(html).toContain('opacity-0');
  });

  it('offre de sauter la séquence', () => {
    // Sans cette commande, la seule façon d'aller vite serait d'attendre.
    expect(render()).toContain('Tout révéler');
  });

  it('donne un halo à CHAQUE rareté', () => {
    const html = render();
    // Une rareté sans halo ne casserait rien : elle se retournerait sans
    // éclat, et personne ne saurait dire si c'est voulu. Le test le dit.
    const halos = html.match(/--tcg-halo:/g) ?? [];
    expect(halos).toHaveLength(RARITY_ORDER.length);
  });

  it('réserve le reflet aux cartes brillantes', () => {
    const html = render();
    const sheens = html.match(/tcg-sheen/g) ?? [];
    expect(sheens).toHaveLength(1);
  });

  it('n’affiche pas « tout révéler » pour un paquet vide', () => {
    // `flipped` (0) >= `cards.length` (0) : tout est déjà révélé, il n'y a
    // rien à sauter. Un bouton inerte resterait un arrêt au clavier.
    expect(render([])).not.toContain('Tout révéler');
  });
});
