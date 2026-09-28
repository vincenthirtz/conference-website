// features/admin/free-players/service.ts — règles de la vue staff du marché
// des joueuses libres (lot 1 acquisition).
//
// POURQUOI un retrait côté staff alors que la joueuse a déjà son lien de
// retrait par email : elle peut avoir perdu l'email, changé d'adresse, ou
// demander le retrait par un autre canal (Discord, formulaire de contact). Une
// donnée publiée doit avoir DEUX portes de sortie — celle de la personne
// concernée, et celle de l'opérateur qu'elle sollicite.
//
// Les fiches Discord (`source='discord'`) sont supprimables ici aussi, mais le
// retrait n'est pas durable : le bot les repousse à la synchro suivante tant
// que la joueuse porte le rôle. Le résultat le signale (`willReturn`) pour que
// l'UI le dise au staff plutôt que de le laisser découvrir 30 minutes plus tard.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError, NotFoundError } from '@/utils/admin/errors';
import { normalizeRoles } from '@/utils/freePlayers';
import * as repo from './repository';
import type { FreePlayerAdminList, RemoveFreePlayerResult } from './schemas';

export async function listFreePlayers(
  ctx: ServiceContext
): Promise<FreePlayerAdminList> {
  const { rows, error } = await repo.listByTenant(ctx.db, ctx.tenantId);
  if (error) {
    ctx.logger.error('[admin/free-players] list error', error);
    throw new AdminError(500, 'internal', 'Chargement impossible.');
  }

  // Le staff VOIT les coordonnées : c'est ce qui lui permet de traiter une
  // demande de retrait reçue par un autre canal (« c'est moi, telle adresse »).
  const items = rows.map((r) => ({
    id: r.id,
    source: r.source === 'web' ? ('web' as const) : ('discord' as const),
    name: r.display_name ?? r.discord_username ?? null,
    roles: normalizeRoles(r.roles),
    level: r.level ?? null,
    availability: r.availability ?? null,
    note: r.note ?? null,
    contactEmail: r.contact_email ?? null,
    contactDiscord: r.contact_discord ?? null,
    discordUsername: r.discord_username ?? null,
    markedAt: r.marked_at,
    expiresAt: r.expires_at,
  }));
  return { items };
}

export async function removeFreePlayer(
  ctx: ServiceContext,
  id: string
): Promise<
  RemoveFreePlayerResult & {
    removed: { source: string | null; name: string | null };
  }
> {
  // Lecture avant suppression : la provenance prévient le staff d'un retour
  // possible, le nom nourrit le journal.
  const { row } = await repo.findForRemoval(ctx.db, ctx.tenantId, id);
  if (!row) throw new NotFoundError('Fiche introuvable.');

  const { error } = await repo.deleteById(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/free-players] delete error', error);
    throw new AdminError(500, 'internal', 'Suppression impossible.');
  }

  return {
    success: true,
    willReturn: row.source === 'discord',
    removed: {
      source: row.source,
      name: row.display_name ?? row.discord_username ?? null,
    },
  };
}
