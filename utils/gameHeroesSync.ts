// utils/gameHeroesSync.ts
// Fetch & upsert the global hero/champion pool used by the MOBA draft engine.
//
// Sources :
//   - LoL  : Riot Data Dragon (https://ddragon.leagueoflegends.com)
//   - Dota : OpenDota         (https://api.opendota.com)
//
// Both are public, key-less, low rate-limit endpoints. We call them at most
// once per day via a Netlify scheduled function (see
// pages/api/cron/sync-game-heroes.ts + netlify/functions/sync-game-heroes-cron.ts).

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from './logger';

const DDRAGON_VERSIONS_URL =
  'https://ddragon.leagueoflegends.com/api/versions.json';
const DDRAGON_CHAMPION_URL = (version: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${encodeURIComponent(version)}/data/en_US/champion.json`;
const DDRAGON_SPLASH_URL = (id: string) =>
  `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${encodeURIComponent(id)}_0.jpg`;
const DDRAGON_ICON_URL = (version: string, id: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${encodeURIComponent(version)}/img/champion/${encodeURIComponent(id)}.png`;

const OPENDOTA_HEROES_URL = 'https://api.opendota.com/api/heroes';
const STEAM_DOTA_HERO_BASE =
  'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes';

const FETCH_TIMEOUT_MS = 15_000;

export type GameHeroUpsertRow = {
  game: 'lol' | 'dota2';
  external_id: string;
  key: string;
  name: string;
  title: string | null;
  roles: string[];
  attribute: string | null;
  image_url: string;
  icon_url: string | null;
  data: Record<string, unknown>;
  enabled: boolean;
  fetched_at: string;
  updated_at: string;
};

export type SyncGameSummary = {
  game: 'lol' | 'dota2';
  ok: boolean;
  fetched: number;
  upserted: number;
  error?: string;
};

export type SyncAllSummary = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  games: SyncGameSummary[];
};

// ---------------------------------------------------------------------------
// Raw shapes returned by the upstream APIs (kept narrow — only the fields we map).

type DdragonChampion = {
  key: string; // numeric Riot id as string ("266")
  id: string; // slug ("Aatrox")
  name: string;
  title: string;
  tags?: string[];
  image?: { full?: string };
};

type DdragonChampionsPayload = {
  data: Record<string, DdragonChampion>;
};

type OpenDotaHero = {
  id: number;
  name: string; // "npc_dota_hero_antimage"
  localized_name: string;
  primary_attr: string; // "str" | "agi" | "int" | "all"
  attack_type?: string;
  roles?: string[];
  legs?: number;
};

// ---------------------------------------------------------------------------
// Pure mapping helpers — exported for unit tests.

export function mapLolChampionToRow(
  champion: DdragonChampion,
  version: string,
  now: string
): GameHeroUpsertRow {
  return {
    game: 'lol',
    external_id: String(champion.key),
    key: champion.id,
    name: champion.name,
    title: champion.title ?? null,
    roles: Array.isArray(champion.tags) ? [...champion.tags] : [],
    attribute: null,
    image_url: DDRAGON_SPLASH_URL(champion.id),
    icon_url: DDRAGON_ICON_URL(version, champion.id),
    data: { version, image: champion.image?.full ?? null },
    enabled: true,
    fetched_at: now,
    updated_at: now,
  };
}

export function dotaShortName(npcName: string): string {
  return npcName.replace(/^npc_dota_hero_/, '');
}

export function dotaPrimaryAttrToAttribute(attr: string): string | null {
  switch (attr) {
    case 'str':
      return 'strength';
    case 'agi':
      return 'agility';
    case 'int':
      return 'intelligence';
    case 'all':
      return 'universal';
    default:
      return null;
  }
}

export function mapDotaHeroToRow(hero: OpenDotaHero, now: string): GameHeroUpsertRow {
  const shortName = dotaShortName(hero.name);
  return {
    game: 'dota2',
    external_id: String(hero.id),
    key: shortName,
    name: hero.localized_name,
    title: null,
    roles: Array.isArray(hero.roles) ? [...hero.roles] : [],
    attribute: dotaPrimaryAttrToAttribute(hero.primary_attr),
    image_url: `${STEAM_DOTA_HERO_BASE}/${shortName}.png`,
    icon_url: `${STEAM_DOTA_HERO_BASE}/icons/${shortName}.png`,
    data: {
      npc_name: hero.name,
      attack_type: hero.attack_type ?? null,
      legs: hero.legs ?? null,
    },
    enabled: true,
    fetched_at: now,
    updated_at: now,
  };
}

// ---------------------------------------------------------------------------
// Fetch + upsert per game.

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`${label}: HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function upsertRows(rows: GameHeroUpsertRow[]): Promise<number> {
  if (!supabaseAdmin) {
    throw new Error('supabaseAdmin not configured');
  }
  if (rows.length === 0) return 0;
  const { error, count } = await supabaseAdmin
    .from('game_heroes')
    .upsert(rows, { onConflict: 'game,external_id', count: 'exact' });
  if (error) {
    throw new Error(`upsert game_heroes failed: ${error.message}`);
  }
  return typeof count === 'number' ? count : rows.length;
}

export async function syncLolHeroes(nowIso?: string): Promise<SyncGameSummary> {
  const now = nowIso ?? new Date().toISOString();
  try {
    const versions = await fetchJson<string[]>(
      DDRAGON_VERSIONS_URL,
      'ddragon versions'
    );
    if (!Array.isArray(versions) || versions.length === 0) {
      throw new Error('ddragon versions: empty list');
    }
    const version = versions[0];
    const payload = await fetchJson<DdragonChampionsPayload>(
      DDRAGON_CHAMPION_URL(version),
      'ddragon champions'
    );
    const champions = Object.values(payload?.data ?? {});
    const rows = champions.map((c) => mapLolChampionToRow(c, version, now));
    const upserted = await upsertRows(rows);
    return { game: 'lol', ok: true, fetched: champions.length, upserted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[gameHeroesSync] LoL sync failed: %s', msg);
    return { game: 'lol', ok: false, fetched: 0, upserted: 0, error: msg };
  }
}

export async function syncDota2Heroes(nowIso?: string): Promise<SyncGameSummary> {
  const now = nowIso ?? new Date().toISOString();
  try {
    const heroes = await fetchJson<OpenDotaHero[]>(
      OPENDOTA_HEROES_URL,
      'opendota heroes'
    );
    if (!Array.isArray(heroes)) {
      throw new Error('opendota heroes: invalid payload');
    }
    const rows = heroes.map((h) => mapDotaHeroToRow(h, now));
    const upserted = await upsertRows(rows);
    return { game: 'dota2', ok: true, fetched: heroes.length, upserted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[gameHeroesSync] Dota2 sync failed: %s', msg);
    return { game: 'dota2', ok: false, fetched: 0, upserted: 0, error: msg };
  }
}

export async function syncAllGameHeroes(): Promise<SyncAllSummary> {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const games = await Promise.all([syncLolHeroes(startedAt), syncDota2Heroes(startedAt)]);
  const finishedAtMs = Date.now();
  return {
    startedAt,
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: finishedAtMs - startedAtMs,
    games,
  };
}
