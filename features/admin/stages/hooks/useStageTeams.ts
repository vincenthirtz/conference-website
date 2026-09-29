// features/admin/stages/hooks/useStageTeams.ts — équipes d'une phase
// (pages/admin/stages/[stageId]/teams), lot L10.
//
// Les seeds se SAISISSENT sur cet écran : pas de relecture automatique
// (focus, reconnexion) qui écraserait une saisie. On relit à l'ouverture et
// après chaque geste, comme avant.

import { useQuery } from '@tanstack/react-query';
import { adminRequest } from '@/utils/admin/adminHttp';
import { EDITOR_QUERY_OPTIONS } from '../../_shared/query';
import { stageUrls } from '../client';
import { stageKeys } from './keys';

/** `R` : forme de la réponse telle que l'écran la lit. */
export function useStageTeams<R>(stageId: string) {
  return useQuery({
    queryKey: stageKeys.part(stageId, 'teams'),
    queryFn: () => adminRequest<R>(stageUrls.teams(stageId)),
    enabled: !!stageId,
    ...EDITOR_QUERY_OPTIONS,
    // Chaque lecture réinitialise seeds et sélection, même sans changement.
    structuralSharing: false,
  });
}
