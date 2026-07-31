// utils/teams/memberDisplayName.ts
//
// Repli de pseudo pour les lignes `team_members`.
//
// `team_members.display_name` est une SURCHARGE par équipe, presque toujours
// nulle : en pratique le pseudo vit sur le compte
// (`auth.users.raw_user_meta_data->>'display_name'`). Les joueuses s'en
// sortaient parce qu'on les identifie par leur BattleTag ; l'encadrement
// (coach / manager), qui n'a pas d'obligation de BattleTag, s'affichait donc
// vide, « Inconnu » ou en préfixe d'UUID selon l'écran.
//
// Serveur uniquement : passe par supabaseAdmin (RPC batch, UN aller-retour).
// Best-effort — en cas d'échec le champ reste nul, jamais d'exception.

import { fetchAdminUserProfiles } from '@/utils/adminUserProfiles';

type MemberLike = {
  user_id?: string | null;
  display_name?: string | null;
};

/**
 * Résout le pseudo de compte des membres dont `display_name` est vide.
 *
 * Renvoie une Map `user_id -> pseudo` ne contenant QUE les ids qui en avaient
 * besoin (aucun appel si tout le monde a déjà un display_name en roster).
 */
export async function resolveMissingDisplayNames(
  members: readonly MemberLike[]
): Promise<Map<string, string | null>> {
  const missing = members
    .filter((m) => !m.display_name && m.user_id)
    .map((m) => m.user_id as string);

  if (missing.length === 0) return new Map();

  const profiles = await fetchAdminUserProfiles(missing);
  const out = new Map<string, string | null>();
  for (const [id, profile] of profiles) {
    out.set(id, profile.display_name ?? null);
  }
  return out;
}

/**
 * Applique le repli à une ligne : `display_name` du roster, sinon celui du
 * compte, sinon `null`.
 */
export function withFallbackDisplayName(
  member: MemberLike,
  resolved: Map<string, string | null>
): string | null {
  if (member.display_name) return member.display_name;
  if (!member.user_id) return null;
  return resolved.get(member.user_id) ?? null;
}
