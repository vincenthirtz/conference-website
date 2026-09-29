// features/player/_shared/ui/ListeView.tsx — archétype LISTE (lot P8) :
// matchs, demandes, annuaire, échanges. Lignes tactiles (≥ 44 px), filtres
// en FEUILLE BASSE sous `lg` (en ligne au-dessus), pagination par curseur
// (« Charger plus », le curseur est l'affaire de l'appelant), total annoncé.
//
// Composé du kit features/ruban (PageHeader, ListToolbar, Button, classes
// `rubanRowLink` / `rubanSpinner`) — aucune brique définie ici.

import Link from 'next/link';
import {
  useCallback,
  useId,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import {
  Button,
  ListToolbar,
  PageHeader,
  rubanRowLink,
  rubanSpinner,
} from '@/features/ruban';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useEscape } from './ActionDock';

export type ListeLabels = {
  /** Bouton qui ouvre la feuille des filtres (mobile). */
  filters: string;
  /** Bouton qui la ferme. */
  closeFilters: string;
  loadMore: string;
  /** Annoncé pendant le premier chargement. */
  loading: string;
};

export default function ListeView({
  title,
  subtitle,
  search,
  filters,
  summary,
  labels,
  loading = false,
  empty,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  lead,
  after,
  resultsProps,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** `ListSearch` du kit. */
  search?: ReactNode;
  /** `FilterSelect` du kit. */
  filters?: ReactNode;
  /** « 12 résultats » : annoncé à chaque mise à jour. */
  summary?: ReactNode;
  labels: ListeLabels;
  loading?: boolean;
  /** État vide, rendu quand il n'y a aucune ligne. */
  empty?: ReactNode;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** Bloc entre l'en-tête et les filtres (ex. « mon annonce », lot P13). */
  lead?: ReactNode;
  /** Section après la liste, jamais mêlée à ses lignes (lot P13). */
  after?: ReactNode;
  /**
   * Attributs du bloc des résultats (liste + « Charger plus ») — ex.
   * `role="tabpanel"` quand des onglets (passés dans `lead`) le pilotent
   * (lot P15).
   */
  resultsProps?: HTMLAttributes<HTMLDivElement>;
  /** Des `ListeRow`. */
  children?: ReactNode;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const close = useCallback(() => setSheetOpen(false), []);
  useEscape(sheetOpen, close);
  const sheetRef = useFocusTrap<HTMLDivElement>(sheetOpen);
  const sheetTitle = useId();
  const hasRows = Array.isArray(children)
    ? children.some(Boolean)
    : Boolean(children);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pb-6 lg:px-6">
      <PageHeader title={title} subtitle={subtitle} />
      {lead}
      <ListToolbar
        search={search}
        filters={
          filters ? (
            <>
              <div className="hidden flex-wrap items-center gap-3 lg:flex [&>*]:min-h-11">
                {filters}
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="lg:hidden"
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                onClick={() => setSheetOpen(true)}
              >
                {labels.filters}
              </Button>
            </>
          ) : undefined
        }
        note={
          <span role="status" aria-live="polite">
            {summary}
          </span>
        }
      />

      <div {...resultsProps}>
        {loading ? (
          <div
            role="status"
            aria-live="polite"
            className="flex min-h-32 items-center justify-center"
          >
            <span className={rubanSpinner} aria-hidden />
            <span className="sr-only">{labels.loading}</span>
          </div>
        ) : hasRows ? (
          <ul className="flex flex-col gap-2">{children}</ul>
        ) : (
          empty
        )}

        {!loading && hasMore && onLoadMore && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              onClick={onLoadMore}
              disabled={loadingMore}
              aria-busy={loadingMore || undefined}
            >
              {labels.loadMore}
            </Button>
          </div>
        )}
      </div>

      {after}

      {sheetOpen && filters && (
        <div className="fixed inset-0 z-[140] flex items-end bg-black/60 lg:hidden">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="absolute inset-0 cursor-default"
            onClick={close}
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={sheetTitle}
            className="relative w-full rounded-t-[var(--r-card,14px)] border-t border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2
                id={sheetTitle}
                className="text-[15px] text-[var(--t1,#f4edf7)]"
              >
                {labels.filters}
              </h2>
              <Button variant="ghost" size="sm" onClick={close}>
                {labels.closeFilters}
              </Button>
            </div>
            <div className="flex flex-col gap-3 [&>*]:min-h-11 [&_select]:w-full">
              {filters}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Une ligne tactile de la liste : lien (navigation) ou bouton (action). */
export function ListeRow({
  href,
  onClick,
  children,
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const cls = `${rubanRowLink} min-h-11 w-full`;
  return (
    <li>
      {href ? (
        <Link href={href} className={cls}>
          {children}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          data-case="normal"
          className={cls}
        >
          {children}
        </button>
      )}
    </li>
  );
}
