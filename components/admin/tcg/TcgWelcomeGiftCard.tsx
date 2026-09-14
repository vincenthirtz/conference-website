// components/admin/tcg/TcgWelcomeGiftCard.tsx
//
// Le cadeau d'accueil d'une édition : voir qui serait crédité, puis distribuer.
//
// ON ANNONCE LE NOMBRE AVANT DE LAISSER CLIQUER, et c'est toute la raison
// d'être de cet écran. Créditer d'un coup toutes les participantes est un acte
// collectif qu'on ne reprend pas : un paquet ouvert ne se rend pas. La
// simulation (`GET`) coûte une requête et évite de découvrir le nombre après
// coup — la confirmation le répète, pour qu'on ne clique pas sur une intention
// vague.
//
// LE BOUTON NE SE RÉARME PAS TOUT SEUL. `autoRegenerateOnSuccess: false` :
// après une distribution réussie, la clé d'idempotence reste la même, donc un
// second clic rejoue la réponse au lieu de redistribuer. Le comportement par
// défaut du hook (régénérer après un 2xx) convient à un formulaire de création
// qu'on veut pouvoir réutiliser ; il serait dangereux ici.
//
// RELANCER EST UN USAGE LÉGITIME, PAS UN ABUS : l'unicité
// `(tenant, user, source_kind, source_ref = tournoi)` fait qu'un second passage
// ne crédite QUE les joueuses arrivées entre-temps dans un roster. L'écran le
// dit, sans quoi personne n'oserait recliquer après un ajout tardif.
//
// COMPOSANT SÉPARÉ, comme les deux cartes d'overlay : le hub monte des panneaux
// côte à côte plutôt que de reconstituer un god-component.
//
// LES LIBELLÉS ARRIVENT PAR PROP : le composant ne connaît aucune langue.

import { useCallback, useEffect, useState } from 'react';

import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import WidgetCard from '@/components/admin/dashboard/WidgetCard';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { format } from '@/lib/i18n/useT';
import { logger } from '../../../utils/logger';

export type TcgWelcomeGiftLabels = {
  heading: string;
  subtitle: string;
  /** Interpole `{count}`. */
  eligible: string;
  /** Interpole `{count}`. */
  alreadyGifted: string;
  /** Interpole `{teams}`. */
  teams: string;
  /** Interpole `{coins}` et `{packs}`. */
  reward: string;
  noTournament: string;
  nothingToDo: string;
  replayHint: string;
  grant: string;
  granting: string;
  confirmTitle: string;
  /** Interpole `{count}`. */
  confirmBody: string;
  /** Interpole `{granted}`. */
  granted: string;
  /** Interpole `{granted}` et `{packsGranted}`. Écriture partielle : cf. `onGrant`. */
  partial: string;
  loadError: string;
  grantError: string;
};

type State = {
  tournamentId: string | null;
  eligible: number;
  alreadyGifted: number;
  granted: number;
  packsGranted: number;
  teams: number;
  reward: { coins: number; packs: number };
};

const ROUTE = '/api/admin/tcg/welcome-gift';

export default function TcgWelcomeGiftCard({
  labels,
}: {
  labels: TcgWelcomeGiftLabels;
}) {
  const { adminFetchJson } = useAdminFetch();
  // Cf. l'en-tête : la clé NE se régénère PAS après un succès.
  const { mutateJson } = useIdempotentMutation({
    autoRegenerateOnSuccess: false,
  });
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(await adminFetchJson<State>(ROUTE));
    } catch (err) {
      logger.error('[admin/tcg/welcome-gift] load error:', err);
      setError(labels.loadError);
    }
  }, [adminFetchJson, labels]);

  useEffect(() => {
    void load();
  }, [load]);

  const onGrant = async () => {
    if (!state) return;
    // Le nombre est répété dans la confirmation : on ne valide pas une
    // intention vague, on valide « crédite ces N comptes-là ».
    const ok = await confirm({
      title: labels.confirmTitle,
      subtitle: format(labels.confirmBody, {
        count: state.eligible - state.alreadyGifted,
      }),
      confirmLabel: labels.grant,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const next = await mutateJson<State>(ROUTE, { method: 'POST' });
      setState(next);
      // UN SUCCÈS N'EN EST PAS UN SI LES PAQUETS MANQUENT, et cet écran l'a
      // appris à ses dépens. Le 2026-09-14, il a affiché « 58 compte(s)
      // crédité(s) » en vert alors que `packsGranted` valait 0 : la contrainte
      // `tcg_packs_source_coherent` refusait chaque paquet `welcome`,
      // `grantWelcomeGift` journalisait sans lever — délibérément, pour ne pas
      // perdre 57 crédits à cause d'un — et le seul humain dans la boucle a lu
      // une réussite. Le compte rendu PORTAIT l'écart depuis le début ;
      // personne ne le regardait. On le regarde maintenant.
      if (next.packsGranted < next.granted) {
        addToast(
          format(labels.partial, {
            granted: next.granted,
            packsGranted: next.packsGranted,
          }),
          'error'
        );
      } else {
        addToast(format(labels.granted, { granted: next.granted }), 'success');
      }
    } catch (err) {
      logger.error('[admin/tcg/welcome-gift] grant error:', err);
      addToast((err as Error)?.message || labels.grantError, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remaining = state ? state.eligible - state.alreadyGifted : 0;

  return (
    <>
      <WidgetCard title={labels.heading}>
        <p className="mb-4 max-w-prose text-xs text-gray-400">
          {labels.subtitle}
        </p>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
          >
            {error}
          </div>
        )}

        {/* UN TOAST DISPARAÎT, PAS UN MANQUE. Une distribution incomplète laisse
            des joueuses avec des pièces et sans paquet — un état qu'aucun rejeu
            ne répare (les pièces existent, donc le RETURNING ne rend plus
            personne). Ça se répare à la main, donc ça doit rester affiché.
            Après un GET, `granted` vaut 0 : la condition ne se déclenche
            qu'à la suite d'une distribution réelle. */}
        {state && state.granted > state.packsGranted && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
          >
            {format(labels.partial, {
              granted: state.granted,
              packsGranted: state.packsGranted,
            })}
          </div>
        )}

        {/* Chargement : un spinner plutôt qu'une carte muette, qui se lirait
            comme « rien à distribuer ». */}
        {!state && !error && <LoadingSpinner size="sm" className="py-4" />}

        {state && !state.tournamentId ? (
          // Aucune édition en cours : il n'y a rien à distribuer, et le dire
          // vaut mieux qu'un bouton qui ne ferait rien.
          <p className="text-sm text-gray-400">{labels.noTournament}</p>
        ) : (
          state && (
            <div className="space-y-3">
              <ul className="space-y-1 text-sm text-gray-300">
                <li>{format(labels.eligible, { count: state.eligible })}</li>
                <li>
                  {format(labels.alreadyGifted, {
                    count: state.alreadyGifted,
                  })}
                </li>
                <li className="text-gray-400">
                  {format(labels.teams, { teams: state.teams })}
                </li>
                <li className="text-gray-400">
                  {format(labels.reward, {
                    coins: state.reward.coins,
                    packs: state.reward.packs,
                  })}
                </li>
              </ul>

              <p className="text-[11px] text-gray-500">{labels.replayHint}</p>

              <div className="flex flex-wrap items-center justify-end gap-3">
                {remaining <= 0 && (
                  <span className="text-xs text-gray-500">
                    {labels.nothingToDo}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void onGrant()}
                  // Rien à distribuer = rien à cliquer. Le bouton reste
                  // visible pour que l'écran ne change pas de forme, mais
                  // inerte : un clic sans effet ferait douter de l'état.
                  disabled={busy || remaining <= 0}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium transition hover:bg-purple-500 disabled:opacity-50"
                >
                  {busy ? labels.granting : labels.grant}
                </button>
              </div>
            </div>
          )
        )}
      </WidgetCard>
      {dialog}
    </>
  );
}
