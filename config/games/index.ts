// config/games/index.ts
// Game registry — single source of truth for supported titles.
// Each game declares its capabilities (map veto, formats, draft phase).

import type { VetoFlowStep } from '@/types/veto';
import type { DraftFlow } from '@/types/draft';
import type { RegistrationField } from '@/utils/registrationFields';
import { OVERWATCH } from './overwatch';
import { VALORANT } from './valorant';
import { CS2 } from './cs2';
import { ROCKET_LEAGUE } from './rocket-league';
import { R6_SIEGE } from './r6-siege';
import { MARVEL_RIVALS } from './marvel-rivals';
import { LOL } from './lol';
import { DOTA2 } from './dota2';

export type GameSlug =
  | 'overwatch'
  | 'valorant'
  | 'cs2'
  | 'rocket-league'
  | 'r6-siege'
  | 'marvel-rivals'
  | 'lol'
  | 'dota2';

export type MatchFormat = 'bo1' | 'bo3' | 'bo5' | 'bo7';

export type GameMap = {
  name: string;
  type: string;
  image: string;
};

export type GameDef = {
  slug: GameSlug;
  label: string;
  /** Whether matches in this game use a map veto/ban-pick phase. */
  hasMapVeto: boolean;
  /** Map pool used by the veto UI. Empty when hasMapVeto = false. */
  mapPool: GameMap[];
  /**
   * Optional veto sequences keyed by match format.
   * When undefined, falls back to VETO_FLOWS defaults from types/veto.ts.
   */
  vetoFlows?: Partial<Record<MatchFormat, VetoFlowStep[]>>;
  /** Supported match formats for tournament creation. */
  matchFormats: MatchFormat[];
  /**
   * Whether matches in this game use a champion/hero draft phase (LoL, Dota 2).
   * Orthogonal to hasMapVeto — a game can theoretically have both.
   */
  hasDraft?: boolean;
  /** Draft flows keyed by match format. Required when hasDraft = true. */
  draftFlows?: Partial<Record<MatchFormat, DraftFlow>>;
  /**
   * Curated TEAM-LEVEL custom registration fields recommended for this game.
   * Surfaced in the admin field-builder via a one-click "add recommended
   * fields" button. One value per team (not per player). Every entry satisfies
   * `RegistrationField` so it validates cleanly if saved as-is.
   */
  registrationPresets?: RegistrationField[];
};

const GAMES: Record<GameSlug, GameDef> = {
  overwatch: OVERWATCH,
  valorant: VALORANT,
  cs2: CS2,
  'rocket-league': ROCKET_LEAGUE,
  'r6-siege': R6_SIEGE,
  'marvel-rivals': MARVEL_RIVALS,
  lol: LOL,
  dota2: DOTA2,
};

export const GAME_SLUGS: readonly GameSlug[] = Object.keys(GAMES) as GameSlug[];

export function getGame(slug: string): GameDef | null {
  return (GAMES as Record<string, GameDef>)[slug] ?? null;
}

export function listGames(): GameDef[] {
  return GAME_SLUGS.map((s) => GAMES[s]);
}

export function isGameSlug(value: unknown): value is GameSlug {
  return typeof value === 'string' && value in GAMES;
}
