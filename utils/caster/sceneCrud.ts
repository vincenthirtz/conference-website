// Logique PURE du CRUD de scènes du cockpit — réordonnancement (port de
// womenscup-caster/src/renderer/sceneOrder.js), nom d'une scène dupliquée et
// `data` par défaut d'un nouveau type (port de DEFAULT_SCENES / l'IPC
// `scenes:default-data` de src/main/scenes.js).
//
// Zéro DOM, zéro réseau : le hook `useCasterScenes` applique les résultats.

import type { CasterSceneType } from '@/types/caster';

/** Réseaux par défaut d'une nouvelle scène — mêmes valeurs que le desktop. */
const DEFAULT_SOCIALS = {
  site: 'owwomenscup.fr',
  discord: 'discord.gg/gERSsjC3Vd',
  twitch: 'twitch.tv/womens_cup',
  youtube: '@owwomenscup',
  instagram: '@womenscup_asso',
  tiktok: '@ow_womenscup',
};

const DEFAULT_HASHTAG = '#WomensCup';

/**
 * Échange la scène `id` avec sa voisine dans la direction `dir` (-1 haut,
 * +1 bas). Rend `null` hors bornes (l'appelant saute alors la persistance).
 */
export function moveInList<T extends { id: string }>(
  list: T[],
  id: string,
  dir: number
): T[] | null {
  const arr = list.slice();
  const i = arr.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return null;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return arr;
}

/**
 * Déplace `fromId` avant (`after=false`) ou après (`after=true`) `toId`.
 * L'index cible est calculé APRÈS retrait de `fromId`, ce qui gère le décalage
 * d'un glissement vers le bas. `null` si l'opération ne change rien.
 */
export function dropInList<T extends { id: string }>(
  list: T[],
  fromId: string,
  toId: string,
  after: boolean
): T[] | null {
  if (!fromId || fromId === toId) return null;
  const arr = list.slice();
  const fromIdx = arr.findIndex((s) => s.id === fromId);
  if (fromIdx < 0) return null;
  const [moved] = arr.splice(fromIdx, 1);
  let toIdx = arr.findIndex((s) => s.id === toId);
  if (toIdx < 0) return null;
  if (after) toIdx++;
  arr.splice(toIdx, 0, moved);
  return arr;
}

/**
 * Nom d'une copie, en évitant les collisions : « Match » → « Match (copie) »,
 * puis « Match (copie 2) »… Les noms ne sont pas contraints uniques en base,
 * mais deux entrées identiques dans la liste sont ingérables à l'antenne.
 */
export function duplicateName(name: string, existing: string[]): string {
  const base = `${name} (copie)`;
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${name} (copie ${n})`)) n++;
  return `${name} (copie ${n})`;
}

/** Nom par défaut proposé à la création d'une scène du type donné. */
export function defaultSceneName(type: CasterSceneType): string {
  return DEFAULT_SCENE_NAMES[type];
}

const DEFAULT_SCENE_NAMES: Record<CasterSceneType, string> = {
  starting: 'Starting Soon',
  match: 'Match en cours',
  pause: 'Pause',
  results: 'Résultats',
  end: 'Fin de stream',
  mvp: 'Vote MVP',
  scrim: 'Scrim',
  webcam: 'Webcam',
  bracket: 'Bracket',
  player: 'Joueuse',
  leaderboard: 'Classement',
  standings: 'Classement final',
};

/**
 * Nom de fichier overlay historique de l'app desktop. La colonne `overlay` ne
 * sert plus au web (les overlays sont des routes), mais l'app desktop s'en sert
 * pour charger son HTML local : une scène créée ici doit donc rester ouvrable
 * là-bas.
 */
export function defaultOverlayFile(type: CasterSceneType): string {
  return `${type}.html`;
}

/**
 * `data` initiale d'une scène — port des templates DEFAULT_SCENES du desktop,
 * étendu aux types qui n'y figuraient pas. Rend un objet NEUF à chaque appel
 * (jamais une référence partagée : l'éditeur le mute via son draft).
 */
export function defaultSceneData(
  type: CasterSceneType
): Record<string, unknown> {
  const socials = { ...DEFAULT_SOCIALS };
  switch (type) {
    case 'starting':
      return {
        title: 'Le stream commence bientôt',
        countdown: 300,
        nextMatch: { team1: '', team2: '', bestOf: 5 },
        socials,
        hashtag: DEFAULT_HASHTAG,
      };
    case 'match':
      return {
        team1: 'Équipe 1',
        team2: 'Équipe 2',
        score1: 0,
        score2: 0,
        map: 'Ilios',
        bestOf: 5,
        team1Logo: '',
        team2Logo: '',
        seriesDots: true,
        casters: [],
        overwatchHud: false,
        ban1: null,
        ban2: null,
        socials,
        hashtag: DEFAULT_HASHTAG,
        matchId: null,
      };
    case 'pause':
      return {
        title: 'Be Right Back',
        message: 'Nous revenons dans un instant',
        marquee: '',
        socials,
        hashtag: DEFAULT_HASHTAG,
      };
    case 'results':
      return {
        team1: '',
        team2: '',
        score1: 0,
        score2: 0,
        mvp: '',
        mapResults: [],
        team1Logo: '',
        team2Logo: '',
        socials,
        hashtag: DEFAULT_HASHTAG,
      };
    case 'end':
      return {
        title: 'Merci !',
        subtitle: 'À bientôt sur Women’s Cup',
        credits: [],
        sponsors: [],
        socials,
      };
    case 'mvp':
      return { title: 'Vote MVP', candidates: [], total: 0, isOpen: false };
    case 'scrim':
      return {
        mode: 'next',
        scrimId: null,
        title: 'SCRIM',
        socials,
        hashtag: DEFAULT_HASHTAG,
      };
    case 'webcam':
      return {
        mode: 'solo',
        cam1: { label: '', deviceId: '' },
        cam2: { label: '', deviceId: '' },
        shape: 'rounded',
        mirror: false,
      };
    case 'bracket':
      return {
        title: 'Bracket',
        tournamentId: null,
        tournamentName: '',
        theme: 'dark',
      };
    case 'player':
      return {
        title: 'Joueuse',
        userId: null,
        playerName: '',
        socials,
        hashtag: DEFAULT_HASHTAG,
      };
    case 'leaderboard':
      return {
        title: 'Classement',
        mode: 'leaderboard',
        leagueSlug: null,
        leagueName: '',
        topN: 8,
        socials,
        hashtag: DEFAULT_HASHTAG,
      };
    case 'standings':
      return {
        title: 'Classement final',
        tournamentId: null,
        tournamentName: '',
        socials,
        hashtag: DEFAULT_HASHTAG,
      };
  }
}
