// utils/botPlayerTeamSnapshot.ts
//
// Instantané court « liens Discord + effectifs » d'un tenant, servi à
// GET /api/bot/v1/players/by-discord/[discordUserId]/team PENDANT UNE RAFALE.
//
// POURQUOI. Le scan blacklist du bot (owwc-discord-bot/blacklist.js, toutes les
// 30 min) appelle cette route pour CHAQUE membre de chaque serveur, l'un après
// l'autre, dès que la blacklist contient un BattleTag. Chaque appel coûtait
// jusqu'à 4 requêtes (user_discord_links, team_members ×2, teams) : ~14 000
// requêtes/jour, soit le quart de tout le trafic base mesuré — 5 548 GET
// user_discord_links, 5 275 GET team_members, 3 028 GET teams en 24 h.
//
// PRINCIPE. Un appel isolé (commande /equipe, profil…) garde le chemin direct,
// donc des données exactes à la milliseconde. Ce n'est qu'à partir du
// BURST_THRESHOLD-ième appel du même tenant en BURST_WINDOW_MS que la route
// bascule sur l'instantané : 3 lectures (plus pagination) pour TOUT le serveur,
// gardées SNAPSHOT_TTL_MS. Une rafale de 150 membres passe de ~450 requêtes à
// une poignée.
//
// FRAÎCHEUR. Pendant une rafale, une réponse peut refléter l'état d'il y a au
// plus 30 s. C'est le seul compromis ; il ne touche que des lectures (aucune
// décision d'autorisation n'est prise sur ces données).

import { supabaseAdmin } from './supabase';
import { logger } from './logger';

export const BURST_WINDOW_MS = 10_000;
export const BURST_THRESHOLD = 3;
export const SNAPSHOT_TTL_MS = 30_000;
/** Taille de page PostgREST (max-rows par défaut = 1000). */
const PAGE_SIZE = 1000;
/** Garde-fou : au-delà, on renonce à l'instantané (chemin direct). */
const MAX_PAGES = 20;

export type SnapshotLink = {
  auth_user_id: string;
  discord_user_id: string;
  discord_username: string | null;
};

export type SnapshotMember = {
  id: string;
  user_id: string | null;
  team_id: string;
  role: string | null;
  battle_tag: string | null;
  is_substitute: boolean | null;
  created_at: string;
};

export type SnapshotTeam = {
  id: string;
  name: string;
  slug: string | null;
  short_name: string | null;
  logo_url: string | null;
  banner_url: string | null;
  country: string | null;
  captain_id: string | null;
  is_joinable: boolean | null;
  discord: string | null;
  discord_role_id: string | null;
  description: string | null;
  website: string | null;
};

export const SNAPSHOT_TEAM_COLUMNS =
  'id, name, slug, short_name, logo_url, banner_url, country, captain_id, is_joinable, discord, discord_role_id, description, website';

export type PlayerTeamSnapshot = {
  linksByDiscordId: Map<string, SnapshotLink>;
  /** Appartenances d'un compte, de la plus ancienne à la plus récente. */
  membershipsByUser: Map<string, SnapshotMember[]>;
  /** Effectif d'une équipe, titulaires d'abord puis par ancienneté. */
  membersByTeam: Map<string, SnapshotMember[]>;
  teamsById: Map<string, SnapshotTeam>;
};

const callsByTenant = new Map<string, number[]>();
const snapshots = new Map<
  string,
  { snapshot: PlayerTeamSnapshot; expiresAt: number }
>();
const inFlight = new Map<string, Promise<PlayerTeamSnapshot | null>>();

/**
 * Enregistre un appel et dit si le tenant est en rafale (≥ BURST_THRESHOLD
 * appels dans les BURST_WINDOW_MS dernières millisecondes, celui-ci compris).
 */
export function registerPlayerTeamCall(
  tenantId: string,
  nowMs: number = Date.now()
): boolean {
  const recent = (callsByTenant.get(tenantId) ?? []).filter(
    (t) => nowMs - t < BURST_WINDOW_MS
  );
  recent.push(nowMs);
  // Borne mémoire : seul le décompte jusqu'au seuil importe.
  if (recent.length > BURST_THRESHOLD)
    recent.splice(0, recent.length - BURST_THRESHOLD);
  callsByTenant.set(tenantId, recent);
  return recent.length >= BURST_THRESHOLD;
}

/** Tri PostgreSQL `is_substitute ASC` (NULLS LAST) puis `created_at ASC`. */
function compareRoster(a: SnapshotMember, b: SnapshotMember): number {
  const rank = (v: boolean | null) => (v === null ? 2 : v ? 1 : 0);
  const d = rank(a.is_substitute) - rank(b.is_substitute);
  if (d !== 0) return d;
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

function compareCreated(a: SnapshotMember, b: SnapshotMember): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

/**
 * Lit toutes les pages d'une requête. `null` sur erreur ou si la table dépasse
 * le garde-fou — l'appelant retombe alors sur le chemin direct.
 */
async function readAll<T>(
  label: string,
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[] | null> {
  const out: T[] = [];
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const from = i * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) {
      logger.error(`[botPlayerTeamSnapshot] ${label} read error`, error);
      return null;
    }
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
  logger.warn(`[botPlayerTeamSnapshot] ${label} too large, snapshot skipped`);
  return null;
}

async function buildSnapshot(
  tenantId: string
): Promise<PlayerTeamSnapshot | null> {
  if (!supabaseAdmin) return null;
  const admin = supabaseAdmin;

  const [links, members, teams] = await Promise.all([
    // Table globale (pas de tenant_id) : la même que le chemin direct.
    readAll<SnapshotLink>('links', (from, to) =>
      admin
        .from('user_discord_links')
        .select('auth_user_id, discord_user_id, discord_username')
        .order('auth_user_id', { ascending: true })
        .range(from, to)
    ),
    readAll<SnapshotMember>('members', (from, to) =>
      admin
        .from('team_members')
        .select(
          'id, user_id, team_id, role, battle_tag, is_substitute, created_at'
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    readAll<SnapshotTeam>('teams', (from, to) =>
      admin
        .from('teams')
        .select(SNAPSHOT_TEAM_COLUMNS)
        .eq('tenant_id', tenantId)
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);
  if (!links || !members || !teams) return null;

  const linksByDiscordId = new Map<string, SnapshotLink>();
  for (const l of links) {
    if (l.discord_user_id) linksByDiscordId.set(String(l.discord_user_id), l);
  }

  const membershipsByUser = new Map<string, SnapshotMember[]>();
  const membersByTeam = new Map<string, SnapshotMember[]>();
  for (const m of members) {
    if (m.user_id) {
      const list = membershipsByUser.get(m.user_id) ?? [];
      list.push(m);
      membershipsByUser.set(m.user_id, list);
    }
    const roster = membersByTeam.get(m.team_id) ?? [];
    roster.push(m);
    membersByTeam.set(m.team_id, roster);
  }
  for (const list of membershipsByUser.values()) list.sort(compareCreated);
  for (const list of membersByTeam.values()) list.sort(compareRoster);

  const teamsById = new Map<string, SnapshotTeam>();
  for (const t of teams) teamsById.set(t.id, t);

  return { linksByDiscordId, membershipsByUser, membersByTeam, teamsById };
}

/**
 * L'instantané du tenant (frais de moins de SNAPSHOT_TTL_MS), ou `null` si la
 * lecture a échoué — l'appelant prend alors le chemin direct.
 */
export async function getPlayerTeamSnapshot(
  tenantId: string
): Promise<PlayerTeamSnapshot | null> {
  const hit = snapshots.get(tenantId);
  if (hit && hit.expiresAt > Date.now()) return hit.snapshot;

  const pending = inFlight.get(tenantId);
  if (pending) return pending;

  const p = buildSnapshot(tenantId)
    .then((snapshot) => {
      if (snapshot) {
        snapshots.set(tenantId, {
          snapshot,
          expiresAt: Date.now() + SNAPSHOT_TTL_MS,
        });
      }
      return snapshot;
    })
    .catch((e) => {
      logger.error('[botPlayerTeamSnapshot] build error', e);
      return null;
    })
    .finally(() => {
      if (inFlight.get(tenantId) === p) inFlight.delete(tenantId);
    });
  inFlight.set(tenantId, p);
  return p;
}

/** Purge l'état (rafales + instantanés). Usage strictement test. */
export function __resetPlayerTeamSnapshotForTests(): void {
  callsByTenant.clear();
  snapshots.clear();
  inFlight.clear();
}
