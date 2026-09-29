// features/player/team/repository/pageEditor.ts — lectures de l'éditeur de
// page publique `team/[slug]/edit` (lot P10) : l'équipe (par slug, id, nom
// ou sigle — rétro-compatibilité des liens) et ses membres éditables.
// Toujours scopé tenant, colonnes explicites.

import type { AdminDb } from '@/utils/admin/serviceContext';

export const EDITABLE_TEAM_COLUMNS =
  'id, slug, name, short_name, logo_url, tcg_image_path, banner_url, description, public_content, accent_color, secondary_color, banner_overlay, banner_focal, twitter, discord, website, youtube, twitch, instagram, tiktok, achievements, sponsors, embed_provider, embed_id, pinned_announcement, pinned_announcement_until, captain_id';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Équipe désignée par l'URL : slug d'abord, puis id, nom, sigle. */
export async function findEditableTeam(
  db: AdminDb,
  tenantId: string,
  slug: string
): Promise<Record<string, unknown> | null> {
  const base = () =>
    db.from('teams').select(EDITABLE_TEAM_COLUMNS).eq('tenant_id', tenantId);

  const bySlug = await base().eq('slug', slug).maybeSingle();
  if (bySlug.data) return bySlug.data as Record<string, unknown>;
  if (UUID_RE.test(slug)) {
    const byId = await base().eq('id', slug).maybeSingle();
    if (byId.data) return byId.data as Record<string, unknown>;
  }
  const byName = await base().ilike('name', slug).maybeSingle();
  if (byName.data) return byName.data as Record<string, unknown>;
  const byShort = await base().ilike('short_name', slug).maybeSingle();
  return (byShort.data as Record<string, unknown> | null) ?? null;
}

export type EditableMemberRow = {
  id: string;
  user_id: string;
  battle_tag: string | null;
  role: string;
  is_substitute: boolean;
  display_name: string | null;
  specialty: string | null;
  avatar_url: string | null;
  pronouns: string | null;
  tagline: string | null;
  twitter: string | null;
  twitch: string | null;
  created_at: string;
};

export async function listEditableMembers(
  db: AdminDb,
  tenantId: string,
  teamId: string
): Promise<EditableMemberRow[]> {
  const { data } = await db
    .from('team_members')
    .select(
      'id, user_id, role, battle_tag, is_substitute, display_name, specialty, avatar_url, pronouns, tagline, twitter, twitch, created_at'
    )
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .order('created_at', { ascending: true });
  return (data ?? []) as EditableMemberRow[];
}
