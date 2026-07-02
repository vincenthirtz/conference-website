// utils/public/readTeam.ts
//
// Équipe publique (accepte id OU slug) + roster public. On PROJETTE uniquement
// les champs publics du roster (display_name, role, is_substitute) — JAMAIS
// d'email ni d'identifiant Discord privé.

import { supabaseAdmin } from '@/utils/supabase';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

export type PublicTeamMember = {
  display_name: string | null;
  role: string | null;
  is_substitute: boolean;
};

export type PublicTeam = {
  id: string;
  name: string;
  short_name: string | null;
  slug: string | null;
  logo_url: string | null;
  roster: PublicTeamMember[];
};

type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  slug: string | null;
  logo_url: string | null;
};

/**
 * Résout une équipe par id (UUID) ou slug, scopée au tenant. `null` si inconnue.
 */
export async function readPublicTeam(
  idOrSlug: string,
  tenantId: string
): Promise<PublicTeam | null> {
  let teamRow: TeamRow | null = null;

  if (isValidUUID(idOrSlug)) {
    const { data, error } = await supabaseAdmin
      .from('teams')
      .select('id, name, short_name, slug, logo_url')
      .eq('tenant_id', tenantId)
      .eq('id', idOrSlug)
      .maybeSingle();
    if (error) {
      logger.error('[readPublicTeam] team-by-id error', error);
      throw new Error('Failed to load team');
    }
    teamRow = (data as TeamRow | null) ?? null;
  }

  if (!teamRow) {
    const { data, error } = await supabaseAdmin
      .from('teams')
      .select('id, name, short_name, slug, logo_url')
      .eq('tenant_id', tenantId)
      .eq('slug', idOrSlug)
      .maybeSingle();
    if (error) {
      logger.error('[readPublicTeam] team-by-slug error', error);
      throw new Error('Failed to load team');
    }
    teamRow = (data as TeamRow | null) ?? null;
  }

  if (!teamRow) return null;

  const { data: memberRows, error: memberErr } = await supabaseAdmin
    .from('team_members')
    .select('display_name, role, is_substitute')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamRow.id);

  if (memberErr) {
    logger.error('[readPublicTeam] members error', memberErr);
    throw new Error('Failed to load roster');
  }

  const roster: PublicTeamMember[] = (
    (memberRows ?? []) as Array<{
      display_name: string | null;
      role: string | null;
      is_substitute: boolean | null;
    }>
  ).map((m) => ({
    display_name: m.display_name ?? null,
    role: m.role ?? null,
    is_substitute: m.is_substitute === true,
  }));

  return {
    id: teamRow.id,
    name: teamRow.name,
    short_name: teamRow.short_name ?? null,
    slug: teamRow.slug ?? null,
    logo_url: teamRow.logo_url ?? null,
    roster,
  };
}
