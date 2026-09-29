// features/player/onboarding/service/registrationAnswers.ts — étape 4 : les
// réponses aux champs d'inscription du tournoi visé, validées AVANT toute
// création (un champ requis manquant bloque l'inscription, donc la création).

import {
  validateFieldDefinitions,
  validateRegistrationAnswers,
  type RegistrationAnswers,
} from '@/utils/registrationFields';
import { readTournamentFieldDefs } from '../repository/teamCreation';
import { createTeamError, type OnboardingCtx } from './context';

export async function readRegistrationAnswers(
  ctx: OnboardingCtx,
  tournamentId: string | null,
  fieldValues: unknown
): Promise<RegistrationAnswers> {
  if (!tournamentId) return {};
  const tournament = await readTournamentFieldDefs(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  // Seul un tournoi publié impose ses champs (sinon pas d'inscription).
  if (!tournament || tournament.status !== 'published') return {};
  const defs = validateFieldDefinitions(tournament.registration_fields);
  const answers = validateRegistrationAnswers(
    defs.ok ? defs.fields : [],
    fieldValues
  );
  if (!answers.ok) {
    throw createTeamError(
      400,
      'FIELD_ERRORS',
      "Champs d'inscription invalides.",
      { fieldErrors: answers.errors }
    );
  }
  return answers.values;
}
