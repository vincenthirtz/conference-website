// components/admin/tcg/TcgCataloguePanel.tsx
//
// Onglet « Vue TCG » : tout ce que l'espace peut donner, et — quand on nomme
// une joueuse — ce qu'elle possède.
//
// POURQUOI LES DEUX ENSEMBLE. « Combien de cartes existent ? » et « lesquelles
// lui manquent ? » sont la même question posée depuis deux places. Les séparer
// en deux écrans obligerait à compter de tête pour répondre à la seconde, qui
// est celle qu'on pose quand une joueuse écrit pour dire qu'elle est bloquée.
//
// LE VIVIER, PAS L'HISTORIQUE. Les cartes listées sont celles qu'un paquet peut
// donner aujourd'hui. Une carte retirée du vivier ne figure plus ici, même si
// elle dort encore dans des collections : ce panneau décrit ce que l'espace
// PROPOSE.
//
// Le sélecteur de joueuse est celui de la correction de solde — même droit
// (`manage_tcg`), même recherche cantonnée à l'espace. En écrire un second
// aurait fait diverger deux fois la même précaution.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AlertBanner from '@/components/admin/AlertBanner';
import TcgPlayerPicker, {
  type PickedUser,
} from '@/components/admin/tcg/TcgPlayerPicker';
import { isOptimizableImageUrl } from '@/utils/images/optimizableImage';
import nsAdminTcgPage from '@/lib/i18n/locales/admin-fr/adminTcgPage';
import nsAdminTcgGrant from '@/lib/i18n/locales/admin-fr/adminTcgGrant';

type CatalogueKind = 'player' | 'team' | 'map' | 'fanart';

type CatalogueCard = {
  key: string;
  kind: CatalogueKind;
  id: string;
  label: string;
  imageUrl: string | null;
  owned: boolean;
  holders: number;
};

type CatalogueResponse = {
  cards: CatalogueCard[];
  total: number;
  ownedCount: number;
  userId: string | null;
};

const KIND_ORDER: CatalogueKind[] = ['player', 'team', 'map', 'fanart'];

export default function TcgCataloguePanel() {
  const t = useAdminT(nsAdminTcgPage);
  const tGrant = useAdminT(nsAdminTcgGrant);
  const { adminFetchJson } = useAdminFetch();

  const [user, setUser] = useState<PickedUser | null>(null);
  const [data, setData] = useState<CatalogueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // `true` masque les cartes déjà possédées : la question « que lui manque-t-il »
  // se pose plus souvent que « qu'a-t-elle déjà ».
  const [missingOnly, setMissingOnly] = useState(false);

  const load = useCallback(
    async (userId: string | null) => {
      setBusy(true);
      setError(null);
      try {
        const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
        const res = await adminFetchJson<CatalogueResponse>(
          `/api/admin/tcg/catalogue${query}`
        );
        setData(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : t.catalogueError);
        setData(null);
      } finally {
        setBusy(false);
      }
    },
    [adminFetchJson, t.catalogueError]
  );

  useEffect(() => {
    void load(user?.id ?? null);
  }, [load, user]);

  const groups = useMemo(() => {
    const cards = data?.cards ?? [];
    const shown = missingOnly ? cards.filter((c) => !c.owned) : cards;
    return KIND_ORDER.map((kind) => ({
      kind,
      cards: shown.filter((c) => c.kind === kind),
    })).filter((g) => g.cards.length > 0);
  }, [data, missingOnly]);

  const kindLabel = (kind: CatalogueKind): string =>
    kind === 'player'
      ? t.catalogueKindPlayers
      : kind === 'team'
        ? t.catalogueKindTeams
        : kind === 'map'
          ? t.catalogueKindMaps
          : t.catalogueKindFanart;

  return (
    <div>
      <AlertBanner message={error} variant="error" className="mb-4" />
      <p className="mb-4 text-sm text-neutral-400">{t.catalogueIntro}</p>

      <div className="mb-5 rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-4">
        <TcgPlayerPicker
          labels={tGrant}
          value={user}
          onChange={setUser}
          inputId="tcg-catalogue-player"
        />
        {user && (
          <button
            type="button"
            onClick={() => setUser(null)}
            className="mt-3 text-xs text-violet-300 underline hover:text-violet-200"
          >
            {t.catalogueClearPlayer}
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-300" aria-live="polite">
          {busy
            ? t.catalogueLoading
            : data
              ? user
                ? format(t.catalogueCountForPlayer, {
                    owned: data.ownedCount,
                    total: data.total,
                  })
                : format(t.catalogueCount, { total: data.total })
              : ''}
        </p>
        {user && (
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={missingOnly}
              onChange={(e) => setMissingOnly(e.target.checked)}
              className="rounded border-neutral-600 bg-neutral-900"
            />
            {t.catalogueMissingOnly}
          </label>
        )}
      </div>

      {groups.map((group) => (
        <section key={group.kind} className="mb-7">
          <h3 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
            {kindLabel(group.kind)} · {group.cards.length}
          </h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {group.cards.map((card) => (
              <li
                key={card.key}
                data-testid="tcg-catalogue-card"
                className={`rounded-xl border p-2 ${
                  user && card.owned
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-neutral-700/50 bg-neutral-800/40'
                }`}
              >
                <span className="relative block aspect-[3/4] overflow-hidden rounded-lg bg-neutral-900">
                  {card.imageUrl && isOptimizableImageUrl(card.imageUrl) ? (
                    <Image
                      src={card.imageUrl}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 18vw, 45vw"
                      className="object-cover"
                    />
                  ) : null}
                </span>
                <span className="mt-1.5 block truncate text-xs text-neutral-200">
                  {card.label}
                </span>
                {user && (
                  <span
                    className={`mt-0.5 block text-[11px] ${
                      card.owned ? 'text-emerald-300' : 'text-neutral-500'
                    }`}
                  >
                    {card.owned ? t.catalogueOwned : t.catalogueMissing}
                  </span>
                )}
                {/* La rareté RÉELLE : une commune que personne n'a tirée est
                    plus rare, dans les faits, qu'une légendaire répandue. */}
                <span
                  className={`mt-0.5 block text-[11px] ${
                    card.holders === 0 ? 'text-amber-300' : 'text-neutral-500'
                  }`}
                >
                  {card.holders === 0
                    ? t.catalogueNoHolder
                    : format(t.catalogueHolders, { count: card.holders })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!busy && data && groups.length === 0 && (
        <p className="py-10 text-center text-sm text-neutral-400">
          {missingOnly ? t.catalogueNothingMissing : t.catalogueEmpty}
        </p>
      )}
    </div>
  );
}
