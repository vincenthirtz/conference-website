// features/admin/social/repository.ts — posts multi-destinations
// (`social_posts` + `social_post_targets`), scopés par tenant.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminDb } from '@/utils/admin/serviceContext';

/** Client non typé : jointure filtrée (`post.tenant_id`) hors du type généré. */
function untyped(db: AdminDb): SupabaseClient {
  return db as unknown as SupabaseClient;
}

export async function listSocialPosts(
  db: AdminDb,
  tenantId: string,
  limit: number
) {
  const { data, error } = await untyped(db)
    .from('social_posts')
    .select(
      'id, base_text, base_image_url, status, published_at, created_at, ' +
        'targets:social_post_targets(platform, status, permalink, error, sent_at)'
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { rows: (data ?? []) as unknown[], error };
}

export async function listRecentHashtags(db: AdminDb, tenantId: string) {
  const { data, error } = await untyped(db)
    .from('social_post_targets')
    .select('hashtags, post:social_posts!inner(tenant_id)')
    .eq('post.tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(300);
  return {
    rows: (data ?? []) as Array<{ hashtags: string[] | null }>,
    error,
  };
}

export async function insertSocialPost(
  db: AdminDb,
  row: {
    tenant_id: string;
    base_text: string;
    base_image_url: string | null;
    status: string;
    created_by: string | null;
  }
) {
  const { data, error } = await untyped(db)
    .from('social_posts')
    .insert(row)
    .select('id')
    .single();
  return { id: (data as { id: string } | null)?.id ?? null, error };
}

export async function insertSocialPostTargets(
  db: AdminDb,
  rows: Array<Record<string, unknown>>
) {
  const { error } = await untyped(db).from('social_post_targets').insert(rows);
  return { error };
}

export async function markSocialPostPublished(
  db: AdminDb,
  postId: string,
  status: string
) {
  await untyped(db)
    .from('social_posts')
    .update({
      status,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId);
}
