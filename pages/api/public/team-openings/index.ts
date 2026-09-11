// pages/api/public/team-openings/index.ts
//
// Le marché « une équipe cherche une joueuse », côté public — MIROIR de
// /api/public/free-players.
//
//   GET  — liste ANONYMISÉE des équipes qui recrutent.
//   POST — publier une annonce de recrutement, SANS COMPTE.
//
// Pourquoi sans compte : même raison que pour les joueuses libres. Une équipe
// qui se monte n'a souvent pas encore d'existence sur le site ; exiger qu'elle
// crée une fiche d'équipe, invite ses membres puis publie remettrait la
// friction exactement là où ce parcours cherche à la retirer. Le lien vers une
// vraie équipe (`team_id`) se fera plus tard, quand l'annonce sera posée depuis
// l'espace capitaine.
//
// Confidentialité : le GET ne renvoie JAMAIS de moyen de contact (cf.
// `toPublicTeamOpening`). L'email et le pseudo Discord ne sortent que par
// /api/team-openings/contact, réservé aux personnes connectées.
//
// Anti-spam du POST : honeypot + captcha HMAC + rate-limit par IP, comme
// /api/public/free-players et /api/public/newsletter/subscribe.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { verifyCaptcha } from '@/utils/captcha';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import { checkEmailQuality, normalizeEmail } from '@/utils/emailQuality';
import { alertIfEntityBlacklisted } from '@/utils/moderation/entityBlacklist';
import { emitBotEvent } from '@/utils/botEvents';
import { sendTeamOpeningPublishedEmail } from '@/utils/email';
import { buildTeamOpeningRemovalUrl } from '@/utils/teamOpeningRemoval';
import { logger } from '@/utils/logger';
import {
  TEAM_OPENING_LEVELS,
  TEAM_OPENING_LIMITS,
  TEAM_OPENING_ROLES,
  TEAM_OPENING_SELECT,
  computeTeamOpeningExpiresAt,
  isTeamOpeningActive,
  normalizeOpeningRoles,
  toPublicTeamOpening,
  type TeamOpeningRow,
} from '@/utils/teamOpenings';

/** Plafond de la liste publique : au-delà, c'est un annuaire, pas une vitrine. */
const LIST_LIMIT = 120;

/** Cache CDN de la liste. Cf. commentaire dans `handleGet`. */
const LIST_CACHE_SECONDS = 60;

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(TEAM_OPENING_LIMITS.contactEmail);

const bodySchema = z.object({
  teamName: z.string().trim().min(2).max(TEAM_OPENING_LIMITS.teamName),
  // Le formulaire public envoie `contactEmail` — nommé comme la colonne, et
  // comme le champ « contact Discord » juste à côté. `email` reste accepté :
  // c'est le nom qu'utilise le formulaire des joueuses libres, et un client
  // écrit en le recopiant ne doit pas se faire refuser en silence.
  contactEmail: emailField.optional(),
  email: emailField.optional(),
  // Au moins un poste recherché : une annonce « on cherche quelqu'un » sans
  // dire quel poste n'aide aucune joueuse à savoir si elle est concernée.
  roles: z
    .array(z.enum(TEAM_OPENING_ROLES))
    .min(1)
    .max(TEAM_OPENING_ROLES.length),
  level: z.enum(TEAM_OPENING_LEVELS).optional(),
  availability: z
    .string()
    .trim()
    .max(TEAM_OPENING_LIMITS.availability)
    .optional(),
  note: z.string().trim().max(TEAM_OPENING_LIMITS.note).optional(),
  contactDiscord: z
    .string()
    .trim()
    .max(TEAM_OPENING_LIMITS.contactDiscord)
    .optional(),
  honeypot: z.string().optional(),
  captchaToken: z.string().optional(),
  captchaAnswer: z.string().optional(),
});

/**
 * Réponse unique du chemin nominal. Comme pour les joueuses libres, elle ne
 * révèle pas si l'adresse avait déjà une annonce : sinon le formulaire devient
 * un oracle permettant de tester n'importe quel email.
 */
function ok(res: NextApiResponse) {
  return res.status(200).json({ success: true });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'team-openings-list'
    )
  ) {
    return;
  }

  const tenantId = await resolveTenantIdForPublicRequestAsync(req);

  const { data, error } = await supabaseAdmin
    .from('team_openings')
    .select(TEAM_OPENING_SELECT)
    .eq('tenant_id', tenantId)
    .order('marked_at', { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    logger.error('[api/public/team-openings] list error', error);
    return res
      .status(500)
      .json({ error: 'Liste indisponible pour le moment.' });
  }

  // Filtre de péremption appliqué ici plutôt qu'en SQL : il doit laisser passer
  // les rows sans `expires_at` (aucune aujourd'hui, mais un `.gt()` les
  // exclurait silencieusement le jour où une provenance Discord en produira).
  const now = new Date();
  const openings = ((data ?? []) as TeamOpeningRow[])
    .filter((row) => isTeamOpeningActive(row, now))
    .map(toPublicTeamOpening)
    .filter((o): o is NonNullable<typeof o> => o !== null);

  // Cache CDN court. ATTENTION au piège déjà rencontré côté /rejoindre : le CDN
  // ne varie pas sur la query string, donc pendant une minute une équipe qui
  // vient de publier peut recevoir la liste d'AVANT et croire son envoi perdu.
  // Le formulaire doit donc afficher sa propre confirmation et ne PAS conclure
  // de l'absence de sa ligne dans la liste rafraîchie.
  res.setHeader(
    'Cache-Control',
    `public, s-maxage=${LIST_CACHE_SECONDS}, stale-while-revalidate=${Math.ceil(
      LIST_CACHE_SECONDS / 2
    )}`
  );
  return res.status(200).json({ openings, count: openings.length });
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error:
        "Formulaire incomplet : il faut au minimum un nom d'équipe, un email valide et un poste recherché.",
      code: 'VALIDATION',
    });
  }
  const body = parsed.data;

  // Honeypot rempli ⇒ bot. Succès générique : ne pas lui apprendre qu'il est
  // détecté, sinon le prochain script contourne le champ.
  if (body.honeypot && body.honeypot.trim().length > 0) {
    return ok(res);
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 5, windowMs: 60_000 },
      'team-openings-publish'
    )
  ) {
    return;
  }

  const captchaResult = verifyCaptcha(
    (body.captchaToken || '').toString(),
    (body.captchaAnswer || '').toString()
  );
  if (!captchaResult.valid) {
    return res.status(400).json({
      error: captchaResult.error || 'Captcha invalide',
      code: 'CAPTCHA',
    });
  }

  // Un des deux noms suffit, mais il en faut un : sans adresse, l'annonce est
  // injoignable ET sans porte de sortie (le lien de retrait part par email).
  const rawEmail = body.contactEmail ?? body.email;
  if (!rawEmail) {
    return res.status(400).json({
      error:
        "Formulaire incomplet : il faut au minimum un nom d'équipe, un email valide et un poste recherché.",
      code: 'VALIDATION',
    });
  }

  const email = normalizeEmail(rawEmail);
  const quality = checkEmailQuality(email);
  if (!quality.ok) {
    // Message volontairement générique : la raison exacte (domaine jetable,
    // placeholder…) n'aide que celui qui cherche à passer au travers.
    return res.status(400).json({
      error: 'Cette adresse email ne peut pas être utilisée.',
      code: 'VALIDATION',
    });
  }

  const tenantId = await resolveTenantIdForPublicRequestAsync(req);
  const nowIso = new Date().toISOString();

  const row = {
    tenant_id: tenantId,
    source: 'web' as const,
    team_name: body.teamName,
    contact_email: email,
    contact_discord: body.contactDiscord || null,
    roles: normalizeOpeningRoles(body.roles),
    level: body.level ?? 'unknown',
    availability: body.availability || null,
    note: body.note || null,
    updated_at: nowIso,
    expires_at: computeTeamOpeningExpiresAt(),
  };

  // Insert d'abord, update sur conflit. Volontairement PAS un `.upsert()` :
  // l'unicité repose sur un index PARTIEL (`WHERE source='web'`) que PostgREST
  // ne sait pas viser via `onConflict`. Le 23505 est donc le chemin normal
  // d'une re-publication, pas une erreur.
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('team_openings')
    .insert({ ...row, marked_at: nowIso })
    .select('id')
    .maybeSingle();

  let isNew = true;
  // L'id sert à construire le lien de retrait envoyé par email : sans lui,
  // l'équipe n'aurait aucun moyen autonome de retirer son annonce.
  let openingId: string | null =
    (inserted as { id?: string } | null)?.id ?? null;

  if (insertErr) {
    if (insertErr.code !== '23505') {
      logger.error('[api/public/team-openings] insert error', insertErr);
      return res.status(500).json({
        error: 'Publication impossible pour le moment. Réessaie plus tard.',
      });
    }
    isNew = false;
    // Re-publication : on rafraîchit l'annonce et on repousse la péremption,
    // sans toucher `marked_at` (l'ancienneté de la recherche reste vraie).
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('team_openings')
      .update(row)
      .eq('tenant_id', tenantId)
      .eq('source', 'web')
      .eq('contact_email', email)
      .select('id')
      .maybeSingle();
    if (updateErr) {
      logger.error('[api/public/team-openings] update error', updateErr);
      return res.status(500).json({
        error: 'Publication impossible pour le moment. Réessaie plus tard.',
      });
    }
    openingId = (updated as { id?: string } | null)?.id ?? null;
  }

  // Email de confirmation, qui porte SURTOUT le lien de retrait. Best-effort :
  // l'annonce est déjà enregistrée, un échec d'envoi ne doit pas la faire
  // échouer. Envoyé aussi sur une re-publication — c'est justement le moment où
  // quelqu'un qui a perdu son lien vient le récupérer.
  if (openingId) {
    void sendTeamOpeningPublishedEmail({
      tenantId,
      to: email,
      teamName: body.teamName,
      removeUrl: buildTeamOpeningRemovalUrl(openingId),
    }).catch((err) => {
      logger.error('[api/public/team-openings] confirmation email failed', err);
    });
  } else {
    // Ne devrait pas arriver : sans id, l'annonce est publiée SANS porte de
    // sortie autonome. On le journalise pour que ça ne passe pas inaperçu.
    logger.error(
      '[api/public/team-openings] id introuvable — aucun lien de retrait envoyé'
    );
  }

  // Modération : alerte (sans bloquer) si le nom d'équipe est sur liste noire.
  // C'est la blacklist ENTITÉS qui s'applique ici, pas celle des joueuses : on
  // publie le nom d'une équipe, pas l'identité d'une personne.
  void alertIfEntityBlacklisted(supabaseAdmin, tenantId, 'team_create', {
    name: body.teamName,
  });

  // Prévenir les joueuses : c'est ce qui transforme une annonce en rencontre.
  // Fire-and-forget — la publication ne doit pas échouer parce que Discord est
  // indisponible. Aucune donnée de contact dans l'event : le bot annonce, il ne
  // distribue pas d'email.
  if (isNew) {
    void emitBotEvent(
      'team_opening.published',
      {
        teamName: body.teamName,
        roles: row.roles,
        level: row.level,
        availability: row.availability,
        note: row.note,
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
