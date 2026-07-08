// components/admin/AdminListShell.tsx
//
// Présentation unifiée des trois états d'une liste admin : erreur → chargement
// → vide → contenu. Factorise la triade JSX hand-rollée dans ~90 pages (empty
// inline) et ~58 « texte de chargement » maison, autour du contrat déjà
// standardisé par `useAdminResource` (`loading` / `error` / `data`).
//
// Contrat des états (dans cet ordre) :
//  1. `error` non nul → bannière d'erreur cohérente (role="alert") + bouton
//     retry optionnel (`onRetry`). La bannière est rendue EN HAUT et n'écrase
//     pas une liste déjà chargée : sur un refetch en erreur avec des données
//     encore présentes (`!isEmpty`), la liste reste visible sous la bannière.
//  2. premier chargement (`loading && isEmpty`) → `LoadingSpinner` centré.
//  3. liste vide (`isEmpty`) → `EmptyState` (via `empty` ReactNode, ou
//     `emptyTitle`/`emptyMessage`/`emptyIcon`/`emptyAction`).
//  4. sinon → `children` (la liste). Un refetch avec données présentes
//     (`loading && !isEmpty`) rend directement `children` : la liste ne
//     clignote pas.

import type { ReactNode } from 'react';
import EmptyState from './EmptyState';
import LoadingSpinner from './LoadingSpinner';

export type AdminListShellProps = {
  /** État de chargement (typiquement `loading` de `useAdminResource`). */
  loading: boolean;
  /** Message d'erreur, ou `null` (typiquement `error` de `useAdminResource`). */
  error: string | null;
  /** La liste est-elle vide ? (typiquement `data.length === 0`). */
  isEmpty: boolean;
  /** Le contenu liste, rendu uniquement quand il y a des données. */
  children: ReactNode;

  /** Callback de retry affiché comme bouton dans la bannière d'erreur. */
  onRetry?: () => void;
  /** Libellé du bouton retry. Défaut : « Réessayer ». */
  retryLabel?: string;

  /** Empty state custom (prioritaire sur emptyTitle/emptyMessage). */
  empty?: ReactNode;
  /** Titre de l'empty state (utilisé si `empty` non fourni). */
  emptyTitle?: string;
  /** Description de l'empty state. */
  emptyMessage?: string;
  /** Icône de l'empty state. */
  emptyIcon?: ReactNode;
  /** Action (CTA) de l'empty state. */
  emptyAction?: ReactNode;

  /** Libellé affiché sous le spinner de chargement. */
  loadingLabel?: string;
  /** Classes du conteneur du spinner (padding vertical, etc.). Défaut : py-16. */
  loadingClassName?: string;

  /** Classe du wrapper racine. */
  className?: string;
  errorTestId?: string;
  emptyTestId?: string;
  loadingTestId?: string;
};

export default function AdminListShell({
  loading,
  error,
  isEmpty,
  children,
  onRetry,
  retryLabel = 'Réessayer',
  empty,
  emptyTitle,
  emptyMessage,
  emptyIcon,
  emptyAction,
  loadingLabel,
  loadingClassName = 'py-16',
  className,
  errorTestId,
  emptyTestId,
  loadingTestId,
}: AdminListShellProps) {
  let content: ReactNode;
  if (error && isEmpty) {
    // Erreur au premier chargement : la bannière suffit, pas d'empty trompeur.
    content = null;
  } else if (loading && isEmpty) {
    content = (
      <div data-testid={loadingTestId}>
        <LoadingSpinner className={loadingClassName} label={loadingLabel} />
      </div>
    );
  } else if (isEmpty) {
    content =
      empty ??
      (emptyTitle ? (
        <EmptyState
          title={emptyTitle}
          description={emptyMessage}
          icon={emptyIcon}
          action={emptyAction}
        />
      ) : null);
  } else {
    content = children;
  }

  return (
    <div className={className}>
      {error && (
        <div
          role="alert"
          data-testid={errorTestId}
          className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex-1">{error}</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="flex-shrink-0 rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-500"
              >
                {retryLabel}
              </button>
            )}
          </div>
        </div>
      )}
      {content}
    </div>
  );
}
