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
import {
  generateUnsubscribeToken,
  generateEmailUnsubscribeToken,
} from './emailUnsubscribe';
import { BROADCAST_OPT_OUT_EVENT_TYPE } from './webPushEvents';
import { slugifyCampaignName } from './campaignSchema';
import { DEFAULT_TENANT_ID } from './tenant';
import { resolveCurrentTournamentId } from './currentTournament';

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

/**
 * Variante EMAIL de l'URL de désinscription broadcast : pour un destinataire
 * SANS compte auth (ex. adhérent·e importé·e). Le token encode l'email (champ
 * `e`) au lieu d'un userId ; l'endpoint /api/email/unsubscribe route alors vers
 * broadcast_email_optouts. Même `&scope=broadcast` que la variante user.
 */
export function buildEmailUnsubscribeUrl(email: string): string {
  return `${SITE_URL.replace(/\/$/, '')}/api/email/unsubscribe?token=${generateEmailUnsubscribeToken(
    email
  )}&scope=broadcast`;
}

/**
 * Construit l'URL de désinscription broadcast adaptée au TYPE de destinataire :
 * - `user_id` présent → token user (compte auth, opt-out en notification_prefs)
 * - sinon → token email (destinataire sans compte, opt-out en
 *   broadcast_email_optouts)
 * Garantit qu'un lien de désinscription fonctionnel existe pour CHAQUE
 * destinataire réel, qu'il ait un compte ou non.
 */
export function buildRecipientUnsubscribeUrl(recipient: {
  user_id: string | null;
  email: string;
}): string {
  return recipient.user_id
    ? buildBroadcastUnsubscribeUrl(recipient.user_id)
    : buildEmailUnsubscribeUrl(recipient.email);
}

export type CampaignAudience =
  | 'all-confirmed-users'
  | 'team-captains'
  | 'team-members'
  | 'staff'
  | 'adherents'
  // Relance : inscrit·es au tournoi en cours qui n'ont JAMAIS ouvert de session.
  | 'tournament-never-logged-in'
  // Relance : capitaines d'une équipe inscrite dont le roster est incomplet.
  | 'tournament-captains-incomplete-roster'
  // Newsletter externe (abonné·es sans compte site) + combinaisons.
  | 'newsletter'
  | 'all-plus-newsletter'
  | 'adherents-plus-newsletter';
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
  /**
   * Compte auth du destinataire, ou `null` pour un destinataire « email direct »
   * (audience `adherents` sans compte lié). `null` ⇒ l'URL de désinscription
   * passe par un token EMAIL (cf. buildRecipientUnsubscribeUrl).
   */
  user_id: string | null;
  email: string;
  label: string | null;
  /**
   * Date de création du compte (ISO) — sert au calcul « nouveaux inscrits »
   * (compte créé après le dernier envoi). `null` si inconnue (destinataire
   * email-only sans date, ou source qui ne l'expose pas).
   */
  createdAt?: string | null;
};

/** Un compte confirmé, projeté sur les seules colonnes utiles ici. */
type ConfirmedUser = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string | null;
  /**
   * Dernière ouverture de session (ISO) ou `null` si le compte n'a JAMAIS été
   * utilisé pour se connecter — critère de l'audience de relance
   * `tournament-never-logged-in`.
   */
  last_sign_in_at?: string | null;
};

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
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
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
      created_at: u.created_at ?? null,
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
 * Charge en UNE requête l'ensemble des opt-out RGPD broadcast keyés par EMAIL
 * (broadcast_email_optouts). Pendant email-only de fetchBroadcastOptOuts (keyé
 * user_id). Renvoie un Set d'emails en minuscules. Consommé par l'audience
 * `adherents` (destinataires souvent sans compte auth).
 */
async function fetchBroadcastEmailOptOuts(): Promise<Set<string>> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured');
  }
  const { data, error } = await supabaseAdmin
    .from('broadcast_email_optouts')
    .select('email');
  if (error) throw error;
  const set = new Set<string>();
  for (const r of data ?? []) {
    const email = (r as { email?: string | null }).email;
    if (email) set.add(email.trim().toLowerCase());
  }
  return set;
}

/**
 * Résout l'ensemble des auth user ids capitaines d'une équipe active. Catalogue
 * broadcast GLOBAL → PAS de filtre tenant. Dédup implicite (Set).
 */
async function listTeamCaptainIds(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin!
    .from('teams')
    .select('captain_id')
    .eq('is_active', true)
    .is('deleted_at', null);
  if (error) throw error;
  const set = new Set<string>();
  for (const r of data ?? []) {
    const id = (r as { captain_id?: string | null }).captain_id;
    if (id) set.add(id);
  }
  return set;
}

/**
 * Résout l'ensemble des auth user ids membres d'une équipe (toutes équipes,
 * global). team_members n'a pas de colonne deleted_at → pas de filtre soft-delete.
 */
async function listTeamMemberIds(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin!
    .from('team_members')
    .select('user_id');
  if (error) throw error;
  const set = new Set<string>();
  for (const r of data ?? []) {
    const id = (r as { user_id?: string | null }).user_id;
    if (id) set.add(id);
  }
  return set;
}

/**
 * Résout l'ensemble des auth user ids du staff actif (non soft-deleted). Global.
 */
async function listStaffAuthUserIds(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin!
    .from('staff')
    .select('auth_user_id')
    .eq('is_active', true)
    .is('deleted_at', null);
  if (error) throw error;
  const set = new Set<string>();
  for (const r of data ?? []) {
    const id = (r as { auth_user_id?: string | null }).auth_user_id;
    if (id) set.add(id);
  }
  return set;
}

/**
 * Résout l'ensemble des auth user ids inscrit·es au tournoi EN COURS : membres
 * (titulaires + remplaçant·es) des équipes présentes dans tournament_teams pour
 * le tournoi résolu par `resolveCurrentTournamentId` (tenant par défaut).
 * Renvoie un Set vide si aucun tournoi actif — l'audience est alors vide, ce qui
 * est le comportement voulu (pas de relance hors période de tournoi).
 */
async function listCurrentTournamentMemberIds(): Promise<Set<string>> {
  const set = new Set<string>();
  const tournamentId = await resolveCurrentTournamentId();
  if (!tournamentId) return set;

  const { data: entries, error: entriesError } = await supabaseAdmin!
    .from('tournament_teams')
    .select('team_id')
    .eq('tournament_id', tournamentId);
  if (entriesError) throw entriesError;

  const teamIds = (entries ?? [])
    .map((r) => (r as { team_id?: string | null }).team_id)
    .filter((id): id is string => Boolean(id));
  if (teamIds.length === 0) return set;

  const { data: members, error: membersError } = await supabaseAdmin!
    .from('team_members')
    .select('user_id')
    .in('team_id', teamIds);
  if (membersError) throw membersError;

  for (const r of members ?? []) {
    const id = (r as { user_id?: string | null }).user_id;
    if (id) set.add(id);
  }
  return set;
}

/**
 * Résout l'ensemble des auth user ids des CAPITAINES d'équipes inscrites au
 * tournoi en cours dont le roster est INCOMPLET : moins de `min_players`
 * titulaires (les remplaçant·es, `is_substitute`, ne comptent pas — l'objet de
 * la relance est « as-tu assez de titulaires pour jouer »). Les équipes sans
 * aucun membre sont incluses (compte = 0).
 *
 * Garde-fou : si le tournoi ne déclare PAS de `min_players`, il n'y a aucun
 * seuil objectif de complétude → audience vide plutôt qu'une relance à
 * l'aveugle. Idem hors période de tournoi.
 */
async function listIncompleteRosterCaptainIds(): Promise<Set<string>> {
  const set = new Set<string>();
  const tournamentId = await resolveCurrentTournamentId();
  if (!tournamentId) return set;

  const { data: tournament, error: tournamentError } = await supabaseAdmin!
    .from('tournaments')
    .select('id, min_players')
    .eq('id', tournamentId)
    .maybeSingle();
  if (tournamentError) throw tournamentError;

  const minPlayers = (tournament as { min_players?: number | null } | null)
    ?.min_players;
  if (!minPlayers || minPlayers < 1) return set;

  const { data: entries, error: entriesError } = await supabaseAdmin!
    .from('tournament_teams')
    .select('team_id')
    .eq('tournament_id', tournamentId);
  if (entriesError) throw entriesError;

  const teamIds = (entries ?? [])
    .map((r) => (r as { team_id?: string | null }).team_id)
    .filter((id): id is string => Boolean(id));
  if (teamIds.length === 0) return set;

  const { data: teams, error: teamsError } = await supabaseAdmin!
    .from('teams')
    .select('id, captain_id')
    .in('id', teamIds)
    .eq('is_active', true)
    .is('deleted_at', null);
  if (teamsError) throw teamsError;

  const { data: members, error: membersError } = await supabaseAdmin!
    .from('team_members')
    .select('team_id, is_substitute')
    .in('team_id', teamIds);
  if (membersError) throw membersError;

  const starterCountByTeam = new Map<string, number>();
  for (const r of members ?? []) {
    const row = r as { team_id?: string | null; is_substitute?: boolean | null };
    if (!row.team_id || row.is_substitute) continue;
    starterCountByTeam.set(
      row.team_id,
      (starterCountByTeam.get(row.team_id) ?? 0) + 1
    );
  }

  for (const r of teams ?? []) {
    const team = r as { id?: string | null; captain_id?: string | null };
    if (!team.id || !team.captain_id) continue;
    if ((starterCountByTeam.get(team.id) ?? 0) < minPlayers) {
      set.add(team.captain_id);
    }
  }
  return set;
}

/**
 * Destinataires « comptes confirmés » filtrés à un sous-ensemble d'auth user ids
 * (`idSet = null` ⇒ tous les confirmés, chemin all-confirmed-users). Réutilise
 * le pipeline commun : confirmés − opt-out broadcast, label via battle-tag.
 * `opts.neverSignedIn` restreint en plus aux comptes qui n'ont JAMAIS ouvert de
 * session (`last_sign_in_at` absent) — audience de relance.
 */
async function computeConfirmedRecipients(
  idSet: Set<string> | null,
  opts: { neverSignedIn?: boolean } = {}
): Promise<ComputedRecipient[]> {
  const confirmed = await listConfirmedUsers();
  const optedOut = await fetchBroadcastOptOuts();
  const eligible = confirmed.filter(
    (u) =>
      (idSet === null || idSet.has(u.id)) &&
      !optedOut.has(u.id) &&
      (!opts.neverSignedIn || !u.last_sign_in_at)
  );

  const battleTagById = await fetchBattleTags(eligible.map((u) => u.id));

  return eligible.map((u) => ({
    user_id: u.id,
    email: u.email,
    label: resolveLabel(battleTagById.get(u.id), u.display_name),
    createdAt: u.created_at,
  }));
}

/**
 * Destinataires de l'audience `adherents` : audience « email direct » — les
 * cibles n'ont souvent PAS de compte auth. Sélectionne les adhérent·es actif·ves
 * à jour de cotisation (paid), dédupe par lower(email), exclut les emails
 * présents dans broadcast_email_optouts. `user_id` = auth_user_id ?? null (⇒
 * l'unsubscribe route vers un token email quand le compte n'est pas lié).
 */
async function computeAdherentRecipients(): Promise<ComputedRecipient[]> {
  const { data, error } = await supabaseAdmin!
    .from('adherents')
    .select('first_name,last_name,email,auth_user_id,created_at')
    .is('deleted_at', null)
    .eq('is_active', true)
    .eq('payment_status', 'paid');
  if (error) throw error;

  const optedOut = await fetchBroadcastEmailOptOuts();
  const byEmail = new Map<string, ComputedRecipient>();

  for (const r of data ?? []) {
    const row = r as {
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      auth_user_id?: string | null;
      created_at?: string | null;
    };
    if (!row.email) continue;
    const lower = row.email.trim().toLowerCase();
    if (!lower) continue;
    if (optedOut.has(lower)) continue;
    if (byEmail.has(lower)) continue; // dédup par lower(email)

    const label =
      `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || null;
    byEmail.set(lower, {
      user_id: row.auth_user_id ?? null,
      email: row.email,
      label,
      createdAt: row.created_at ?? null,
    });
  }

  return Array.from(byEmail.values());
}

/**
 * Destinataires de l'audience `newsletter` : abonné·es newsletter EXTERNES
 * (sans compte site), double opt-in → on ne garde que `status='confirmed'`.
 * Audience « email direct » (user_id null ⇒ unsubscribe via token email).
 * Scopée au tenant courant (DEFAULT_TENANT_ID), dédup par lower(email), exclut
 * les emails désinscrits (broadcast_email_optouts).
 */
async function computeNewsletterRecipients(): Promise<ComputedRecipient[]> {
  const { data, error } = await supabaseAdmin!
    .from('newsletter_subscribers')
    .select('email, confirmed_at, created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('status', 'confirmed');
  if (error) throw error;

  const optedOut = await fetchBroadcastEmailOptOuts();
  const byEmail = new Map<string, ComputedRecipient>();
  for (const r of data ?? []) {
    const row = r as {
      email?: string | null;
      confirmed_at?: string | null;
      created_at?: string | null;
    };
    if (!row.email) continue;
    const lower = row.email.trim().toLowerCase();
    if (!lower || optedOut.has(lower) || byEmail.has(lower)) continue;
    byEmail.set(lower, {
      user_id: null,
      email: row.email,
      label: null,
      createdAt: row.confirmed_at ?? row.created_at ?? null,
    });
  }
  return Array.from(byEmail.values());
}

/**
 * Fusionne plusieurs listes de destinataires en dédupliquant par lower(email).
 * En cas de doublon d'email, on PRÉFÈRE le destinataire AVEC compte auth
 * (user_id présent) — greeting personnalisé + unsubscribe user plutôt qu'email.
 * L'ordre des listes fait foi pour la 1re occurrence ; un compte remplace une
 * entrée email-only déjà vue.
 */
function mergeRecipientsByEmail(
  ...lists: ComputedRecipient[][]
): ComputedRecipient[] {
  const byEmail = new Map<string, ComputedRecipient>();
  for (const list of lists) {
    for (const r of list) {
      const key = r.email.trim().toLowerCase();
      if (!key) continue;
      const existing = byEmail.get(key);
      if (!existing) {
        byEmail.set(key, r);
      } else if (!existing.user_id && r.user_id) {
        byEmail.set(key, r); // un compte auth supplante une entrée email-only
      }
    }
  }
  return Array.from(byEmail.values());
}

/**
 * Calcule la liste des destinataires éligibles pour une audience donnée.
 *
 * Deux familles d'audiences :
 * - « comptes auth » (all-confirmed-users, team-captains, team-members, staff,
 *   tournament-never-logged-in, tournament-captains-incomplete-roster) :
 *   résout un Set<authUserId>, filtre les comptes confirmés à ce set, retire les
 *   opt-out RGPD broadcast (notification_prefs), label via profiles.battle_tag
 *   (fallback display_name). Catalogue broadcast GLOBAL → aucun filtre tenant.
 * - « email direct » (adherents) : destinataires souvent sans compte auth,
 *   filtrés par cotisation payée, dédupés par email, opt-out via
 *   broadcast_email_optouts.
 */
export async function computeAudienceRecipients(
  audience: CampaignAudience
): Promise<ComputedRecipient[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured');
  }

  switch (audience) {
    case 'all-confirmed-users':
      return computeConfirmedRecipients(null);
    case 'team-captains':
      return computeConfirmedRecipients(await listTeamCaptainIds());
    case 'team-members':
      return computeConfirmedRecipients(await listTeamMemberIds());
    case 'staff':
      return computeConfirmedRecipients(await listStaffAuthUserIds());
    case 'tournament-never-logged-in':
      return computeConfirmedRecipients(
        await listCurrentTournamentMemberIds(),
        { neverSignedIn: true }
      );
    case 'tournament-captains-incomplete-roster':
      return computeConfirmedRecipients(await listIncompleteRosterCaptainIds());
    case 'adherents':
      return computeAdherentRecipients();
    case 'newsletter':
      return computeNewsletterRecipients();
    case 'all-plus-newsletter':
      return mergeRecipientsByEmail(
        await computeConfirmedRecipients(null),
        await computeNewsletterRecipients()
      );
    case 'adherents-plus-newsletter':
      return mergeRecipientsByEmail(
        await computeAdherentRecipients(),
        await computeNewsletterRecipients()
      );
    default:
      throw new Error(`Unsupported audience: ${audience as string}`);
  }
}

/**
 * Résout l'ensemble des auth user ids déjà marqués `sent` pour une campagne
 * dans broadcast_recipients (paginé). C'est la référence du diff « nouveaux
 * inscrits » : un id présent ici a déjà reçu l'email (envoi direct enregistré
 * via recordSentRecipients OU vague planifiée passée à sent).
 */
async function fetchSentRecipientIds(campaignId: string): Promise<Set<string>> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured');
  }
  const ids = new Set<string>();
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('broadcast_recipients')
      .select('user_id')
      .eq('campaign_id', campaignId)
      .eq('status', 'sent')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    for (const r of batch) {
      const id = (r as { user_id?: string | null }).user_id;
      if (id) ids.add(id);
    }
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return ids;
}

/**
 * Résout la date du DERNIER envoi d'une campagne (high-water mark), en prenant
 * le max de deux sources :
 *  - staff_logs (entity_type='broadcast', payload.campaign=id) : chaque envoi
 *    direct/vague y logge un agrégat daté — SEULE trace des envois historiques
 *    (avant la trace par-destinataire).
 *  - broadcast_recipients.sent_at (status='sent') : trace par-destinataire des
 *    envois récents (envoi direct enregistré / vagues).
 * Renvoie l'ISO le plus récent, ou null si la campagne n'a jamais été envoyée.
 */
async function fetchLastSentAt(campaignId: string): Promise<string | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured');
  }
  let last: number | null = null;
  const consider = (iso: string | null | undefined) => {
    if (!iso) return;
    const t = Date.parse(iso);
    if (Number.isFinite(t) && (last === null || t > last)) last = t;
  };

  const { data: logs, error: logErr } = await supabaseAdmin
    .from('staff_logs')
    .select('created_at')
    .eq('entity_type', 'broadcast')
    .filter('payload->>campaign', 'eq', campaignId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (logErr) throw logErr;
  consider((logs?.[0] as { created_at?: string | null } | undefined)?.created_at);

  const { data: recs, error: recErr } = await supabaseAdmin
    .from('broadcast_recipients')
    .select('sent_at')
    .eq('campaign_id', campaignId)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1);
  if (recErr) throw recErr;
  consider((recs?.[0] as { sent_at?: string | null } | undefined)?.sent_at);

  return last === null ? null : new Date(last).toISOString();
}

export type NewRecipientsResult = {
  /**
   * Destinataires de l'audience ACTUELLE qui ont rejoint APRÈS le dernier envoi
   * (compte créé après le high-water mark) — la cible de « nouveaux inscrits ».
   */
  newRecipients: ComputedRecipient[];
  /** Taille de l'audience résolue, tous types de destinataires confondus. */
  audienceTotal: number;
  /** Destinataires AVEC compte déjà présents au dernier envoi (donc exclus). */
  alreadySent: number;
  /**
   * Destinataires email-only (sans compte auth, ex. adhérent·es) écartés :
   * pas de date de compte fiable pour le diff « nouvel inscrit ». Compté,
   * jamais droppé en silence.
   */
  emailOnlyExcluded: number;
  /** Date du dernier envoi (ISO) retenue comme seuil, ou null si jamais envoyée. */
  lastSentAt: string | null;
};

/**
 * Calcule les « nouveaux inscrits » d'une campagne : les destinataires de
 * l'audience ACTUELLE dont le COMPTE a été créé APRÈS le dernier envoi
 * (high-water mark daté). Alimente le bouton « Envoyer aux nouveaux inscrits »
 * — on ne renvoie qu'aux comptes qui ont rejoint depuis, sans re-spammer les
 * anciens.
 *
 * Pourquoi date-based (et non un diff d'identités) : les envois HISTORIQUES ne
 * laissent souvent qu'un compteur agrégé dans staff_logs (aucune ligne
 * broadcast_recipients). Un diff par identité compterait alors TOUTE l'audience
 * comme « nouvelle ». Le seuil daté (dernier envoi) donne le vrai nombre de
 * nouveaux inscrits (ex. 37 confirmés − 32 présents au dernier envoi = 5).
 *
 * Robustesse : on exclut aussi les comptes déjà tracés `sent`
 * (broadcast_recipients) le cas échéant. Si la campagne n'a JAMAIS été envoyée
 * (lastSentAt null), tout le monde est nouveau. Les destinataires email-only
 * sont exclus (emailOnlyExcluded).
 */
export async function computeNewRecipients(
  campaignId: string,
  audience: CampaignAudience
): Promise<NewRecipientsResult> {
  const recipients = await computeAudienceRecipients(audience);
  const [lastSentAt, sentIds] = await Promise.all([
    fetchLastSentAt(campaignId),
    fetchSentRecipientIds(campaignId),
  ]);
  const thresholdMs = lastSentAt ? Date.parse(lastSentAt) : null;

  let emailOnlyExcluded = 0;
  const accountBased: (ComputedRecipient & { user_id: string })[] = [];
  for (const r of recipients) {
    if (r.user_id) {
      accountBased.push(r as ComputedRecipient & { user_id: string });
    } else {
      emailOnlyExcluded += 1;
    }
  }

  const newRecipients = accountBased.filter((r) => {
    if (sentIds.has(r.user_id)) return false; // déjà tracé sent
    if (thresholdMs === null) return true; // jamais envoyée → tout est nouveau
    const created = r.createdAt ? Date.parse(r.createdAt) : NaN;
    // Compte créé strictement après le dernier envoi = nouvel inscrit.
    return Number.isFinite(created) && created > thresholdMs;
  });

  return {
    newRecipients,
    audienceTotal: recipients.length,
    alreadySent: accountBased.length - newRecipients.length,
    emailOnlyExcluded,
    lastSentAt,
  };
}

/**
 * Enregistre des destinataires comme `sent` dans broadcast_recipients (upsert
 * idempotent, chunké). Appelé après un envoi direct réussi pour amorcer / tenir
 * à jour la trace par-destinataire que computeNewRecipients soustrait ensuite.
 * N'enregistre que les destinataires AVEC compte (user_id NOT NULL) ; les
 * email-only sont ignorés (comptés dans `skippedEmailOnly`).
 */
export async function recordSentRecipients(
  campaignId: string,
  recipients: ComputedRecipient[]
): Promise<{ recorded: number; skippedEmailOnly: number }> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured');
  }
  const nowIso = new Date().toISOString();
  const rows = recipients
    .filter((r) => r.user_id)
    .map((r) => ({
      campaign_id: campaignId,
      user_id: r.user_id as string,
      email: r.email,
      label: r.label,
      status: 'sent' as const,
      sent_at: nowIso,
      error: null,
    }));
  const skippedEmailOnly = recipients.length - rows.length;

  const CHUNK = 500;
  let recorded = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error, count } = await supabaseAdmin
      .from('broadcast_recipients')
      .upsert(slice, { onConflict: 'campaign_id,user_id', count: 'exact' });
    if (error) throw error;
    recorded += count ?? slice.length;
  }
  return { recorded, skippedEmailOnly };
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
      const unsubscribeUrl = buildRecipientUnsubscribeUrl({
        user_id: (r.user_id as string | null) ?? null,
        email: r.email as string,
      });
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
