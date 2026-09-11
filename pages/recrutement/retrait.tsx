// pages/recrutement/retrait.tsx
//
// Page de retrait d'une annonce « cette équipe cherche une joueuse ». Cible du
// lien envoyé par email à la publication (utils/teamOpeningRemoval.ts).
//
// Miroir exact de `pages/rejoindre/retrait.tsx`, mêmes deux partis pris :
//
//   1. le retrait exige un CLIC. La page ne supprime rien au chargement, parce
//      que les clients mail et les antivirus pré-visitent les liens d'un email —
//      un retrait déclenché au GET ferait disparaître des annonces sans que
//      personne n'ait rien décidé ;
//   2. `noindex` : l'URL porte un jeton, elle n'a rien à faire dans un index.
//
// Différence avec le pendant joueuse : l'API renvoie `teamName` et non `name`.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT, format as fmt } from '@/lib/i18n/useT';
import nsRecrutementPage from '@/lib/i18n/locales/fr/recrutementPage';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; teamName: string | null }
  | { kind: 'removing'; teamName: string | null }
  | { kind: 'done' }
  | { kind: 'invalid' }
  | { kind: 'error'; teamName: string | null };

function RetraitAnnoncePage() {
  const t = useT(nsRecrutementPage);
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : '';
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    // `router.isReady` : sur une page statique, `query` est vide au premier
    // rendu. Vérifier le jeton avant reviendrait à le déclarer invalide.
    if (!router.isReady) return;
    if (!token) {
      setState({ kind: 'invalid' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/public/team-openings/remove?token=${encodeURIComponent(token)}`
        );
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: 'invalid' });
          return;
        }
        const data = await res.json();
        setState({ kind: 'ready', teamName: data?.teamName ?? null });
      } catch {
        if (!cancelled) setState({ kind: 'invalid' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, token]);

  const handleRemove = useCallback(async () => {
    const teamName = 'teamName' in state ? state.teamName : null;
    setState({ kind: 'removing', teamName });
    try {
      const res = await fetch('/api/public/team-openings/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState({ kind: 'done' });
    } catch {
      setState({ kind: 'error', teamName });
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
          <Link href="/recrutement" className={linkBtn}>
            {t.removeBackCta}
          </Link>
        </div>
      )}

      {(state.kind === 'ready' ||
        state.kind === 'removing' ||
        state.kind === 'error') && (
        <div className={card}>
          <h1 className="text-xl font-bold">{t.removeTitle}</h1>
          {state.teamName && (
            <p className="mt-2 text-sm text-gray-400">
              {fmt(t.removeFor, { team: state.teamName })}
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

          <Link href="/recrutement" className={linkBtn}>
            {t.removeBackCta}
          </Link>
        </div>
      )}
    </div>
  );
}

const retraitSeo: SeoProps = {
  title: {
    fr: "Retirer mon annonce — OW Women's Cup",
    en: "Remove my listing — OW Women's Cup",
  },
  // Une URL qui porte un jeton n'a rien à faire dans un index.
  noindex: true,
};

RetraitAnnoncePage.seo = retraitSeo;

export default RetraitAnnoncePage;
