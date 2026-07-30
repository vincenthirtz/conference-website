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
import CameraSceneEditor from '@/components/admin/caster/CameraSceneEditor';
import PlayerSceneEditor from '@/components/admin/caster/PlayerSceneEditor';
import LeaderboardSceneEditor from '@/components/admin/caster/LeaderboardSceneEditor';
import StandingsSceneEditor from '@/components/admin/caster/StandingsSceneEditor';
import PublicDataPicker from '@/components/admin/caster/PublicDataPicker';
import OverlayPreview from '@/components/admin/caster/OverlayPreview';
import SceneList from '@/components/admin/caster/SceneList';
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
  // ---- Scène `camera` : captation d'un opérateur DISTANT par un lien --------
  {
    type: 'camera',
    Editor: CameraSceneEditor,
    data: {
      url: 'https://vdo.ninja/?view=wc7k2m9x',
      label: 'Caméra salle',
      fit: 'contain',
      shape: 'circle',
      mirror: true,
      layout: 'corner',
      corner: 'tl',
      audio: true,
    },
    testid: 'caster-camera-editor',
    markers: [
      'caster-camera-url',
      'https://vdo.ninja/?view=wc7k2m9x',
      'Caméra salle',
      // Source reconnue ⇒ pastille de latence, pas de bandeau « non reconnu ».
      'caster-camera-detected',
      'caster-camera-latency',
      // Coin visible car layout=corner, et audio coché ⇒ avertissement d'écho.
      'caster-camera-corner',
      'caster-camera-audio-warning',
    ],
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
 * Scène `camera` : le retour sur le LIEN est la fonction critique de l'éditeur
 * (un lien non reconnu = cadre noir à l'antenne, un lien Twitch = 15 s de
 * retard). Chacun des trois états du champ est vérifié.
 */
describe('CameraSceneEditor (retour sur le lien de captation)', () => {
  const renderCamera = (data: Record<string, unknown>) =>
    render(CameraSceneEditor, scene('camera', data));

  it('champ vide : aide aux formats, aucun bandeau d’alerte', () => {
    const html = renderCamera({});
    expect(html).toContain('caster-camera-empty-hint');
    expect(html).not.toContain('caster-camera-unknown');
    expect(html).not.toContain('caster-camera-detected');
  });

  it('lien non reconnu : bandeau ambre + liste des formats acceptés', () => {
    const html = renderCamera({ url: 'https://example.com/ma-page' });
    expect(html).toContain('caster-camera-unknown');
    expect(html).toContain('Lien non reconnu');
    expect(html).toContain('vdo.ninja/?view=salle');
    expect(html).not.toContain('caster-camera-detected');
  });

  it('lien Twitch : latence élevée signalée comme inexploitable en direct', () => {
    const html = renderCamera({ url: 'twitch.tv/womens_cup' });
    expect(html).toContain('caster-camera-detected');
    expect(html).toContain('caster-camera-latency-warning');
    // L'URL normalisée (player + parent) est montrée telle qu'utilisée à l'antenne.
    expect(html).toContain('player.twitch.tv');
  });

  it('lien VDO.Ninja : temps réel, aucun avertissement de latence', () => {
    const html = renderCamera({ url: 'https://vdo.ninja/?view=wc7k2m9x' });
    expect(html).toContain('caster-camera-detected');
    expect(html).not.toContain('caster-camera-latency-warning');
  });

  it('plein cadre : le sélecteur de coin disparaît', () => {
    const corner = renderCamera({ layout: 'corner' });
    expect(corner).toContain('caster-camera-corner');
    const full = renderCamera({ layout: 'fullscreen' });
    expect(full).not.toContain('caster-camera-corner');
  });

  it('audio décoché par défaut : pas d’avertissement d’écho, mais le rappel', () => {
    const html = renderCamera({ url: 'https://vdo.ninja/?view=wc1' });
    expect(html).not.toContain('caster-camera-audio-warning');
    expect(html).toContain('Son coupé');
  });

  it('générateur VDO.Ninja présent, sans identifiant tiré au rendu (pureté)', () => {
    // Le tirage aléatoire vit dans un effet : en SSR l'identifiant est vide, donc
    // aucun couple de liens n'est rendu (et le rendu reste déterministe).
    const html = renderCamera({});
    expect(html).toContain('caster-camera-vdo');
    expect(html).toContain('caster-camera-vdo-room');
    expect(html).not.toContain('caster-camera-vdo-push');
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

/* ------------------------------------------------------------------------- *
 * Lot 7 — liste des scènes avec ses actions CRUD, et aperçu de l'overlay
 * ------------------------------------------------------------------------- */

/** Scène nommée, avec un id distinct (la liste en manipule plusieurs). */
function named(
  id: string,
  name: string,
  type: CasterSceneType = 'match'
): CasterScene {
  return { ...scene(type, {}), id, name };
}

/** Mutateurs neutres : le SSR ne déclenche aucune interaction. */
const crud = {
  createScene: async () => 'new-id',
  renameScene: async () => {},
  duplicateScene: async () => 'copy-id',
  deleteScene: async () => {},
  reorderScenes: async () => {},
};

function renderSceneList(scenes: CasterScene[], selectedId: string | null) {
  return renderToString(
    createElement(
      ToastProvider,
      null,
      createElement(SceneList, {
        scenes,
        selectedId,
        onSelect: () => {},
        othersByScene: {},
        typeLabel: (type: string) => type.toUpperCase(),
        crud,
      })
    )
  );
}

describe('SceneList (liste + actions CRUD, rendu SSR)', () => {
  const three = [
    named('s-1', 'Starting Soon', 'starting'),
    named('s-2', 'Match en cours', 'match'),
    named('s-3', 'Pause', 'pause'),
  ];

  it('rend la liste, le bouton de création et les 5 actions par scène', () => {
    const html = renderSceneList(three, 's-2');
    expect(html).toContain('caster-scene-list');
    expect(html).toContain('caster-scene-new');
    // Le menu de types n'est ouvert que sur clic.
    expect(html).not.toContain('caster-scene-new-menu');
    for (const testid of [
      'caster-scene-move-up',
      'caster-scene-move-down',
      'caster-scene-rename',
      'caster-scene-duplicate',
      'caster-scene-delete',
    ]) {
      expect(html).toContain(testid);
    }
    // Une ligne d'actions par scène.
    expect(html.split('caster-scene-actions').length - 1).toBe(three.length);
    expect(html).toContain('Match en cours');
    expect(html).not.toMatch(/>undefined</);
  });

  it('les flèches de bout de liste sont désactivées, pas absentes', () => {
    const html = renderSceneList(three, 's-1');
    // 1 « monter » désactivée (première) + 1 « descendre » désactivée (dernière).
    const disabledCount = html.split('disabled=""').length - 1;
    expect(disabledCount).toBe(2);
  });

  it('scène unique : suppression désactivée avec son explication', () => {
    const html = renderSceneList([named('s-1', 'Seule scène')], 's-1');
    expect(html).toContain('caster-scene-delete');
    expect(html).toContain('La dernière scène ne peut pas être supprimée.');
  });

  it('liste vide : le bouton de création reste offert (pas de cul-de-sac)', () => {
    const html = renderSceneList([], null);
    expect(html).toContain('caster-scene-new');
    expect(html).not.toContain('caster-scene-item');
  });

  it('présence : pastille « autre caster » sur la scène concernée', () => {
    const html = renderToString(
      createElement(
        ToastProvider,
        null,
        createElement(SceneList, {
          scenes: three,
          selectedId: 's-1',
          onSelect: () => {},
          othersByScene: {
            's-2': [
              {
                staffId: 'other',
                displayName: 'Alice',
                role: 'caster',
                activeScene: 's-2',
                activeField: null,
                joinedAt: '2026-01-01T00:00:00Z',
              },
            ],
          },
          typeLabel: (type: string) => type,
          crud,
        })
      )
    );
    expect(html).toContain('caster-scene-presence-dot');
    expect(html).toContain('Alice');
  });
});

describe('OverlayPreview (aperçu iframe, rendu SSR)', () => {
  function renderPreview(s: CasterScene) {
    return renderToString(createElement(OverlayPreview, { scene: s }));
  }

  it('cible l’overlay par UUID (et pas par type) et offre ses deux commandes', () => {
    const html = renderPreview(
      named('11111111-2222-3333-4444-555555555555', 'M')
    );
    expect(html).toContain('caster-overlay-preview');
    expect(html).toContain('caster-overlay-preview-refresh');
    expect(html).toContain(
      'href="/overlay/caster/11111111-2222-3333-4444-555555555555"'
    );
    // L'iframe n'est montée qu'après mesure de la largeur (échelle 1920→panneau),
    // donc jamais en SSR : aucun chargement d'overlay côté serveur.
    expect(html).not.toContain('<iframe');
    expect(html).not.toMatch(/>undefined</);
  });

  it('scène webcam : garde explicite, aucune iframe (la caméra reste éteinte)', () => {
    const html = renderPreview(named('cam-1', 'Webcam', 'webcam'));
    expect(html).toContain('caster-overlay-preview-webcam-guard');
    expect(html).toContain('caster-overlay-preview-webcam-allow');
    expect(html).not.toContain('<iframe');
  });
});
