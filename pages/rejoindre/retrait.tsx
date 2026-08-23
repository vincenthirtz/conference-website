// pages/rejoindre/retrait.tsx
//
// Page de retrait d'une fiche « joueuse libre ». Cible du lien envoyé par email
// à l'inscription (utils/freePlayerRemoval.ts).
//
// Le retrait exige un CLIC : la page ne supprime rien au chargement. Les
// clients mail et les antivirus pré-visitent les liens d'un email — un retrait
// déclenché au GET ferait disparaître des fiches sans que personne n'ait
// décidé quoi que ce soit.
//
// `noindex` : la page n'a de sens qu'avec un token, et une URL portant un token
// n'a rien à faire dans un index de moteur de recherche.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT, format as fmt } from '@/lib/i18n/useT';
import nsRejoindrePage from '@/lib/i18n/locales/fr/rejoindrePage';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; name: string | null }
  | { kind: 'removing'; name: string | null }
  | { kind: 'done' }
  | { kind: 'invalid' }
  | { kind: 'error'; name: string | null };

function RetraitPage() {
  const t = useT(nsRejoindrePage);
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : '';
  const [state, setState] = useState<State>({ kind: 'loading' });

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
          `/api/public/free-players/remove?token=${encodeURIComponent(token)}`
        );
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: 'invalid' });
          return;
        }
        const data = await res.json();
        setState({ kind: 'ready', name: data?.name ?? null });
      } catch {
        if (!cancelled) setState({ kind: 'invalid' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, token]);

  const handleRemove = useCallback(async () => {
    const name = 'name' in state ? state.name : null;
    setState({ kind: 'removing', name });
    try {
      const res = await fetch('/api/public/free-players/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState({ kind: 'done' });
    } catch {
      setState({ kind: 'error', name });
    }
  }, [state, token]);

  const card =
    'mx-auto max-w-lg rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-8 text-center';
  const primaryBtn =
    'mt-6 w-full rounded-lg bg-gradient-to-r from-[var(--color-violet)] to-[var(--color-green)] px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
  const linkBtn =
    'mt-4 inline-block text-sm font-semibold text-[var(--color-green-light)] underline underline-offset-2';

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
          <p className="mt-3 text-sm text-gray-300">{t.removeInvalidBody}</p>
          <Link href="/contact" className={linkBtn}>
            {t.removeContactStaff}
          </Link>
        </div>
      )}

      {state.kind === 'done' && (
        <div className={card} role="status">
          <h1 className="text-xl font-bold">{t.removeDoneTitle}</h1>
          <p className="mt-3 text-sm text-gray-300">{t.removeDoneBody}</p>
          <Link href="/rejoindre" className={linkBtn}>
            {t.removeBackCta}
          </Link>
        </div>
      )}

      {(state.kind === 'ready' ||
        state.kind === 'removing' ||
        state.kind === 'error') && (
        <div className={card}>
          <h1 className="text-xl font-bold">{t.removeTitle}</h1>
          {state.name && (
            <p className="mt-2 text-sm text-gray-400">
              {fmt(t.removeFor, { name: state.name })}
            </p>
          )}
          <p className="mt-3 text-sm text-gray-300">{t.removeIntro}</p>

          {state.kind === 'error' && (
            <p role="alert" className="mt-4 text-sm text-red-300">
              {t.removeError}
            </p>
          )}

          <button
            type="button"
            onClick={handleRemove}
            disabled={state.kind === 'removing'}
            className={primaryBtn}
          >
            {state.kind === 'removing' ? t.removeWorking : t.removeConfirm}
          </button>

          <Link href="/rejoindre" className={linkBtn}>
            {t.removeBackCta}
          </Link>
        </div>
      )}
    </div>
  );
}

const retraitSeo: SeoProps = {
  title: {
    fr: "Retirer ma fiche — OW Women's Cup",
    en: "Remove my profile — OW Women's Cup",
  },
  // Une URL qui porte un token n'a rien à faire dans un index.
  noindex: true,
};

RetraitPage.seo = retraitSeo;

export default RetraitPage;
