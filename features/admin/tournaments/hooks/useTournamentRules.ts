// features/admin/tournaments/hooks/useTournamentRules.ts — le règlement à
// valider, côté staff : versions déposées, validations par équipe, dépôt
// d'une nouvelle version.
//
// Partagé par l'édition du tournoi (section « Règlement »), le hub (pastille
// « Règlement X/Y » des équipes) et les demandes d'inscription (bouton
// « Approuver » bloqué tant qu'une validation manque). Une seule clé par
// tournoi : le cache est commun à ces écrans.
//
// Lectures SILENCIEUSES en cas de refus : la fiche demande est ouverte aux
// casters, que `manage_tournaments` exclut — un 403 ici n'efface rien de
// l'écran, il ne fait qu'éteindre l'annonce (le serveur reste le juge).

import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tournamentsClient, type TournamentRulesUploadBody } from '../client';
import { MOUNT_ONLY, tournamentKeys } from './keys';

export const tournamentRulesKey = (id: string) =>
  tournamentKeys.part(id, 'rules');
export const tournamentRulesStatusKey = (id: string) =>
  tournamentKeys.part(id, 'rules', 'status');

/** `GET /api/admin/tournament/[id]/rules` — réglage + versions. */
export function useTournamentRulesVersions(id: string, enabled = true) {
  return useQuery({
    queryKey: tournamentRulesKey(id),
    queryFn: () => tournamentsClient.rules(id),
    enabled: !!id && enabled,
    ...MOUNT_ONLY,
  });
}

/** `GET /api/admin/tournament/[id]/rules/status` — validations par équipe. */
export function useTournamentRulesStatus(id: string, enabled = true) {
  return useQuery({
    queryKey: tournamentRulesStatusKey(id),
    queryFn: () => tournamentsClient.rulesStatus(id),
    enabled: !!id && enabled,
    ...MOUNT_ONLY,
  });
}

/**
 * Réglage + validations, la seconde lecture seulement si le tournoi demande
 * la validation (sinon rien à compter).
 */
export function useTournamentRulesOverview(
  id: string | null | undefined,
  enabled = true
) {
  const tid = id ?? '';
  const versions = useTournamentRulesVersions(tid, enabled);
  const required = versions.data?.required === true;
  const status = useTournamentRulesStatus(tid, enabled && required);
  return { versions, status, required };
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Empreinte d'un dépôt : même fichier, mêmes choix → même intention. */
function uploadFingerprint(body: TournamentRulesUploadBody): string {
  return [
    body.filename,
    body.data.length,
    body.data.slice(-64),
    body.requiresRevalidation,
    body.note ?? '',
  ].join('|');
}

/**
 * Dépôt d'une version. La clé d'idempotence est GARDÉE jusqu'au succès tant
 * que le dépôt est le même : un nouvel essai après une coupure rejoue la
 * réponse au lieu de créer une version de plus (et de renotifier toutes les
 * équipes). Un autre fichier ou d'autres choix = une autre intention.
 */
export function useUploadTournamentRules(id: string) {
  const qc = useQueryClient();
  const keyRef = useRef<{ key: string; fingerprint: string } | null>(null);
  return useMutation({
    mutationFn: (body: TournamentRulesUploadBody) => {
      const fingerprint = uploadFingerprint(body);
      if (keyRef.current?.fingerprint !== fingerprint) {
        keyRef.current = { key: newIdempotencyKey(), fingerprint };
      }
      return tournamentsClient.uploadRules(id, body, keyRef.current.key);
    },
    onSuccess: () => {
      keyRef.current = null;
      void qc.invalidateQueries({ queryKey: tournamentRulesKey(id) });
    },
  });
}
