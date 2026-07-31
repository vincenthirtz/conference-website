// components/player/NetworkOnboardingCard.tsx
//
// « Exister dans le réseau » — checklist d'identité (R11 + R12).
//
// Le problème n'était PAS l'absence de boutons : lier Discord (DiscordLinkCard),
// vérifier son BattleTag (BattlenetVerifyCard) et activer la découverte
// (/player/discovery) existent tous. Mais ils sont dispersés, présentés comme
// des réglages techniques, et jamais mis en regard de ce qu'ils DÉBLOQUENT.
// Résultat en prod (2026-07-31) : 6 comptes Discord liés sur 38, 3 BattleTags
// vérifiés sur 19, 0 profil découvrable.
//
// Cette carte ne réimplémente rien : elle constate ce qui manque, dit à quoi
// ça sert, et renvoie vers la surface existante. Elle disparaît d'elle-même
// quand tout est fait, et reste refermable — une relance, pas un harcèlement
// (le rejet est mémorisé par utilisateur, en local).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useT } from '@/lib/i18n/useT';
import type { NetworkStatus } from '../../pages/api/player/network-status';
import { logger } from '../../utils/logger';

type Step = {
  key: string;
  title: string;
  why: string;
  href: string;
  cta: string;
};

/** Clé de rejet par utilisateur : refermer chez soi ne referme pas chez l'autre. */
function dismissKey(userId: string): string {
  return `network-onboarding-dismissed:${userId}`;
}

export default function NetworkOnboardingCard({ userId }: { userId: string }) {
  const t = useT('networkOnboarding');
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  const [dismissed, setDismissed] = useState(true); // fermé tant qu'on ne sait pas

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(dismissKey(userId)) === '1');
    } catch {
      setDismissed(false);
    }
  }, [userId]);

  const load = useCallback(async () => {
    try {
      const data = await adminFetchJson<NetworkStatus>(
        '/api/player/network-status',
        { skipAuthRedirect: true }
      );
      setStatus(data);
    } catch (err) {
      logger.error('[NetworkOnboardingCard] load error', err);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissKey(userId), '1');
    } catch {
      // Pas de localStorage (navigation privée) : la carte réapparaîtra, tant pis.
    }
  };

  if (!status || dismissed || status.missingCount === 0) return null;

  const steps: Step[] = [];
  if (!status.discordLinked) {
    steps.push({
      key: 'discord',
      title: t.stepDiscordTitle,
      why: t.stepDiscordWhy,
      href: '#discord-link',
      cta: t.stepDiscordCta,
    });
  }
  // Le BattleTag ne concerne que les joueuses EN équipe.
  if (status.hasTeam && !status.battleTagVerified) {
    steps.push({
      key: 'battletag',
      title: t.stepBattleTagTitle,
      why: t.stepBattleTagWhy,
      href: '/player/manage-team?welcome=1',
      cta: t.stepBattleTagCta,
    });
  }
  if (!status.discoverable) {
    steps.push({
      key: 'discovery',
      title: t.stepDiscoveryTitle,
      why: t.stepDiscoveryWhy,
      href: '/player/discovery',
      cta: t.stepDiscoveryCta,
    });
  }

  if (steps.length === 0) return null;

  return (
    <section
      aria-labelledby="network-onboarding-heading"
      className="mb-6 rounded-2xl border border-[var(--color-violet)]/30 bg-gradient-to-r from-[var(--color-violet)]/10 via-[var(--color-violet)]/5 to-transparent p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id="network-onboarding-heading"
            className="text-lg font-semibold text-white"
          >
            {t.title}
          </h2>
          <p className="mt-1 text-sm text-gray-300">{t.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t.dismiss}
          title={t.dismiss}
          className="flex-shrink-0 rounded-full p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {steps.map((step) => (
          <li
            key={step.key}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">{step.title}</p>
              <p className="mt-0.5 text-xs text-gray-400">{step.why}</p>
            </div>
            <Link
              href={step.href}
              className="flex-shrink-0 rounded-xl bg-[var(--color-violet)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110"
            >
              {step.cta}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
