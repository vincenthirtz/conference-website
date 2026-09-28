// features/admin/diffusion/hooks/useTwitchChannel.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminKey } from '../../_shared/query';
import { twitchChannelsClient } from '../client';
import type { TwitchChannelPatch } from '../schemas';

export const twitchChannelKeys = {
  all: adminKey('twitch-channels'),
  one: (id: string) => [...twitchChannelKeys.all, id] as const,
};

export function useTwitchChannel(id: string | undefined) {
  return useQuery({
    queryKey: twitchChannelKeys.one(id ?? ''),
    queryFn: () => twitchChannelsClient.get(id as string),
    enabled: Boolean(id),
  });
}

export function useUpdateTwitchChannel(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: TwitchChannelPatch) =>
      twitchChannelsClient.update(id, patch),
    onSuccess: (row) => {
      qc.setQueryData(twitchChannelKeys.one(id), row);
      void qc.invalidateQueries({ queryKey: twitchChannelKeys.all });
    },
  });
}
