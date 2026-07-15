// utils/broadcasts.ts
// Catalogue des campagnes d'emails broadcast déclenchables depuis l'admin.
// Pour ajouter une campagne :
//   1. Créer la fonction d'envoi dans utils/email.ts
//   2. Ajouter une entrée dans BROADCAST_CAMPAIGNS ci-dessous
// Le `staff_logs` payload tag (entity_type='broadcast', campaign=<id>) sert
// à reconstruire l'historique d'envoi pour le tableau de bord admin.

import { supabaseAdmin } from './supabase';
import {
  buildIdahobitLiveEmailHtml,
  sendIdahobitLiveEmail,
  buildCampaignEmailHtml,
  sendCampaignEmail,
} from './email';
import type { SendEmailResult, CampaignBody } from './email';
import { generateUnsubscribeToken } from './emailUnsubscribe';
import { BROADCAST_OPT_OUT_EVENT_TYPE } from './webPushEvents';
import { slugifyCampaignName } from './campaignSchema';

import { logger } from './logger';

// Origine du site pour construire les liens absolus (même précédence que
// utils/emailDispatcher.ts / utils/checkin.ts).
const SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://owwomenscup.fr';

/**
 * Construit l'URL de désinscription RGPD (scope broadcast) pour un user donné.
 * Le token HMAC est propre au user ; l'URL est donc unique par destinataire.
 * Consommée par les 2 chemins d'envoi (POST direct + processCampaignWave) pour
 * alimenter le footer HTML ET le header List-Unsubscribe one-click.
 */
export function buildBroadcastUnsubscribeUrl(userId: string): string {
  return `${SITE_URL.replace(/\/$/, '')}/api/email/unsubscribe?token=${generateUnsubscribeToken(
    userId
  )}&scope=broadcast`;
}

export type CampaignAudience = 'all-confirmed-users';
export type CampaignStatus = 'active' | 'draft' | 'archived';

export type BroadcastCampaign = {
  id: string;
  name: string;
  description: string;
  subject: string;
  audience: CampaignAudience;
  status: CampaignStatus;
  /** 'builtin' = catalogue codé en dur (legacy, non éditable) ; 'db' = créée depuis l'admin */
  source: 'builtin' | 'db';
  /** Corps structuré — présent uniquement pour les campagnes 'db' (prefill du formulaire) */
  body?: CampaignBody;
  /**
   * Envoi réel via Brevo. `unsubscribeUrl` (par-destinataire) alimente le lien
   * de désinscription broadcast dans le footer + le header List-Unsubscribe.
   * Optionnel : les previews (test) l'omettent (pas de user associé).
   */
  send: (
    to: string,
    label: string | null,
    unsubscribeUrl?: string
  ) => Promise<SendEmailResult>;
  /** Génère le HTML rendu (utilisé pour le live preview admin) */
  buildHtml: (label: string | null) => string;
};

// Catalogue codé en dur — campagnes one-shot historiques, non éditables depuis
// l'admin. getCampaign()/listCampaigns() lisent la DB en priorité et retombent
// ici par id (fallback). Les nouvelles campagnes vivent dans email_campaigns.
export const BROADCAST_CAMPAIGNS: BroadcastCampaign[] = [
  {
    id: 'idahobit-live-2026',
    name: 'Live Twitch — IDAHOBIT 2026',
    description:
      'Annonce du live Twitch du dimanche 17 mai 2026 à 14h pour la Journée mondiale contre l’homophobie, la transphobie et la biphobie.',
    subject:
      'Live Twitch — Journée internationale contre les LGBTphobies, dimanche 17 mai à 14h',
    audience: 'all-confirmed-users',
    status: 'active',
    source: 'builtin',
    send: sendIdahobitLiveEmail,
    buildHtml: buildIdahobitLiveEmailHtml,
  },
];

/** Ligne brute de la table email_campaigns. */
export type EmailCampaignRow = {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  audience: CampaignAudience;
  status: CampaignStatus;
  heading: string;
  greeting_enabled: boolean;
  body_paragraphs: unknown;
  cta_label: string | null;
  cta_url: string | null;
  footer_note: string | null;
};

/** Convertit une ligne email_campaigns en BroadcastCampaign exécutable. */
export function rowToCampaign(row: EmailCampaignRow): BroadcastCampaign {
  const body: CampaignBody = {
    heading: row.heading,
    greetingEnabled: row.greeting_enabled,
    bodyParagraphs: Array.isArray(row.body_paragraphs)
      ? (row.body_paragraphs as unknown[]).filter(
          (p): p is string => typeof p === 'string'
        )
      : [],
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    footerNote: row.footer_note,
  };
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    subject: row.subject,
    audience: row.audience,
    status: row.status,
    source: 'db',
    body,
    send: (to, label, unsubscribeUrl) =>
      sendCampaignEmail({
        to,
        subject: row.subject,
        body,
        displayLabel: label,
        tags: [row.id],
        unsubscribeUrl,
      }),
    buildHtml: (label) => buildCampaignEmailHtml(body, label),
  };
}

/**
 * Génère un id de campagne unique dérivé du slug du nom : `base`, puis
 * `base-2`, `base-3`… jusqu'à trouver un id libre dans email_campaigns.
 * Partagé par la création (POST /api/admin/broadcast) et la duplication
 * (POST /api/admin/broadcast/[id]/duplicate) pour garantir la même règle.
 * Rejette si supabaseAdmin est indisponible ou si aucun id libre n'est
 * trouvé dans la fenêtre (collision extrême) — l'appelant renvoie alors 500.
 */
export async function generateUniqueCampaignId(name: string): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured');
  }
  const base = slugifyCampaignName(name);
  let id = base;
  for (let i = 2; i < 100; i++) {
    const { data: clash, error } = await supabaseAdmin
      .from('email_campaigns')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (!clash) return id;
    id = `${base}-${i}`;
  }
  throw new Error(`Could not derive a unique campaign id from "${name}"`);
}

/**
 * Résout une campagne par id : DB (email_campaigns) en priorité, puis fallback
 * sur le catalogue codé en dur. Renvoie undefined si introuvable.
 */
export async function getCampaign(
  id: string
): Promise<BroadcastCampaign | undefined> {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('email_campaigns')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      logger.error('[broadcasts] getCampaign DB error:', error);
    } else if (data) {
      return rowToCampaign(data as EmailCampaignRow);
    }
  }
  return BROADCAST_CAMPAIGNS.find((c) => c.id === id);
}

/**
 * Liste toutes les campagnes : DB d'abord (plus récentes en tête), puis les
 * campagnes builtin dont l'id n'est pas déjà couvert par une entrée DB.
 */
export async function listCampaigns(): Promise<BroadcastCampaign[]> {
  let dbCampaigns: BroadcastCampaign[] = [];
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('email_campaigns')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('[broadcasts] listCampaigns DB error:', error);
    } else if (data) {
      dbCampaigns = (data as EmailCampaignRow[]).map(rowToCampaign);
    }
  }
  const dbIds = new Set(dbCampaigns.map((c) => c.id));
  const builtin = BROADCAST_CAMPAIGNS.filter((c) => !dbIds.has(c.id));
  return [...dbCampaigns, ...builtin];
}

export type ComputedRecipient = {
  user_id: string;
  email: string;
  label: string | null;
};

/** Un compte confirmé, projeté sur les seules colonnes utiles ici. */
type ConfirmedUser = { id: string; email: string; display_name: string | null };

/**
 * Pagine `auth.users` et ne garde que les comptes confirmés avec un email.
 * Source de vérité partagée entre computeAudienceRecipients (destinataires)
 * et computeSubscriptionStats (compteurs abonnés/désabonnés).
 */
async function listConfirmedUsers(): Promise<ConfirmedUser[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured');
  }
  const users: ConfirmedUser[] = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    const batch = data?.users ?? [];
    for (const u of batch) {
      if (!u.email) continue;
      if (!u.email_confirmed_at && !u.confirmed_at) continue;
      users.push({
        id: u.id,
        email: u.email,
        display_name:
          (u.user_metadata?.display_name as string | undefined) ?? null,
      });
    }
    if (batch.length < perPage) break;
    page += 1;
  }
  return users;
}

/**
 * Résout un sous-ensemble ciblé de comptes confirmés par leurs ids, via des
 * appels `auth.admin.getUserById` (pas de scan complet de auth.users). Utilisé
 * pour n'enrichir que les désabonnés broadcast dans `computeSubscriptionStats`.
 * Filtre les comptes non confirmés / sans email (même critère que
 * `listConfirmedUsers`).
 */
async function fetchConfirmedUsersByIds(
  ids: string[]
): Promise<ConfirmedUser[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured');
  }
  if (ids.length === 0) return [];
  const out: ConfirmedUser[] = [];
  for (const id of ids) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
    if (error || !data?.user) continue;
    const u = data.user;
    if (!u.email) continue;
    if (!u.email_confirmed_at && !u.confirmed_at) continue;
    out.push({
      id: u.id,
      email: u.email,
      display_name:
        (u.user_metadata?.display_name as string | undefined) ?? null,
    });
  }
  return out;
}

/**
 * Charge en UNE requête l'ensemble des opt-out RGPD broadcast :
 * notification_prefs(channel='email', event_type='broadcast', enabled=false).
 * Renvoie une map user_id -> updated_at (= date de désinscription, ou null).
 * Les opt-outs d'événements (EMAIL_EVENT_TYPES) n'affectent PAS les
 * broadcasts — scope dédié via BROADCAST_OPT_OUT_EVENT_TYPE.
 */
async function fetchBroadcastOptOuts(): Promise<Map<string, string | null>> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured');
  }
  const { data, error } = await supabaseAdmin
    .from('notification_prefs')
    .select('user_id, updated_at')
    .eq('channel', 'email')
    .eq('event_type', BROADCAST_OPT_OUT_EVENT_TYPE)
    .eq('enabled', false);
  if (error) throw error;
  const map = new Map<string, string | null>();
  for (const r of data ?? []) {
    const row = r as { user_id: string; updated_at?: string | null };
    if (row.user_id) map.set(row.user_id, row.updated_at ?? null);
  }
  return map;
}

/**
 * Résout profiles.battle_tag pour un lot d'user ids (chunké à 500).
 * Renvoie une map user_id -> battle_tag brut.
 */
async function fetchBattleTags(
  userIds: string[]
): Promise<Map<string, string>> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured');
  }
  const battleTagById = new Map<string, string>();
  const CHUNK = 500;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const slice = userIds.slice(i, i + CHUNK);
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, battle_tag')
      .in('id', slice);
    if (profiles) {
      for (const p of profiles) {
        if (p.id && p.battle_tag) {
          battleTagById.set(p.id as string, p.battle_tag as string);
        }
      }
    }
  }
  return battleTagById;
}

/**
 * Résout le label de greeting : prénom depuis battle_tag (avant "#"),
 * fallback display_name, puis null.
 */
function resolveLabel(
  battleTag: string | undefined,
  displayName: string | null
): string | null {
  if (battleTag) {
    return battleTag.split('#')[0]?.trim() || battleTag;
  }
  if (displayName) {
    return displayName.trim() || null;
  }
  return null;
}

/**
 * Calcule la liste des destinataires éligibles pour une audience donnée.
 * - Itère auth.users (paginé), filtre les comptes confirmés
 * - Récupère profiles.battle_tag pour le greeting (split sur "#")
 * - Fallback sur user_metadata.display_name puis null
 * - Exclut les opt-out RGPD broadcast (UNE requête, pas de N+1)
 */
export async function computeAudienceRecipients(
  audience: CampaignAudience
): Promise<ComputedRecipient[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured');
  }
  if (audience !== 'all-confirmed-users') {
    throw new Error(`Unsupported audience: ${audience}`);
  }

  const confirmed = await listConfirmedUsers();
  const optedOut = await fetchBroadcastOptOuts();
  const eligible =
    optedOut.size > 0
      ? confirmed.filter((u) => !optedOut.has(u.id))
      : confirmed;

  const battleTagById = await fetchBattleTags(eligible.map((u) => u.id));

  return eligible.map((u) => ({
    user_id: u.id,
    email: u.email,
    label: resolveLabel(battleTagById.get(u.id), u.display_name),
  }));
}

export type UnsubscribedUser = {
  email: string;
  label: string | null;
  unsubscribedAt: string | null;
};

export type SubscriptionStats = {
  totalConfirmed: number;
  subscribed: number;
  unsubscribed: number;
  unsubscribedUsers: UnsubscribedUser[];
};

/**
 * Statistiques d'abonnement broadcast pour le dashboard staff.
 * - Compteurs calculés UNIQUEMENT sur les comptes confirmés (cohérent avec
 *   l'audience réelle) : un opt-out d'un compte non-confirmé/supprimé est
 *   ignoré des compteurs.
 * - `unsubscribedUsers` trié par date de désinscription décroissante
 *   (les plus récents d'abord ; null en dernier).
 */
export async function computeSubscriptionStats(): Promise<SubscriptionStats> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured');
  }

  const optedOut = await fetchBroadcastOptOuts();

  // Total des comptes confirmés via un RPC de comptage SQL, au lieu d'énumérer
  // toute la table auth.users (paginée 1000/page) juste pour un compteur.
  // Fail-safe : si le RPC n'est pas encore déployé (ou échoue), on retombe sur
  // l'ancien comportement (énumération complète), qui produit exactement la
  // même sortie.
  let totalConfirmed: number | null = null;
  try {
    const { data, error } = await supabaseAdmin.rpc(
      'count_confirmed_auth_users'
    );
    if (error) {
      logger.error('[broadcasts] count_confirmed_auth_users RPC error:', error);
    } else if (data != null) {
      const n = Number(data);
      if (Number.isFinite(n)) totalConfirmed = n;
    }
  } catch (err) {
    logger.error('[broadcasts] count_confirmed_auth_users RPC threw:', err);
  }

  if (totalConfirmed === null) {
    return computeSubscriptionStatsByEnumeration(optedOut);
  }

  // Chemin optimisé : le total vient du RPC. On ne résout email + label que
  // pour le sous-ensemble désabonné confirmé (petit), sans énumérer l'intégralité
  // de auth.users.
  const unsubConfirmed = await fetchConfirmedUsersByIds(
    Array.from(optedOut.keys())
  );
  const battleTagById = await fetchBattleTags(unsubConfirmed.map((u) => u.id));

  const unsubscribedUsers: UnsubscribedUser[] = unsubConfirmed.map((u) => ({
    email: u.email,
    label: resolveLabel(battleTagById.get(u.id), u.display_name),
    unsubscribedAt: optedOut.get(u.id) ?? null,
  }));

  sortUnsubscribedUsers(unsubscribedUsers);

  const unsubscribed = unsubscribedUsers.length;
  const subscribed = Math.max(0, totalConfirmed - unsubscribed);
  return {
    totalConfirmed,
    subscribed,
    unsubscribed,
    unsubscribedUsers,
  };
}

/**
 * Ancien chemin : énumère l'intégralité des comptes confirmés pour dériver les
 * compteurs. Conservé comme fallback quand le RPC `count_confirmed_auth_users`
 * n'est pas disponible. Produit une sortie strictement identique à l'historique.
 */
async function computeSubscriptionStatsByEnumeration(
  optedOut: Map<string, string | null>
): Promise<SubscriptionStats> {
  const confirmed = await listConfirmedUsers();

  // On ne résout les battle_tags que pour les désabonnés confirmés (le seul
  // sous-ensemble dont on expose le label).
  const unsubConfirmed = confirmed.filter((u) => optedOut.has(u.id));
  const battleTagById = await fetchBattleTags(unsubConfirmed.map((u) => u.id));

  let subscribed = 0;
  const unsubscribedUsers: UnsubscribedUser[] = [];
  for (const u of confirmed) {
    if (optedOut.has(u.id)) {
      unsubscribedUsers.push({
        email: u.email,
        label: resolveLabel(battleTagById.get(u.id), u.display_name),
        unsubscribedAt: optedOut.get(u.id) ?? null,
      });
    } else {
      subscribed += 1;
    }
  }

  sortUnsubscribedUsers(unsubscribedUsers);

  const unsubscribed = unsubscribedUsers.length;
  return {
    totalConfirmed: subscribed + unsubscribed,
    subscribed,
    unsubscribed,
    unsubscribedUsers,
  };
}

/** Tri par date de désinscription décroissante ; null en dernier. */
function sortUnsubscribedUsers(users: UnsubscribedUser[]): void {
  users.sort((a, b) => {
    if (a.unsubscribedAt === b.unsubscribedAt) return 0;
    if (a.unsubscribedAt === null) return 1;
    if (b.unsubscribedAt === null) return -1;
    return a.unsubscribedAt < b.unsubscribedAt ? 1 : -1;
  });
}

export type WaveResult = {
  campaignId: string;
  status: 'scheduled' | 'completed' | 'paused' | 'idle';
  waveSize: number;
  attempted: number;
  sent: number;
  failed: number;
  remainingPending: number;
};

/**
 * Traite la prochaine vague d'une campagne planifiée :
 * - lit broadcast_schedules pour vérifier que la campagne est 'scheduled'
 * - tire wave_size recipients pending (FIFO sur created_at)
 * - envoie chaque email, marque sent/failed dans broadcast_recipients
 * - met à jour last_wave_at, et passe le status à 'completed' s'il n'y a
 *   plus de pending
 *
 * Retourne null si la campagne n'a pas de planning actif (skipped sans erreur).
 */
export async function processCampaignWave(
  campaignId: string
): Promise<WaveResult | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured');
  }
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    throw new Error(`Unknown campaign: ${campaignId}`);
  }

  const { data: schedule, error: schedErr } = await supabaseAdmin
    .from('broadcast_schedules')
    .select('campaign_id, wave_size, status')
    .eq('campaign_id', campaignId)
    .maybeSingle();

  if (schedErr) throw schedErr;
  if (!schedule) return null;
  if (schedule.status !== 'scheduled') {
    return {
      campaignId,
      status: schedule.status as WaveResult['status'],
      waveSize: schedule.wave_size,
      attempted: 0,
      sent: 0,
      failed: 0,
      remainingPending: 0,
    };
  }

  const waveSize = schedule.wave_size as number;

  const { data: pending, error: pendErr } = await supabaseAdmin
    .from('broadcast_recipients')
    .select('user_id, email, label')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(waveSize);

  if (pendErr) throw pendErr;

  let sent = 0;
  let failed = 0;
  const nowIso = new Date().toISOString();

  for (const r of pending ?? []) {
    let success = false;
    let errorMsg: string | null = null;
    try {
      const unsubscribeUrl = buildBroadcastUnsubscribeUrl(r.user_id as string);
      const result = await campaign.send(
        r.email as string,
        (r.label as string | null) ?? null,
        unsubscribeUrl
      );
      success = result.success;
      if (!success) errorMsg = result.error ?? 'unknown error';
    } catch (err: unknown) {
      errorMsg = (err as Error).message;
    }

    const { error: updErr } = await supabaseAdmin
      .from('broadcast_recipients')
      .update({
        status: success ? 'sent' : 'failed',
        sent_at: nowIso,
        error: errorMsg,
      })
      .eq('campaign_id', campaignId)
      .eq('user_id', r.user_id as string);

    if (updErr) {
      logger.error('[broadcast/wave] update recipient error:', updErr);
    }

    if (success) sent++;
    else failed++;
  }

  // Compte les pending restants pour décider du status final
  const { count: remainingPending } = await supabaseAdmin
    .from('broadcast_recipients')
    .select('user_id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending');

  const newStatus: 'scheduled' | 'completed' =
    (remainingPending ?? 0) > 0 ? 'scheduled' : 'completed';

  await supabaseAdmin
    .from('broadcast_schedules')
    .update({
      status: newStatus,
      last_wave_at: nowIso,
      updated_at: nowIso,
    })
    .eq('campaign_id', campaignId);

  return {
    campaignId,
    status: newStatus,
    waveSize,
    attempted: pending?.length ?? 0,
    sent,
    failed,
    remainingPending: remainingPending ?? 0,
  };
}
