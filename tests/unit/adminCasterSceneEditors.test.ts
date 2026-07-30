// Smoke de rendu des 12 éditeurs de scènes caster (/admin/caster, lots 2 et 6).
//
// Pas de jsdom/testing-library dans ce repo (politique zéro dépendance) : on
// rend chaque éditeur côté serveur via react-dom/server. Ça attrape les crashs
// de rendu, les clés i18n manquantes passées à format() et les régressions de
// normalisation des `data` jsonb (shapes réelles de la table caster_scenes,
// y compris les legacy : ban en chaîne nue, candidates { name }…). Les effets
// (auto-save, fetch scrims, fetch des pickers publics du lot 6) ne tournent pas
// en renderToString — voulu : aucun réseau, aucune écriture. Les pickers sont
// donc rendus dans leur état « chargement » (liste null).

import { describe, it, expect } from 'vitest';
import { createElement, type ComponentType } from 'react';
import { renderToString } from 'react-dom/server';

import { ToastProvider } from '@/components/Toast';
import StartingSceneEditor from '@/components/admin/caster/StartingSceneEditor';
import MatchSceneEditor from '@/components/admin/caster/MatchSceneEditor';
import PauseSceneEditor from '@/components/admin/caster/PauseSceneEditor';
import ResultsSceneEditor from '@/components/admin/caster/ResultsSceneEditor';
import EndSceneEditor from '@/components/admin/caster/EndSceneEditor';
import MvpSceneEditor from '@/components/admin/caster/MvpSceneEditor';
import ScrimSceneEditor from '@/components/admin/caster/ScrimSceneEditor';
import WebcamSceneEditor from '@/components/admin/caster/WebcamSceneEditor';
import BracketSceneEditor from '@/components/admin/caster/BracketSceneEditor';
import PlayerSceneEditor from '@/components/admin/caster/PlayerSceneEditor';
import LeaderboardSceneEditor from '@/components/admin/caster/LeaderboardSceneEditor';
import StandingsSceneEditor from '@/components/admin/caster/StandingsSceneEditor';
import PublicDataPicker from '@/components/admin/caster/PublicDataPicker';
import type { CasterScene, CasterSceneType } from '@/types/caster';

type EditorProps = {
  scene: CasterScene;
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
};

const onSave = async () => {};

function scene(
  type: CasterSceneType,
  data: Record<string, unknown>
): CasterScene {
  return {
    id: `00000000-0000-0000-0000-00000000000${type.length}`,
    name: `Scène ${type}`,
    type,
    overlay: `${type}.html`,
    data,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function render(Editor: ComponentType<EditorProps>, s: CasterScene): string {
  return renderToString(
    createElement(
      ToastProvider,
      null,
      createElement(Editor, { scene: s, onSave })
    )
  );
}

const CASES: Array<{
  type: CasterSceneType;
  Editor: ComponentType<EditorProps>;
  data: Record<string, unknown>;
  testid: string;
  markers: string[];
}> = [
  {
    type: 'starting',
    Editor: StartingSceneEditor,
    data: {
      title: 'On arrive !',
      countdown: 600,
      nextMatch: { team1: 'Alpha', team2: 'Bravo', bestOf: 5 },
      hashtag: '#WomensCup',
      socials: { site: 'owwomenscup.fr' },
    },
    testid: 'caster-starting-editor',
    markers: ['On arrive !', 'Alpha', 'Bravo'],
  },
  {
    type: 'match',
    Editor: MatchSceneEditor,
    data: {
      team1: 'Alpha',
      team2: 'Bravo',
      score1: 2,
      score2: 1,
      map: 'Ilios',
      bestOf: 5,
      overwatchHud: true,
      // Shapes legacy tolérées : ban1 objet complet, ban2 chaîne nue.
      ban1: { key: 'ana', name: 'Ana', portrait: 'https://cdn/ana.png' },
      ban2: 'Sombra',
      casters: ['Caster A', 'Caster B'],
      matchId: '123e4567-e89b-42d3-a456-426614174000',
    },
    testid: 'caster-match-editor',
    markers: ['caster-hero-bans', 'Ilios', 'Caster A, Caster B'],
  },
  {
    type: 'pause',
    Editor: PauseSceneEditor,
    data: { message: 'On revient', marquee: 'Discord !' },
    testid: 'caster-pause-editor',
    markers: ['Be Right Back', 'On revient'],
  },
  {
    type: 'results',
    Editor: ResultsSceneEditor,
    data: {
      team1: 'Alpha',
      team2: 'Bravo',
      score1: 3,
      score2: 2,
      bestOf: 5,
      mvp: 'Joueuse X',
      mapResults: [{ map: 'Ilios', score1: 2, score2: 1 }],
    },
    testid: 'caster-results-editor',
    markers: ['Joueuse X', 'Ilios 2-1'],
  },
  {
    type: 'end',
    Editor: EndSceneEditor,
    data: {
      subtitle: 'À la prochaine',
      credits: [{ label: 'Production', value: "Women's Cup" }],
      sponsors: ['Sponsor A', 'Sponsor B'],
    },
    testid: 'caster-end-editor',
    markers: ['Merci !', 'Sponsor A, Sponsor B'],
  },
  {
    type: 'mvp',
    Editor: MvpSceneEditor,
    data: {
      title: 'Vote MVP',
      // Les deux shapes de candidates rencontrées en base.
      candidates: [{ id: '1', label: 'Joueuse A' }, { name: 'Joueuse B' }],
      total: 42,
      isOpen: true,
    },
    testid: 'caster-mvp-editor',
    markers: ['Joueuse A', 'Joueuse B', '42'],
  },
  {
    type: 'scrim',
    Editor: ScrimSceneEditor,
    data: { mode: 'matchup', scrimId: 'scrim-slug', title: 'SCRIM' },
    testid: 'caster-scrim-editor',
    markers: ['caster-scrim-picker', 'SCRIM'],
  },
  {
    type: 'webcam',
    Editor: WebcamSceneEditor,
    data: {
      mode: 'duo',
      cam1: { label: 'EOS Webcam Utility', deviceId: 'abc' },
      cam2: { label: '', deviceId: '' },
      shape: 'circle',
      mirror: true,
    },
    testid: 'caster-webcam-editor',
    markers: ['EOS Webcam Utility', 'caster-webcam-detect'],
  },
  // ---- Lot 6 : scènes « données du site » (référence seule en base) --------
  {
    type: 'bracket',
    Editor: BracketSceneEditor,
    data: {
      title: 'BRACKET LIVE',
      tournamentId: '123e4567-e89b-42d3-a456-426614174000',
      tournamentName: 'Summer Cup 2026',
      theme: 'light',
    },
    testid: 'caster-bracket-editor',
    // Un tournoi sélectionné ⇒ le lien d'aperçu de l'embed est rendu.
    markers: [
      'caster-bracket-picker',
      'BRACKET LIVE',
      'caster-bracket-preview',
    ],
  },
  {
    type: 'player',
    Editor: PlayerSceneEditor,
    data: {
      title: 'Spotlight Kiriko',
      userId: 'user-42',
      playerName: 'Kiriko',
      hashtag: '#WomensCup',
      socials: { twitch: 'twitch.tv/womens_cup' },
    },
    testid: 'caster-player-editor',
    markers: ['caster-player-picker', 'Spotlight Kiriko'],
  },
  {
    type: 'leaderboard',
    Editor: LeaderboardSceneEditor,
    data: {
      title: 'TOP LIGUE',
      mode: 'league',
      leagueSlug: 'ligue-2026',
      leagueName: 'Ligue 2026',
      // Hors bornes en base (scène desktop bricolée) ⇒ ramené à 20 au rendu.
      topN: 42,
    },
    testid: 'caster-leaderboard-editor',
    markers: ['caster-leaderboard-league-picker', 'TOP LIGUE', 'value="20"'],
  },
  {
    type: 'standings',
    Editor: StandingsSceneEditor,
    data: {
      title: 'PODIUM',
      tournamentId: '123e4567-e89b-42d3-a456-426614174000',
      tournamentName: 'Summer Cup 2026',
    },
    testid: 'caster-standings-editor',
    markers: ['caster-standings-picker', 'PODIUM'],
  },
];

describe('éditeurs de scènes caster (rendu SSR)', () => {
  for (const c of CASES) {
    it(`rend l'éditeur ${c.type} sans crash ni clé i18n manquante`, () => {
      const html = render(c.Editor, scene(c.type, c.data));
      expect(html).toContain(c.testid);
      for (const marker of c.markers) {
        expect(html).toContain(marker);
      }
      // Une clé i18n manquante interpolée finirait en texte « undefined ».
      expect(html).not.toMatch(/>undefined</);
    });
  }

  it('rend chaque éditeur avec une data VIDE (scène fraîche, défauts)', () => {
    for (const c of CASES) {
      const html = render(c.Editor, scene(c.type, {}));
      expect(html).toContain(c.testid);
    }
  });

  it("leaderboard : le picker de ligue n'apparaît qu'en mode league", () => {
    const players = render(
      LeaderboardSceneEditor,
      scene('leaderboard', { mode: 'leaderboard', topN: 8 })
    );
    expect(players).not.toContain('caster-leaderboard-league-picker');
    // topN par défaut respecté (pas de clamp intempestif sur une valeur valide).
    expect(players).toContain('value="8"');

    const league = render(
      LeaderboardSceneEditor,
      scene('leaderboard', { mode: 'league' })
    );
    expect(league).toContain('caster-leaderboard-league-picker');
  });

  it("bracket : pas de lien d'aperçu sans tournoi sélectionné", () => {
    const html = render(BracketSceneEditor, scene('bracket', { title: 'X' }));
    expect(html).not.toContain('caster-bracket-preview');
  });
});

/**
 * Le picker partagé des scènes du lot 6 est rendu directement : ses trois états
 * « liste chargée » (vide, peuplée, sélection disparue) ne sont pas atteignables
 * via les éditeurs en SSR, où les effets de chargement ne tournent pas.
 */
describe('PublicDataPicker (états de liste)', () => {
  type PickerProps = Parameters<typeof PublicDataPicker>[0];

  const base: PickerProps = {
    label: 'Tournoi',
    options: null,
    selected: null,
    onSelect: () => {},
    onReload: () => {},
    loadingLabel: 'Chargement…',
    noneLabel: '— Sélectionner —',
    reloadLabel: 'Recharger la liste',
    testId: 'pick',
  };

  function renderPicker(overrides: Partial<PickerProps>): string {
    return renderToString(
      createElement(PublicDataPicker, { ...base, ...overrides })
    );
  }

  it('liste vide → note explicite plutôt qu’un select vide', () => {
    const html = renderPicker({ options: [], selected: null });
    expect(html).toContain('pick-empty');
  });

  it('chargement → option unique désactivée, pas de note vide', () => {
    const html = renderPicker({ options: null, selected: 'tid-1' });
    expect(html).toContain('Chargement…');
    expect(html).toContain('disabled');
    expect(html).not.toContain('pick-empty');
  });

  it('sélection hors liste → option fantôme + note de référence morte', () => {
    const html = renderPicker({
      options: [{ value: 'tid-1', label: 'Summer Cup', name: 'Summer Cup' }],
      selected: 'tid-archive',
      memorizedLabel: 'Archive Cup',
      ghostNote: 'Référence absente de la liste',
    });
    expect(html).toContain('Archive Cup');
    expect(html).toContain('value="tid-archive"');
    expect(html).toContain('pick-ghost-note');
  });

  it('pas de note fantôme sans ghostNote (picker joueuse)', () => {
    const html = renderPicker({
      options: [{ value: 'u1', label: 'Kiriko', name: 'Kiriko' }],
      selected: 'u2',
      memorizedLabel: 'Hors top 100',
    });
    expect(html).toContain('Hors top 100');
    expect(html).not.toContain('pick-ghost-note');
  });
});
