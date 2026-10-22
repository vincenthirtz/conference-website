// features/player/library/ui/arena/ArenaDeckBuilder.tsx — construire son deck
// d'arène (lot 12 de docs/PLAN-tcg-2.md) : sa collection à gauche (filtres
// par rareté et par profil), ses 20 emplacements à droite, « Enregistrer ».
//
// UN DECK N'EST QU'UNE SÉLECTION. On y met un sujet autant de fois qu'on en
// possède d'exemplaires ; chaque ajout prend le MEILLEUR exemplaire encore
// libre (la règle du serveur au lancement), et la ligne du deck dit ses
// chiffres. Rien n'est verrouillé : une carte échangée ou recyclée depuis
// est signalée « plus dans ta collection » et serait écartée au lancement.
//
// Accessible : chaque carte a un bouton « Ajouter <nom> », chaque ligne du
// deck un bouton « Retirer <nom> » ; l'état de l'enregistrement est annoncé.

import { useEffect, useId, useMemo, useState } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsArena from '@/lib/i18n/locales/fr/playerLibraryArena';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import { Button, Card } from '@/features/ruban';
import type { CardStatProfile } from '@/utils/tcg/cardStats';
import type { TcgRarity } from '@/utils/tcg/rarity';
import { useArenaDeck, useSaveArenaDeck } from '../../arena/useArena';
import {
  addToDeck,
  errorCodeOf,
  availableCopies,
  capitalizeLead,
  type DeckFilters,
  faceName,
  filterCollection,
  nextCopy,
  previewDeck,
  removeFromDeck,
} from '../../arena/viewModel';
import { FOCUS_RING, TEXT_ERROR, TEXT_MUTED } from './styles';
import ArenaCardFace, {
  useArenaCardLabels,
  useProfileNames,
} from './ArenaCardFace';

const H2 = 'text-lg font-bold text-[var(--t1,#f4edf7)]';
const SELECT = `min-h-10 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-2 text-sm text-[var(--t1,#f4edf7)] ${FOCUS_RING}`;
const RARITIES: TcgRarity[] = ['common', 'rare', 'epic', 'legendary'];
const PROFILES: CardStatProfile[] = ['assault', 'bulwark', 'balanced'];

export default function ArenaDeckBuilder({ onBack }: { onBack: () => void }) {
  const t = useT(nsArena);
  const tTcg = useT(nsPlayerTcg);
  const labels = useArenaCardLabels();
  const profiles = useProfileNames();
  const ids = useId();
  const query = useArenaDeck(true);
  const save = useSaveArenaDeck();
  const [draft, setDraft] = useState<string[] | null>(null);
  const [filters, setFilters] = useState<DeckFilters>({
    rarity: 'all',
    profile: 'all',
  });
  const [saved, setSaved] = useState(false);

  const data = query.data;
  // Le brouillon part du deck enregistré, une fois lu.
  useEffect(() => {
    if (data && draft === null) setDraft(data.deck.cards);
  }, [data, draft]);

  const deck = draft ?? data?.deck.cards ?? [];
  const size = data?.rules.deckSize ?? 20;
  const collection = data?.collection ?? [];
  const shown = useMemo(
    () => filterCollection(collection, filters),
    [collection, filters]
  );
  const preview = useMemo(
    () => previewDeck(deck, collection),
    [deck, collection]
  );
  const ownedTotal = collection.reduce((n, e) => n + e.copies.length, 0);
  const dirty = data ? deck.join(',') !== data.deck.cards.join(',') : false;
  const missing = preview.filter((c) => c === null).length;

  if (query.isPending) {
    return (
      <p role="status" className={TEXT_MUTED}>
        {t.loading}
      </p>
    );
  }
  if (query.isError || !data) {
    const code = errorCodeOf(query.error);
    return (
      <div role="alert" className="flex flex-wrap items-center gap-4">
        <p className={TEXT_ERROR}>
          {(code && (t.errors as Record<string, string>)[code]) || t.error}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void query.refetch()}
        >
          {t.retry}
        </Button>
      </div>
    );
  }

  const name = (key: string) => faceName(data.faces[key], key, t.anonymous);
  const rarityName: Record<TcgRarity, string> = {
    common: tTcg.rarityCommon,
    rare: tTcg.rarityRare,
    epic: tTcg.rarityEpic,
    legendary: tTcg.rarityLegendary,
  };
  const saveCode = save.error ? errorCodeOf(save.error) : null;

  const onSave = () => {
    setSaved(false);
    save.mutate(deck, {
      onSuccess: (res) => {
        setDraft(res.deck.cards);
        setSaved(true);
      },
    });
  };

  return (
    <div className="flex flex-col gap-6" data-arena-deck="">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className={H2}>{t.deck.title}</h2>
          <p className={`mt-1 ${TEXT_MUTED}`}>
            {format(t.deck.intro, { size })}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          {t.deck.back}
        </Button>
      </div>

      {ownedTotal < size && (
        <p className={TEXT_MUTED} data-arena-too-few="">
          {format(t.deck.tooFew, { count: ownedTotal, size })}
        </p>
      )}
      {missing > 0 && (
        <p role="note" className="text-sm text-[var(--warn,#f5b342)]">
          {format(t.deck.dropped, {
            count: missing,
            names: deck
              .filter((_, i) => preview[i] === null)
              .map(name)
              .join(', '),
          })}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section
          aria-labelledby={`${ids}-collection`}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h3
              id={`${ids}-collection`}
              className="font-bold text-[var(--t1,#f4edf7)]"
            >
              {t.deck.collectionTitle}
            </h3>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-xs text-[var(--t2,#c7bfca)]">
                {t.deck.filterRarity}
                <select
                  className={SELECT}
                  value={filters.rarity}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      rarity: e.target.value as DeckFilters['rarity'],
                    }))
                  }
                >
                  <option value="all">{t.deck.filterAll}</option>
                  {RARITIES.map((r) => (
                    <option key={r} value={r}>
                      {rarityName[r]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--t2,#c7bfca)]">
                {t.deck.filterProfile}
                <select
                  className={SELECT}
                  value={filters.profile}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      profile: e.target.value as DeckFilters['profile'],
                    }))
                  }
                >
                  <option value="all">{t.deck.filterAll}</option>
                  {PROFILES.map((p) => (
                    <option key={p} value={p}>
                      {profiles[p]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {collection.length === 0 ? (
            <p className={TEXT_MUTED}>{t.deck.collectionNone}</p>
          ) : shown.length === 0 ? (
            <p className={TEXT_MUTED}>{t.deck.collectionEmpty}</p>
          ) : (
            <ul
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
              data-arena-collection=""
            >
              {shown.map((entry) => {
                const copy = nextCopy(entry, deck) ?? entry.copies[0];
                const free = availableCopies(entry, deck);
                const label = name(entry.key);
                return (
                  <li key={entry.key} className="flex flex-col gap-2">
                    <ArenaCardFace
                      card={copy}
                      face={data.faces[entry.key]}
                      labels={labels}
                    />
                    <p className="text-xs text-[var(--t2,#c7bfca)]">
                      {format(t.deck.available, {
                        count: free,
                        owned: entry.copies.length,
                      })}
                    </p>
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={free === 0 || deck.length >= size}
                      aria-label={format(t.deck.addAria, { name: label })}
                      onClick={() => {
                        setSaved(false);
                        setDraft(addToDeck(deck, entry, size));
                      }}
                    >
                      {t.deck.add}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Card
          as="section"
          aria-labelledby={`${ids}-deck`}
          className="flex flex-col gap-3 self-start lg:sticky lg:top-24"
        >
          <h3 id={`${ids}-deck`} className="font-bold text-[var(--t1,#f4edf7)]">
            {format(t.deck.deckTitle, { count: deck.length, size })}
          </h3>
          <p className={TEXT_MUTED}>
            {deck.length >= size
              ? t.deck.full
              : deck.length === 0
                ? t.deck.empty
                : ''}
          </p>
          <ol
            className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto"
            data-arena-slots=""
          >
            {deck.map((key, index) => {
              const card = preview[index];
              const label = name(key);
              return (
                <li
                  // L'ordre du deck est sa seule identité : une clé peut y être deux fois.
                  key={`${key}-${index}`}
                  className="flex items-center justify-between gap-2 rounded border border-[var(--line,rgba(194,196,201,.12))] px-2 py-1 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[var(--t1,#f4edf7)]">
                      {capitalizeLead(label, t.anonymous)}
                    </span>
                    <span className="block text-xs text-[var(--t2,#c7bfca)]">
                      {card
                        ? `${rarityName[card.rarity]} · ${format(tTcg.statsLevel, { level: card.level })} · ${tTcg.statsAttack} ${card.attack} · ${tTcg.statsDefense} ${card.defense}`
                        : t.deck.missing}
                    </span>
                  </span>
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label={format(t.deck.removeAria, { name: label })}
                    onClick={() => {
                      setSaved(false);
                      setDraft(removeFromDeck(deck, index));
                    }}
                  >
                    {t.deck.remove}
                  </Button>
                </li>
              );
            })}
          </ol>
          <div aria-live="polite" className="min-h-5 text-sm">
            {save.isPending ? (
              <span className={TEXT_MUTED}>{t.deck.saving}</span>
            ) : saved && !dirty ? (
              <span className="text-[var(--ok,#7fca65)]">{t.deck.saved}</span>
            ) : saveCode === 'not_owned' ? (
              <span className={TEXT_ERROR}>{t.deck.notOwned}</span>
            ) : save.isError ? (
              <span className={TEXT_ERROR}>{t.deck.saveError}</span>
            ) : dirty ? (
              <span className={TEXT_MUTED}>{t.deck.unsaved}</span>
            ) : null}
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={onSave}
          >
            {t.deck.save}
          </Button>
        </Card>
      </div>
    </div>
  );
}
