// components/player/TcgExclusionCard.tsx
//
// « Ne pas figurer dans le TCG » — le retrait total, et son retour.
//
// POURQUOI UNE CARTE SÉPARÉE DE CELLE DE LA PHOTO. Deux raisons, et la seconde
// est la plus importante :
//   1. ce ne sont pas les mêmes gestes — déposer une image, et quitter un jeu ;
//   2. la carte de la photo ne rend RIEN tant qu'elle n'a pas pu lire son état
//      (mieux vaut une section absente qu'un « aucune photo » affiché à tort).
//      Adosser le retrait à ce composant le rendrait injoignable exactement
//      quand quelque chose ne va pas — le pire moment pour ne pas pouvoir
//      partir.
//
// LE TON N'EST PAS NEUTRE, ET C'EST VOULU. On dit ce qui part, ce qui reste, et
// que c'est réversible. Un bouton « me retirer » sans ces trois phrases
// obtiendrait un geste sans qu'il soit éclairé — le reproche exact que
// docs/TCG.md §2 adresse à un simple « envoyer une photo ».
//
// CE QUI RESTE est dit AVANT la confirmation, pas après : les cartes déjà
// tirées ne disparaissent pas des collections d'autrui, elles deviennent
// anonymes. Le découvrir ensuite ferait de ce retrait une demi-promesse.

import { useCallback, useEffect, useState } from 'react';
import { tcgClient } from '@/features/player/tcg/client';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';

type State = { excluded: boolean; excludedAt: string | null };

export default function TcgExclusionCard({
  className = '',
}: {
  className?: string;
}) {
  const t = useT(nsPlayerTcg);
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await tcgClient.exclusion<State>());
    } catch {
      // On n'affiche rien plutôt qu'un état faux : proposer « se retirer » à
      // quelqu'un qui s'est DÉJÀ retirée serait au mieux troublant.
      setState(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (next: boolean) => {
      if (busy) return;
      if (next) {
        const ok = await confirm({
          title: t.exclusionConfirmTitle,
          subtitle: t.exclusionConfirmBody,
          variant: 'warning',
          confirmLabel: t.exclusionConfirmCta,
        });
        if (!ok) return;
      }
      setBusy(true);
      try {
        await tcgClient.setExclusion(next);
        addToast(next ? t.exclusionDone : t.exclusionUndone, 'success');
        await load();
      } catch (err) {
        addToast((err as Error)?.message ?? t.errGeneric, 'error');
      } finally {
        setBusy(false);
      }
    },
    [busy, confirm, addToast, load, t]
  );

  if (!state) return null;

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-6 ${className}`}
      aria-labelledby="tcg-exclusion-title"
    >
      <h2 id="tcg-exclusion-title" className="text-lg font-semibold text-white">
        {t.exclusionTitle}
      </h2>

      {state.excluded ? (
        <>
          <p className="mt-2 max-w-prose text-sm text-gray-300">
            {t.exclusionActive}
          </p>
          <button
            type="button"
            onClick={() => void act(false)}
            disabled={busy}
            className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm text-gray-200 transition hover:bg-white/10 disabled:opacity-50"
          >
            {t.exclusionRejoin}
          </button>
        </>
      ) : (
        <>
          <ul className="mt-2 max-w-prose space-y-1.5 text-sm text-gray-300">
            <li>{t.exclusionWhatGoes}</li>
            <li>{t.exclusionWhatStays}</li>
            <li>{t.exclusionReversible}</li>
          </ul>
          <button
            type="button"
            onClick={() => void act(true)}
            disabled={busy}
            className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-rose-400/30 px-4 py-2 text-sm text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-50"
          >
            {t.exclusionCta}
          </button>
        </>
      )}

      {dialog}
    </section>
  );
}
