// Smoke de rendu des 8 éditeurs de scènes caster (/admin/caster, lot 2).
//
// Pas de jsdom/testing-library dans ce repo (politique zéro dépendance) : on
// rend chaque éditeur côté serveur via react-dom/server. Ça attrape les crashs
// de rendu, les clés i18n manquantes passées à format() et les régressions de
// normalisation des `data` jsonb (shapes réelles de la table caster_scenes,
// y compris les legacy : ban en chaîne nue, candidates { name }…). Les effets
// (auto-save, fetch scrims) ne tournent pas en renderToString — voulu : aucun
// réseau, aucune écriture.

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
});
