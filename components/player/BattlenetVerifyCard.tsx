// components/player/BattlenetVerifyCard.tsx
//
// Carte « Vérifier mon BattleTag » (Battle.net OAuth, anti-smurf Tier 1),
// partagée par les deux endroits où on la propose :
//   - `variant="section"`    → /player/profile, section permanente du profil ;
//   - `variant="onboarding"` → /player/manage-team?welcome=1, juste après la
//     création d'équipe (arrivée par le magic-link). C'est LE moment où la
//     joueuse est connectée et encore engagée ; la proposer seulement depuis le
//     profil supposait qu'elle aille l'y chercher.
//   - `chrome="bare"`        → contenu SANS encadré, pour être posé dans le
//     chrome d'un hôte (la modale profil admin a ses propres SectionCard).
//
// La carte porte tout l'état : lecture de /api/player/battlenet-status, toast de
// retour du flux OAuth (`?battlenet=…`) et nettoyage du paramètre. Les pages
// n'ont qu'à la monter.
//
// Deux garde-fous d'affichage :
//   - feature dormante (`configured: false`) → rien n'est rendu, jamais de
//     bouton qui mènerait à un 503 ;
//   - `hideWhenVerified` (utilisé par l'onboarding) → une joueuse déjà vérifiée
//     ne voit pas de relance inutile sur son écran d'accueil.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsBattlenetVerify from '@/lib/i18n/locales/fr/battlenetVerify';

export type BattlenetStatus = {
  configured: boolean;
  linked: boolean;
  battleTag: string | null;
  verifiedAt: string | null;
};

type Props = {
  variant?: 'section' | 'onboarding';
  /**
   * 'card' (défaut) rend l'encadré ; 'bare' rend le contenu nu, à charge de
   * l'hôte de fournir titre + encadré (cas de la modale profil admin).
   */
  chrome?: 'card' | 'bare';
  /**
   * Où renvoyer sur 401. `/login` côté joueuse, `/admin/login` côté staff —
   * un·e admin déconnectée ne doit pas atterrir sur le login joueur.
   */
  loginPath?: string;
  /**
   * Chemin de retour après le round-trip Blizzard. Par défaut le chemin courant
   * sans query — `/api/auth/battlenet/start` n'accepte qu'un chemin interne.
   */
  returnTo?: string;
  /** Masque totalement la carte si la joueuse est déjà vérifiée. */
  hideWhenVerified?: boolean;
  /** Rendu si fourni : bouton « plus tard » de la variante onboarding. */
  onDismiss?: () => void;
};

export default function BattlenetVerifyCard({
  variant = 'section',
  chrome = 'card',
  loginPath = '/login',
  returnTo,
  hideWhenVerified = false,
  onDismiss,
}: Props) {
  const router = useRouter();
  const t = useT(nsBattlenetVerify);
  const locale = useLocale();
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch({ loginPath });

  const [status, setStatus] = useState<BattlenetStatus | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const next = await adminFetchJson<BattlenetStatus>(
        '/api/player/battlenet-status'
      );
      setStatus(next);
    } catch {
      // Feature dormante, session expirée ou réseau : on masque la carte
      // plutôt que d'afficher un bouton qui échouerait.
      setStatus(null);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Retour du flux OAuth : ?battlenet=verified|linked_no_match|already_linked|
  // error → toast, refresh de l'état, puis on strippe le param (les autres
  // paramètres de l'URL, dont `welcome`, sont préservés).
  useEffect(() => {
    if (!router.isReady) return;
    const bn = router.query.battlenet;
    if (typeof bn !== 'string') return;

    const feedback: Record<
      string,
      { msg: string; variant: 'success' | 'warning' | 'error' }
    > = {
      verified: { msg: t.toastVerified, variant: 'success' },
      // `linked` = compte relié mais aucun roster (staff non-joueuse) : succès
      // neutre, jamais l'avertissement « ton tag ne correspond pas ».
      linked: { msg: t.toastLinked, variant: 'success' },
      linked_no_match: { msg: t.toastNoMatch, variant: 'warning' },
      already_linked: { msg: t.toastAlreadyLinked, variant: 'error' },
      error: { msg: t.toastError, variant: 'error' },
    };
    const entry = feedback[bn];
    if (entry) {
      addToast(entry.msg, entry.variant);
      void loadStatus();
    }

    const { battlenet: _omit, ...rest } = router.query;
    void router.replace({ pathname: router.pathname, query: rest }, undefined, {
      shallow: true,
    });
  }, [router, addToast, loadStatus, t]);

  if (!status?.configured) return null;
  if (status.linked && hideWhenVerified) return null;

  const startHref = `/api/auth/battlenet/start?returnTo=${encodeURIComponent(
    returnTo || router.asPath.split('?')[0]
  )}`;

  const isOnboarding = variant === 'onboarding';

  const body = (
    <>
      {chrome === 'card' && (
        <h2 className="mb-2 text-lg font-semibold">
          {isOnboarding ? t.onboardingTitle : t.title}
        </h2>
      )}
      <p className="mb-4 text-sm text-gray-400">
        {isOnboarding ? t.onboardingWhy : t.why}
      </p>

      {status.linked ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
            <span aria-hidden="true">✓</span>
            <span>{t.verifiedTitle}</span>
          </div>
          <div className="mt-2 break-all font-mono text-sm text-white">
            {status.battleTag || '—'}
          </div>
          {status.verifiedAt && (
            <div className="mt-1 text-xs text-gray-400">
              {format(t.verifiedOn, {
                date: new Date(status.verifiedAt).toLocaleDateString(locale),
              })}
            </div>
          )}
          <p className="mt-3 text-xs text-gray-400">{t.verifiedProof}</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={startHref}
            className="inline-flex items-center gap-2 rounded-xl bg-[#148eff] px-6 py-2.5 text-sm font-medium text-white transition hover:bg-[#1a9bff]"
          >
            <span aria-hidden="true">🛡️</span>
            {t.verifyBtn}
          </a>
          {isOnboarding && (
            <>
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="text-sm text-gray-400 transition hover:text-white"
                >
                  {t.later}
                </button>
              )}
              <span className="text-xs text-gray-500">{t.onboardingHint}</span>
            </>
          )}
        </div>
      )}
    </>
  );

  if (chrome === 'bare') return body;

  return (
    <section
      className={
        isOnboarding
          ? 'mb-6 rounded-2xl border border-[#148eff]/40 bg-[#148eff]/[0.07] p-5'
          : 'rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6'
      }
    >
      {body}
    </section>
  );
}
