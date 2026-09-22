// utils/rating/playerProfileSeo.ts
//
// SEO de la fiche publique d'une joueuse (`pages/player/[userId].tsx`).
//
// POURQUOI UN MODULE À PART. La décision d'indexer ou non la fiche est la règle
// de vie privée la plus importante de cette page : une joueuse n'entre dans un
// moteur de recherche que si ELLE l'a voulu (opt-in de découverte, décision
// produit du 2026-07-13). Elle vivait à la ligne 1 460 d'une page de 1 564
// lignes, sans test — une refonte de la page pouvait l'emporter sans que rien
// ne le signale. Extraite telle quelle (comportement inchangé) et verrouillée
// par `tests/unit/playerProfileSeo.test.ts`.

import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { PlayerProfileCore, PlayerProfileResponse } from '@/types/rating';
// `supabaseAdmin` est chargé À LA DEMANDE dans `readProfileDiscoverable` : la
// page profil importe aussi `coreLabel` dans son composant, et un import
// statique de `@/utils/supabase` embarquerait le client serveur côté client.

/** Libellé public d'une joueuse : nom affiché, sinon BattleTag masqué. */
export function coreLabel(p: PlayerProfileCore): string {
  return p.displayName ?? p.battleTag ?? 'Joueuse inconnue';
}

/**
 * La joueuse a-t-elle activé sa découverte ?
 *
 * En l'absence de PREUVE — pas de ligne `player_discovery_profiles`, ligne à
 * `discoverable: false`, client indisponible ou lecture impossible — la réponse
 * est `false` : on n'indexe PAS. C'est le sens sûr, et le seul compatible avec
 * « aucune page publique indexée de personne » par défaut. Ne lève jamais.
 */
export async function readProfileDiscoverable(
  userId: string
): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import('@/utils/supabase');
    if (!supabaseAdmin) return false;
    const { data } = await supabaseAdmin
      .from('player_discovery_profiles')
      .select('auth_user_id')
      .eq('auth_user_id', userId)
      .eq('discoverable', true)
      .maybeSingle();
    return Boolean(data);
  } catch {
    /* on reste sur false — ne pas indexer par défaut */
    return false;
  }
}

export function buildPlayerSeo(
  profile: PlayerProfileResponse,
  /**
   * La joueuse a-t-elle activé sa découverte ? C'est ce qui décide de
   * l'INDEXATION. Une fiche reste accessible par lien dans tous les cas — un
   * partage, le classement — mais elle n'entre dans un moteur de recherche que
   * si sa titulaire l'a voulu (décision produit du 2026-07-13).
   */
  discoverable: boolean
): SeoProps {
  const { player } = profile;
  const label = coreLabel(player);
  const total = player.wins + player.losses;
  const winRate = total > 0 ? Math.round((player.wins / total) * 100) : null;
  const rating = Math.round(player.rating);

  const plural = player.gamesPlayed > 1;

  // Une joueuse non classée n'a ni rang ni rating : la description générique
  // sortait « Rang #null · 0 de rating · 0V-0D sur 0 match », et le titre
  // « Profil de X — 0 ». C'est ce que voient un moteur de recherche et
  // l'aperçu d'un lien partagé — le pire endroit pour afficher un zéro qui
  // n'est pas une mesure.
  const descriptionFr = player.unrated
    ? `Profil de ${label} : équipe, réseaux et palmarès. Pas encore de match classé.`
    : `Rang #${player.rank} · ${rating} de rating · ` +
      `${player.wins}V-${player.losses}D` +
      (winRate !== null ? ` (${winRate}% de victoires)` : '') +
      ` sur ${player.gamesPlayed} match${plural ? 's' : ''}. ` +
      `Progression, derniers matchs et face-à-face de ${label}.`;

  const descriptionEn = player.unrated
    ? `${label}'s profile: team, socials and achievements. No ranked match yet.`
    : `Rank #${player.rank} · ${rating} rating · ` +
      `${player.wins}W-${player.losses}L` +
      (winRate !== null ? ` (${winRate}% win rate)` : '') +
      ` across ${player.gamesPlayed} match${plural ? 'es' : ''}. ` +
      `Progression, recent matches and head-to-head for ${label}.`;

  // JSON-LD ProfilePage → mainEntity Person.
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: `Profil de ${label}`,
    mainEntity: {
      '@type': 'Person',
      name: label,
      ...(player.battleTag ? { alternateName: player.battleTag } : {}),
      ...(player.avatarUrl ? { image: player.avatarUrl } : {}),
    },
  };

  // Carte sociale dynamique (1200×630) générée par /api/og/player/[userId].
  // Absolue (DefaultSeo n'ajoute pas d'origine aux URLs déjà absolues). En
  // l'absence de NEXT_PUBLIC_SITE_URL (dev), on retombe sur le chemin relatif,
  // que DefaultSeo laisse tel quel.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || '';
  const ogImage = `${baseUrl}/api/og/player/${encodeURIComponent(
    player.userId
  )}`;

  return {
    title: player.unrated
      ? { fr: `Profil de ${label}`, en: `${label}'s profile` }
      : {
          fr: `Profil de ${label} — ${rating}`,
          en: `${label}'s profile — ${rating}`,
        },
    description: { fr: descriptionFr, en: descriptionEn },
    image: ogImage,
    jsonLd,
    // LA règle de ce module : pas d'opt-in, pas d'indexation.
    noindex: !discoverable,
  };
}
