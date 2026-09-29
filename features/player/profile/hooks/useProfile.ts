// features/player/profile/hooks/useProfile.ts — lectures et gestes de l'écran
// « Mon profil » sur le cache joueuse (lot P9).
//
// Routes « soi seulement » : la clé porte la portée courante (sujet = soi),
// comme toute clé joueuse, mais aucun `?as=` n'est envoyé.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { logger } from '@/utils/logger';
import type { PlayerScope } from '@/utils/player/playerHttp';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  usePlayerScope,
} from '../../_shared/query';
import { accountAuth, profileClient } from '../client';
import type { TwitchSourceResponse, UpdateProfileResponse } from '../schemas';

export const profileKeys = {
  twitchSource: (scope: PlayerScope, userId: string | null) =>
    playerKey(scope, 'profile', 'twitch-source', userId),
};

/**
 * Chaîne Twitch PUBLIÉE et son origine. La fiche publique retombe sur la
 * saisie de la capitaine : initialiser le champ depuis les seules métadonnées
 * le laissait vide pendant que la fiche affichait un bouton Twitch.
 */
export function useTwitchSource(userId: string | null) {
  const scope = usePlayerScope();
  return useQuery({
    queryKey: profileKeys.twitchSource(scope, userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      try {
        return await profileClient.twitchSource();
      } catch (err) {
        logger.error('[player] twitch source read error:', err);
        throw err;
      }
    },
    ...PLAYER_QUERY_OPTIONS,
  });
}

/**
 * PATCH du profil puis rafraîchissement de la session (les métadonnées du
 * jeton changent). Un Twitch envoyé devient la valeur publiée, déclarée par
 * la joueuse (`self`) — ou rien s'il a été retiré.
 */
export function useUpdateProfile(userId: string | null) {
  const scope = usePlayerScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      body: Record<string, unknown>
    ): Promise<UpdateProfileResponse> => {
      const res = await profileClient.update(body);
      await accountAuth.refreshSession();
      return res;
    },
    onSuccess: (_res, body) => {
      if (!('twitch' in body) && body.clear_twitch !== true) return;
      const next =
        body.clear_twitch === true ? '' : String(body.twitch ?? '').trim();
      qc.setQueryData<TwitchSourceResponse>(
        profileKeys.twitchSource(scope, userId),
        { twitch: next || null, twitchOrigin: next ? 'self' : null }
      );
    },
  });
}

/** Télécharge `mes-donnees.json` (droit d'accès RGPD). */
export function useDataExport() {
  return useMutation({
    mutationFn: async () => {
      const data = await profileClient.dataExport();
      // Même octets que la réponse (JSON compact, ordre des clés conservé).
      const blob = new Blob([JSON.stringify(data)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mes-donnees.json';
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (err) => logger.error('[player] export error:', err),
  });
}

/** Supprime le compte, ferme la session et renvoie à l'accueil. */
export function useDeleteAccount() {
  const router = useRouter();
  return useMutation({
    mutationFn: async () => {
      await profileClient.deleteAccount();
      await accountAuth.signOut();
      router.replace('/');
    },
    onError: (err) => logger.error('[player] delete account error:', err),
  });
}

/**
 * Changement d'e-mail / de mot de passe : ré-authentification d'abord
 * (`WrongCurrentPasswordError`), puis Supabase Auth. Après un nouveau mot de
 * passe, toutes les sessions sont révoquées et la joueuse se reconnecte.
 */
export function useAccountSecurity(email: string) {
  const router = useRouter();
  return {
    changeEmail: (currentPassword: string, newEmail: string) =>
      accountAuth.changeEmail(email, currentPassword, newEmail),
    changePassword: async (currentPassword: string, newPassword: string) => {
      await accountAuth.changePassword(email, currentPassword, newPassword);
      try {
        await accountAuth.signOutEverywhere();
      } catch (signOutErr) {
        logger.error('[player] global sign-out after pwd change:', signOutErr);
      }
    },
    backToLogin: () => router.replace('/login?next=/player/profile'),
  };
}

export { WrongCurrentPasswordError } from '../client';
