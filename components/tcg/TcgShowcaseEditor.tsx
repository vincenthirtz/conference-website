// components/tcg/TcgShowcaseEditor.tsx
//
// Régler MA vitrine depuis l'espace joueuse : l'activer, choisir jusqu'à
// `maxCards` cartes.
//
// OPT-IN, ET LE RETRAIT NE S'ATTEND PAS. La case « Afficher ma vitrine »
// s'enregistre DÈS QU'ON LA DÉCOCHE : retirer quelque chose d'une page publique
// ne doit pas dépendre d'un second clic sur « Enregistrer » qu'on pourrait
// oublier. Le choix des cartes, lui, s'enregistre explicitement — on compose
// avant de publier. Le serveur régénère la fiche aussitôt.
//
// SE CHARGE LUI-MÊME (`GET/PUT /api/player/tcg/showcase`) pour ne pas grossir
// `pages/player/tcg.tsx`. La liste des cartes à choisir vient de
// `/api/player/tcg/collection`, chargée seulement à l'ouverture du sélecteur :
// la plupart des visites ne règlent pas leur vitrine.
//
// Le sélecteur est une liste de CASES À COCHER natives dans un `fieldset` :
// clavier, lecteur d'écran et limite de sélection (cases désactivées une fois
// le maximum atteint, avec la raison écrite) sans rien réinventer.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { JSX } from 'react';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import TcgCard from '@/components/tcg/TcgCard';
import { showcaseCardSubject } from '@/components/tcg/TcgShowcaseSection';
import { Skeleton } from '@/components/ui/Skeleton';
import type { ShowcaseCard } from '@/utils/tcg/showcase';
import type { LogoCredit } from '@/utils/teams/logoCredit';
import type { TcgRarity } from '@/utils/tcg/rarity';
import { useT, format } from '@/lib/i18n/useT';
import nsTcgShowcase from '@/lib/i18n/locales/fr/tcgShowcase';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';

/** Plafond d'une page de collection côté API. */
const COLLECTION_PAGE = 200;
/** Cartes lues au plus pour le sélecteur : cinq pages. */
const CHOOSER_MAX = 1000;

type ShowcaseResponse = {
  enabled: boolean;
  cards: ShowcaseCard[];
  unavailable: number;
  maxCards: number;
  publicProfileUrl: string | null;
};

/** Une carte de la collection, telle que la rend l'API (champs utiles ici). */
type CollectionCard =
  | {
      kind: 'player';
      userId: string;
      displayName: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
    }
  | {
      kind: 'team';
      teamId: string;
      name: string | null;
      slug: string | null;
      logoUrl: string | null;
      cardImageUrl: string | null;
      // Recopié tel quel dans la carte de vitrine par l'étalement de
      // `collectionToShowcaseCard` : le déclarer suffit à le faire suivre.
      logoCredit?: LogoCredit | null;
      rarity: TcgRarity;
      isFoil: boolean;
    }
  | {
      kind: 'map';
      slug: string;
      name: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
    };

/**
 * Une carte de collection sous la forme d'une carte de vitrine. La clé suit le
 * format serveur (`player:<uuid>`…), celui que la route attend.
 */
export function collectionToShowcaseCard(card: CollectionCard): ShowcaseCard {
  if (card.kind === 'player') {
    return { ...card, key: `player:${card.userId}` };
  }
  if (card.kind === 'map') {
    return { ...card, key: `map:${card.slug}` };
  }
  return {
    ...card,
    key: `team:${card.teamId}`,
    logoCredit: card.logoCredit ?? null,
  };
}

function cardName(card: ShowcaseCard): string | null {
  return card.kind === 'player' ? card.displayName : card.name;
}

export default function TcgShowcaseEditor({
  reloadToken,
  className,
}: {
  /** Change quand la collection change : la vitrine est relue. */
  reloadToken: number;
  className?: string;
}): JSX.Element {
  const t = useT(nsTcgShowcase);
  const tTcg = useT(nsPlayerTcg);
  const { addToast } = useToast();
  const { adminFetch, adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const chooserId = useId();
  const toggleId = useId();

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [enabled, setEnabled] = useState(false);
  const [maxCards, setMaxCards] = useState(3);
  const [profileUrl, setProfileUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(0);
  /** La sélection en cours, dans l'ordre choisi. */
  const [selected, setSelected] = useState<ShowcaseCard[]>([]);
  const [dirty, setDirty] = useState(false);
  // Miroir de `dirty` lisible dans `load` sans en faire une dépendance : une
  // relecture déclenchée par la collection (paquet ouvert pendant qu'on
  // compose) ne doit pas effacer une sélection pas encore enregistrée.
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const [busy, setBusy] = useState(false);

  const [chooserOpen, setChooserOpen] = useState(false);
  const [chooserState, setChooserState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [collection, setCollection] = useState<ShowcaseCard[]>([]);

  const rarityLabels: Record<TcgRarity, string> = {
    common: tTcg.rarityCommon,
    rare: tTcg.rarityRare,
    epic: tTcg.rarityEpic,
    legendary: tTcg.rarityLegendary,
  };
  const cardLabels = {
    rarity: rarityLabels,
    foil: tTcg.foil,
    copies: tTcg.copies,
    logoCredit: tTcg.logoCredit,
  };

  const apply = useCallback((data: ShowcaseResponse, keepSelection = false) => {
    setEnabled(data.enabled === true);
    if (keepSelection) {
      setUnavailable(
        typeof data.unavailable === 'number' ? data.unavailable : 0
      );
      setProfileUrl(data.publicProfileUrl ?? null);
      return;
    }
    setSelected(Array.isArray(data.cards) ? data.cards : []);
    setUnavailable(typeof data.unavailable === 'number' ? data.unavailable : 0);
    if (typeof data.maxCards === 'number' && data.maxCards > 0) {
      setMaxCards(data.maxCards);
    }
    setProfileUrl(data.publicProfileUrl ?? null);
    setDirty(false);
  }, []);

  const load = useCallback(
    async (force = false) => {
      try {
        apply(
          await adminFetchJson<ShowcaseResponse>('/api/player/tcg/showcase'),
          !force && dirtyRef.current
        );
        setState('ready');
      } catch {
        setState((prev) => (prev === 'ready' ? prev : 'error'));
      }
    },
    [adminFetchJson, apply]
  );

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const save = useCallback(
    async (nextEnabled: boolean, cards: ShowcaseCard[]) => {
      setBusy(true);
      try {
        const res = await adminFetch('/api/player/tcg/showcase', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: nextEnabled,
            cards: cards.map((c) => c.key),
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            code?: string;
          };
          addToast(
            body.code === 'not_owned' ? t.errNotOwned : t.errGeneric,
            'error'
          );
          // L'écran reprend l'état RÉEL plutôt que sa version optimiste.
          await load(true);
          return;
        }
        apply((await res.json()) as ShowcaseResponse);
        addToast(nextEnabled ? t.saved : t.savedOff, 'success');
      } catch {
        addToast(t.errGeneric, 'error');
        await load(true);
      } finally {
        setBusy(false);
      }
    },
    [adminFetch, addToast, apply, load, t]
  );

  const openChooser = useCallback(async () => {
    setChooserOpen(true);
    if (chooserState === 'ready' || chooserState === 'loading') return;
    setChooserState('loading');
    try {
      const acc: ShowcaseCard[] = [];
      let cursor: string | null = null;
      do {
        const qs: string = cursor
          ? `limit=${COLLECTION_PAGE}&cursor=${encodeURIComponent(cursor)}`
          : `limit=${COLLECTION_PAGE}`;
        const page = await adminFetchJson<{
          cards?: CollectionCard[];
          nextCursor?: string | null;
        }>(`/api/player/tcg/collection?${qs}`);
        acc.push(...(page.cards ?? []).map(collectionToShowcaseCard));
        cursor = page.nextCursor ?? null;
      } while (cursor && acc.length < CHOOSER_MAX);
      setCollection(acc);
      setChooserState('ready');
    } catch {
      setChooserState('error');
    }
  }, [adminFetchJson, chooserState]);

  const toggleCard = useCallback(
    (card: ShowcaseCard) => {
      setSelected((prev) => {
        if (prev.some((c) => c.key === card.key)) {
          return prev.filter((c) => c.key !== card.key);
        }
        if (prev.length >= maxCards) return prev;
        return [...prev, card];
      });
      setDirty(true);
    },
    [maxCards]
  );

  const selectedKeys = new Set(selected.map((c) => c.key));
  const full = selected.length >= maxCards;

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 ${className ?? ''}`}
      aria-labelledby="tcg-showcase-editor-title"
    >
      <h2 id="tcg-showcase-editor-title" className="text-lg font-semibold">
        {t.editorTitle}
      </h2>
      <p className="mt-1 max-w-prose text-sm text-gray-400">
        {format(t.editorIntro, { max: maxCards })}
      </p>
      <p className="mt-1 max-w-prose text-xs text-gray-500">{t.consentNote}</p>

      {state === 'loading' && (
        <div aria-hidden className="mt-4 space-y-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-24 w-full" rounded="rounded-xl" />
        </div>
      )}

      {state === 'error' && (
        <div role="alert" className="mt-4 text-sm text-gray-300">
          <p>{t.loadError}</p>
          <button
            type="button"
            onClick={() => {
              setState('loading');
              void load();
            }}
            className="mt-3 min-h-11 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
          >
            {t.retry}
          </button>
        </div>
      )}

      {state === 'ready' && (
        <>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <label
              htmlFor={toggleId}
              className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-white"
            >
              <input
                id={toggleId}
                type="checkbox"
                checked={enabled}
                disabled={busy}
                onChange={(e) => void save(e.target.checked, selected)}
                className="h-5 w-5 shrink-0 accent-[var(--color-green)]"
              />
              {t.toggleLabel}
            </label>
            <p
              role="status"
              aria-live="polite"
              className={`text-xs ${enabled ? 'text-[var(--color-green)]' : 'text-gray-400'}`}
            >
              {enabled ? t.statusOn : t.statusOff}
            </p>
          </div>

          {profileUrl ? (
            <Link
              href={profileUrl}
              className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-purple-300 underline-offset-4 hover:text-purple-200 hover:underline"
            >
              {t.viewProfile}
            </Link>
          ) : (
            <p className="mt-2 max-w-prose text-xs text-gray-400">
              {t.noProfile}
            </p>
          )}

          {unavailable > 0 && (
            <p role="note" className="mt-3 text-xs text-amber-200">
              {unavailable === 1
                ? t.unavailable_one
                : format(t.unavailable_other, { count: unavailable })}
            </p>
          )}

          <h3 className="mt-5 text-sm font-semibold text-gray-200">
            {format(t.chosenTitle, { count: selected.length, max: maxCards })}
          </h3>
          {selected.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">{t.chosenEmpty}</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:max-w-2xl">
              {selected.map((card) => (
                <li key={card.key} className="min-w-0">
                  <TcgCard
                    subject={showcaseCardSubject(card)}
                    rarity={card.rarity}
                    isFoil={card.isFoil}
                    labels={cardLabels}
                  />
                  <button
                    type="button"
                    onClick={() => toggleCard(card)}
                    disabled={busy}
                    aria-label={format(t.remove, {
                      name: cardName(card) ?? t.unnamed,
                    })}
                    className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-white/10 px-2 py-2 text-xs text-gray-300 transition hover:border-white/40 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] disabled:opacity-50"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                chooserOpen ? setChooserOpen(false) : void openChooser()
              }
              aria-expanded={chooserOpen}
              aria-controls={chooserId}
              className="min-h-11 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition hover:border-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
            >
              {chooserOpen ? t.chooseClose : t.chooseOpen}
            </button>
            <button
              type="button"
              onClick={() => void save(enabled, selected)}
              disabled={busy || !dirty}
              aria-busy={busy}
              className="min-h-11 rounded-full bg-[var(--color-violet-cta)]/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-violet-cta)]/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] disabled:opacity-50"
            >
              {busy ? t.saving : t.save}
            </button>
          </div>

          <div id={chooserId} hidden={!chooserOpen} className="mt-4">
            {chooserState === 'loading' && (
              <p role="status" className="text-sm text-gray-400">
                {t.chooserLoading}
              </p>
            )}
            {chooserState === 'error' && (
              <p role="alert" className="text-sm text-gray-300">
                {t.chooserError}
              </p>
            )}
            {chooserState === 'ready' && collection.length === 0 && (
              <p className="text-sm text-gray-400">{t.chooserEmpty}</p>
            )}
            {chooserState === 'ready' && collection.length > 0 && (
              <fieldset>
                <legend className="text-sm font-semibold text-gray-200">
                  {format(t.chooserLegend, { max: maxCards })}
                </legend>
                {full && (
                  <p className="mt-1 text-xs text-gray-400" aria-live="polite">
                    {format(t.chooserLimit, { max: maxCards })}
                  </p>
                )}
                <ul className="mt-3 grid max-h-96 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
                  {collection.map((card) => {
                    const checked = selectedKeys.has(card.key);
                    const kind =
                      card.kind === 'player'
                        ? t.kindPlayer
                        : card.kind === 'team'
                          ? t.kindTeam
                          : t.kindMap;
                    return (
                      <li key={card.key}>
                        <label
                          className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition hover:bg-white/5 ${
                            !checked && full
                              ? 'cursor-not-allowed opacity-50'
                              : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busy || (!checked && full)}
                            onChange={() => toggleCard(card)}
                            className="h-5 w-5 shrink-0 accent-[var(--color-violet)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-white">
                              {cardName(card) ?? t.unnamed}
                            </span>
                            <span className="block text-xs text-gray-400">
                              {kind} · {rarityLabels[card.rarity]}
                              {card.isFoil ? ` · ${tTcg.foil}` : ''}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}
          </div>
        </>
      )}
    </section>
  );
}
