// components/admin/tcg/TcgPackHistoryPanel.tsx
//
// Onglet « Historique des gains » : chaque paquet distribué, le plus récent
// d'abord — qui l'a reçu, par quelle voie, et s'il est ouvert.
//
// POURQUOI CET ÉCRAN EXISTE. La vue d'ensemble compte, « Paquets dormants »
// nomme celles qui n'ouvrent pas ; aucun des deux ne répond à la question
// posée en direct : « est-ce qu'elle a eu son drop ? ». Il fallait lire la
// base à la main. Le filtre « Drop Twitch » y répond, pseudo Twitch à l'appui.
//
// CE QUE L'ÉCRAN NE PEUT PAS DIRE. Un drop refusé (compte Twitch non lié,
// chaîne hors direct) n'écrit rien : les points sont rendus. La note sous
// l'introduction le dit, pour qu'une absence ne se lise pas comme une panne.
//
// Le filtre vit dans l'URL (`?tab=historique&source=drop`) : le lien « les
// drops Twitch » se partage, et survit à un rechargement. Lecture : route
// `pack-history` du TCG admin, paginée par curseur.

import { useMemo } from 'react';
import Link from 'next/link';
import { useUrlFilters } from '@/utils/useUrlFilters';
import {
  tcgAdminKeys,
  useReloadTcg,
  useTcgPackHistory,
} from '@/features/admin/tcg/hooks/useTcgAdmin';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AlertBanner from '@/components/admin/AlertBanner';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import nsAdminTcgPage from '@/lib/i18n/locales/admin-fr/adminTcgPage';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import ListToolbar, { FilterSelect } from '@/features/ruban/ListToolbar';
import {
  rubanFaint,
  rubanMuted,
  rubanStrong,
} from '@/features/admin/_shared/ui/ruban';

/** Les voies d'un gain, dans l'ordre du filtre (miroir de l'API). */
const SOURCES = [
  'drop',
  'victory',
  'streak',
  'placement',
  'welcome',
  'purchase',
  'forge',
  // L'arène de la Library (lot 12 de docs/PLAN-tcg-2.md).
  'arena',
] as const;

type PackSource = (typeof SOURCES)[number];

function isPackSource(value: string | null): value is PackSource {
  return value !== null && (SOURCES as readonly string[]).includes(value);
}

/** Stable : `useUrlFilters` en fait une dépendance de mémo. */
const URL_KEYS = ['source'] as const;

type HistoryItem = {
  id: string;
  userId: string;
  displayName: string | null;
  twitchLogin: string | null;
  source: PackSource;
  grantedAt: string;
  openedAt: string | null;
  matchId: string | null;
};

type HistoryPage = {
  items: HistoryItem[];
  nextCursor: string | null;
  /** `null` = compte illisible (jamais un 0 inventé). */
  counts: Partial<Record<PackSource, number | null>>;
};

const PAGE_SIZE = 50;

/** Le drop d'abord : c'est la question qui a fait naître l'écran. */
const SOURCE_TONE: Record<PackSource, ChipTone> = {
  drop: 'live',
  victory: 'ok',
  streak: 'brand',
  placement: 'brand',
  welcome: 'neutral',
  purchase: 'neutral',
  forge: 'neutral',
  arena: 'brand',
};

const SOURCE_LABEL = {
  drop: 'historySourceDrop',
  victory: 'historySourceVictory',
  streak: 'historySourceStreak',
  placement: 'historySourcePlacement',
  welcome: 'historySourceWelcome',
  purchase: 'historySourcePurchase',
  forge: 'historySourceForge',
  arena: 'historySourceArena',
} as const satisfies Record<PackSource, string>;

/** Heure de Paris : c'est celle du direct, quel que soit le poste du staff. */
function dateTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TcgPackHistoryPanel({
  canOpenMatch = false,
}: {
  /** `arbitrate_matches` : sans lui, la fiche d'un match répond 403. */
  canOpenMatch?: boolean;
}) {
  const t = useAdminT(nsAdminTcgPage);
  // Une source que l'écran ne connaît pas encore s'affiche brute, pas vide.
  const sourceLabel = (s: PackSource): string =>
    SOURCE_LABEL[s] ? t[SOURCE_LABEL[s]] : s;
  const { filters, setFilter } = useUrlFilters(URL_KEYS);
  // Une valeur d'URL inconnue (lien ancien, faute de frappe) vaut « toutes ».
  const source: PackSource | '' = isPackSource(filters.source)
    ? filters.source
    : '';
  const query = useTcgPackHistory<HistoryPage>(source, PAGE_SIZE);
  const reload = useReloadTcg();

  const pages = query.data?.pages ?? [];
  // Un paquet distribué entre deux pages décale la suivante d'une ligne :
  // dédoublonner par id plutôt que d'afficher deux fois la même.
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: HistoryItem[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        out.push(item);
      }
    }
    return out;
  }, [query.data]);

  // Les comptes ne dépendent pas du filtre : ceux des pages du filtre
  // précédent (servies pendant la lecture) restent justes, et la liste
  // déroulante ne clignote pas.
  const counts = pages[0]?.counts ?? null;
  // La liste, elle, dépend du filtre : celle du précédent ne s'affiche pas.
  const loading = query.isPending || query.isPlaceholderData;

  const error = query.error ? query.error.message || t.historyError : null;

  const options = SOURCES.map((s) => {
    const label = sourceLabel(s);
    const count = counts?.[s];
    return {
      value: s,
      label:
        typeof count === 'number'
          ? format(t.historySourceCount, { label, count })
          : label,
    };
  });

  return (
    <div>
      <p className="mb-1 text-sm text-[var(--t2,#c7bfca)]">{t.historyIntro}</p>
      <p className={`mb-6 text-xs ${rubanFaint}`}>{t.historyRefusedNote}</p>

      <ListToolbar
        filters={
          <>
            <FilterSelect
              label={t.historySourceFilter}
              allLabel={t.historySourceAll}
              value={source}
              onChange={(v) => setFilter('source', v)}
              options={options}
            />
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={() => void reload(tcgAdminKeys.packHistory(source))}
            >
              {t.historyRefresh}
            </AdminButton>
          </>
        }
      />

      <AlertBanner message={error} variant="error" className="mb-4" />

      {loading ? (
        <p className={`text-sm ${rubanMuted}`}>{t.historyLoading}</p>
      ) : items.length === 0 ? (
        !error && (
          <p className={`py-8 text-center text-sm ${rubanMuted}`}>
            {t.historyEmpty}
          </p>
        )
      ) : (
        <>
          <ul className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
            {items.map((item) => (
              <li
                key={item.id}
                data-testid="tcg-pack-history-row"
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-medium ${rubanStrong}`}>
                      {item.displayName ?? t.historyNoName}
                    </span>
                    <Chip tone={SOURCE_TONE[item.source] ?? 'neutral'}>
                      {sourceLabel(item.source)}
                    </Chip>
                    {item.source === 'drop' && item.twitchLogin && (
                      <span className={`text-xs ${rubanMuted}`}>
                        {format(t.historyTwitch, { login: item.twitchLogin })}
                      </span>
                    )}
                  </div>
                  <p className={`mt-0.5 text-xs ${rubanFaint}`}>
                    <time dateTime={item.grantedAt}>
                      {dateTime(item.grantedAt)}
                    </time>
                    {' · '}
                    {item.openedAt ? t.historyOpened : t.historySealed}
                  </p>
                </div>
                {canOpenMatch && item.source === 'victory' && item.matchId && (
                  <Link
                    href={`/admin/matches/${item.matchId}`}
                    className="text-xs text-[var(--or-200,#eec4ff)] underline hover:text-[var(--t1,#f4edf7)]"
                  >
                    {t.historySeeMatch}
                  </Link>
                )}
              </li>
            ))}
          </ul>

          {query.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <AdminButton
                variant="ghost"
                size="sm"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage
                  ? t.historyLoadingMore
                  : t.historyLoadMore}
              </AdminButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
