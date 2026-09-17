// utils/teams/externalScrimTeam.ts
//
// Équipe EXTÉRIEURE d'un scrim : l'adversaire n'est pas inscrit sur le site,
// le staff tape son nom dans le formulaire du scrim et la ligne `teams` est
// créée à la volée.
//
// Forme de l'équipe créée — calquée sur les adversaires déjà saisis à la main
// (ex. « Noname ») : pas de capitaine, pas d'effectif, `is_active = false`
// (absente de l'annuaire public et des listes d'équipes), ni recrutable ni
// ouverte aux scrims. Logo par défaut via `withDefaultTeamLogo`.
//
// Un nom qui correspond déjà (casse ignorée) à une équipe du tenant est
// RÉUTILISÉ plutôt que dupliqué : taper « Sparkles » pointe sur la vraie
// équipe, et le même adversaire extérieur saisi deux fois reste une seule
// ligne.

import slugify from 'slugify';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { logStaffAction } from '@/utils/staffLogs';
import { withDefaultTeamLogo } from '@/utils/teams/defaultTeamLogo';
import { logger } from '@/utils/logger';

export const EXTERNAL_TEAM_NAME_MAX = 80;

export const EXTERNAL_TEAM_DESCRIPTION =
  'Équipe adverse de scrim. Effectif non inscrit sur le site : aucune joueuse rattachée.';

/** Nom d'équipe extérieure : chaîne non vide après trim, bornée. */
export const externalTeamNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(EXTERNAL_TEAM_NAME_MAX);

/**
 * Champs optionnels `team1_name` / `team2_name` d'un corps de scrim admin.
 * Absents ou `null`/chaîne vide = pas d'équipe extérieure demandée.
 */
export const externalTeamNamesSchema = z.object({
  team1_name: z
    .union([externalTeamNameSchema, z.literal(''), z.null()])
    .optional(),
  team2_name: z
    .union([externalTeamNameSchema, z.literal(''), z.null()])
    .optional(),
});

export type ExternalTeamNames = {
  team1Name: string | null;
  team2Name: string | null;
};

export type ParseExternalTeamNamesResult =
  | { ok: true; names: ExternalTeamNames }
  | { ok: false; error: string };

/**
 * Valide et extrait les noms d'équipes extérieures d'un corps de requête.
 * Refuse un nom accompagné d'un id sur le même côté (ambigu) et deux noms
 * identiques (le scrim opposerait l'équipe à elle-même).
 */
export function parseExternalTeamNames(
  body: Record<string, unknown>
): ParseExternalTeamNamesResult {
  const parsed = externalTeamNamesSchema.safeParse({
    team1_name: body.team1_name,
    team2_name: body.team2_name,
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0] ?? 'team_name';
    return {
      ok: false,
      error: `${String(field)} invalide (1 à ${EXTERNAL_TEAM_NAME_MAX} caractères).`,
    };
  }
  const team1Name = parsed.data.team1_name || null;
  const team2Name = parsed.data.team2_name || null;

  if (team1Name && body.team1_id) {
    return { ok: false, error: 'team1_id et team1_name sont exclusifs.' };
  }
  if (team2Name && body.team2_id) {
    return { ok: false, error: 'team2_id et team2_name sont exclusifs.' };
  }
  if (
    team1Name &&
    team2Name &&
    team1Name.toLocaleLowerCase('fr') === team2Name.toLocaleLowerCase('fr')
  ) {
    return {
      ok: false,
      error: 'Les deux équipes doivent être distinctes.',
    };
  }
  return { ok: true, names: { team1Name, team2Name } };
}

export type ResolveExternalTeamResult =
  | { ok: true; teamId: string; created: boolean; logoUrl: string | null }
  | { ok: false; error: string };

/** Échappe les jokers LIKE pour une comparaison littérale. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Retrouve (casse ignorée) ou crée l'équipe extérieure `name` dans le tenant.
 * `logoUrl` fourni est conservé ; absent, le logo par défaut est posé.
 */
export async function findOrCreateExternalScrimTeam(opts: {
  tenantId: string;
  name: string;
  logoUrl?: string | null;
}): Promise<ResolveExternalTeamResult> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Supabase admin not configured' };
  }
  const name = opts.name.trim();
  const wanted = name.toLocaleLowerCase('fr');

  const { data: candidates, error: lookupErr } = await supabaseAdmin
    .from('teams')
    .select('id, name, logo_url')
    .eq('tenant_id', opts.tenantId)
    .is('deleted_at', null)
    .ilike('name', escapeLike(name))
    .limit(20);
  if (lookupErr) {
    logger.error('[externalScrimTeam] lookup error:', lookupErr);
    return { ok: false, error: "Impossible de vérifier l'équipe." };
  }
  const existing = (candidates ?? []).find(
    (t) =>
      typeof t.name === 'string' && t.name.toLocaleLowerCase('fr') === wanted
  );
  if (existing?.id) {
    return {
      ok: true,
      teamId: existing.id as string,
      created: false,
      logoUrl: (existing.logo_url as string | null) ?? null,
    };
  }

  const logoUrl = await withDefaultTeamLogo(opts.logoUrl, opts.tenantId);
  const baseSlug =
    slugify(name, { lower: true, strict: true }) ||
    `team-${Date.now().toString(36)}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const suffix =
      attempt === 0 ? '' : `-${Math.random().toString(36).slice(2, 6)}`;
    const { data: created, error: insertErr } = await supabaseAdmin
      .from('teams')
      .insert({
        tenant_id: opts.tenantId,
        name,
        slug: `${baseSlug}${suffix}`,
        logo_url: logoUrl,
        description: EXTERNAL_TEAM_DESCRIPTION,
        is_active: false,
        is_joinable: false,
        open_for_scrim: false,
      })
      .select('id')
      .maybeSingle();
    if (!insertErr && created?.id) {
      return { ok: true, teamId: created.id as string, created: true, logoUrl };
    }
    const msg = insertErr?.message?.toLowerCase() ?? '';
    if (!msg.includes('duplicate') && !msg.includes('unique')) {
      logger.error('[externalScrimTeam] insert error:', insertErr);
      break;
    }
  }
  return { ok: false, error: "Impossible de créer l'équipe extérieure." };
}

export type ResolveScrimExternalTeamsResult =
  | {
      ok: true;
      team1Id: string | null | undefined;
      team2Id: string | null | undefined;
    }
  | { ok: false; status: number; error: string };

/**
 * Résout les deux côtés d'un scrim : un id fourni est gardé tel quel, un nom
 * d'équipe extérieure est retrouvé ou créé (et la création tracée dans
 * `staff_logs`). À appeler APRÈS les autres validations de la route, pour ne
 * pas créer d'équipe derrière une requête finalement refusée.
 *
 * `team1Id` / `team2Id` : valeur fournie par la requête (`undefined` = côté non
 * touché, utile au PATCH). Les ids renvoyés suivent la même convention.
 */
export async function resolveScrimExternalTeams(opts: {
  tenantId: string;
  names: ExternalTeamNames;
  team1Id: string | null | undefined;
  team2Id: string | null | undefined;
  staffId: string | null;
}): Promise<ResolveScrimExternalTeamsResult> {
  const sides = [
    { name: opts.names.team1Name, id: opts.team1Id },
    { name: opts.names.team2Name, id: opts.team2Id },
  ];
  const ids: Array<string | null | undefined> = [];

  for (const side of sides) {
    if (!side.name) {
      ids.push(side.id);
      continue;
    }
    const resolved = await findOrCreateExternalScrimTeam({
      tenantId: opts.tenantId,
      name: side.name,
    });
    if (!resolved.ok) {
      return { ok: false, status: 500, error: resolved.error };
    }
    ids.push(resolved.teamId);
    if (resolved.created && opts.staffId) {
      try {
        await logStaffAction({
          staff_id: opts.staffId,
          action: 'other',
          entity_type: 'team',
          entity_id: resolved.teamId,
          tournament_id: null,
          payload: {
            subject: 'create_external_scrim_team',
            name: side.name,
            logo_url: resolved.logoUrl,
          },
        });
      } catch (e) {
        logger.error('[externalScrimTeam] log error:', e);
      }
    }
  }

  const [team1Id, team2Id] = ids;
  if (team1Id && team2Id && team1Id === team2Id) {
    return {
      ok: false,
      status: 400,
      error: 'team1_id et team2_id doivent etre distincts',
    };
  }
  return { ok: true, team1Id, team2Id };
}
