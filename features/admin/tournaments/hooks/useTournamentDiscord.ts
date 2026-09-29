// features/admin/tournaments/hooks/useTournamentDiscord.ts — webhooks
// Discord d'un tournoi par type de salon (pages/admin/tournament/[id]/discord),
// lot L10.
//
// L'écran lisait et écrivait par `fetch()` nu : tout passe par `adminRequest`
// (jeton). La fiche est ÉDITÉE : pas de relecture automatique.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DiscordChannelType } from '@/utils/discord/channels';
import { adminRequest } from '@/utils/admin/adminHttp';
import { EDITOR_QUERY_OPTIONS } from '../../_shared/query';
import { tournamentUrls, withFallback } from '../client';
import { tournamentKeys } from './keys';

type ChannelType = DiscordChannelType;

export type WebhookRow = {
  id: string;
  tournament_id: string | null;
  channel_type: ChannelType;
  webhook_url: string;
  role_mention: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type DiscordWebhooksResponse = {
  channelTypes: ChannelType[];
  scoped: WebhookRow[];
  globals: WebhookRow[];
};

const key = (id: string) => tournamentKeys.part(id, 'discord-webhooks');

export function useTournamentDiscordWebhooks(id: string, loadError: string) {
  return useQuery({
    queryKey: key(id),
    queryFn: () =>
      withFallback(
        adminRequest<DiscordWebhooksResponse>(
          tournamentUrls.discordWebhooks(id)
        ),
        loadError
      ),
    enabled: !!id,
    ...EDITOR_QUERY_OPTIONS,
    // Chaque lecture réhydrate les brouillons, même sans changement.
    structuralSharing: false,
  });
}

export function useTournamentDiscordActions(
  id: string,
  messages: { save: string; remove: string; test: string }
) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: key(id) });

  const save = useMutation({
    mutationFn: (body: {
      channelType: ChannelType;
      webhookUrl: string;
      roleMention: string | null;
      isActive: boolean;
    }) =>
      withFallback(
        adminRequest(tournamentUrls.discordWebhooks(id), {
          method: 'PUT',
          json: body,
        }),
        messages.save
      ),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (channelType: ChannelType) =>
      withFallback(
        adminRequest(tournamentUrls.discordWebhooks(id, channelType), {
          method: 'DELETE',
        }),
        messages.remove
      ),
    onSuccess: refresh,
  });

  const test = useMutation({
    mutationFn: (channelType: ChannelType) =>
      withFallback(
        adminRequest(tournamentUrls.discordTest(id), {
          method: 'POST',
          json: { channelType },
        }),
        messages.test
      ),
  });

  return { save, remove, test };
}
