// features/player/onboarding/service/accounts.ts — étape 3 : les COMPTES du
// roster et de la créatrice. `findOrCreateUserByEmail` crée un compte par
// e-mail inconnu : cette étape ne tourne qu'après l'anti-bot et les refus
// purs (étapes 1-2), et tout refus y tombe AVANT la création de l'équipe
// (aucun orphelin à nettoyer).

import { findOrCreateUserByEmail } from '@/utils/find-or-create-user';
import {
  validateExistingUserId,
  validateRole,
  validateSpecialty,
} from '@/utils/apiHelpers';
import {
  BATTLE_TAG_REGEX,
  roleRequiresBattleTag,
} from '@/utils/teams/addMember';
import type { CreateTeamInput } from '../schemas';
import { createTeamError, messageOf } from './context';
import type { DeclaredRoster } from './roster';

export type MemberRecord = {
  user_id: string;
  role: string;
  captain: boolean;
  battle_tag: string | null;
  specialty: string | null;
  /** Adresse saisie : celle où part l'invitation (ou l'e-mail d'accès). */
  email: string | null;
};

export type ResolvedAccounts = {
  records: MemberRecord[];
  captainUserId: string | null;
  managerUserId: string | null;
  /** La personne insérée directement, destinataire du magic-link et inviteuse. */
  creatorUserId: string | null;
};

/**
 * BattleTag conditionnel (lot 6) : exigé pour un rôle JOUANT lors d'une
 * inscription à un tournoi ; sinon facultatif, mais validé s'il est fourni.
 */
function resolveBattleTag(
  raw: string,
  role: string,
  forTournament: boolean
): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    if (forTournament && roleRequiresBattleTag(role)) {
      throw createTeamError(
        400,
        'BATTLETAG_REQUIRED',
        'BattleTag required for each member when registering to a tournament.'
      );
    }
    return null;
  }
  if (!BATTLE_TAG_REGEX.test(trimmed)) {
    throw createTeamError(
      400,
      'BATTLETAG_INVALID',
      'Invalid BattleTag. Expected format: Name#0000 (letters or digits, accents allowed, + # + 3 to 6 digits).'
    );
  }
  return trimmed;
}

/**
 * Un `user_id` brut venu d'une route PUBLIQUE n'est jamais inséré (ni promu)
 * sans validation : UUID valide + utilisateur existant. Le wizard résout par
 * e-mail et n'en envoie jamais.
 */
async function checkedUserId(raw: string): Promise<string> {
  const check = await validateExistingUserId(raw);
  if (!check.ok) {
    throw createTeamError(check.status, 'INVALID_USER_ID', check.error);
  }
  return check.userId;
}

async function accountFor(
  email: string,
  role: string,
  fallback: string
): Promise<string> {
  try {
    const { userId } = await findOrCreateUserByEmail(email, role);
    return userId;
  } catch (err: unknown) {
    throw createTeamError(500, 'SERVER_ERROR', messageOf(err, fallback));
  }
}

async function resolveRecords(
  body: CreateTeamInput,
  roster: DeclaredRoster,
  forTournament: boolean
): Promise<MemberRecord[]> {
  const records: MemberRecord[] = [];

  if (roster.lines.length === 0 && roster.wantsMember) {
    // Chemin « membre unique » historique.
    const role = validateRole(body.member_role);
    const specialty = validateSpecialty(body.member_specialty);
    const battleTag = resolveBattleTag(
      body.member_battle_tag?.trim() || '',
      role,
      forTournament
    );
    const captain = Boolean(body.set_captain);
    if (roster.memberUserId) {
      records.push({
        user_id: await checkedUserId(roster.memberUserId),
        role,
        captain,
        battle_tag: battleTag,
        specialty,
        email: roster.memberEmail || null,
      });
    } else if (roster.memberEmail) {
      records.push({
        user_id: await accountFor(
          roster.memberEmail,
          role,
          'User lookup failed for the provided email'
        ),
        role,
        captain,
        battle_tag: battleTag,
        specialty,
        email: roster.memberEmail,
      });
    }
    return records;
  }

  for (const m of roster.lines) {
    const role = validateRole(m.role);
    const specialty = validateSpecialty(m.specialty);
    const battleTag = resolveBattleTag(m.battle_tag, role, forTournament);
    const base = {
      role,
      captain: m.set_captain,
      battle_tag: battleTag,
      specialty,
    };
    if (m.user_id) {
      records.push({
        ...base,
        user_id: await checkedUserId(m.user_id),
        email: m.email || null,
      });
      continue;
    }
    if (!m.email) continue;
    records.push({
      ...base,
      user_id: await accountFor(
        m.email,
        role,
        'User could not be found or created for one of the provided emails'
      ),
      email: m.email,
    });
  }
  return records;
}

export async function resolveAccounts(
  body: CreateTeamInput,
  roster: DeclaredRoster
): Promise<ResolvedAccounts> {
  // Lot 6 : BattleTag obligatoire UNIQUEMENT lors d'une inscription.
  const forTournament = !!body.tournament_id?.trim();
  let records = await resolveRecords(body, roster, forTournament);

  // Un seul capitaine : la première ligne marquée.
  const firstCaptainIdx = records.findIndex((m) => m.captain);
  const captainUserId =
    firstCaptainIdx >= 0 ? records[firstCaptainIdx].user_id : null;
  records = records.map((m, idx) => ({
    ...m,
    captain: firstCaptainIdx === idx && m.captain,
  }));

  // Mode manager : son compte AVANT l'équipe, pour échouer sans orphelin.
  let managerUserId: string | null = null;
  if (roster.managerEmail) {
    managerUserId = await accountFor(
      roster.managerEmail,
      'manager',
      'User lookup failed for the provided manager email'
    );
    // Même compte sous un autre e-mail (user_id, alias) : invitation
    // impossible (auto-invitation) et roster incohérent.
    if (records.some((m) => m.user_id === managerUserId)) {
      throw createTeamError(
        400,
        'MANAGER_DUPLICATE',
        "Le manager ne peut pas être aussi membre du roster de l'équipe."
      );
    }
  }

  const creatorUserId = managerUserId ?? captainUserId;
  // Des membres sans pilote : ni insérables, ni invitables. Une équipe
  // « à blanc » (sans membre) reste autorisée.
  if (records.length > 0 && creatorUserId === null) {
    throw createTeamError(
      400,
      'CAPTAIN_REQUIRED',
      'Un capitaine doit être désigné (set_captain) quand des membres sont fournis.'
    );
  }

  return { records, captainUserId, managerUserId, creatorUserId };
}
