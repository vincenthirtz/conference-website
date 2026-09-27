// components/tcg/TcgCosmeticsPanel.tsx
//
// LES HABILLAGES DE VITRINE : acheter un cadre ou un fond, et le poser.
//
// POURQUOI. Au 2026-09-27 : 10 805 pièces gagnées, **zéro dépensée**, et DEUX
// vitrines configurées sur 63 comptes. Un habillage ne donne aucun avantage et
// ne dérègle rien — il récompense un effort par de la visibilité, ce que la
// vitrine fait déjà gratuitement pour deux personnes.
//
// ACHETER ET POSER SONT DEUX GESTES, ET L'ÉCRAN LE MONTRE. Un habillage
// possédé se pose et se retire autant qu'on veut, sans rien payer : c'est ce
// qui rend l'achat tentable. Si essayer coûtait, personne n'essaierait — et le
// débit n'existerait que sur le papier.
//
// LE CATALOGUE VIENT DE L'API, pas du bundle : un prix réglé dans le barème
// (`utils/tcg/economy.ts`) arrive ici tout seul, et l'écran ne porte pas une
// seconde copie des libellés.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import { TcgAmount } from '@/components/tcg/TcgCoin';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Cosmetic, CosmeticKind } from '@/utils/tcg/cosmetics';

type State = {
  catalog: Cosmetic[];
  owned: string[];
  frame: string | null;
  background: string | null;
};

type Props = {
  onChanged?: () => void;
  className?: string;
};

export default function TcgCosmeticsPanel({
  onChanged,
  className = '',
}: Props) {
  const t = useT(nsPlayerTcg);
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();

  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const json = await adminFetchJson<State>('/api/player/tcg/cosmetics');
      setState(json);
    } catch {
      // Panneau secondaire : on se tait plutôt que d'alerter. La page a déjà
      // de quoi faire, et un habillage indisponible n'empêche rien.
      setState(null);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  async function buy(cosmetic: Cosmetic) {
    if (busy) return;
    setBusy(cosmetic.key);
    try {
      await adminFetchJson('/api/player/tcg/cosmetics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: cosmetic.key }),
      });
      addToast(t.cosmeticBought, 'success');
      await load();
      onChanged?.();
    } catch (err) {
      addToast((err as Error)?.message ?? t.cosmeticFailed, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function equip(kind: CosmeticKind, key: string | null) {
    if (busy) return;
    setBusy(key ?? `clear-${kind}`);
    try {
      await adminFetchJson('/api/player/tcg/cosmetics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [kind]: key }),
      });
      await load();
    } catch (err) {
      addToast((err as Error)?.message ?? t.cosmeticFailed, 'error');
    } finally {
      setBusy(null);
    }
  }

  if (!state) {
    return (
      <Skeleton className={`h-40 w-full ${className}`} rounded="rounded-2xl" />
    );
  }

  const groups: {
    kind: CosmeticKind;
    title: string;
    equipped: string | null;
  }[] = [
    { kind: 'frame', title: t.cosmeticFrames, equipped: state.frame },
    {
      kind: 'background',
      title: t.cosmeticBackgrounds,
      equipped: state.background,
    },
  ];

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 ${className}`}
      aria-labelledby="tcg-cosmetics-title"
    >
      <h2 id="tcg-cosmetics-title" className="text-lg font-semibold text-white">
        {t.cosmeticTitle}
      </h2>
      <p className="mt-1 text-sm text-gray-400">{t.cosmeticIntro}</p>

      {groups.map((group) => (
        <div key={group.kind} className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
            {group.title}
          </h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {state.catalog
              .filter((c) => c.kind === group.kind)
              .map((cosmetic) => {
                const owned = state.owned.includes(cosmetic.key);
                const on = group.equipped === cosmetic.key;
                return (
                  <li
                    key={cosmetic.key}
                    className={`flex min-h-[44px] items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${
                      on
                        ? 'border-[var(--color-green)] bg-[var(--color-green)]/10'
                        : 'border-white/10 bg-black/30'
                    }`}
                  >
                    <span className="truncate text-gray-100">
                      {cosmetic.label}
                    </span>
                    {owned ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          equip(group.kind, on ? null : cosmetic.key)
                        }
                        className="shrink-0 rounded-lg border border-white/20 px-3 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-60"
                      >
                        {on ? t.cosmeticUnequip : t.cosmeticEquip}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => buy(cosmetic)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--color-green)] px-3 py-1 text-xs font-semibold text-black hover:brightness-110 disabled:opacity-60"
                      >
                        <TcgAmount value={cosmetic.priceCoins} size={12} />
                      </button>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </section>
  );
}
