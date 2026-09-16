// /api/bot/v1/free-players/sync
//
// POST — FULL REPLACE des "joueurs libres" (free_players) du tenant courant,
// POUR LA SEULE PROVENANCE DISCORD (`source = 'discord'`).
//
// Depuis le lot 1 du backlog d'acquisition, `free_players` contient aussi des
// inscriptions faites depuis le site (`source = 'web'`, formulaire /rejoindre,
// sans compte requis). Elles n'appartiennent PAS au bot : sans le filtre de
// provenance ci-dessous, la première synchro venue les effacerait toutes en
// silence — et personne ne s'en apercevrait avant de constater une liste vide.
//
// Le bot Discord lit les membres portant le rôle "Recherche une équipe" et
// pousse la liste complète ici. Le site remplace intégralement la table
// `free_players` pour ce tenant par la liste reçue (delete-then-insert, soit
// l'équivalent d'un upsert sur UNIQUE(tenant_id, discord_user_id) + purge des
// rows absentes du payload) :
//   - chaque joueur présent est (ré)inséré avec username + auth_user_id à jour,
//   - les rows du tenant absentes du payload sont supprimées (le membre a perdu
//     le rôle côté Discord),
//   - `marked_at` des joueurs déjà présents est préservé.
//
// Pour chaque joueur, on résout `auth_user_id` en joignant `user_discord_links`
// sur discord_user_id (NULL si le compte Discord n'est pas lié au site).
//
// Auth : x-api-key (per-tenant). Tenant-scopé : req.botContext.tenantId.
//
// Réponse 200 : { count, linked, unlinked, unlinkedDiscordIds }.
// `unlinkedDiscordIds` = les discordUserId du set reçu sans compte site lié.

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';
import { syncBodySchema } from '@/lib/apiContracts/bot/free-players/sync';

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const tenantId = req.botContext.tenantId;
  const input = req.botInput as z.infer<typeof syncBodySchema>;

  // Dédup par discord_user_id (le dernier gagne) : le payload bot peut
  // théoriquement contenir un doublon ; la contrainte UNIQUE(tenant_id,
  // discord_user_id) le rejetterait sinon.
  const byDiscordId = new Map<
    string,
    { discordUserId: string; username: string | null }
  >();
  for (const p of input.players) {
    byDiscordId.set(p.discordUserId, {
      discordUserId: p.discordUserId,
      username: p.discordUsername ?? p.displayName ?? null,
    });
  }
  const players = [...byDiscordId.values()];
  const discordIds = players.map((p) => p.discordUserId);

  // Résolution des liens Discord -> auth_user_id (NULL si non lié).
  const linkByDiscordId = new Map<string, string>();
  if (discordIds.length > 0) {
    const { data: links, error: linksErr } = await supabaseAdmin
      .from('user_discord_links')
      .select('discord_user_id, auth_user_id')
      .in('discord_user_id', discordIds);
    if (linksErr) {
      logger.error('[bot/free-players/sync] links lookup error', linksErr);
      return res
        .status(500)
        .json({ error: 'Erreur de résolution des comptes liés.' });
    }
    for (const row of links ?? []) {
      const did = (row as Record<string, unknown>).discord_user_id;
      const aid = (row as Record<string, unknown>).auth_user_id;
      if (typeof did === 'string' && typeof aid === 'string') {
        linkByDiscordId.set(did, aid);
      }
    }
  }

  // État existant du tenant. On lit AVANT toute écriture pour :
  //   - préserver `marked_at` des joueurs déjà présents (un re-sync ne ré-arme
  //     pas la date de marquage initial),
  //   - calculer le set de discord_user_id à supprimer (absents du payload).
  const { data: existingRows, error: existingErr } = await supabaseAdmin
    .from('free_players')
    .select(
      'discord_user_id, marked_at, roles, level, availability, note, contact_email, contact_discord'
    )
    .eq('tenant_id', tenantId)
    // Scopé Discord comme la purge : une inscription web n'a pas de
    // discord_user_id et n'a rien à faire dans ce calcul.
    .eq('source', 'discord');
  if (existingErr) {
    logger.error('[bot/free-players/sync] existing lookup error', existingErr);
    return res
      .status(500)
      .json({ error: 'Erreur de lecture des joueurs libres.' });
  }
  /**
   * Ce qui SURVIT au full replace, par joueuse.
   *
   * `marked_at` survivait déjà : sans lui, chaque synchro remettrait à zéro la
   * date « libre depuis », et l'ancienneté d'une recherche disparaîtrait toutes
   * les trente minutes.
   *
   * Le PROFIL doit survivre pour la même raison. Le bot ne connaît de Discord
   * qu'un identifiant et un pseudo : poste, niveau, disponibilité et note ne
   * peuvent venir que d'ailleurs — d'une saisie de la joueuse, ou d'une
   * correction du staff. Les laisser hors de cette carte, c'est garantir qu'ils
   * seront effacés au prochain filet périodique, en silence, et qu'aucune fiche
   * Discord ne pourra jamais dire autre chose qu'un pseudo.
   */
  type Preserved = {
    marked_at: string;
    roles: string[] | null;
    level: string | null;
    availability: string | null;
    note: string | null;
    contact_email: string | null;
    contact_discord: string | null;
  };
  const preservedByDiscordId = new Map<string, Preserved>();
  for (const r of existingRows ?? []) {
    const row = r as Record<string, unknown>;
    const did = row.discord_user_id;
    const mat = row.marked_at;
    if (typeof did !== 'string' || typeof mat !== 'string') continue;
    preservedByDiscordId.set(did, {
      marked_at: mat,
      roles: Array.isArray(row.roles) ? (row.roles as string[]) : null,
      level: typeof row.level === 'string' ? row.level : null,
      availability:
        typeof row.availability === 'string' ? row.availability : null,
      note: typeof row.note === 'string' ? row.note : null,
      contact_email:
        typeof row.contact_email === 'string' ? row.contact_email : null,
      contact_discord:
        typeof row.contact_discord === 'string' ? row.contact_discord : null,
    });
  }

  const nowIso = new Date().toISOString();
  let linked = 0;
  // discordUserId du set reçu dont le compte n'est PAS lié au site
  // (auth_user_id null). Exposé tel quel au bot pour afficher un CTA
  // « lance /inscription » uniquement à ces joueuses.
  const unlinkedDiscordIds: string[] = [];

  // Full replace = delete-then-insert pour le set présent (déterministe et
  // équivalent à un upsert sur la contrainte UNIQUE(tenant_id, discord_user_id)).
  // On compte linked/unlinked en construisant les rows.
  const rows = players.map((p) => {
    const authUserId = linkByDiscordId.get(p.discordUserId) ?? null;
    const kept = preservedByDiscordId.get(p.discordUserId);
    if (authUserId) linked += 1;
    else unlinkedDiscordIds.push(p.discordUserId);
    return {
      tenant_id: tenantId,
      source: 'discord',
      discord_user_id: p.discordUserId,
      discord_username: p.username,
      auth_user_id: authUserId,
      // Préserve la date de marquage initiale si le joueur était déjà présent,
      // ET tout ce que le bot ne sait pas : le profil vient d'ailleurs.
      marked_at: kept?.marked_at ?? nowIso,
      roles: kept?.roles ?? [],
      level: kept?.level ?? null,
      availability: kept?.availability ?? null,
      note: kept?.note ?? null,
      contact_email: kept?.contact_email ?? null,
      contact_discord: kept?.contact_discord ?? null,
      updated_at: nowIso,
    };
  });

  // FULL REPLACE : on supprime les rows DISCORD du tenant (présentes + stale)…
  // `.eq('source', 'discord')` est le garde-fou décrit en en-tête : les
  // inscriptions web ne passent jamais par le bot et doivent lui survivre.
  const { error: deleteErr } = await supabaseAdmin
    .from('free_players')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('source', 'discord');
  if (deleteErr) {
    logger.error('[bot/free-players/sync] delete error', deleteErr);
    return res
      .status(500)
      .json({ error: 'Échec du nettoyage des joueurs libres.' });
  }

  // …puis on ré-insère le set présent.
  if (rows.length > 0) {
    const { error: insertErr } = await supabaseAdmin
      .from('free_players')
      .insert(rows);
    if (insertErr) {
      logger.error('[bot/free-players/sync] insert error', insertErr);
      return res
        .status(500)
        .json({ error: 'Échec de la synchronisation des joueurs libres.' });
    }
  }

  return res.status(200).json({
    count: rows.length,
    linked,
    unlinked: unlinkedDiscordIds.length,
    unlinkedDiscordIds,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 30, key: 'bot-free-players-sync' },
  idempotent: true,
  bodySchema: syncBodySchema,
});
