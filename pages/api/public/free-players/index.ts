// pages/api/public/free-players.ts
//
// Le « marché des joueuses libres », côté public — lot 1 du backlog
// d'acquisition (docs/BACKLOG-acquisition-joueuses.md).
//
//   GET  — liste ANONYMISÉE des joueuses qui cherchent une équipe.
//   POST — se signaler comme joueuse libre, SANS COMPTE.
//
// Pourquoi sans compte : c'est tout l'objet du lot. Une joueuse qui n'a pas
// déjà cinq copines n'avait aucun chemin sur le site — on la renvoyait sur
// Discord. Exiger un compte avant même de savoir si quelqu'un la contactera
// remettrait la friction là où elle était. Le compte se crée plus tard, quand
// une capitaine l'invite.
//
// Confidentialité : le GET ne renvoie JAMAIS de moyen de contact (cf.
// `toPublicFreePlayer`). L'email et le tag Discord ne sortent que par
// /api/teams/free-players, réservé aux capitaines authentifiées.
//
// Anti-spam du POST : honeypot + captcha HMAC + rate-limit par IP, exactement
// comme /api/public/newsletter/subscribe et /api/public/scrim-requests.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { verifyCaptcha } from '@/utils/captcha';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import {
  readNetworkTenantIds,
  readTenantLabels,
} from '@/utils/tenants/networkSharing';
import { checkEmailQuality, normalizeEmail } from '@/utils/emailQuality';
import { alertIfBlacklisted } from '@/utils/moderation/blacklist';
import { emitBotEvent } from '@/utils/botEvents';
import { sendFreePlayerPublishedEmail } from '@/utils/email';
import { buildFreePlayerRemovalUrl } from '@/utils/freePlayerRemoval';
import { logger } from '@/utils/logger';
import { lookupUserIdByEmail } from '@/utils/find-or-create-user';
import { freePlayerSignupBodySchema } from '@/lib/apiContracts/public/freePlayers';
import {
  FREE_PLAYER_SELECT,
  computeExpiresAt,
  isActive,
  normalizeRoles,
  toPublicFreePlayer,
  type FreePlayerRow,
} from '@/utils/freePlayers';

/** Plafond de la liste publique : au-delà, c'est un annuaire, pas une vitrine. */
const LIST_LIMIT = 120;

// Schéma partagé avec la spec OpenAPI (lib/apiContracts).
const bodySchema = freePlayerSignupBodySchema;

/**
 * Réponse unique du chemin nominal. Comme pour la newsletter, elle ne révèle
 * pas si l'adresse était déjà inscrite : sinon le formulaire devient un oracle
 * permettant de tester l'appartenance de n'importe quel email.
 */
function ok(res: NextApiResponse) {
  return res.status(200).json({ success: true });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'free-players-list')) {
    return;
  }

  const tenantId = await resolveTenantIdForPublicRequestAsync(req);

  // Le réseau entre espaces volontaires (lot 4). DEUX consentements sont
  // exigés, et c'est voulu : celui de l'ESPACE qui ouvre son recrutement, et
  // celui de la JOUEUSE qui accepte d'être lue ailleurs. Une annonce déposée
  // sur un site n'a pas été déposée sur tous les autres.
  const networkIds = (
    await readNetworkTenantIds(tenantId, 'recruitment')
  ).filter((id) => id !== tenantId);

  const [mineRes, networkRes] = await Promise.all([
    supabaseAdmin
      .from('free_players')
      .select(FREE_PLAYER_SELECT)
      .eq('tenant_id', tenantId)
      .order('marked_at', { ascending: false })
      .limit(LIST_LIMIT),
    networkIds.length > 0
      ? supabaseAdmin
          .from('free_players')
          .select(FREE_PLAYER_SELECT)
          .in('tenant_id', networkIds)
          .eq('share_across_tenants', true)
          .order('marked_at', { ascending: false })
          .limit(LIST_LIMIT)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const { data, error } = mineRes;
  if (error) {
    logger.error('[api/public/free-players] list error', error);
    return res.status(500).json({ error: 'Liste indisponible pour le moment.' });
  }
  if (networkRes.error) {
    // Le réseau est un bonus : s'il tombe, la liste de l'espace s'affiche
    // quand même. L'inverse ferait dépendre ma page du réglage d'un voisin.
    logger.error('[api/public/free-players] network error', networkRes.error);
  }

  // Le filtre de péremption est appliqué ici plutôt qu'en SQL parce qu'il doit
  // laisser passer les rows sans `expires_at` (provenance Discord, fraîcheur
  // garantie par la synchro du bot) — un `.gt()` les exclurait toutes.
  const now = new Date();
  const networkRows = (
    networkRes.error ? [] : ((networkRes.data ?? []) as FreePlayerRow[])
  ).filter((row) => isActive(row, now));
  const labels =
    networkRows.length > 0
      ? await readTenantLabels(
          networkRows.map((row) => String(row.tenant_id ?? ''))
        )
      : new Map<string, { name: string; slug: string | null }>();

  const mine = ((data ?? []) as FreePlayerRow[])
    .filter((row) => isActive(row, now))
    .map(toPublicFreePlayer)
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const fromNetwork = networkRows
    .map((row) => {
      const projected = toPublicFreePlayer(row);
      if (!projected) return null;
      const label = labels.get(String(row.tenant_id ?? ''));
      return { ...projected, from: label ?? null };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Les annonces de l'espace d'abord : c'est chez soi qu'on recrute en
  // premier, et le réseau complète au lieu de noyer.
  const players = [...mine, ...fromNetwork].slice(0, LIST_LIMIT);

  // PAS de cache CDN, et c'est délibéré. Un `max-age=60` a été essayé : le CDN
  // Netlify ne varie pas sur la query string, donc une joueuse qui venait de
  // publier sa fiche recevait la liste d'AVANT — y compris après le
  // rafraîchissement déclenché par le formulaire. Elle en concluait que son
  // envoi n'était pas parti, ce qui est précisément le doute que ce parcours
  // doit lever. La requête est minuscule et le trafic quasi nul : le cache ne
  // gagnait rien et cassait le seul moment qui compte.
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ players, count: players.length });
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error:
        'Formulaire incomplet : il faut au minimum un pseudo, un email valide et un poste.',
      code: 'VALIDATION',
    });
  }
  const body = parsed.data;

  // Honeypot rempli ⇒ bot. Succès générique : ne pas lui apprendre qu'il est
  // détecté, sinon le prochain script contourne le champ.
  if (body.honeypot && body.honeypot.trim().length > 0) {
    return ok(res);
  }

  if (applyRateLimit(req, res, { max: 5, windowMs: 60_000 }, 'free-players-signup')) {
    return;
  }

  const captchaResult = await verifyCaptcha(
    (body.captchaToken || '').toString(),
    (body.captchaAnswer || '').toString()
  );
  if (!captchaResult.valid) {
    return res
      .status(400)
      .json({ error: captchaResult.error || 'Captcha invalide', code: 'CAPTCHA' });
  }

  const email = normalizeEmail(body.email);
  const quality = checkEmailQuality(email);
  if (!quality.ok) {
    // Message volontairement générique : la raison exacte (domaine jetable,
    // placeholder…) n'aide que celui qui cherche à passer au travers.
    return res
      .status(400)
      .json({ error: 'Cette adresse email ne peut pas être utilisée.', code: 'VALIDATION' });
  }

  const tenantId = await resolveTenantIdForPublicRequestAsync(req);
  const nowIso = new Date().toISOString();

  // Un compte existe-t-il déjà à cette adresse ? Le formulaire se remplit SANS
  // compte — c'est tout son intérêt — mais rien n'interdit à une personne qui
  // en a un de passer par là, et c'est même le cas le plus fréquent. Sans ce
  // rapprochement, sa fiche naît orpheline et l'invitation en un clic, qui
  // exige un compte lié, reste indisponible sur elle.
  //
  // La preuve est la même que partout ailleurs dans ce parcours : l'accès à la
  // boîte mail. Elle vaut ici ce qu'elle vaut pour le lien de retrait.
  // `lookupUserIdByEmail` LÈVE en cas d'erreur : ici, une panne de lookup ne
  // doit pas empêcher quelqu'un de se signaler. On retombe sur « pas de compte »,
  // qui est l'état d'avant ce lot — et le rattachement se refera à sa prochaine
  // connexion.
  let existingAccountId: string | null = null;
  try {
    existingAccountId = await lookupUserIdByEmail(email);
  } catch (err) {
    logger.error('[api/public/free-players] lookup compte impossible', err);
  }

  const row = {
    tenant_id: tenantId,
    share_across_tenants: parsed.data.shareAcrossTenants === true,
    source: 'web' as const,
    auth_user_id: existingAccountId,
    display_name: body.displayName,
    contact_email: email,
    contact_discord: body.contactDiscord || null,
    roles: normalizeRoles(body.roles),
    level: body.level ?? 'unknown',
    availability: body.availability || null,
    note: body.note || null,
    updated_at: nowIso,
    expires_at: computeExpiresAt(),
  };

  // Insert d'abord, update sur conflit. Volontairement PAS un `.upsert()` :
  // l'unicité web repose sur un index PARTIEL (`WHERE source='web'`) que
  // PostgREST ne sait pas viser via `onConflict`. Le 23505 est donc le chemin
  // normal d'une ré-inscription, pas une erreur.
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('free_players')
    .insert({ ...row, marked_at: nowIso })
    .select('id')
    .maybeSingle();

  let isNew = true;
  // L'id sert à construire le lien de retrait envoyé par email : sans lui, la
  // joueuse n'aurait aucun moyen autonome de disparaître de la liste.
  let freePlayerId: string | null =
    (inserted as { id?: string } | null)?.id ?? null;

  if (insertErr) {
    if (insertErr.code !== '23505') {
      logger.error('[api/public/free-players] insert error', insertErr);
      return res
        .status(500)
        .json({ error: 'Inscription impossible pour le moment. Réessaie plus tard.' });
    }
    isNew = false;
    // Ré-inscription : on rafraîchit la fiche et on repousse la péremption,
    // sans toucher `marked_at` (l'ancienneté de la démarche reste vraie).
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('free_players')
      .update(row)
      .eq('tenant_id', tenantId)
      .eq('source', 'web')
      .eq('contact_email', email)
      .select('id')
      .maybeSingle();
    if (updateErr) {
      logger.error('[api/public/free-players] update error', updateErr);
      return res
        .status(500)
        .json({ error: 'Inscription impossible pour le moment. Réessaie plus tard.' });
    }
    freePlayerId = (updated as { id?: string } | null)?.id ?? null;
  }

  // Email de confirmation, qui porte SURTOUT le lien de retrait. Best-effort :
  // l'inscription est déjà enregistrée, un échec d'envoi ne doit pas la faire
  // échouer. Envoyé aussi sur une ré-inscription — c'est justement le moment où
  // quelqu'un qui a perdu son lien vient le récupérer.
  if (freePlayerId) {
    void sendFreePlayerPublishedEmail({
      tenantId,
      to: email,
      displayName: body.displayName,
      removeUrl: buildFreePlayerRemovalUrl(freePlayerId),
    }).catch((err) => {
      logger.error('[api/public/free-players] confirmation email failed', err);
    });
  } else {
    // Ne devrait pas arriver : sans id, la joueuse est publiée SANS porte de
    // sortie autonome. On le journalise pour que ça ne passe pas inaperçu.
    logger.error(
      '[api/public/free-players] id introuvable — aucun lien de retrait envoyé'
    );
  }

  // Modération : alerte (sans bloquer) si le pseudo est sur liste noire.
  void alertIfBlacklisted(supabaseAdmin, tenantId, 'free_player', {
    displayName: body.displayName,
  });

  // Prévenir les capitaines : c'est ce qui transforme une inscription en
  // rencontre. Fire-and-forget — l'inscription ne doit pas échouer parce que
  // Discord est indisponible. Aucune donnée de contact dans l'event : le bot
  // annonce, il ne distribue pas d'email.
  if (isNew) {
    void emitBotEvent(
      'free_player.registered',
      {
        displayName: body.displayName,
        roles: row.roles,
        level: row.level,
        availability: row.availability,
      },
      tenantId
    ).catch(() => {
      /* déjà journalisé par emitBotEvent ; jamais bloquant */
    });
  }

  return ok(res);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
