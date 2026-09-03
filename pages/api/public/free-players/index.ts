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
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { verifyCaptcha } from '@/utils/captcha';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { checkEmailQuality, normalizeEmail } from '@/utils/emailQuality';
import { alertIfBlacklisted } from '@/utils/moderation/blacklist';
import { emitBotEvent } from '@/utils/botEvents';
import { sendFreePlayerPublishedEmail } from '@/utils/email';
import { buildFreePlayerRemovalUrl } from '@/utils/freePlayerRemoval';
import { logger } from '@/utils/logger';
import {
  FREE_PLAYER_LEVELS,
  FREE_PLAYER_LIMITS,
  FREE_PLAYER_ROLES,
  FREE_PLAYER_SELECT,
  computeExpiresAt,
  isActive,
  normalizeRoles,
  toPublicFreePlayer,
  type FreePlayerRow,
} from '@/utils/freePlayers';

/** Plafond de la liste publique : au-delà, c'est un annuaire, pas une vitrine. */
const LIST_LIMIT = 120;

const bodySchema = z.object({
  displayName: z.string().trim().min(2).max(FREE_PLAYER_LIMITS.displayName),
  email: z.string().trim().toLowerCase().email().max(FREE_PLAYER_LIMITS.contactEmail),
  // Au moins un poste : sans ça la fiche n'aide aucune capitaine à décider.
  roles: z.array(z.enum(FREE_PLAYER_ROLES)).min(1).max(FREE_PLAYER_ROLES.length),
  level: z.enum(FREE_PLAYER_LEVELS).optional(),
  availability: z.string().trim().max(FREE_PLAYER_LIMITS.availability).optional(),
  note: z.string().trim().max(FREE_PLAYER_LIMITS.note).optional(),
  contactDiscord: z
    .string()
    .trim()
    .max(FREE_PLAYER_LIMITS.contactDiscord)
    .optional(),
  honeypot: z.string().optional(),
  captchaToken: z.string().optional(),
  captchaAnswer: z.string().optional(),
});

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

  const tenantId = resolveTenantIdForPublicRequest(req);

  const { data, error } = await supabaseAdmin
    .from('free_players')
    .select(FREE_PLAYER_SELECT)
    .eq('tenant_id', tenantId)
    .order('marked_at', { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    logger.error('[api/public/free-players] list error', error);
    return res.status(500).json({ error: 'Liste indisponible pour le moment.' });
  }

  // Le filtre de péremption est appliqué ici plutôt qu'en SQL parce qu'il doit
  // laisser passer les rows sans `expires_at` (provenance Discord, fraîcheur
  // garantie par la synchro du bot) — un `.gt()` les exclurait toutes.
  const now = new Date();
  const players = ((data ?? []) as FreePlayerRow[])
    .filter((row) => isActive(row, now))
    .map(toPublicFreePlayer)
    .filter((p): p is NonNullable<typeof p> => p !== null);

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

  const captchaResult = verifyCaptcha(
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

  const tenantId = resolveTenantIdForPublicRequest(req);
  const nowIso = new Date().toISOString();

  const row = {
    tenant_id: tenantId,
    source: 'web' as const,
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
