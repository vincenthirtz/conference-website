// Smoke de rendu du match picker et des composants de présence (/admin/caster,
// lot 5). Même posture que adminCasterSceneEditors.test.ts : pas de jsdom
// (politique zéro dépendance), rendu serveur via react-dom/server. Ça attrape
// les crashs de rendu, les clés i18n manquantes passées à format(), et vérifie
// le contenu réellement produit (libellés de matchs, indicateur live, avatars).
// Les effets (fetch, canal Presence) ne tournent pas en renderToString — voulu.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import { ToastProvider } from '@/components/Toast';
import CasterCollabBanner from '@/components/admin/caster/CasterCollabBanner';
import CasterPresenceBar from '@/components/admin/caster/CasterPresenceBar';
import MatchPickerPanel from '@/components/admin/caster/MatchPickerPanel';
import MatchSceneEditor from '@/components/admin/caster/MatchSceneEditor';
import type { UseCasterTournaments } from '@/hooks/useCasterTournaments';
import type {
  CasterApiMatch,
  CasterPresenceUser,
  CasterScene,
  CasterSceneType,
} from '@/types/caster';

const onSave = async () => {};

function scene(
  type: CasterSceneType,
  data: Record<string, unknown> = {}
): CasterScene {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: `Scène ${type}`,
    type,
    overlay: `${type}.html`,
    data,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function match(over: Partial<CasterApiMatch> = {}): CasterApiMatch {
  return {
    id: 'm-live',
    status: 'ongoing',
    best_of: 5,
    match_format: null,
    scheduled_at: null,
    team1_score: 1,
    team2_score: 2,
    round_name: 'Demi-finale',
    stream_url: null,
    team1: { id: 't1', name: 'Percevál', short_name: 'PERC', logo_url: null },
    team2: { id: 't2', name: 'Karadoc', short_name: 'KARA', logo_url: null },
    ...over,
  };
}

/** Faux retour de useCasterTournaments (le hook n'est pas exécuté ici). */
function pickerState(over: Partial<UseCasterTournaments> = {}) {
  const noop = () => {};
  return {
    tournaments: [
      {
        id: 'tour-1',
        name: 'Women’s Cup #7',
        slug: null,
        game: 'overwatch',
        status: 'running',
        start_date: null,
        format_type: null,
      },
    ],
    tournamentsLoading: false,
    tournamentId: 'tour-1',
    matches: [match()],
    matchesLoading: false,
    maps: [],
    error: null,
    selectTournament: noop,
    reloadMatches: noop,
    reloadTournaments: noop,
    ...over,
  } as UseCasterTournaments;
}

function renderPicker(
  s: CasterScene,
  picker: UseCasterTournaments,
  linkedMatch: CasterApiMatch | null = null
): string {
  return renderToString(
    createElement(
      ToastProvider,
      null,
      createElement(MatchPickerPanel, {
        scene: s,
        picker,
        linkedMatch,
        onImport: async () => {},
        onDetach: async () => {},
      })
    )
  );
}

describe('MatchPickerPanel', () => {
  it('rend les sélecteurs et le libellé complet du match (glyphe + score + tour)', () => {
    const html = renderPicker(scene('match'), pickerState());
    expect(html).toContain('data-testid="caster-match-picker"');
    expect(html).toContain('data-testid="caster-pick-tournament"');
    expect(html).toContain('data-testid="caster-pick-match"');
    expect(html).toContain('Women’s Cup #7 (running)');
    // Libellé d'option : glyphe live, équipes, score, tour.
    expect(html).toContain('PERC vs KARA (1-2) — Demi-finale');
    expect(html).toContain('🔴');
    // Aucun match lié → pas d'indicateur live ni de bouton Détacher.
    expect(html).not.toContain('data-testid="caster-live-score-indicator"');
    expect(html).not.toContain('data-testid="caster-detach-match"');
  });

  it('révèle la recherche seulement au-delà du seuil (8 matchs)', () => {
    const nine = Array.from({ length: 9 }, (_, i) =>
      match({ id: `m-${i}`, status: 'pending', round_name: `Tour ${i}` })
    );
    expect(renderPicker(scene('match'), pickerState())).not.toContain(
      'data-testid="caster-match-filter"'
    );
    expect(
      renderPicker(scene('match'), pickerState({ matches: nine }))
    ).toContain('data-testid="caster-match-filter"');
  });

  it('scène liée : indicateur de score en direct + Détacher', () => {
    const html = renderPicker(
      scene('match', { matchId: 'm-live' }),
      pickerState(),
      match({ team1_score: 2, team2_score: 1 })
    );
    expect(html).toContain('data-testid="caster-live-score-indicator"');
    expect(html).toContain('data-testid="caster-detach-match"');
    expect(html).toContain('PERC 2–1 KARA');
  });

  it('scène liée sans lecture encore aboutie : libellé d’attente', () => {
    const html = renderPicker(
      scene('match', { matchId: 'm-live' }),
      pickerState(),
      null
    );
    expect(html).toContain('data-testid="caster-live-score-indicator"');
    expect(html).toContain('lecture…');
  });

  it('tournoi sans match → EmptyState (jamais une liste muette)', () => {
    const html = renderPicker(scene('match'), pickerState({ matches: [] }));
    expect(html).toContain('Aucun match diffusable');
  });

  it('erreur réseau → bandeau non bloquant + retry', () => {
    const html = renderPicker(
      scene('match'),
      pickerState({ error: 'HTTP 500' })
    );
    expect(html).toContain('HTTP 500');
    expect(html).toContain('Réessayer');
  });

  it('chargement en cours → libellés d’attente dans les sélecteurs', () => {
    const html = renderPicker(
      scene('match'),
      pickerState({
        tournamentsLoading: true,
        matchesLoading: true,
        tournaments: [],
        matches: [],
      })
    );
    expect(html).toContain('Chargement…');
  });
});

describe('MatchSceneEditor — map pool du tournoi (lot 5)', () => {
  function renderEditor(tournamentMaps: Array<{ map_name: string }> | null) {
    return renderToString(
      createElement(
        ToastProvider,
        null,
        createElement(MatchSceneEditor, {
          scene: scene('match', { map: 'Ilios' }),
          onSave,
          tournamentMaps,
        })
      )
    );
  }

  it('les maps du tournoi remplacent le pool par défaut', () => {
    const html = renderEditor([{ map_name: 'Oasis' }, { map_name: 'Busan' }]);
    expect(html).toContain('Oasis');
    expect(html).toContain('Busan');
    // La valeur courante hors liste est conservée…
    expect(html).toContain('Ilios');
    // …mais le pool par défaut n'est pas déversé.
    expect(html).not.toContain('Shambali Monastery');
  });

  it('sans maps de tournoi : pool Overwatch par défaut (comportement lot 2)', () => {
    const html = renderEditor(null);
    expect(html).toContain('Shambali Monastery');
  });
});

describe('CasterPresenceBar', () => {
  function user(over: Partial<CasterPresenceUser> = {}): CasterPresenceUser {
    return {
      staffId: 'me',
      displayName: 'Perceval',
      role: 'caster',
      activeScene: null,
      activeField: null,
      joinedAt: '2026-07-30T10:00:00.000Z',
      ...over,
    };
  }

  it('affiche les casters, la scène éditée et marque « vous »', () => {
    const html = renderToString(
      createElement(CasterPresenceBar, {
        users: [
          user({ activeScene: 'scene-a' }),
          user({
            staffId: 'other',
            displayName: 'Karadoc',
            activeScene: 'scene-a',
          }),
        ],
        selfStaffId: 'me',
        sceneNameById: { 'scene-a': 'Match en cours' },
        connected: true,
      })
    );
    expect(html).toContain('data-testid="caster-presence-bar"');
    expect(html).toContain('Perceval (vous)');
    expect(html).toContain('Karadoc');
    expect(html).toContain('Match en cours');
    // Compteur affiché dès 2 casters.
    expect(html).toContain('👥 2');
  });

  it('canal non souscrit → mention explicite, pas de fausse solitude', () => {
    const html = renderToString(
      createElement(CasterPresenceBar, {
        users: [],
        selfStaffId: 'me',
        sceneNameById: {},
        connected: false,
      })
    );
    expect(html).toContain('Présence indisponible');
    expect(html).not.toContain('data-testid="caster-presence-bar"');
  });
});

describe('CasterCollabBanner', () => {
  function other(activeField: string | null): CasterPresenceUser {
    return {
      staffId: 'other',
      displayName: 'Karadoc',
      role: 'caster',
      activeScene: 'scene-a',
      activeField,
      joinedAt: '2026-07-30T10:00:00.000Z',
    };
  }

  it('rien quand personne d’autre n’a la scène ouverte', () => {
    expect(
      renderToString(createElement(CasterCollabBanner, { others: [] }))
    ).toBe('');
  });

  it('variante « ouverte » vs « édition simultanée » selon activeField', () => {
    const shared = renderToString(
      createElement(CasterCollabBanner, { others: [other(null)] })
    );
    expect(shared).toContain('également ouverte par Karadoc');

    const editing = renderToString(
      createElement(CasterCollabBanner, { others: [other('ed-team1')] })
    );
    expect(editing).toContain('Édition simultanée par Karadoc');
  });
});
