// components/tcg/TcgForgePanel.tsx
//
// LA FORGE, côté écran : choisir trois doublons d'une même rareté, payer, et
// recevoir une carte de joueuse du palier au-dessus qu'on ne possède pas.
//
// POURQUOI CE PANNEAU EXISTE. Au 2026-09-27 : 10 805 pièces gagnées, **zéro
// dépensée**. Le booster était le seul débit, et douze comptes qui pouvaient se
// l'offrir ne l'ont pas fait — payer pour cinq cartes au hasard quand un paquet
// non ouvert attend déjà n'a aucun intérêt. La forge vend autre chose : une
// certitude.
//
// LA RARETÉ EST UN FILTRE, PAS UNE CONSIGNE. On ne demande pas à la joueuse de
// vérifier elle-même que ses trois cartes sont du même palier : l'écran ne lui
// propose qu'un palier à la fois. Une règle qu'on peut enfreindre par
// inattention est une règle qui produit des refus, pas des forges.
//
// ON NE PROPOSE QUE DES EXEMPLAIRES CÉDABLES. `recyclable` est calculé par
// l'API : c'est LE surnuméraire d'un sujet, celui dont la perte ne retire rien
// à la collection. S'en servir ici évite de reconstruire côté client la règle
// « jamais le dernier exemplaire », qui est la garde la plus importante du lot.

import { useMemo, useState } from 'react';
import { tcgClient } from '@/features/player/tcg/client';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import { TcgAmount } from '@/components/tcg/TcgCoin';
import {
  FORGE_DUPLICATES_REQUIRED,
  FORGE_FEE_COINS,
  nextRarity,
} from '@/utils/tcg/forge';
import { RARITY_ORDER, type TcgRarity } from '@/utils/tcg/rarity';

/** Le strict nécessaire, pour ne pas coupler ce panneau au type de la page. */
export type ForgePanelCard = {
  rarity: TcgRarity;
  count: number;
  /** L'exemplaire surnuméraire, calculé par l'API. `null` = rien à céder. */
  recyclable?: { packId: string; position: number } | null;
  /** Ce qu'on montre dans la liste. */
  label: string;
  /** Clé stable d'affichage. */
  key: string;
};

type Props = {
  cards: readonly ForgePanelCard[];
  balance: number;
  /** Appelé après une forge réussie — la page recharge collection et solde. */
  onForged: () => void;
  className?: string;
};

export default function TcgForgePanel({
  cards,
  balance,
  onForged,
  className = '',
}: Props) {
  const t = useT(nsPlayerTcg);
  const { addToast } = useToast();

  const [rarity, setRarity] = useState<TcgRarity | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  /** Les doublons cédables, par rareté — et jamais `legendary`, qui n'a rien au-dessus. */
  const byRarity = useMemo(() => {
    const out = new Map<TcgRarity, ForgePanelCard[]>();
    for (const card of cards) {
      if (!card.recyclable || card.count < 2) continue;
      if (!nextRarity(card.rarity)) continue;
      const list = out.get(card.rarity) ?? [];
      list.push(card);
      out.set(card.rarity, list);
    }
    return out;
  }, [cards]);

  /** Les paliers où l'on a DE QUOI forger — les autres ne se proposent pas. */
  const forgeable = RARITY_ORDER.filter(
    (r) => (byRarity.get(r)?.length ?? 0) >= FORGE_DUPLICATES_REQUIRED
  );

  const pool = rarity ? (byRarity.get(rarity) ?? []) : [];
  const enough = picked.length === FORGE_DUPLICATES_REQUIRED;
  const affordable = balance >= FORGE_FEE_COINS;
  const target = rarity ? nextRarity(rarity) : null;

  function toggle(key: string) {
    setPicked((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      // On borne à trois : au-delà, l'API refuserait, et un refus évitable est
      // une erreur d'interface.
      if (prev.length >= FORGE_DUPLICATES_REQUIRED) return prev;
      return [...prev, key];
    });
  }

  function chooseRarity(next: TcgRarity) {
    setRarity(next);
    // La sélection ne survit pas au changement de palier : mélanger deux
    // raretés est exactement ce que l'écran existe pour empêcher.
    setPicked([]);
  }

  async function forge() {
    if (busy || !enough || !affordable) return;
    setBusy(true);
    try {
      const chosen = pool
        .filter((c) => picked.includes(c.key))
        .map((c) => c.recyclable!)
        .filter(Boolean);
      const json = await tcgClient.forge(chosen);
      addToast(
        format(t.forgeDone, { rarity: rarityLabel(t, json?.rarity) }),
        'success'
      );
      setPicked([]);
      setRarity(null);
      onForged();
    } catch (err) {
      addToast((err as Error)?.message ?? t.forgeFailed, 'error');
    } finally {
      setBusy(false);
    }
  }

  // Aucun palier forgeable : on se tait plutôt que d'afficher un panneau mort.
  // Un débit qu'on ne peut pas déclencher n'encourage rien, il décourage.
  if (forgeable.length === 0) return null;

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 ${className}`}
      aria-labelledby="tcg-forge-title"
    >
      <h2 id="tcg-forge-title" className="text-lg font-semibold text-white">
        {t.forgeTitle}
      </h2>
      <p className="mt-1 text-sm text-gray-400">
        {format(t.forgeIntro, {
          count: FORGE_DUPLICATES_REQUIRED,
          price: FORGE_FEE_COINS,
        })}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {forgeable.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => chooseRarity(r)}
            aria-pressed={rarity === r}
            className={`rounded-xl border px-3 py-1.5 text-sm transition ${
              rarity === r
                ? 'border-[var(--color-green)] bg-[var(--color-green)]/15 text-white'
                : 'border-white/15 bg-white/5 text-gray-200 hover:bg-white/10'
            }`}
          >
            {format(t.forgeTier, {
              from: rarityLabel(t, r),
              to: rarityLabel(t, nextRarity(r) ?? undefined),
            })}
          </button>
        ))}
      </div>

      {rarity && (
        <>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {pool.map((card) => {
              const on = picked.includes(card.key);
              return (
                <li key={card.key}>
                  <button
                    type="button"
                    onClick={() => toggle(card.key)}
                    aria-pressed={on}
                    className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition ${
                      on
                        ? 'border-[var(--color-green)] bg-[var(--color-green)]/10 text-white'
                        : 'border-white/10 bg-black/30 text-gray-200 hover:bg-white/5'
                    }`}
                  >
                    <span className="truncate">{card.label}</span>
                    <span className="shrink-0 text-xs text-gray-500">
                      ×{card.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={forge}
              disabled={busy || !enough || !affordable}
              className="rounded-xl bg-[var(--color-green)] px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy
                ? t.forgeBusy
                : format(t.forgeCta, {
                    rarity: rarityLabel(t, target ?? undefined),
                  })}
            </button>
            <span className="inline-flex items-center gap-1 text-sm text-gray-400">
              <TcgAmount value={FORGE_FEE_COINS} />
            </span>
            {!affordable && (
              <span className="text-xs text-[var(--status-error)]">
                {t.forgeNoFunds}
              </span>
            )}
            {affordable && !enough && (
              <span className="text-xs text-gray-500">
                {format(t.forgePickMore, {
                  count: FORGE_DUPLICATES_REQUIRED - picked.length,
                })}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** Libellé d'une rareté. Table explicite : pas de clé i18n construite. */
function rarityLabel(
  t: typeof nsPlayerTcg.fr,
  rarity: string | undefined
): string {
  switch (rarity) {
    case 'common':
      return t.rarityCommon;
    case 'rare':
      return t.rarityRare;
    case 'epic':
      return t.rarityEpic;
    case 'legendary':
      return t.rarityLegendary;
    default:
      return '';
  }
}
