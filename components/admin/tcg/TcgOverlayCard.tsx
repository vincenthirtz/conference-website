// components/admin/tcg/TcgOverlayCard.tsx
//
// Le lien de la source navigateur OBS du TCG : l'émettre, le copier, le révoquer.
//
// COMPOSANT SÉPARÉ DE `TcgOverviewPanel`, DÉLIBÉRÉMENT. Ce panneau-là vient
// d'être ramené de 809 à 572 lignes pour satisfaire le garde de taille des
// écrans admin, dont la règle est « tout lot qui touche un de ces fichiers en
// extrait au moins un panneau ». Y rajouter cette carte irait à rebours du
// geste, et rapprocherait à nouveau le plafond. Deux composants montés côte à
// côte se lisent d'ailleurs mieux qu'un fichier qui fait les deux.
//
// LE LIEN EST UN SECRET PORTEUR, et l'écran le traite comme tel :
//   * il n'est jamais affiché en clair tant qu'on ne le demande pas — un lien
//     visible en permanence finit sur une capture d'écran ou dans un partage
//     d'écran de préparation de stream ;
//   * « Régénérer » est présenté comme LA réponse à « le lien a circulé », pas
//     comme un bouton anodin : émettre révoque le précédent, donc l'overlay
//     déjà configuré dans OBS cesse de fonctionner. Le dire avant évite de
//     casser un direct par curiosité.
//
// LES LIBELLÉS ARRIVENT PAR PROP, comme le reste des panneaux admin : le
// composant ne connaît aucune langue, la page hôte lui passe le bloc traduit.

import { useCallback, useEffect, useState } from 'react';

import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import WidgetCard from '@/components/admin/dashboard/WidgetCard';
import { logger } from '../../../utils/logger';

export type TcgOverlayTokenState = {
  url: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
};

export type TcgOverlayLabels = {
  heading: string;
  subtitle: string;
  none: string;
  /** Interpole `{date}`. */
  createdAt: string;
  /** Interpole `{date}`. */
  lastUsedAt: string;
  neverUsed: string;
  reveal: string;
  hide: string;
  copy: string;
  copied: string;
  create: string;
  rotate: string;
  rotateWarning: string;
  revoke: string;
  revokeWarning: string;
  working: string;
  loadError: string;
  saveError: string;
  obsHint: string;
};

type Props = { labels: TcgOverlayLabels };

export default function TcgOverlayCard({ labels }: Props) {
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const [state, setState] = useState<TcgOverlayTokenState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Le lien reste masqué par défaut : cf. l'en-tête.
  const [revealed, setRevealed] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(
        await adminFetchJson<TcgOverlayTokenState>(
          '/api/admin/tcg/overlay-token'
        )
      );
    } catch (err) {
      logger.error('[admin/tcg/overlay] load error:', err);
      setError(labels.loadError);
    }
  }, [adminFetchJson, labels]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = async (method: 'POST' | 'DELETE') => {
    setBusy(true);
    try {
      const next = await adminFetchJson<TcgOverlayTokenState>(
        '/api/admin/tcg/overlay-token',
        { method }
      );
      setState(next);
      setRevealed(false);
    } catch (err) {
      logger.error('[admin/tcg/overlay] mutate error:', err);
      addToast((err as Error)?.message || labels.saveError, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!state?.url) return;
    try {
      await navigator.clipboard.writeText(state.url);
      addToast(labels.copied, 'success');
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : on révèle
      // le lien pour qu'il reste copiable à la main plutôt que d'échouer sec.
      setRevealed(true);
    }
  };

  const onRotate = async () => {
    const ok = await confirm({
      title: labels.rotate,
      subtitle: labels.rotateWarning,
      confirmLabel: labels.rotate,
    });
    if (ok) await mutate('POST');
  };

  const onRevoke = async () => {
    const ok = await confirm({
      title: labels.revoke,
      subtitle: labels.revokeWarning,
      confirmLabel: labels.revoke,
      variant: 'danger',
    });
    if (ok) await mutate('DELETE');
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString() : null;

  return (
    <>
      <WidgetCard title={labels.heading}>
        {/* `WidgetCard` ne porte qu'un titre : le sous-titre vit dans le corps
            plutôt que d'élargir un composant partagé pour un seul appelant. */}
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

        {state?.url ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-gray-300">
                {revealed ? state.url : '•'.repeat(48)}
              </code>
              <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                className="rounded-lg border border-white/15 px-3 py-2 text-xs text-gray-300 transition hover:border-white/40 hover:text-white"
              >
                {revealed ? labels.hide : labels.reveal}
              </button>
              <button
                type="button"
                onClick={onCopy}
                className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium transition hover:bg-purple-500"
              >
                {labels.copy}
              </button>
            </div>

            <p className="text-[11px] text-gray-500">{labels.obsHint}</p>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
              {state.createdAt && (
                <span>
                  {labels.createdAt.replace(
                    '{date}',
                    fmt(state.createdAt) ?? ''
                  )}
                </span>
              )}
              <span>
                {state.lastUsedAt
                  ? labels.lastUsedAt.replace(
                      '{date}',
                      fmt(state.lastUsedAt) ?? ''
                    )
                  : labels.neverUsed}
              </span>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onRevoke}
                disabled={busy}
                className="rounded-lg px-3 py-2 text-xs text-gray-400 transition hover:text-red-200 disabled:opacity-50"
              >
                {busy ? labels.working : labels.revoke}
              </button>
              <button
                type="button"
                onClick={onRotate}
                disabled={busy}
                className="rounded-lg border border-white/15 px-3 py-2 text-xs text-gray-300 transition hover:border-white/40 hover:text-white disabled:opacity-50"
              >
                {busy ? labels.working : labels.rotate}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-400">{labels.none}</span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => void mutate('POST')}
              disabled={busy}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium transition hover:bg-purple-500 disabled:opacity-50"
            >
              {busy ? labels.working : labels.create}
            </button>
          </div>
        )}
      </WidgetCard>
      {dialog}
    </>
  );
}
