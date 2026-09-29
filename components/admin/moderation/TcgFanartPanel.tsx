// components/admin/moderation/TcgFanartPanel.tsx
//
// La file des cartes FAN ART proposées par la communauté, dans le hub de
// modération (droit `manage_tcg`, comme la file des photos).
//
// VALIDER, C'EST DÉCIDER D'UNE RARETÉ : la base l'exige (une carte approuvée
// sans rareté n'existe pas), et le tirage l'écrit sur la carte. Le défaut vient
// du serveur, il n'est jamais imposé.
//
// RETIRER N'EST PAS SUPPRIMER. Une œuvre validée puis retirée sort des paquets
// à venir ; les cartes déjà tirées restent dans les collections et retombent
// sur une face neutre. C'est la même promesse que le retrait d'une photo.
//
// L'ÉCRAN MONTRE L'ŒUVRE ET SON CRÉDIT, pas l'identité du compte qui l'a
// déposée : on modère une image et un nom d'artiste.

import { useCallback, useState } from 'react';
import type { FanartItem, FanartStatus } from '@/features/admin/tcg/client';
import {
  useDecideTcgFanart,
  useTcgFanart,
} from '@/features/admin/tcg/hooks/useTcgModeration';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTcgFanart from '@/lib/i18n/locales/admin-fr/adminTcgFanart';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

type Status = FanartStatus;
type Item = FanartItem;

const STATUSES: Status[] = ['pending', 'approved', 'rejected', 'revoked'];

export default function TcgFanartPanel() {
  const t = useAdminT(nsAdminTcgFanart);
  const { addToast } = useToast();

  const [status, setStatus] = useState<Status>('pending');
  const list = useTcgFanart(status);
  const decideMutation = useDecideTcgFanart();
  const data = list.data ?? null;
  const state: 'loading' | 'ready' | 'error' = list.isFetching
    ? 'loading'
    : list.isError
      ? 'error'
      : 'ready';
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [rarities, setRarities] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const decide = useCallback(
    async (item: Item, action: 'approve' | 'reject' | 'revoke') => {
      const note = (notes[item.id] ?? '').trim();
      if ((action === 'reject' || action === 'revoke') && note.length < 3) {
        addToast(t.notesRequired, 'error');
        return;
      }
      setBusy(item.id);
      try {
        await decideMutation.mutateAsync({
          action,
          id: item.id,
          ...(action === 'approve'
            ? { rarity: rarities[item.id] ?? data?.defaultRarity }
            : {}),
          ...(note ? { notes: note } : {}),
        });
        addToast(
          action === 'approve'
            ? t.toastApproved
            : action === 'reject'
              ? t.toastRejected
              : t.toastRevoked,
          'success'
        );
      } catch (err) {
        addToast(err instanceof Error ? err.message : t.toastError, 'error');
      } finally {
        setBusy(null);
      }
    },
    [decideMutation, addToast, data?.defaultRarity, notes, rarities, t]
  );

  const statusLabel: Record<Status, string> = {
    pending: t.statusPending,
    approved: t.statusApproved,
    rejected: t.statusRejected,
    revoked: t.statusRevoked,
  };

  return (
    <section aria-labelledby="tcg-fanart-title">
      <h2 id="tcg-fanart-title" className="text-xl font-semibold">
        {t.title}
      </h2>
      <p className="mt-1 text-sm text-neutral-400">{t.intro}</p>

      <div className="mt-4 flex flex-wrap gap-2" role="group">
        {STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
            className={`h-[30px] rounded-[var(--r-ctrl,4px)] border px-3 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] transition [font-stretch:75%] ${
              status === value
                ? 'border-[var(--or,#b467d1)] text-[var(--or-200,#eec4ff)]'
                : 'border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t3,#a39ba6)] hover:border-[var(--t4,#807984)]'
            }`}
          >
            {statusLabel[value]}
          </button>
        ))}
      </div>

      {state === 'error' && (
        <p role="alert" className="mt-4 text-sm text-red-300">
          {t.loadError}
        </p>
      )}
      {state === 'ready' && data && data.items.length === 0 && (
        <p className="mt-4 text-sm text-neutral-400">{t.empty}</p>
      )}

      {state === 'ready' && data && data.items.length > 0 && (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {data.items.map((item) => (
            <li
              key={item.id}
              className="overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]"
            >
              {item.imageUrl ? (
                // Bucket public, hors `remotePatterns` de next/image.
                // biome-ignore lint/performance/noImgElement: bucket public hors remotePatterns
                <img
                  src={item.imageUrl}
                  alt={format(t.imageAlt, {
                    title: item.title,
                    artist: item.artistName,
                  })}
                  className="aspect-[3/4] w-full max-w-full object-cover"
                />
              ) : (
                <div
                  className="aspect-[3/4] w-full bg-[var(--s2,#1d1520)]"
                  aria-hidden
                />
              )}
              <div className="space-y-3 p-4">
                <div>
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="text-sm text-neutral-300">
                    {format(t.by, { artist: item.artistName })}
                  </p>
                  {item.artistUrl && (
                    <a
                      href={item.artistUrl}
                      target="_blank"
                      rel="noreferrer nofollow"
                      className="text-xs text-[var(--or-200,#eec4ff)] underline underline-offset-2"
                    >
                      {t.artistLink}
                    </a>
                  )}
                  {item.rarity && (
                    <p className="mt-1 text-xs text-neutral-400">
                      {format(t.rarityIs, { rarity: item.rarity })}
                    </p>
                  )}
                  {item.reviewNotes && (
                    <p className="mt-1 text-xs text-neutral-400">
                      {format(t.notesAre, { notes: item.reviewNotes })}
                    </p>
                  )}
                </div>

                {(item.status === 'pending' || item.status === 'approved') && (
                  <div className="space-y-2">
                    {item.status === 'pending' && (
                      <label className="block text-xs text-neutral-400">
                        {t.labelRarity}
                        <select
                          value={rarities[item.id] ?? data.defaultRarity}
                          onChange={(e) =>
                            setRarities((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-white focus:border-[var(--or,#b467d1)] focus:outline-none"
                        >
                          {data.rarities.map((rarity) => (
                            <option key={rarity} value={rarity}>
                              {rarity}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="block text-xs text-neutral-400">
                      {t.labelNotes}
                      <input
                        value={notes[item.id] ?? ''}
                        onChange={(e) =>
                          setNotes((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-white focus:border-[var(--or,#b467d1)] focus:outline-none"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {item.status === 'pending' ? (
                        <>
                          <AdminButton
                            variant="secondary"
                            size="sm"
                            disabled={busy === item.id}
                            onClick={() => void decide(item, 'approve')}
                          >
                            {t.approve}
                          </AdminButton>
                          <AdminButton
                            variant="danger"
                            size="sm"
                            disabled={busy === item.id}
                            onClick={() => void decide(item, 'reject')}
                          >
                            {t.reject}
                          </AdminButton>
                        </>
                      ) : (
                        <AdminButton
                          variant="ghost"
                          size="sm"
                          disabled={busy === item.id}
                          onClick={() => void decide(item, 'revoke')}
                        >
                          {t.revoke}
                        </AdminButton>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
