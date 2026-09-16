// utils/tenants/networkSharing.ts
//
// LE RÉSEAU ENTRE ESPACES VOLONTAIRES : quels espaces un espace donné a-t-il le
// droit de lire, pour les scrims et pour le recrutement ?
//
// Lot 4 du rapport : un espace isolé est une île. Une équipe qui cherche un
// adversaire ne voyait que les équipes de son propre espace — c'est la
// contrepartie de la marque blanche, et elle coûte cher aux petits espaces.
//
// TROIS RÈGLES, ET ELLES TIENNENT TOUT LE FICHIER.
//
// 1. RIEN N'EST GLOBAL. Un espace ne rejoint le réseau que si son staff le
//    décide (`tenants.network_share_scrims` / `network_share_recruitment`),
//    interrupteur par interrupteur, et le défaut est fermé.
//
// 2. ON NE VOIT QUE SI L'ON DONNE. Un espace fermé ne lit que ses propres
//    annonces. Sans cette réciprocité, le réseau se remplirait de lecteurs :
//    ceux qui publient supporteraient les demandes de ceux qui se cachent, et
//    la première chose qu'un organisateur ferait serait de refermer.
//
// 3. ON LIT, ON N'ÉCRIT PAS AILLEURS. Ces identifiants ne servent QUE sur des
//    lectures. Publier reste un acte chez soi : une annonce appartient à
//    l'espace où elle a été déposée, et c'est ce qui permet de la retirer d'un
//    seul endroit.
//
// La décision (`selectNetworkTenantIds`) est pure et testable sans base ; la
// lecture est mise en cache une minute, parce que ces listes sont interrogées
// à chaque affichage d'annuaire et qu'un réglage de staff n'a pas besoin d'être
// propagé à la seconde.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/** Les deux réseaux, indépendants l'un de l'autre. */
export type NetworkKind = 'scrims' | 'recruitment';

export type TenantSharingRow = {
  id: string;
  network_share_scrims?: boolean | null;
  network_share_recruitment?: boolean | null;
};

/** Le drapeau qui gouverne chaque réseau. */
export function sharesNetwork(
  row: TenantSharingRow | null | undefined,
  kind: NetworkKind
): boolean {
  if (!row) return false;
  return kind === 'scrims'
    ? row.network_share_scrims === true
    : row.network_share_recruitment === true;
}

/**
 * Les espaces lisibles depuis `selfId`, pour un réseau donné.
 *
 * Toujours au moins `selfId` : un espace se voit lui-même, ouvert ou fermé.
 * Fermé, il ne voit que lui — c'est la réciprocité, et c'est le point.
 *
 * Pure : la liste des espaces est fournie par l'appelant.
 */
export function selectNetworkTenantIds(
  selfId: string,
  rows: TenantSharingRow[],
  kind: NetworkKind
): string[] {
  const self = rows.find((r) => r.id === selfId) ?? null;
  if (!sharesNetwork(self, kind)) return [selfId];

  const ids = new Set<string>([selfId]);
  for (const row of rows) {
    if (sharesNetwork(row, kind)) ids.add(row.id);
  }
  return Array.from(ids);
}

type CacheEntry = { ids: string[]; expiresAt: number };
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

/** Vide le cache — tests, et après un changement de réglage. */
export function resetNetworkSharingCache(): void {
  cache.clear();
}

/**
 * Les espaces lisibles depuis `selfId` (lecture en base, cache 60 s).
 *
 * NE JETTE JAMAIS : en cas d'erreur, rend `[selfId]`. Un réseau indisponible
 * doit refermer l'espace sur lui-même, jamais l'ouvrir — une panne ne doit pas
 * publier ce que personne n'a accepté de publier.
 */
export async function readNetworkTenantIds(
  selfId: string,
  kind: NetworkKind
): Promise<string[]> {
  if (!selfId) return [];
  const key = `${kind}:${selfId}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.ids;

  if (!supabaseAdmin) return [selfId];

  try {
    const column =
      kind === 'scrims' ? 'network_share_scrims' : 'network_share_recruitment';
    // On ne charge que les espaces ACTIFS qui ont ouvert ce réseau, plus
    // le sien : un espace suspendu ne doit pas continuer à peupler l'annuaire
    // des autres.
    const [selfRes, openRes] = await Promise.all([
      supabaseAdmin
        .from('tenants')
        .select(`id, ${column}`)
        .eq('id', selfId)
        .maybeSingle(),
      supabaseAdmin
        .from('tenants')
        .select(`id, ${column}`)
        .eq(column, true)
        .eq('is_active', true),
    ]);

    if (selfRes.error) {
      logger.error('[networkSharing] self read error', selfRes.error);
      return [selfId];
    }
    const rows = [
      (selfRes.data ?? null) as TenantSharingRow | null,
      ...(((openRes.error ? [] : openRes.data) ?? []) as TenantSharingRow[]),
    ].filter((r): r is TenantSharingRow => Boolean(r?.id));

    const ids = selectNetworkTenantIds(selfId, rows, kind);
    cache.set(key, { ids, expiresAt: now + CACHE_TTL_MS });
    return ids;
  } catch (err) {
    logger.error('[networkSharing] read error', err);
    return [selfId];
  }
}

/**
 * Noms d'espaces, pour dire D'OÙ vient une annonce venue d'ailleurs.
 *
 * Une annonce d'un autre espace sans étiquette, c'est une ligne inexplicable
 * au milieu d'une liste : on doit pouvoir lire « via Ardent League » et
 * comprendre pourquoi cette équipe apparaît ici.
 */
export async function readTenantLabels(
  ids: string[]
): Promise<Map<string, { name: string; slug: string | null }>> {
  const map = new Map<string, { name: string; slug: string | null }>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0 || !supabaseAdmin) return map;

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug')
    .in('id', unique);
  if (error) {
    logger.error('[networkSharing] labels error', error);
    return map;
  }
  for (const row of (data ?? []) as {
    id: string;
    name: string | null;
    slug: string | null;
  }[]) {
    map.set(row.id, { name: row.name ?? '', slug: row.slug ?? null });
  }
  return map;
}
