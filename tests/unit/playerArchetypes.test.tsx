// @vitest-environment happy-dom
//
// Archétypes joueuse (lot P8) : Fil / Fiche / Liste / Parcours / Collection.
// Ce que la spec vérifie par archétype : cibles ≥ 44 px (classes du kit ou
// `min-h-11`), `aria-live` là où il y a mise à jour, focus géré (feuille,
// étape, plein écran). Le focus VISIBLE est porté par la surface
// (styles/player-ruban.css → `[data-surface="player"] :focus-visible`).

import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Button, Card, EntityHeader } from '../../features/ruban';
import {
  CollectionView,
  FicheFold,
  FicheView,
  FilView,
  ListeRow,
  ListeView,
  ParcoursView,
} from '../../features/player/_shared/ui';

afterEach(cleanup);

const LABELS = {
  filters: 'Filtres',
  closeFilters: 'Fermer',
  loadMore: 'Charger plus',
  loading: 'Chargement',
};

describe('FilView', () => {
  it('annonce l’état du fil et pose l’action principale en bas', () => {
    render(
      <FilView
        title="Fil"
        status="2 nouveautés"
        primaryAction={<Button variant="primary">Check-in</Button>}
      >
        <Card>carte</Card>
      </FilView>
    );
    const live = screen.getByRole('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('2 nouveautés');
    const cta = screen.getByRole('button', { name: 'Check-in' });
    expect(cta.hasAttribute('data-ruban-target')).toBe(true);
    expect(cta.closest('[data-action-dock]')).toBeTruthy();
  });
});

describe('FicheView', () => {
  it('sections repliables (résumé 44 px) et statut annoncé', () => {
    render(
      <FicheView
        header={<EntityHeader title="Nova" />}
        status="Enregistré"
        actions={<Button>Enregistrer</Button>}
      >
        <FicheFold title="Roster" defaultOpen={false}>
          <p>membres</p>
        </FicheFold>
      </FicheView>
    );
    expect(screen.getByRole('heading', { name: 'Nova' })).toBeTruthy();
    const summary = screen.getByText('Roster').closest('summary');
    expect(summary?.className).toContain('min-h-11');
    expect(summary?.parentElement?.hasAttribute('open')).toBe(false);
    expect(screen.getByRole('status').textContent).toBe('Enregistré');
  });
});

describe('ListeView', () => {
  it('lignes tactiles, total annoncé, pagination par curseur', () => {
    const onLoadMore = vi.fn();
    render(
      <ListeView
        title="Annuaire"
        labels={LABELS}
        summary="2 sur 5"
        hasMore
        onLoadMore={onLoadMore}
      >
        <ListeRow href="/player/teams">Nova</ListeRow>
        <ListeRow onClick={() => {}}>Aurora</ListeRow>
      </ListeView>
    );
    expect(screen.getByRole('link', { name: 'Nova' }).className).toContain(
      'min-h-11'
    );
    expect(screen.getByRole('button', { name: 'Aurora' }).className).toContain(
      'min-h-11'
    );
    expect(screen.getByText('2 sur 5').getAttribute('aria-live')).toBe(
      'polite'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Charger plus' }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('état vide et chargement', () => {
    const { rerender } = render(
      <ListeView title="L" labels={LABELS} empty={<p>Rien</p>} />
    );
    expect(screen.getByText('Rien')).toBeTruthy();
    rerender(<ListeView title="L" labels={LABELS} loading />);
    expect(screen.getByText('Chargement')).toBeTruthy();
  });

  it('filtres en feuille basse : dialogue modal, Échap ferme', () => {
    render(
      <ListeView
        title="L"
        labels={LABELS}
        filters={
          <select aria-label="Région">
            <option>EU</option>
          </select>
        }
      >
        <ListeRow onClick={() => {}}>a</ListeRow>
      </ListeView>
    );
    const open = screen.getByRole('button', { name: 'Filtres' });
    expect(open.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(open);
    const sheet = screen.getByRole('dialog', { name: 'Filtres' });
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ParcoursView', () => {
  function Harness() {
    const [i, setI] = useState(0);
    return (
      <ParcoursView
        title="Créer"
        steps={[
          { key: 'a', label: 'Identité' },
          { key: 'b', label: 'Roster' },
        ]}
        current={i}
        progressLabel="Progression"
        position={`Étape ${i + 1} sur 2`}
        backLabel="Retour"
        onBack={i > 0 ? () => setI(0) : undefined}
        next={<Button onClick={() => setI(1)}>Continuer</Button>}
      >
        <p>décision</p>
      </ParcoursView>
    );
  }

  it('une étape par écran, position annoncée, focus sur le titre de l’étape', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Retour' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Étape 1 sur 2');
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(screen.getByRole('status').textContent).toBe('Étape 2 sur 2');
    const heading = screen.getByRole('heading', { name: 'Roster' });
    expect(document.activeElement).toBe(heading);
    const current = screen
      .getByRole('list', { name: 'Progression' })
      .querySelector('[aria-current="step"]');
    expect(current?.textContent).toBe('Roster');
    expect(screen.getByRole('button', { name: 'Retour' })).toBeTruthy();
  });
});

describe('CollectionView', () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}` }));
  it('grille fenêtrée, fiche plein écran, focus rendu à la vignette', () => {
    render(
      <CollectionView
        title="Collection"
        items={items}
        getKey={(c) => c.id}
        tileLabel={(c) => `Carte ${c.id}`}
        renderTile={(c) => c.id}
        renderDetail={(c) => <p>détail {c.id}</p>}
        summary="5 cartes"
        labels={{ close: 'Fermer', more: 'Afficher plus' }}
        pageSize={2}
      />
    );
    expect(screen.getAllByRole('button', { name: /^Carte / })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Afficher plus' }));
    expect(screen.getAllByRole('button', { name: /^Carte / })).toHaveLength(4);
    expect(screen.getByText('5 cartes').getAttribute('aria-live')).toBe(
      'polite'
    );

    const tile = screen.getByRole('button', { name: 'Carte c1' });
    expect(tile.className).toContain('min-h-11');
    fireEvent.click(tile);
    const dialog = screen.getByRole('dialog', { name: 'Carte c1' });
    expect(dialog.textContent).toContain('détail c1');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(tile);
  });
});
