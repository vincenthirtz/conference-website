// lib/apiContracts/player/bodies.ts — corps de requête des routes joueuse
// HISTORIQUES validés par un schéma partagé (lot P4,
// docs/PLAN-industrialisation-joueur.md). La route applique le schéma via
// `parseBody` (utils/player/errors.ts), le fragment OpenAPI le référence
// (`x-zod: <clé>`). Les routes migrées sur `defineSubjectRoute` sont dans
// ./features.ts.
//
// Chemins relatifs, comme le reste de lib/apiContracts : l'assembleur tourne
// aussi dans le script de build (sans alias `@/`).

import type { ApiContractEntry } from '../index';
import {
  CancelDemandeBody,
  JoinDemandeBody,
  RegisterTeamDemandeBody,
  TransferDemandeBody,
} from '../../../features/player/demandes/schemas';
import { LineupBody } from '../../../features/player/matches/schemas';
import { SendMessageBody } from '../../../features/player/messages/schemas';
import { LeaderboardVisibilityBody } from '../../../features/player/predictions/schemas';
import { UpdatePlayerProfileBody } from '../../../features/player/profile/schemas';
import {
  PlanningAvailabilityBody,
  ScrimRequestDecisionBody,
} from '../../../features/player/scrims/schemas';
import {
  AddMemberBody,
  JoinRequestDecisionBody,
  MemberPermissionBody,
  RemoveTeamMemberBody,
  TeamMemberProfileBody,
  TeamPublicPageBody,
  TeamReviewBody,
  TeamRhythmBody,
  TransferCaptainBody,
  TransferRequestDecisionBody,
  UpdateMemberRoleBody,
  UpdateMemberSpecialtyBody,
} from '../../../features/player/team/schemas';
import {
  EquipCosmeticsBody,
  ForgeBody,
  OpenPackBody,
  RecycleCardBody,
  TradeBlockBody,
} from '../../../features/player/tcg/schemas';

const input = (schema: ApiContractEntry['schema']): ApiContractEntry => ({
  schema,
  io: 'input',
});

export const PLAYER_BODY_SCHEMAS: Record<string, ApiContractEntry> = {
  'player.messages.send': input(SendMessageBody),
  'player.demandes.join': input(JoinDemandeBody),
  'player.demandes.transfer': input(TransferDemandeBody),
  'player.demandes.register-team': input(RegisterTeamDemandeBody),
  'player.demandes.cancel': input(CancelDemandeBody),
  'player.teams.transfer-requests.decide': input(TransferRequestDecisionBody),
  'player.teams.join-requests.decide': input(JoinRequestDecisionBody),
  'player.teams.scrim-requests.decide': input(ScrimRequestDecisionBody),
  'player.teams.update-member-role': input(UpdateMemberRoleBody),
  'player.teams.update-member-specialty': input(UpdateMemberSpecialtyBody),
  'player.teams.transfer-captain': input(TransferCaptainBody),
  'player.teams.members.remove': input(RemoveTeamMemberBody),
  'player.teams.member-permissions': input(MemberPermissionBody),
  'player.teams.add-member': input(AddMemberBody),
  'player.teams.scrim-plannings.availability': input(PlanningAvailabilityBody),
  'player.teams.public-page': input(TeamPublicPageBody),
  'player.teams.member-profile': input(TeamMemberProfileBody),
  'player.predictions.leaderboard': input(LeaderboardVisibilityBody),
  'player.teams.matches.lineup': input(LineupBody),
  'player.team-reviews.put': input(TeamReviewBody),
  'player.team-rhythm.put': input(TeamRhythmBody),
  'player.update-profile': input(UpdatePlayerProfileBody),
  'player.tcg.packs.open': input(OpenPackBody),
  'player.tcg.recycle': input(RecycleCardBody),
  'player.tcg.forge': input(ForgeBody),
  'player.tcg.trades.blocks': input(TradeBlockBody),
  'player.tcg.cosmetics.equip': input(EquipCosmeticsBody),
};
