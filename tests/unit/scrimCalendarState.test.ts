// tests/unit/scrimCalendarState.test.ts
//
// Décisions de l'agenda des scrims. Ces règles vivaient dans le corps du
// composant : rien n'était vérifiable sans monter un calendrier, alors qu'il
// s'agit de logique pure.

import { describe, it, expect } from 'vitest';
import {
  isYmd,
  parseStatusFilter,
  toggleStatusParam,
  buildTeamOptions,
  keyboardMove,
  effectiveValues,
} from '@/utils/teams/scrimCalendarState';

const ALL = ['draft', 'scheduled', 'running', 'completed', 'cancelled'] as const;

describe('isYmd', () => {
  it('accepte une date bien formée, rejette le reste', () => {
    expect(isYmd('2026-09-08')).toBe(true);
    expect(isYmd('2026-9-8')).toBe(false);
    expect(isYmd('hier')).toBe(false);
    expect(isYmd(null)).toBe(false);
    expect(isYmd(undefined)).toBe(false);
  });
});

describe('parseStatusFilter', () => {
  it('paramètre absent = tous les statuts', () => {
    expect(parseStatusFilter(null, ALL)).toEqual([...ALL]);
    expect(parseStatusFilter('', ALL)).toEqual([...ALL]);
  });

  it('lit une liste et ignore les valeurs inconnues', () => {
    expect(parseStatusFilter('draft,running', ALL)).toEqual(['draft', 'running']);
    expect(parseStatusFilter('draft,pouet', ALL)).toEqual(['draft']);
  });

  it('un paramètre entièrement illisible ne vide PAS l’agenda', () => {
    // Un lien tronqué ou bricolé ne doit pas produire un écran vide sans
    // explication : on retombe sur « tous ».
    expect(parseStatusFilter('pouet,truc', ALL)).toEqual([...ALL]);
  });

  it('tolère les espaces', () => {
    expect(parseStatusFilter(' draft , running ', ALL)).toEqual([
      'draft',
      'running',
    ]);
  });
});

describe('toggleStatusParam', () => {
  it('retirer un statut écrit les restants', () => {
    expect(toggleStatusParam([...ALL], 'draft', ALL)).toBe(
      'scheduled,running,completed,cancelled'
    );
  });

  it('revenir à tous efface le paramètre', () => {
    const partial = ['scheduled', 'running', 'completed', 'cancelled'];
    expect(toggleStatusParam(partial, 'draft', ALL)).toBeNull();
  });

  it('tout décocher est une intention explicite, pas « tous »', () => {
    expect(toggleStatusParam(['draft'], 'draft', ALL)).toBe('');
  });

  it('l’ordre est stable quel que soit le chemin suivi', () => {
    // Deux séquences de clics menant aux mêmes statuts donnent la même URL.
    const a = toggleStatusParam(['running', 'draft'], 'completed', ALL);
    const b = toggleStatusParam(['completed', 'draft'], 'running', ALL);
    expect(a).toBe(b);
  });
});

describe('buildTeamOptions', () => {
  const rows = [
    { team1_id: 'b', team1Name: 'Bravo', team2_id: 'a', team2Name: 'Alpha' },
  ];

  it('déduplique et trie par nom', () => {
    expect(buildTeamOptions([...rows, ...rows], null)).toEqual([
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Bravo' },
    ]);
  });

  it('conserve l’équipe sélectionnée absente de la plage', () => {
    // Sans ça, changer de semaine faisait disparaître l'option alors que le
    // filtre restait actif : agenda vide, et impossible de désélectionner.
    const opts = buildTeamOptions(rows, { id: 'z', name: 'Zoulou' });
    expect(opts.map((o) => o.id)).toEqual(['a', 'b', 'z']);
  });

  it('ne duplique pas l’équipe sélectionnée si elle est déjà présente', () => {
    const opts = buildTeamOptions(rows, { id: 'a', name: 'Alpha' });
    expect(opts.filter((o) => o.id === 'a')).toHaveLength(1);
  });

  it('ignore les équipes sans nom', () => {
    expect(
      buildTeamOptions([{ team1_id: 'x', team1Name: null }], null)
    ).toEqual([]);
  });
});

describe('keyboardMove', () => {
  const base = {
    dayYmd: '2026-09-09',
    minute: 1200,
    duration: 60,
    bandStart: 960,
    bandEnd: 1440,
    days: ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10'],
    snap: 15,
  };

  it('flèche bas/haut déplace d’un cran', () => {
    expect(keyboardMove({ ...base, key: 'ArrowDown', shiftKey: false })).toEqual({
      type: 'move',
      dayYmd: '2026-09-09',
      minute: 1215,
    });
    expect(keyboardMove({ ...base, key: 'ArrowUp', shiftKey: false })).toEqual({
      type: 'move',
      dayYmd: '2026-09-09',
      minute: 1185,
    });
  });

  it('flèche droite/gauche change de jour, à la même heure', () => {
    expect(keyboardMove({ ...base, key: 'ArrowRight', shiftKey: false })).toEqual({
      type: 'move',
      dayYmd: '2026-09-10',
      minute: 1200,
    });
  });

  it('Maj+flèches change la durée', () => {
    expect(keyboardMove({ ...base, key: 'ArrowDown', shiftKey: true })).toEqual({
      type: 'resize',
      duration: 75,
    });
  });

  it('ne fait jamais sortir de la plage horaire visible', () => {
    // En haut de bande, une flèche haut ne doit rien produire du tout.
    expect(
      keyboardMove({ ...base, minute: 960, key: 'ArrowUp', shiftKey: false })
    ).toBeNull();
    expect(
      keyboardMove({ ...base, minute: 1425, key: 'ArrowDown', shiftKey: false })
    ).toBeNull();
  });

  it('ne fait jamais sortir de la semaine affichée', () => {
    expect(
      keyboardMove({
        ...base,
        dayYmd: '2026-09-10',
        key: 'ArrowRight',
        shiftKey: false,
      })
    ).toBeNull();
    expect(
      keyboardMove({
        ...base,
        dayYmd: '2026-09-07',
        key: 'ArrowLeft',
        shiftKey: false,
      })
    ).toBeNull();
  });

  it('la durée ne descend pas sous un cran ni ne déborde la bande', () => {
    expect(
      keyboardMove({ ...base, duration: 15, key: 'ArrowUp', shiftKey: true })
    ).toBeNull();
    const grown = keyboardMove({
      ...base,
      minute: 1425,
      duration: 15,
      key: 'ArrowDown',
      shiftKey: true,
    });
    expect(grown).toBeNull();
  });

  it('ignore les touches non gérées et un jour hors grille', () => {
    expect(keyboardMove({ ...base, key: 'Enter', shiftKey: false })).toBeNull();
    expect(
      keyboardMove({ ...base, dayYmd: '1999-01-01', key: 'ArrowRight', shiftKey: false })
    ).toBeNull();
  });
});

describe('effectiveValues', () => {
  const raw = { scheduled_date: '2026-09-08T18:00:00Z', duration_minutes: 60 };

  it('sans surcharge, rend la donnée serveur', () => {
    expect(effectiveValues(raw, undefined)).toEqual({
      scheduled_date: '2026-09-08T18:00:00Z',
      duration_minutes: 60,
    });
  });

  it('la surcharge optimiste prime — c’est elle qu’on annule', () => {
    // Mémoriser la valeur du dernier fetch ferait annuler vers un état périmé
    // dès le second déplacement avant rafraîchissement.
    expect(
      effectiveValues(raw, { scheduled_date: '2026-09-08T20:00:00Z' })
    ).toEqual({
      scheduled_date: '2026-09-08T20:00:00Z',
      duration_minutes: 60,
    });
  });

  it('scrim inconnu : rien à mémoriser', () => {
    expect(effectiveValues(undefined, undefined)).toEqual({
      scheduled_date: undefined,
      duration_minutes: undefined,
    });
  });
});
