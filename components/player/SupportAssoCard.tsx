// components/player/SupportAssoCard.tsx
//
// Petit encart "coup de main à l'asso" affiché sur le dashboard joueur après
// connexion : la billetterie est gratuite, mais un don ou une adhésion aide
// l'association. Dismissible — le choix est persisté en localStorage (clé
// versionnée pour pouvoir re-proposer plus tard en changeant le suffixe).
//
// Même famille visuelle que les autres cartes du dashboard (rounded-2xl,
// border, surface translucide) et même pattern de dismissal que PushOptIn.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import nsSupportAssoCard from '@/lib/i18n/locales/fr/supportAssoCard';

const DISMISS_KEY = 'asso-support-dismissed-v1';

export default function SupportAssoCard() {
  const t = useT(nsSupportAssoCard);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      // localStorage indisponible — on accepte d'afficher.
    }
    setVisible(true);
  }, []);

  const handleDismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Ignore.
    }
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="rounded-2xl border border-pink-500/30 bg-pink-500/[0.06] backdrop-blur-xl p-4"
      data-testid="support-asso-card"
    >
      <div className="flex items-start gap-3">
        <svg
          className="w-6 h-6 flex-shrink-0 text-pink-300 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
          />
        </svg>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold mb-1 text-pink-100">
            {t.title}
          </h3>
          <p className="text-xs text-pink-100/70 leading-snug">{t.body}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href="/don"
              className="px-3 py-1.5 text-xs rounded-md bg-gradient-to-r from-pink-500 to-purple-500 hover:brightness-110 text-white font-medium transition"
              data-testid="support-asso-donate"
            >
              {t.donateCta}
            </Link>
            <Link
              href="/association#adhesion"
              className="px-3 py-1.5 text-xs rounded-md border border-pink-500/30 text-pink-100 hover:bg-pink-500/10 transition-colors"
              data-testid="support-asso-join"
            >
              {t.joinCta}
            </Link>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label={t.dismissAria}
              className="ml-auto px-3 py-1.5 text-xs rounded-md text-pink-100/60 hover:text-pink-100 hover:bg-pink-500/10 transition-colors"
              data-testid="support-asso-dismiss"
            >
              {t.dismiss}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
