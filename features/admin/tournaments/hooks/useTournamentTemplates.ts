// features/admin/tournaments/hooks/useTournamentTemplates.ts — modèles de
// tournoi personnalisés (page modèles + création de tournoi), lot L10.
//
// La création reste sur `useIdempotentMutation` (file hors ligne) ; la
// suppression passait par une requête simple, elle y reste.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TemplateStage } from '@/config/tournament-templates';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { adminRequest } from '@/utils/admin/adminHttp';
import { tournamentsClient, tournamentsUrls } from '../client';
import { MOUNT_ONLY, tournamentKeys } from './keys';

/** `enabled` : ne charger qu'à l'ouverture d'une modale, par exemple. */
export function useTournamentTemplates(enabled = true) {
  return useQuery({
    queryKey: tournamentKeys.templates(),
    queryFn: async () => (await tournamentsClient.templates()).templates ?? [],
    enabled,
    ...MOUNT_ONLY,
  });
}

export function useTournamentTemplateActions() {
  const { mutateJson } = useIdempotentMutation();
  const qc = useQueryClient();
  const refresh = () =>
    qc.invalidateQueries({ queryKey: tournamentKeys.templates() });

  const create = useMutation({
    mutationFn: (body: {
      name: string;
      description: string;
      stages: TemplateStage[];
    }) =>
      mutateJson(tournamentsUrls.templates, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void refresh(),
  });

  const remove = useMutation({
    mutationFn: (templateId: string) =>
      adminRequest(tournamentsUrls.templates, {
        method: 'DELETE',
        json: { templateId },
      }),
    onSuccess: () => void refresh(),
  });

  return { create, remove };
}
