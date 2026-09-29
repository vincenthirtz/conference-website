// features/player/onboarding/service/createTeam.ts — création d'équipe
// ANONYME (wizard /team/create), découpée en étapes testables (lot P11 ;
// déplacé de pages/api/teams/create-with-member, 1 386 lignes).
//
// La garde (definePublicRoute) a déjà appliqué rate-limit, honeypot et
// captcha AVANT cette fonction : aucune étape ici ne crée de compte ni
// n'envoie d'e-mail pour un bot.
//
//   1. identité de l'équipe       (pur)            teamFields.ts
//   2. roster déclaré             (pur)            roster.ts
//   3. comptes du roster/manager  (crée des comptes) accounts.ts
//   4. réponses d'inscription     (lecture)        registrationAnswers.ts
//   5. équipe + sièges + invitations (retour arrière si siège KO) seating.ts
//   6. e-mails + pont magic-link  (best-effort)    access.ts
//   7. tournoi : inscription ou candidature (best-effort) tournament.ts
//   8. synthèse, listes noires, `team.created`     announce.ts
//
// Les étapes 1 à 4 refusent AVANT la création de l'équipe : aucun orphelin.

import type { CreateTeamInput, CreateTeamResponse } from '../schemas';
import { resolveAccounts } from './accounts';
import {
  emailsByUser,
  notifyInsertedMembers,
  sendCreatorAccess,
} from './access';
import { alertBlacklists, announceTeamCreated, summaryInfo } from './announce';
import type { OnboardingCtx } from './context';
import { readRegistrationAnswers } from './registrationAnswers';
import { readDeclaredRoster } from './roster';
import { assignCaptain, createTeamRow, seatRoster } from './seating';
import { readTeamFields } from './teamFields';
import { attachToTournament, type TournamentOutcome } from './tournament';

export async function createTeam(
  ctx: OnboardingCtx,
  body: CreateTeamInput
): Promise<CreateTeamResponse> {
  const fields = readTeamFields(body);
  const roster = readDeclaredRoster(body);
  const accounts = await resolveAccounts(body, roster);
  const tournamentId = body.tournament_id?.trim() || null;
  const answers = await readRegistrationAnswers(
    ctx,
    tournamentId,
    body.field_values
  );

  const team = await createTeamRow(ctx, fields.row);
  const { inserted, invited } = await seatRoster(ctx, team, accounts);
  await assignCaptain(ctx, team.id, accounts);

  const emails = emailsByUser(accounts, roster.managerEmail);
  notifyInsertedMembers(
    ctx,
    team.name,
    inserted,
    emails,
    accounts.creatorUserId
  );
  const accessEmail = await sendCreatorAccess(ctx, team, accounts, emails);

  const outcome: TournamentOutcome = tournamentId
    ? await attachToTournament(ctx, {
        tournamentId,
        team,
        inserted,
        invited,
        creatorUserId: accounts.creatorUserId,
        creatorEmail: accounts.creatorUserId
          ? (emails.get(accounts.creatorUserId) ?? null)
          : null,
        answers,
      })
    : { registration: null, application: null, solo: false };

  const info = summaryInfo(accounts, inserted, invited, outcome, tournamentId);
  alertBlacklists(ctx, team, inserted);
  announceTeamCreated(ctx, team, accounts, outcome.solo, tournamentId);

  return {
    team,
    members: inserted.length ? inserted : undefined,
    invitedMembers: invited.length ? invited : undefined,
    tournament: outcome.registration || undefined,
    tournament_application: outcome.application || undefined,
    info,
    accessEmail,
  };
}
