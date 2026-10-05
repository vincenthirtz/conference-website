// pages/rejoindre/prolonger.tsx
//
// « Je cherche toujours » — prolonge une fiche « joueuse libre » de 60 jours.
// Cible du bouton de la relance envoyée avant péremption
// (cron free-players-expiry), et du renvoi de liens.
//
// Comme pour le retrait, la prolongation exige un CLIC : les clients mail et
// les antivirus pré-visitent les liens d'un email. Prolonger au chargement
// garderait en ligne des fiches dont la titulaire n'a rien décidé.
//
// `noindex` : une URL qui porte un token n'a rien à faire dans un index.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT, format as fmt } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsRejoindrePage from '@/lib/i18n/locales/fr/rejoindrePage';

type Info = { name: string | null; expiresAt: string | null; expired: boolean };

type State =
  | { kind: 'loading' }
  | ({ kind: 'ready' } & Info)
  | ({ kind: 'renewing' } & Info)
  | { kind: 'done'; expiresAt: string | null }
  | { kind: 'invalid' }
  | ({ kind: 'error' } & Info);

function ProlongerPage() {
  const t = useT(nsRejoindrePage);
  const locale = useLocale();
  const router = useRouter();
  const token =
    typeof router.query.token === 'string' ? router.query.token : '';
  const [state, setState] = useState<State>({ kind: 'loading' });

  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '';

  useEffect(() => {
    // `router.isReady` : sur une page statique, `query` est vide au premier
    // rendu. Vérifier le token avant équivaudrait à le déclarer invalide.
    if (!router.isReady) return;
    if (!token) {
      setState({ kind: 'invalid' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/public/free-players/renew?token=${encodeURIComponent(token)}`
        );
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: 'invalid' });
          return;
        }
        const data = await res.json();
        setState({
          kind: 'ready',
          name: data?.name ?? null,
          expiresAt: data?.expiresAt ?? null,
          expired: data?.expired === true,
        });
      } catch {
        if (!cancelled) setState({ kind: 'invalid' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, token]);

  const handleRenew = useCallback(async () => {
    if (state.kind !== 'ready' && state.kind !== 'error') return;
    const info: Info = {
      name: state.name,
      expiresAt: state.expiresAt,
      expired: state.expired,
    };
    setState({ kind: 'renewing', ...info });
    try {
      const res = await fetch('/api/public/free-players/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setState({ kind: 'done', expiresAt: data?.expiresAt ?? null });
    } catch {
      setState({ kind: 'error', ...info });
    }
  }, [state, token]);

  const card =
    'mx-auto max-w-lg rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-8 text-center';
  const primaryBtn =
    'mt-6 w-full rounded-lg bg-gradient-to-r from-[var(--color-violet)] to-[var(--color-green)] px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
  const linkBtn =
    'mt-4 inline-block text-sm font-semibold text-[var(--color-green-light)] underline underline-offset-2';
  const removeHref = `/rejoindre/retrait?token=${encodeURIComponent(token)}`;

  return (
    <div className="min-h-screen bg-neutral-950 px-6 py-32 text-white">
      {state.kind === 'loading' && (
        <div className={card}>
          <p className="text-sm text-gray-300">{t.removeLoading}</p>
        </div>
      )}

      {state.kind === 'invalid' && (
        <div className={card} role="alert">
          <h1 className="text-xl font-bold">{t.removeInvalidTitle}</h1>
          <p className="mt-3 text-sm text-gray-300">{t.renewInvalidBody}</p>
          <Link href="/rejoindre" className={linkBtn}>
            {t.removeBackCta}
          </Link>
        </div>
      )}

      {state.kind === 'done' && (
        <div className={card} role="status">
          <h1 className="text-xl font-bold">{t.renewDoneTitle}</h1>
          <p className="mt-3 text-sm text-gray-300">
            {fmt(t.renewDoneBody, { date: formatDate(state.expiresAt) })}
          </p>
          <Link href="/rejoindre" className={linkBtn}>
            {t.removeBackCta}
          </Link>
        </div>
      )}

      {(state.kind === 'ready' ||
        state.kind === 'renewing' ||
        state.kind === 'error') && (
        <div className={card}>
          <h1 className="text-xl font-bold">{t.renewTitle}</h1>
          {state.name && (
            <p className="mt-2 text-sm text-gray-400">
              {fmt(t.renewFor, { name: state.name })}
            </p>
          )}
          <p className="mt-3 text-sm text-gray-300">
            {state.expired
              ? t.renewExpired
              : state.expiresAt
                ? fmt(t.renewExpiresOn, { date: formatDate(state.expiresAt) })
                : null}
          </p>
          <p className="mt-3 text-sm text-gray-300">{t.renewIntro}</p>

          {state.kind === 'error' && (
            <p role="alert" className="mt-4 text-sm text-red-300">
              {t.renewError}
            </p>
          )}

          <button
            type="button"
            onClick={handleRenew}
            disabled={state.kind === 'renewing'}
            className={primaryBtn}
          >
            {state.kind === 'renewing' ? t.renewWorking : t.renewConfirm}
          </button>

          <Link href={removeHref} className={linkBtn}>
            {t.renewRemoveInstead}
          </Link>
        </div>
      )}
    </div>
  );
}

const prolongerSeo: SeoProps = {
  title: {
    // DefaultSeo ajoute déjà « | <nom du site> » : pas de suffixe ici.
    fr: 'Garder ma fiche en ligne',
    en: 'Keep my profile online',
  },
  noindex: true,
};

ProlongerPage.seo = prolongerSeo;

export default ProlongerPage;
