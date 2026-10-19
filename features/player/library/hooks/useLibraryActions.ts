// features/player/library/hooks/useLibraryActions.ts — les gestes de l'écran
// « Mon appartement » : attester, acheter, changer d'avatar, régler
// l'appartement (lot 4 de docs/PLAN-womens-library.md).
//
// CHAQUE GESTE REND UNE ISSUE (`{ ok, data }` ou `{ ok: false, error }`), que
// le panneau traduit par son `code` : un refus n'est jamais avalé.
//
// UN SEUL ACHAT À LA FOIS. L'`Idempotency-Key` protège contre un rejeu RÉSEAU
// de la même requête ; un double clic, lui, produirait deux requêtes et deux
// clés. Le verrou (`useRef`, posé avant le premier rendu) l'arrête ici, et la
// base garde sa propre protection (verrou du porte-monnaie, registre à clé
// unique). Après un achat, réussi ou non, `me` est RELU : un achat dont la
// réponse s'est perdue apparaît quand même.

import { useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePlayerScope } from '../../_shared/query';
import { useLibraryClient } from '../clientContext';
import { applyPurchase, libraryErrorCode, libraryErrorNumber } from '../model';
import type { LibraryApartmentResponse, LibraryMeResponse } from '../responses';
import type {
  SaveApartmentItemsInput,
  UpdateApartmentInput,
  UpdateAvatarInput,
} from '../schemas';
import { libraryKeys } from './useLibraryHome';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: unknown };

async function settle<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    return { ok: false, error };
  }
}

export function useLibraryActions() {
  const qc = useQueryClient();
  const scope = usePlayerScope();
  const libraryClient = useLibraryClient();
  const meKey = libraryKeys.me(scope);
  const apartmentKey = libraryKeys.apartment(scope);

  const attestM = useMutation({
    mutationFn: () => libraryClient.attestAdult(),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKey }),
  });

  const buyM = useMutation({
    mutationFn: (key: string) => libraryClient.buy(key),
    onSuccess: (purchase) => {
      qc.setQueryData<LibraryMeResponse>(meKey, (prev) =>
        prev ? applyPurchase(prev, purchase) : prev
      );
    },
    onError: (error) => {
      // Le refus rappelle le solde du REGISTRE : on l'affiche tout de suite.
      const balance = libraryErrorNumber(error, 'balance');
      if (libraryErrorCode(error) === 'insufficient_funds' && balance !== null)
        qc.setQueryData<LibraryMeResponse>(meKey, (prev) =>
          prev ? { ...prev, balance } : prev
        );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: meKey }),
  });

  const avatarM = useMutation({
    mutationFn: (input: UpdateAvatarInput) => libraryClient.updateAvatar(input),
    onSuccess: (res) => {
      qc.setQueryData<LibraryMeResponse>(meKey, (prev) =>
        prev ? { ...prev, avatar: res.avatar } : prev
      );
    },
  });

  const settingsM = useMutation({
    mutationFn: (input: UpdateApartmentInput) =>
      libraryClient.updateApartment(input),
    onSuccess: (res) => {
      qc.setQueryData<LibraryApartmentResponse>(apartmentKey, (prev) =>
        prev ? { ...prev, room: res.room } : prev
      );
    },
  });

  const buying = useRef(false);
  const { mutateAsync: buyAsync } = buyM;
  const buy = useCallback(
    async (key: string) => {
      if (buying.current) return null;
      buying.current = true;
      try {
        return await settle(() => buyAsync(key));
      } finally {
        buying.current = false;
      }
    },
    [buyAsync]
  );

  const { mutateAsync: attestAsync } = attestM;
  const { mutateAsync: avatarAsync } = avatarM;
  const { mutateAsync: settingsAsync } = settingsM;

  return {
    attest: useCallback(() => settle(() => attestAsync()), [attestAsync]),
    attesting: attestM.isPending,
    buy,
    /** La clé du meuble en cours d'achat, ou null. */
    buyingKey: buyM.isPending ? (buyM.variables ?? null) : null,
    updateAvatar: useCallback(
      (input: UpdateAvatarInput) => settle(() => avatarAsync(input)),
      [avatarAsync]
    ),
    savingAvatar: avatarM.isPending,
    updateSettings: useCallback(
      (input: UpdateApartmentInput) => settle(() => settingsAsync(input)),
      [settingsAsync]
    ),
    savingSettings: settingsM.isPending,
    /** Mode déco : enregistre l'état complet (lève sur refus, cf. l'éditeur). */
    saveItems: useCallback(
      (body: SaveApartmentItemsInput) => libraryClient.saveItems(body),
      [libraryClient]
    ),
    /** L'appartement enregistré devient celui du cache (meubles posés compris). */
    applySavedApartment: useCallback(
      (res: LibraryApartmentResponse) =>
        qc.setQueryData<LibraryApartmentResponse>(apartmentKey, res),
      [qc, apartmentKey]
    ),
    /** Relit l'appartement (version dépassée : un autre onglet a enregistré). */
    reloadApartment: useCallback(
      () => qc.invalidateQueries({ queryKey: apartmentKey }),
      [qc, apartmentKey]
    ),
  };
}
