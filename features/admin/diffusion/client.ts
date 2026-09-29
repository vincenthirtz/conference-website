// features/admin/diffusion/client.ts — appels typés de l'édition des chaînes
// Twitch. Les types viennent de `schemas.ts`.

import { adminRequest } from '@/utils/admin/adminHttp';
import type {
  TwitchChannelBody,
  TwitchChannelPatch,
  TwitchChannelRow,
} from './schemas';

const BASE = '/api/admin/twitch-channels';
const one = (id: string) => `${BASE}/${encodeURIComponent(id)}`;

export const twitchChannelsClient = {
  get: (id: string) => adminRequest<TwitchChannelRow>(one(id)),
  create: (body: TwitchChannelBody) =>
    adminRequest<TwitchChannelRow>(BASE, {
      method: 'POST',
      json: body,
      idempotent: true,
    }),
  remove: (id: string) =>
    adminRequest<null>(one(id), { method: 'DELETE', idempotent: true }),
  update: (id: string, patch: TwitchChannelPatch) =>
    adminRequest<TwitchChannelRow>(one(id), {
      method: 'PATCH',
      json: patch,
      idempotent: true,
    }),
};
