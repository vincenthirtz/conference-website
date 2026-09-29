// features/player/_shared/ui/CollectionView.tsx — archétype COLLECTION
// (lot P8) : TCG. Grille de vignettes tactiles (3 colonnes à 375 px, 6 en
// `lg`), FENÊTRÉE — seules les `pageSize` premières vignettes sont montées,
// la suite arrive quand la sentinelle entre dans l'écran (ou au bouton, sans
// IntersectionObserver) — et fiche d'élément en PLEIN ÉCRAN (focus piégé,
// Échap, retour du focus sur la vignette).
//
// Composé du kit features/ruban (PageHeader, Button, classes) — aucune
// brique définie ici.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { Button, PageHeader } from '@/features/ruban';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useEscape } from './ActionDock';

export type CollectionLabels = { close: string; more: string };

export default function CollectionView<T>({
  title,
  subtitle,
  items,
  getKey,
  tileLabel,
  renderTile,
  renderDetail,
  summary,
  empty,
  labels,
  pageSize = 24,
  lead,
  trail,
  gridRef,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  items: readonly T[];
  getKey: (item: T) => string;
  /** Nom accessible de la vignette et de sa fiche plein écran. */
  tileLabel: (item: T) => string;
  renderTile: (item: T) => ReactNode;
  renderDetail: (item: T) => ReactNode;
  /** « 42 cartes sur 120 », annoncé à chaque mise à jour. */
  summary?: ReactNode;
  empty?: ReactNode;
  labels: CollectionLabels;
  pageSize?: number;
  /** Panneaux entre l'en-tête et la grille (paquets, solde…). */
  lead?: ReactNode;
  /** Après la grille (page suivante servie par l'API, panneaux annexes). */
  trail?: ReactNode;
  /** Conteneur de la grille : l'écran y pose le focus après un ajout. */
  gridRef?: Ref<HTMLDivElement>;
}) {
  const [shown, setShown] = useState(pageSize);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const selected =
    openKey === null
      ? null
      : (items.find((item) => getKey(item) === openKey) ?? null);
  const dialogRef = useFocusTrap<HTMLDivElement>(selected !== null);
  const close = useCallback(() => setOpenKey(null), []);
  useEscape(selected !== null, close);
  // Retour du focus sur la vignette APRÈS le démontage de la fiche (le piège
  // de focus rend d'abord le focus à l'élément actif à son ouverture).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (openKey !== null) {
      wasOpen.current = true;
    } else if (wasOpen.current) {
      wasOpen.current = false;
      opener.current?.focus();
    }
  }, [openKey]);

  const hasMore = shown < items.length;
  const more = useCallback(
    () => setShown((n) => Math.min(n + pageSize, items.length)),
    [pageSize, items.length]
  );

  useEffect(() => {
    const node = sentinel.current;
    if (!hasMore || !node || typeof IntersectionObserver === 'undefined')
      return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) more();
    });
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, more]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-6 lg:px-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <span
            role="status"
            aria-live="polite"
            className="text-[13px] text-[var(--t3,#a39ba6)]"
          >
            {summary}
          </span>
        }
      />
      {lead}
      <div ref={gridRef}>
        {items.length === 0 ? (
          empty
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 lg:gap-3">
            {items.slice(0, shown).map((item) => {
              const key = getKey(item);
              return (
                <li key={key}>
                  <button
                    type="button"
                    data-case="normal"
                    aria-label={tileLabel(item)}
                    onClick={(e) => {
                      opener.current = e.currentTarget;
                      setOpenKey(key);
                    }}
                    className="block min-h-11 w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-1 transition-colors hover:border-[var(--or,#b467d1)]"
                  >
                    {renderTile(item)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {hasMore && (
          <div ref={sentinel} className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={more}>
              {labels.more}
            </Button>
          </div>
        )}
      </div>
      {trail}

      {selected !== null && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={tileLabel(selected)}
          className="fixed inset-0 z-[140] flex flex-col overflow-y-auto bg-[var(--canvas,#07030a)] px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <div className="mb-4 flex justify-end">
            <Button variant="secondary" size="sm" onClick={close}>
              {labels.close}
            </Button>
          </div>
          <div className="mx-auto w-full max-w-md flex-1">
            {renderDetail(selected)}
          </div>
        </div>
      )}
    </div>
  );
}
