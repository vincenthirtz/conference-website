import type { NextApiRequest, NextApiResponse } from 'next';
import slugify from 'slugify';
import { supabaseAdmin } from '@/utils/supabase';
import { findOrCreateUserByEmail } from '@/utils/find-or-create-user';
import {
  sendTeamJoinEmail,
  sendTeamAccessEmail,
  sendTeamInviteLinkEmail,
} from '@/utils/email';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  sanitizeUrl,
  validateRole,
  validateSpecialty,
  validateExistingUserId,
} from '@/utils/apiHelpers';
import { emitBotEvent } from '@/utils/botEvents';
import { createInvitation } from '@/utils/teams/invitations';
import {
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
} from '@/utils/teams/inviteLinks';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { alertIfBlacklisted } from '@/utils/moderation/blacklist';
import { getDiscordLinkForUser } from '@/utils/discordLinks';
import { alertIfEntityBlacklisted } from '@/utils/moderation/entityBlacklist';
import { verifyCaptcha } from '@/utils/captcha';
import {
  roleRequiresBattleTag,
  isNonPlayingTeamRole,
  countPlayingMembers,
} from '@/utils/teams/addMember';
import { MAX_TEAM_PLAYERS } from '@/utils/constants';
import {
  validateFieldDefinitions,
  validateRegistrationAnswers,
  type RegistrationAnswers,
} from '@/utils/registrationFields';

import { logger } from '../../../utils/logger';

// Résolution SITE_URL : même convention que utils/email.ts / forgot-password.ts.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  'https://owwomenscup.fr';

/** Même forme que la validation client (pages/team/create.tsx). */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Plafond ABSOLU de lignes de roster acceptées en une requête, encadrement
 * compris — garde-fou anti-abus d'un endpoint public qui crée des comptes auth.
 * Volontairement plus large que MAX_TEAM_PLAYERS : une équipe complète peut
 * légitimement déclarer un coach et un manager en plus de ses 5 joueuses.
 */
const MAX_ROSTER_ROWS = 10;

/**
 * Masque un email pour l'exposer côté client sans divulguer l'adresse complète :
 * "alice@domain.com" -> "a***@domain.com". Le token magic-link n'est JAMAIS
 * renvoyé — seul l'email masqué confirme où le lien a été envoyé.
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const first = local.slice(0, 1) || '*';
  return `${first}***@${domain}`;
}

type Body = {
  name?: string;
  short_name?: string | null;
  logo_url?: string | null;
  country?: string | null;
  description?: string | null;
  discord?: string | null;
  website?: string | null;
  member_email?: string | null;
  member_role?: string | null;
  member_user_id?: string | null;
  member_battle_tag?: string | null;
  member_specialty?: string | null;
  set_captain?: boolean;
  members?: MemberInput[];
  /**
   * Création « en tant que manager » : email de la personne qui crée l'équipe
   * sans y jouer. Elle est insérée directement dans `team_members` avec le rôle
   * `manager` (rôle à permissions, cf. utils/teamRoles.ts) et reçoit le
   * magic-link d'accès à l'espace équipe. Toutes les joueuses du roster — y
   * compris la capitaine désignée — sont alors INVITÉES (consentement requis),
   * et `teams.captain_id` reste NULL jusqu'à ce que la capitaine désignée
   * accepte (cf. `set_captain` dans le payload d'invitation).
   */
  manager_email?: string | null;
  tournament_id?: string | null;
  /** Réponses aux champs d'inscription personnalisés du tournoi (Flow A). */
  field_values?: Record<string, unknown> | null;
  // Anti-abuse : ce endpoint est PUBLIC (flux d'inscription anonyme, cf.
  // pages/team/create.tsx — page "Créer une équipe" sans session). Il peut
  // créer des comptes auth à partir des emails du roster
  // (findOrCreateUserByEmail) et envoyer des emails. On exige donc un captcha
  // HMAC (challenge GET /api/captcha) + un honeypot AVANT toute résolution ou
  // création d'utilisateur, sur le même modèle que pages/api/news/comments.ts.
  honeypot?: string | null;
  captchaToken?: string | null;
  captchaAnswer?: string | null;
};

type MemberInput = {
  email?: string | null;
  user_id?: string | null;
  role?: string | null;
  set_captain?: boolean;
  battle_tag?: string | null;
  specialty?: string | null;
};

type MemberResult = {
  id: string | null;
  user_id: string;
  role: string;
  captain: boolean;
  /** Lot 6 : NULL quand l'équipe n'est pas inscrite à un tournoi. */
  battle_tag: string | null;
  /** tank | dps | support | flex | null (spécialité in-game). */
  specialty: string | null;
};

/**
 * Membre INVITÉ (pas inséré) : non-créateur du roster web. Une invitation
 * pending (demandes type='invite') est créée et le membre devra l'accepter.
 */
type InvitedMemberResult = {
  /** id de la demande type='invite' créée, ou null si la création a échoué. */
  invitation_id: string | null;
  user_id: string;
  role: string;
  battle_tag: string | null;
  specialty: string | null;
  /** Renseigné quand l'invitation n'a PAS pu être créée (déjà membre, etc.). */
  skipped_reason?: string;
};

type ApiResponse =
  | {
      team: Record<string, any>;
      members?: MemberResult[];
      invitedMembers?: InvitedMemberResult[];
      tournament?: { tournament_name: string; stages_count: number };
      info?: string;
      /**
       * Pont magic-link : indique si un email d'accès à l'espace équipe a été
       * envoyé au créateur — capitaine, ou manager en mode « je gère l'équipe »
       * (fire-and-forget, non bloquant). `to` = email masqué.
       * Le token_hash n'est jamais exposé.
       */
      accessEmail?: { sent: boolean; to?: string };
    }
  | {
      error: string;
      /** Code machine-readable stable (cf. docs contrat §1). */
      code?: string;
      /** Champ(s) fautif(s) — ex. { logo_url: '…' } pour INVALID_URL. */
      fields?: Record<string, string>;
      fieldErrors?: Record<string, string>;
    };

/**
 * Atterrissage du capitaine après consommation du magic-link. Le `welcome=1`
 * active la carte d'onboarding Battle.net dans /player/manage-team ; il est
 * inerte partout ailleurs.
 */
const CAPTAIN_LANDING = '/player/manage-team?welcome=1';

/**
 * Atterrissage du MANAGER créateur : même espace équipe, sans la carte
 * d'onboarding Battle.net (il ne joue pas, il n'a pas de BattleTag à vérifier).
 */
const MANAGER_LANDING = '/player/manage-team';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res
      .status(405)
      .json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  // Rate limiting (durci) : ce endpoint public crée des équipes ET des comptes
  // auth (via les emails du roster). On garde une fenêtre courte agressive
  // (anti-burst) en plus de la fenêtre horaire (anti-volume soutenu). Le
  // premier des deux seuils atteint bloque (429).
  if (
    applyRateLimit(
      req,
      res,
      { max: 3, windowMs: 5 * 60 * 1000 },
      'create-team-burst'
    )
  )
    return;
  if (
    applyRateLimit(
      req,
      res,
      { max: 5, windowMs: 60 * 60 * 1000 },
      'create-team'
    )
  )
    return;

  if (!supabaseAdmin) {
    return res
      .status(503)
      .json({ error: 'Service unavailable.', code: 'SERVICE_UNAVAILABLE' });
  }

  const body: Body = req.body || {};

  // Anti-bot : honeypot (champ caché jamais rempli par un humain) + captcha
  // HMAC. Vérifiés AVANT toute résolution/création d'utilisateur pour qu'un
  // bot ne puisse pas créer de comptes auth ni déclencher d'emails sans
  // résoudre le challenge. Cohérent avec pages/api/news/comments.ts.
  if (body.honeypot && `${body.honeypot}`.trim().length > 0) {
    return res.status(400).json({ error: 'Bot detected', code: 'HONEYPOT' });
  }
  const captchaResult = verifyCaptcha(
    (body.captchaToken || '').toString(),
    (body.captchaAnswer || '').toString()
  );
  if (!captchaResult.valid) {
    return res.status(400).json({
      error: captchaResult.error || 'Captcha invalide',
      code: 'CAPTCHA_INVALID',
    });
  }

  const tenantId = resolveTenantIdForPublicRequest(req);

  const name = (body.name || '').trim();

  if (!name) {
    return res
      .status(400)
      .json({ error: 'Le nom est requis.', code: 'NAME_REQUIRED' });
  }
  if (name.length < 2) {
    return res.status(400).json({
      error: 'Le nom doit faire au moins 2 caractères.',
      code: 'NAME_TOO_SHORT',
    });
  }
  if (name.length > 100) {
    return res.status(400).json({
      error: 'Le nom ne peut pas dépasser 100 caractères.',
      code: 'NAME_TOO_LONG',
    });
  }

  const description = body.description?.toString().trim() || null;
  if (description && description.length > 2000) {
    return res.status(400).json({
      error: 'La description ne peut pas dépasser 2000 caractères.',
      code: 'DESCRIPTION_TOO_LONG',
    });
  }

  // Valider les URLs
  const urlFields = {
    logo_url: body.logo_url,
    website: body.website,
    discord: body.discord,
  };
  for (const [field, val] of Object.entries(urlFields)) {
    if (val && typeof val === 'string' && val.trim()) {
      if (!sanitizeUrl(val)) {
        return res.status(400).json({
          error: `${field} doit être une URL http(s) valide.`,
          code: 'INVALID_URL',
          fields: { [field]: `${field} doit être une URL http(s) valide.` },
        });
      }
    }
  }

  const memberEmail = body.member_email?.trim().toLowerCase() || null;
  const memberUserId = body.member_user_id?.trim() || null;

  // Mode « créée par un manager » : l'email du manager pilote tout le flux
  // (créateur inséré, destinataire du magic-link, inviteur du roster).
  const managerEmail = body.manager_email?.trim().toLowerCase() || null;
  if (managerEmail && !EMAIL_REGEX.test(managerEmail)) {
    return res.status(400).json({
      error: "L'email du manager est invalide.",
      code: 'MANAGER_EMAIL_INVALID',
      fields: { manager_email: "L'email du manager est invalide." },
    });
  }

  const rawMembers = Array.isArray(body.members) ? body.members : [];
  const cleanedMembers = rawMembers
    .map((m) => ({
      email: m.email?.toString().trim().toLowerCase() || '',
      user_id: m.user_id?.toString().trim() || '',
      role: m.role?.toString().trim() || '',
      set_captain: Boolean(m.set_captain),
      battle_tag: m.battle_tag?.toString().trim() || '',
      specialty: m.specialty?.toString().trim() || '',
    }))
    .filter((m) => m.email || m.user_id);

  // Le plafond porte sur les JOUEUSES, pas sur les lignes. Compter les lignes
  // faisait payer une place de roster à chaque coach ou manager déclaré : un
  // effectif complet (5) plus un coach était rejeté en TOO_MANY_MEMBERS, alors
  // que le wizard — qui applique déjà la bonne règle côté client — laissait
  // saisir la ligne. L'utilisateur voyait donc un formulaire valide refusé à
  // l'envoi, sans comprendre pourquoi.
  //
  // Même définition de « joueuse » que partout ailleurs (countPlayingMembers),
  // et même exemption que le trigger `enforce_team_max_players` en base.
  if (countPlayingMembers(cleanedMembers) > MAX_TEAM_PLAYERS) {
    return res.status(400).json({
      error: `You can add up to ${MAX_TEAM_PLAYERS} players in one request`,
      code: 'TOO_MANY_MEMBERS',
    });
  }

  // Plafond ABSOLU sur le nombre de lignes, encadrement compris. Ce endpoint
  // est PUBLIC et crée des comptes auth à partir des emails reçus : sans borne,
  // « l'encadrement ne compte pas » deviendrait un vecteur d'abus (200 lignes
  // `role: coach` = 200 comptes créés).
  if (cleanedMembers.length > MAX_ROSTER_ROWS) {
    return res.status(400).json({
      error: `You can add up to ${MAX_ROSTER_ROWS} members in one request`,
      code: 'TOO_MANY_MEMBERS',
    });
  }

  const wantsMember = Boolean(
    memberEmail || memberUserId || cleanedMembers.length
  );

  if (body.set_captain && !wantsMember) {
    return res.status(400).json({
      error: 'Provide a member to set as captain',
      code: 'CAPTAIN_REQUIRED',
    });
  }

  // Le manager ne peut pas figurer AUSSI dans le roster : il serait à la fois
  // inviteur et invité (createInvitation refuse l'auto-invitation) et on ne
  // saurait pas quel rôle lui poser. On rejette AVANT toute création de compte.
  if (
    managerEmail &&
    (cleanedMembers.some((m) => m.email === managerEmail) ||
      memberEmail === managerEmail)
  ) {
    return res.status(400).json({
      error:
        "L'email du manager ne peut pas être aussi celui d'une joueuse du roster.",
      code: 'MANAGER_DUPLICATE',
      fields: {
        manager_email: 'Cet email est déjà utilisé par un membre du roster.',
      },
    });
  }

  // Lot 6 : BattleTag obligatoire UNIQUEMENT lors d'une inscription à un
  // tournoi. Hors tournoi (équipe scrim-only ou création sans engagement),
  // le BattleTag reste validé s'il est fourni mais peut être laissé vide.
  const tournamentRequiresBattleTag = !!body.tournament_id?.toString().trim();

  let memberRecords: {
    user_id: string;
    role: string;
    captain: boolean;
    battle_tag: string | null;
    specialty: string | null;
    /**
     * Email saisi pour ce membre, quand il y en a un (chemin `user_id` brut
     * excepté). Porté ici plutôt que re-corrélé plus bas : c'est l'adresse à
     * laquelle part l'invitation — sans elle, l'invitée n'apprend jamais qu'on
     * l'a invitée.
     */
    email: string | null;
  }[] = [];
  const validateBattleTag = (tag: string) => {
    const trimmed = tag.trim();
    const re = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;
    if (!re.test(trimmed)) {
      throw new Error(
        'Invalid BattleTag. Expected format: Name#0000 (alphanumeric + # + 3 to 6 digits).'
      );
    }
    return trimmed;
  };

  // Distingue le code d'erreur BattleTag à partir du message levé par
  // resolveBattleTag : "required" -> manquant (tournoi), sinon format invalide.
  const battleTagErrorCode = (message: string): string =>
    /required/i.test(message) ? 'BATTLETAG_REQUIRED' : 'BATTLETAG_INVALID';

  // Lot 6 helper : valide le BattleTag de manière conditionnelle.
  // - tournoi + rôle jouant : required + format.
  // - coach / manager : toujours optionnel, même à l'inscription — ils ne
  //   comptent pas dans le roster jouant (cf. min_players plus bas).
  // - hors tournoi : optionnel (renvoie null si vide) + format si fourni.
  const resolveBattleTag = (raw: string, role: string): string | null => {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) {
      if (tournamentRequiresBattleTag && roleRequiresBattleTag(role)) {
        throw new Error(
          'BattleTag required for each member when registering to a tournament.'
        );
      }
      return null;
    }
    return validateBattleTag(trimmed);
  };

  if (cleanedMembers.length === 0 && wantsMember) {
    // Fallback to single member fields
    const resolvedRole = validateRole(body.member_role);
    const resolvedSpecialty = validateSpecialty(body.member_specialty);
    const memberBattleTag = body.member_battle_tag?.trim() || '';
    let resolvedBattleTag: string | null;
    try {
      resolvedBattleTag = resolveBattleTag(memberBattleTag, resolvedRole);
    } catch (err: unknown) {
      const message = (err as Error)?.message || 'Invalid BattleTag';
      return res
        .status(400)
        .json({ error: message, code: battleTagErrorCode(message) });
    }
    if (memberUserId) {
      // Anti-abuse : ce endpoint est PUBLIC. Un `user_id` brut fourni par le
      // client ne doit JAMAIS être inséré (ni promu capitaine) sans validation
      // — sinon un attaquant connaissant l'id d'une victime (ces ids fuient,
      // cf. pages/profile.tsx) pourrait l'épingler dans une équipe. Le flux
      // légitime (pages/team/create.tsx) résout par email et n'envoie jamais
      // de `user_id`. On exige donc : UUID valide + utilisateur existant.
      const check = await validateExistingUserId(memberUserId);
      if (!check.ok) {
        return res
          .status(check.status)
          .json({ error: check.error, code: 'INVALID_USER_ID' });
      }
      memberRecords.push({
        user_id: check.userId,
        role: resolvedRole,
        captain: Boolean(body.set_captain),
        battle_tag: resolvedBattleTag,
        specialty: resolvedSpecialty,
        email: memberEmail || null,
      });
    } else if (memberEmail) {
      try {
        const { userId } = await findOrCreateUserByEmail(
          memberEmail,
          resolvedRole
        );

        memberRecords.push({
          user_id: userId,
          role: resolvedRole,
          captain: Boolean(body.set_captain),
          battle_tag: resolvedBattleTag,
          specialty: resolvedSpecialty,
          email: memberEmail,
        });
      } catch (err: unknown) {
        const message =
          (err as Error)?.message ||
          'User lookup failed for the provided email';
        return res.status(500).json({ error: message, code: 'SERVER_ERROR' });
      }
    }
  } else if (cleanedMembers.length > 0) {
    for (const m of cleanedMembers) {
      const resolvedRole = validateRole(m.role);
      const resolvedSpecialty = validateSpecialty(m.specialty);
      let resolvedBattleTag: string | null;
      try {
        resolvedBattleTag = resolveBattleTag(m.battle_tag, resolvedRole);
      } catch (err: unknown) {
        const message = (err as Error)?.message || 'Invalid BattleTag';
        return res
          .status(400)
          .json({ error: message, code: battleTagErrorCode(message) });
      }

      if (m.user_id) {
        // Même garde anti-abuse que le chemin single-member : valider tout
        // `user_id` brut (UUID valide + utilisateur existant) avant insertion /
        // promotion capitaine sur ce endpoint public.
        const check = await validateExistingUserId(m.user_id);
        if (!check.ok) {
          return res
            .status(check.status)
            .json({ error: check.error, code: 'INVALID_USER_ID' });
        }
        memberRecords.push({
          user_id: check.userId,
          role: resolvedRole,
          captain: Boolean(m.set_captain),
          battle_tag: resolvedBattleTag,
          specialty: resolvedSpecialty,
          email: m.email || null,
        });
        continue;
      }

      if (!m.email) continue;

      try {
        const { userId } = await findOrCreateUserByEmail(m.email, resolvedRole);

        memberRecords.push({
          user_id: userId,
          role: resolvedRole,
          captain: Boolean(m.set_captain),
          battle_tag: resolvedBattleTag,
          specialty: resolvedSpecialty,
          email: m.email,
        });
      } catch (err: unknown) {
        const message =
          (err as Error)?.message ||
          'User could not be found or created for one of the provided emails';
        return res.status(500).json({ error: message, code: 'SERVER_ERROR' });
      }
    }
  }

  // Ensure only one captain flag across bulk list (résolu AVANT la création de
  // la team pour pouvoir rejeter un roster sans capitaine sans laisser d'orphelin).
  const firstCaptainIdx = memberRecords.findIndex((m) => m.captain);
  const captainUserId =
    firstCaptainIdx >= 0 ? memberRecords[firstCaptainIdx].user_id : null;
  memberRecords = memberRecords.map((m, idx) => ({
    ...m,
    captain: firstCaptainIdx === idx && m.captain,
  }));

  // Mode manager : on résout (ou crée) son compte AVANT la création de l'équipe
  // pour pouvoir échouer sans laisser d'orphelin.
  let managerUserId: string | null = null;
  if (managerEmail) {
    try {
      const { userId } = await findOrCreateUserByEmail(managerEmail, 'manager');
      managerUserId = userId;
    } catch (err: unknown) {
      const message =
        (err as Error)?.message ||
        'User lookup failed for the provided manager email';
      return res.status(500).json({ error: message, code: 'SERVER_ERROR' });
    }
    // Filet supplémentaire : un membre du roster peut pointer sur le MÊME
    // compte que le manager sans avoir le même email (résolution par user_id,
    // alias d'email…). Dans ce cas on rejette plutôt que de produire une
    // invitation impossible (auto-invitation) et un roster incohérent.
    if (memberRecords.some((m) => m.user_id === managerUserId)) {
      return res.status(400).json({
        error:
          "Le manager ne peut pas être aussi membre du roster de l'équipe.",
        code: 'MANAGER_DUPLICATE',
      });
    }
  }

  // Créateur de l'équipe = la personne insérée directement + destinataire du
  // magic-link + inviteur du reste du roster. C'est le manager quand il y en a
  // un, sinon la capitaine (flux historique).
  const creatorUserId = managerUserId ?? captainUserId;

  // Ferme le trou « équipe orpheline sans pilote » : si des membres sont
  // fournis mais qu'AUCUN créateur n'est identifiable (ni manager, ni capitaine
  // désignée), on ne peut ni les insérer ni les inviter (pas d'inviteur). On
  // rejette AVANT de créer la team (aucune donnée à nettoyer). Une team sans
  // membre du tout (création « à blanc ») reste autorisée.
  if (memberRecords.length > 0 && creatorUserId === null) {
    return res.status(400).json({
      error:
        'Un capitaine doit être désigné (set_captain) quand des membres sont fournis.',
      code: 'CAPTAIN_REQUIRED',
    });
  }

  // Champs d'inscription personnalisés : si le tournoi cible est publié et
  // définit des champs custom, on valide les réponses AVANT toute création
  // (un champ requis manquant doit bloquer l'inscription — donc la création).
  // On garde les valeurs nettoyées pour l'upsert tournament_teams plus bas.
  let cleanedFieldValues: RegistrationAnswers = {};
  const earlyTournamentId = body.tournament_id?.toString().trim() || null;
  if (earlyTournamentId) {
    const { data: tourForFields } = await supabaseAdmin
      .from('tournaments')
      .select('id, status, registration_fields')
      .eq('id', earlyTournamentId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (tourForFields && tourForFields.status === 'published') {
      const defs = validateFieldDefinitions(tourForFields.registration_fields);
      const fieldDefs = defs.ok ? defs.fields : [];
      const answers = validateRegistrationAnswers(fieldDefs, body.field_values);
      if (!answers.ok) {
        return res.status(400).json({
          error: "Champs d'inscription invalides.",
          code: 'FIELD_ERRORS',
          fieldErrors: answers.errors,
        });
      }
      cleanedFieldValues = answers.values;
    }
  }

  const teamPayload: Record<string, any> = {
    name,
    short_name: body.short_name?.toString().trim() || null,
    logo_url: sanitizeUrl(body.logo_url) || null,
    country: body.country?.toString().trim() || null,
    description: description || null,
    discord: sanitizeUrl(body.discord) || null,
    website: sanitizeUrl(body.website) || null,
    tenant_id: tenantId,
    // Une nouvelle équipe est ouverte au recrutement par défaut. On le pose
    // EXPLICITEMENT (plutôt que de dépendre du défaut DB) : robuste si le
    // défaut change, et testable directement sur le payload d'insert.
    is_joinable: true,
  };

  // Insert unique (pas de retry-loop) : le slug est auto-généré et
  // DÉSAMBIGUÏSÉ par le trigger DB `teams_set_slug()` (suffixes -2, -3… en cas
  // de collision, cf. database/migrations/add_team_slug.sql), donc une
  // collision de slug ne fait JAMAIS échouer l'insert. L'ancienne boucle
  // `maxAttempts` ré-insérait un payload IDENTIQUE — elle ne pouvait donc
  // résoudre aucune contrainte unique (même nom/slug → même résultat). On
  // renvoie l'erreur directement : 409 sur un conflit d'unicité résiduel,
  // 500 sinon.
  const { data: createdTeam, error: createErr } = await supabaseAdmin
    .from('teams')
    .insert(teamPayload)
    .select('*')
    .maybeSingle();

  if (createErr || !createdTeam) {
    logger.error('[/api/teams/create-with-member] create error:', createErr);
    const message = createErr?.message?.toLowerCase() || '';
    const isDuplicate =
      message.includes('duplicate') || message.includes('unique');
    if (isDuplicate) {
      return res.status(409).json({
        error: 'Une équipe avec ce nom existe déjà. Choisis un autre nom.',
        code: 'SLUG_CONFLICT',
      });
    }
    return res.status(500).json({
      error:
        createErr?.message ||
        'Failed to create team. Try again with another name.',
      code: 'SERVER_ERROR',
    });
  }

  const insertedMembers: MemberResult[] = [];
  const invitedMembers: InvitedMemberResult[] = [];

  // Helper : cleanup d'une team orpheline (members + team).
  // Si le cleanup lui-meme echoue, on log NEEDS_REVIEW pour qu'un admin
  // puisse retrouver et nettoyer la donnee a la main.
  const cleanupOrphanTeam = async (teamId: string, reason: string) => {
    const { error: delMembersErr } = await supabaseAdmin
      .from('team_members')
      .delete()
      .eq('team_id', teamId);
    const { error: delTeamErr } = await supabaseAdmin
      .from('teams')
      .delete()
      .eq('id', teamId);

    if (delMembersErr || delTeamErr) {
      logger.error(
        '[create-with-member] NEEDS_REVIEW orphan-team cleanup failed',
        {
          teamId,
          reason,
          delMembersErr: delMembersErr?.message ?? null,
          delTeamErr: delTeamErr?.message ?? null,
        }
      );
    }
  };

  // Mode manager : le créateur n'est PAS dans `memberRecords` (il ne joue pas).
  // On l'insère directement, avec le rôle `manager` — rôle à permissions
  // (utils/teamRoles.ts) qui lui donne la gestion du roster, des scrims, des
  // demandes… sans être capitaine. C'est lui qui invite ensuite le roster.
  if (managerUserId) {
    const { data: managerMember, error: managerInsertErr } = await supabaseAdmin
      .from('team_members')
      .insert({
        team_id: createdTeam.id,
        user_id: managerUserId,
        role: 'manager',
        battle_tag: null,
        specialty: null,
        tenant_id: tenantId,
      })
      .select('id')
      .maybeSingle();

    if (managerInsertErr) {
      logger.error(
        '[/api/teams/create-with-member] manager insert error:',
        managerInsertErr
      );
      await cleanupOrphanTeam(createdTeam.id, 'manager-insert-failed');
      const msg = managerInsertErr.message?.toLowerCase() || '';
      const isDuplicate = msg.includes('duplicate') || msg.includes('unique');
      // Un manager PEUT encadrer plusieurs équipes depuis 2026-08-20 (index
      // unique partiel, cf. allow_manager_multi_team.sql) : une 23505 ici ne
      // veut plus dire « il a déjà une équipe » mais « il est déjà dans
      // CELLE-CI » — quasi impossible sur une équipe qu'on vient de créer,
      // sauf reprise d'une équipe orpheline. Le message le dit tel quel.
      return res.status(400).json({
        error: isDuplicate
          ? 'Ce manager est déjà membre de cette équipe.'
          : "Le manager n'a pas pu être ajouté. L'équipe n'a pas été enregistrée.",
        code: 'MEMBER_INSERT_FAILED',
      });
    }

    insertedMembers.push({
      id: managerMember?.id ?? null,
      user_id: managerUserId,
      role: 'manager',
      captain: false,
      battle_tag: null,
      specialty: null,
    });
  }

  // Invite-accept model : SEUL le créateur (m.user_id === creatorUserId, càd la
  // capitaine ou — en mode manager — personne dans cette boucle) est inséré
  // directement dans team_members. Tous les autres membres du roster web sont
  // INVITÉS (consentement requis) — on crée une invitation pending (demandes
  // type='invite') au lieu de les forcer dans la team. L'échec d'une invitation
  // (déjà membre d'une équipe, doublon, …) ne fait PAS échouer la création de
  // l'équipe : on collecte et on continue (la team + le créateur restent valides).
  for (const m of memberRecords) {
    const isCreatorRecord =
      creatorUserId !== null && m.user_id === creatorUserId;

    if (!isCreatorRecord) {
      // Membre non-créateur → invitation pending. Nécessite un inviteur (le
      // créateur). Sans créateur, on ne peut pas inviter : on skip.
      if (creatorUserId === null) {
        invitedMembers.push({
          invitation_id: null,
          user_id: m.user_id,
          role: m.role,
          battle_tag: m.battle_tag,
          specialty: m.specialty,
          skipped_reason: 'no_captain_to_invite',
        });
        continue;
      }

      // Lien privé : sans lui, l'invitation n'existe QUE derrière une session
      // que l'invitée n'a pas encore (son compte vient d'être créé pour elle).
      // C'est ce qui manquait — les invitées ne recevaient rien, l'invitation
      // expirait au bout de 7 jours et elles finissaient par demander à
      // rejoindre l'équipe à la main.
      const inviteToken = m.email ? generateInviteToken() : null;
      const asCaptain = Boolean(managerUserId && m.captain);

      const inviteResult = await createInvitation(tenantId, {
        teamId: createdTeam.id,
        inviteeAuthUserId: m.user_id,
        captainAuthUserId: creatorUserId,
        role: m.role,
        battleTag: m.battle_tag,
        specialty: m.specialty,
        // Mode manager : la capitaine désignée est invitée comme les autres.
        // Le drapeau lui donne le capitanat au moment où elle accepte (l'équipe
        // n'a pas de capitaine d'ici là).
        setCaptain: asCaptain,
        inviteTokenHash: inviteToken ? hashInviteToken(inviteToken) : null,
        inviteEmail: m.email,
        source: 'website',
      });

      if (inviteResult.ok) {
        // Best-effort, comme partout ailleurs : un échec Brevo ne remet pas en
        // cause l'équipe déjà créée ni l'invitation déjà persistée.
        if (inviteToken && m.email) {
          sendTeamInviteLinkEmail({
            to: m.email,
            teamName: createdTeam.name,
            role: m.role,
            asCaptain,
            inviteUrl: buildInviteUrl(inviteToken),
          }).catch((err) => {
            logger.error(
              '[/api/teams/create-with-member] invite email error:',
              err
            );
          });
        }
        invitedMembers.push({
          invitation_id: inviteResult.data.id,
          user_id: m.user_id,
          role: m.role,
          battle_tag: m.battle_tag,
          specialty: m.specialty,
        });
      } else {
        logger.error(
          '[/api/teams/create-with-member] invite error (skipped):',
          inviteResult.error
        );
        invitedMembers.push({
          invitation_id: null,
          user_id: m.user_id,
          role: m.role,
          battle_tag: m.battle_tag,
          specialty: m.specialty,
          skipped_reason: inviteResult.error,
        });
      }
      continue;
    }

    // Créateur (capitaine) → insertion directe dans team_members.
    const memberPayload = {
      team_id: createdTeam.id,
      user_id: m.user_id,
      role: m.role,
      battle_tag: m.battle_tag,
      specialty: m.specialty,
      tenant_id: tenantId,
    };

    const { data: member, error: insertErr } = await supabaseAdmin
      .from('team_members')
      .insert(memberPayload)
      .select('id')
      .maybeSingle();

    if (insertErr) {
      logger.error(
        '[/api/teams/create-with-member] add-member error:',
        insertErr
      );
      await cleanupOrphanTeam(createdTeam.id, 'member-insert-failed');

      const msg = insertErr.message?.toLowerCase() || '';
      const isDuplicate = msg.includes('duplicate') || msg.includes('unique');

      return res.status(400).json({
        error: isDuplicate
          ? 'One of the users already belongs to this team'
          : 'Member(s) could not be added. The team was not saved.',
        code: 'MEMBER_INSERT_FAILED',
      });
    }

    insertedMembers.push({
      id: member?.id ?? null,
      user_id: m.user_id,
      role: m.role,
      captain: m.captain,
      battle_tag: m.battle_tag,
      specialty: m.specialty,
    });
  }

  // Mode manager : `captain_id` reste NULL. La capitaine désignée n'est encore
  // qu'invitée — on ne la nomme qu'au moment où elle accepte (drapeau
  // `set_captain` du payload d'invitation), ou via l'espace équipe du manager
  // (PATCH /api/teams/transfer-captain → RPC designate_captain).
  if (captainUserId && !managerUserId) {
    const { error: captainErr } = await supabaseAdmin
      .from('teams')
      .update({ captain_id: captainUserId })
      .eq('id', createdTeam.id);

    if (captainErr) {
      logger.error(
        '[/api/teams/create-with-member] captain update error:',
        captainErr
      );
      // Sans capitaine assigne, l'equipe est inutilisable cote produit
      // (pas de droits de gestion). Cleanup pour eviter une team orpheline.
      await cleanupOrphanTeam(createdTeam.id, 'captain-update-failed');
      return res.status(500).json({
        error:
          captainErr.message ||
          'Failed to assign team captain. Team rolled back.',
        code: 'SERVER_ERROR',
      });
    }
  }

  // Send team join emails (non-blocking)
  // userId→email : lu directement sur les enregistrements, qui portent l'email
  // saisi. L'ancienne corrélation par BattleTag ratait tout membre sans
  // BattleTag (encadrement, ou création hors tournoi) et pouvait confondre deux
  // membres partageant le même tag vide.
  const userIdToEmail = new Map<string, string>();
  for (const rec of memberRecords) {
    if (rec.email) userIdToEmail.set(rec.user_id, rec.email);
  }
  if (managerUserId && managerEmail) {
    userIdToEmail.set(managerUserId, managerEmail);
  }
  for (const m of insertedMembers) {
    // Le créateur reçoit l'email d'accès dédié (magic-link ci-dessous) — pas
    // l'email « vous avez rejoint l'équipe » (redondant : il vient de la créer).
    // On l'exclut donc de la boucle join pour ne pas lui envoyer 2 mails.
    if (creatorUserId !== null && m.user_id === creatorUserId) continue;
    const email = userIdToEmail.get(m.user_id);
    if (email) {
      sendTeamJoinEmail(email, createdTeam.name, m.role).catch((err) => {
        logger.error('[create-with-member] team join email error:', err);
      });
    }
  }

  // Pont magic-link (contrat §2) : le capitaine vient d'être inséré dans
  // team_members mais n'a PAS de session (flux public anonyme). On lui envoie un
  // lien de connexion Supabase (magiclink) pointant vers /auth/team-access pour
  // qu'il rejoigne directement son espace équipe authentifié. Best-effort : un
  // échec (génération de lien ou envoi email) ne fait JAMAIS échouer la création.
  //
  // On réutilise le pattern éprouvé de forgot-password.ts : on N'utilise PAS
  // l'`action_link` renvoyé (code PKCE non échangeable côté client) mais on
  // extrait `hashed_token` et on construit l'URL nous-mêmes (verifyOtp côté page).
  let accessEmail: { sent: boolean; to?: string } = { sent: false };
  if (creatorUserId) {
    const creatorEmail = userIdToEmail.get(creatorUserId) || null;
    // Le manager ne joue pas : la carte d'onboarding Battle.net (`welcome=1`)
    // ne le concerne pas, on l'envoie directement sur son espace équipe.
    const landing = managerUserId ? MANAGER_LANDING : CAPTAIN_LANDING;
    if (creatorEmail) {
      try {
        // `welcome=1` déclenche, à l'arrivée dans l'espace équipe, la carte
        // d'onboarding « vérifie ton BattleTag » (Battle.net OAuth). C'est le
        // seul instant du parcours où la capitaine vient de créer son compte et
        // est déjà connectée ; proposer la vérification ailleurs suppose qu'elle
        // aille la chercher dans son profil.
        const redirectTo = `${SITE_URL}/auth/team-access?next=${encodeURIComponent(
          landing
        )}`;
        const { data: linkData, error: linkErr } =
          await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: creatorEmail,
            options: { redirectTo },
          });

        const tokenHash = linkData?.properties?.hashed_token;
        if (linkErr || !tokenHash) {
          logger.error(
            '[create-with-member] creator magic-link generateLink failed',
            { teamId: createdTeam.id, error: linkErr?.message ?? 'no token' }
          );
        } else {
          const actionLink = `${SITE_URL}/auth/team-access?token_hash=${encodeURIComponent(
            tokenHash
          )}&type=magiclink&next=${encodeURIComponent(landing)}`;

          // Fire-and-forget : un échec Brevo ne doit pas bloquer la création.
          sendTeamAccessEmail({
            to: creatorEmail,
            teamName: createdTeam.name,
            actionLink,
          }).catch(() => {});

          accessEmail = { sent: true, to: maskEmail(creatorEmail) };
        }
      } catch (e) {
        logger.error('[create-with-member] creator magic-link bridge crash', {
          teamId: createdTeam.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // Auto-register team to tournament if tournament_id provided
  let tournamentRegistration: {
    tournament_name: string;
    stages_count: number;
  } | null = null;
  const tournamentId = body.tournament_id?.toString().trim() || null;

  if (tournamentId) {
    try {
      // Verify tournament exists and is published
      const { data: tournament } = await supabaseAdmin
        .from('tournaments')
        .select('id, name, status, max_teams, min_players')
        .eq('id', tournamentId)
        .eq('tenant_id', tenantId)
        .single();

      if (tournament && tournament.status === 'published') {
        // Check max_teams limit
        let canRegister = true;
        // min_players = nombre de JOUEURS (player + substitute), coachs ET
        // managers EXCLUS (décision produit : l'encadrement ne compte pas dans
        // le roster minimum requis pour l'inscription auto).
        const playerCount = insertedMembers.filter(
          (m) => !isNonPlayingTeamRole(m.role)
        ).length;
        if (tournament.min_players && playerCount < tournament.min_players) {
          canRegister = false;
        }
        if (tournament.max_teams) {
          const { data: existingTeams } = await supabaseAdmin
            .from('stage_teams')
            .select('team_id, tournament_stages!inner(tournament_id)')
            .eq('tenant_id', tenantId)
            .eq('tournament_stages.tournament_id', tournamentId);

          const uniqueTeams = new Set(
            existingTeams?.map((t) => t.team_id) || []
          );
          if (uniqueTeams.size >= tournament.max_teams) {
            canRegister = false;
          }
        }

        if (canRegister) {
          // Get all stages for the tournament
          const { data: stages } = await supabaseAdmin
            .from('tournament_stages')
            .select('id')
            .eq('tournament_id', tournamentId)
            .eq('tenant_id', tenantId);

          if (stages && stages.length > 0) {
            const insertData = stages.map((s) => ({
              stage_id: s.id,
              team_id: createdTeam.id,
              tenant_id: tenantId,
            }));

            const { error: regError } = await supabaseAdmin
              .from('stage_teams')
              .insert(insertData);

            if (!regError) {
              tournamentRegistration = {
                tournament_name: tournament.name,
                stages_count: stages.length,
              };

              // Aligne le Flow A sur la table d'inscription canonique
              // (tournament_teams) : on y consigne le statut + les réponses aux
              // champs custom. Best-effort/guardé comme l'insert stage_teams —
              // un échec ne fait pas échouer la création de l'équipe.
              try {
                const { error: ttError } = await supabaseAdmin
                  .from('tournament_teams')
                  .upsert(
                    {
                      tenant_id: tenantId,
                      tournament_id: tournamentId,
                      team_id: createdTeam.id,
                      status: 'registered',
                      field_values: cleanedFieldValues,
                    },
                    { onConflict: 'tournament_id,team_id' }
                  );
                if (ttError) {
                  logger.error(
                    '[create-with-member] NEEDS_REVIEW tournament_teams upsert failed',
                    {
                      teamId: createdTeam.id,
                      tournamentId,
                      error: ttError.message,
                    }
                  );
                }
              } catch (ttErr) {
                logger.error(
                  '[create-with-member] NEEDS_REVIEW tournament_teams upsert crash',
                  {
                    teamId: createdTeam.id,
                    tournamentId,
                    error:
                      ttErr instanceof Error ? ttErr.message : String(ttErr),
                  }
                );
              }
            } else {
              // Best-effort : la team est creee, on ne rollback pas.
              // Marquer NEEDS_REVIEW pour qu'un admin puisse la reinscrire manuellement.
              logger.error(
                '[create-with-member] NEEDS_REVIEW tournament registration failed',
                {
                  teamId: createdTeam.id,
                  tournamentId,
                  error: regError.message,
                }
              );
            }
          }
        }
      }
    } catch (err) {
      // Non-blocking: team is created, registration is best-effort
      logger.error(
        '[create-with-member] NEEDS_REVIEW tournament registration crash',
        {
          teamId: createdTeam.id,
          tournamentId,
          error: err instanceof Error ? err.message : String(err),
        }
      );
    }
  }

  const infoParts: string[] = [];
  if (managerUserId) infoParts.push('Équipe créée et manager ajouté');
  else if (insertedMembers.length)
    infoParts.push('Équipe créée et capitaine ajouté');
  else infoParts.push('Équipe créée');
  const sentInvites = invitedMembers.filter((i) => i.invitation_id).length;
  if (sentInvites > 0) {
    infoParts.push(
      `${sentInvites} invitation(s) envoyée(s) — chaque joueuse doit l'accepter pour rejoindre l'équipe`
    );
  }
  if (tournamentRegistration) {
    infoParts.push(
      `inscrite au tournoi "${tournamentRegistration.tournament_name}"`
    );
  } else if (tournamentId) {
    infoParts.push(
      "L'inscription au tournoi n'a pas pu être effectuée (nombre de joueurs insuffisant ou tournoi complet). Vous pourrez vous inscrire plus tard."
    );
  }

  // Blacklist : alerte (ne bloque pas) si un membre inséré est banni. On itère
  // sur les battletags des membres effectivement insérés. Fire-and-forget.
  for (const m of insertedMembers) {
    if (!m.battle_tag) continue;
    void alertIfBlacklisted(supabaseAdmin, tenantId, 'team_create', {
      battleTag: m.battle_tag,
    });
  }

  // Blacklist entités : alerte (ne bloque pas) si le NOM de l'équipe créée
  // matche une équipe/structure bannie. Fire-and-forget.
  void alertIfEntityBlacklisted(supabaseAdmin, tenantId, 'team_create', {
    name: createdTeam.name,
  });

  // Bot push : team.created -> le bot cree le salon vocal natif de l'equipe
  // (chantier voice par equipe). Idempotent cote bot via teams.discord_voice_channel_id.
  void (async () => {
    // Mode manager : il n'y a PAS encore de capitaine (la désignée n'a pas
    // accepté). On n'annonce donc aucun capitaine au bot — sinon il assignerait
    // le rôle d'équipe à quelqu'un qui n'en fait pas partie. Le créateur
    // (manager) est exposé à part : le bot lui donne le rôle à la place.
    const effectiveCaptainUserId = managerUserId ? null : captainUserId;
    const resolveDiscordId = async (
      authUserId: string | null
    ): Promise<string | null> => {
      if (!authUserId) return null;
      // Helper canonique : la colonne est `auth_user_id`. La query en ligne
      // d'origine filtrait sur `user_id` (inexistante), donc renvoyait
      // toujours null — le bot ne recevait jamais le Discord du créateur et
      // ne pouvait pas lui donner son rôle d'équipe.
      const link = await getDiscordLinkForUser(authUserId);
      return link?.discordUserId ?? null;
    };

    const captainDiscordUserId = await resolveDiscordId(effectiveCaptainUserId);
    const creatorDiscordUserId = managerUserId
      ? await resolveDiscordId(managerUserId)
      : captainDiscordUserId;

    await emitBotEvent(
      'team.created',
      {
        teamId: createdTeam.id,
        name: createdTeam.name,
        slug: createdTeam.slug ?? null,
        captainAuthUserId: effectiveCaptainUserId,
        captainDiscordUserId,
        // Créateur de l'équipe : capitaine (flux historique) ou manager. Le bot
        // s'en sert comme cible de repli pour l'assignation du rôle d'équipe.
        creatorAuthUserId: creatorUserId,
        creatorDiscordUserId,
        creatorRole: managerUserId ? 'manager' : 'captain',
        discordRoleId: createdTeam.discord_role_id ?? null,
      },
      tenantId
    );
  })().catch((e) => logger.error('[botEvents] team.created emit error:', e));

  return res.status(201).json({
    team: createdTeam,
    members: insertedMembers.length ? insertedMembers : undefined,
    invitedMembers: invitedMembers.length ? invitedMembers : undefined,
    tournament: tournamentRegistration || undefined,
    info: infoParts.join(' — '),
    accessEmail,
  });
}
