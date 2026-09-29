// features/player/onboarding/service/roster.ts — étape 2 : le roster DÉCLARÉ
// (normalisé, plafonné, cohérent avec le manager). Pure : aucune lecture de
// base, aucune création de compte — tout refus tombe AVANT.

import { countPlayingMembers } from '@/utils/teams/addMember';
import { MAX_ROSTER_ROWS, MAX_TEAM_PLAYERS } from '@/utils/constants';
import type { CreateTeamInput } from '../schemas';
import { createTeamError } from './context';

/** Même forme que la validation client (pages/team/create.tsx). */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RosterLine = {
  email: string;
  user_id: string;
  role: string;
  set_captain: boolean;
  battle_tag: string;
  specialty: string;
};

export type DeclaredRoster = {
  /** Chemin « membre unique » historique. */
  memberEmail: string | null;
  memberUserId: string | null;
  /** Mode « créée par un manager » : il pilote tout le flux. */
  managerEmail: string | null;
  lines: RosterLine[];
  wantsMember: boolean;
};

export function readDeclaredRoster(body: CreateTeamInput): DeclaredRoster {
  const memberEmail = body.member_email?.trim().toLowerCase() || null;
  const memberUserId = body.member_user_id?.trim() || null;

  const managerEmail = body.manager_email?.trim().toLowerCase() || null;
  if (managerEmail && !EMAIL_REGEX.test(managerEmail)) {
    throw createTeamError(
      400,
      'MANAGER_EMAIL_INVALID',
      "L'email du manager est invalide.",
      { fields: { manager_email: "L'email du manager est invalide." } }
    );
  }

  const lines: RosterLine[] = body.members
    .map((m) => ({
      email: m.email?.trim().toLowerCase() || '',
      user_id: m.user_id?.trim() || '',
      role: m.role?.trim() || '',
      set_captain: Boolean(m.set_captain),
      battle_tag: m.battle_tag?.trim() || '',
      specialty: m.specialty?.trim() || '',
    }))
    .filter((m) => m.email || m.user_id);

  // Le plafond porte sur les JOUEUSES (countPlayingMembers, même exemption
  // que le trigger `enforce_team_max_players`) : un coach ne coûte pas de
  // place de roster.
  if (countPlayingMembers(lines) > MAX_TEAM_PLAYERS) {
    throw createTeamError(
      400,
      'TOO_MANY_MEMBERS',
      `You can add up to ${MAX_TEAM_PLAYERS} players in one request`
    );
  }
  // Plafond ABSOLU de lignes, encadrement compris : la route est publique et
  // crée des comptes à partir des e-mails reçus.
  if (lines.length > MAX_ROSTER_ROWS) {
    throw createTeamError(
      400,
      'TOO_MANY_MEMBERS',
      `You can add up to ${MAX_ROSTER_ROWS} members in one request`
    );
  }

  const wantsMember = Boolean(memberEmail || memberUserId || lines.length);
  if (body.set_captain && !wantsMember) {
    throw createTeamError(
      400,
      'CAPTAIN_REQUIRED',
      'Provide a member to set as captain'
    );
  }

  // Le manager ne peut pas figurer AUSSI dans le roster (inviteur et invité).
  if (
    managerEmail &&
    (lines.some((m) => m.email === managerEmail) ||
      memberEmail === managerEmail)
  ) {
    throw createTeamError(
      400,
      'MANAGER_DUPLICATE',
      "L'email du manager ne peut pas être aussi celui d'une joueuse du roster.",
      {
        fields: {
          manager_email: 'Cet email est déjà utilisé par un membre du roster.',
        },
      }
    );
  }

  return { memberEmail, memberUserId, managerEmail, lines, wantsMember };
}
