// features/player/teamSettings/client.ts — appels typés des réglages
// d'ouverture de l'équipe gérée (lot P5) : recrutement, scrims.
//
// Routes `subject: 'follow'` + `actAs` : `playerRequest` pose `?as=…&act=1`
// quand le staff agit à la place d'une capitaine, puis `?teamId=` de l'équipe
// active. Mutations : `Idempotency-Key` fraîche (idempotence par défaut de
// `defineSubjectRoute`).

import { playerRequest, type PlayerScope } from '@/utils/player/playerHttp';
import type {
  ToggleJoinableInput,
  ToggleJoinableResponse,
  ToggleScrimOpenInput,
  ToggleScrimOpenResponse,
} from './schemas';

export const teamSettingsUrls = {
  toggleJoinable: '/api/teams/toggle-joinable',
  toggleScrimOpen: '/api/teams/toggle-scrim-open',
};

export const teamSettingsClient = {
  toggleJoinable: (scope: PlayerScope, body: ToggleJoinableInput) =>
    playerRequest<ToggleJoinableResponse>(teamSettingsUrls.toggleJoinable, {
      method: 'POST',
      json: body,
      idempotent: true,
      scope,
    }),
  toggleScrimOpen: (scope: PlayerScope, body: ToggleScrimOpenInput) =>
    playerRequest<ToggleScrimOpenResponse>(teamSettingsUrls.toggleScrimOpen, {
      method: 'POST',
      json: body,
      idempotent: true,
      scope,
    }),
};
