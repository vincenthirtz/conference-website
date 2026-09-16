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

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTcgFanart from '@/lib/i18n/locales/admin-fr/adminTcgFanart';

type Status = 'pending' | 'approved' | 'rejected' | 'revoked';

type Item = {
  id: string;
  title: string;
  artistName: string;
  artistUrl: string | null;
  imageUrl: string | null;
  status: Status;
  rarity: string | null;
  reviewNotes: string | null;
  createdAt: string;
};

type Response = {
  items: Item[];
  status: Status;
  rarities: string[];
  defaultRarity: string;
};

const STATUSES: Status[] = ['pending', 'approved', 'rejected', 'revoked'];

export default function TcgFanartPanel() {
  const t = useAdminT(nsAdminTcgFanart);
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();

  const [status, setStatus] = useState<Status>('pending');
  const [data, setData] = useState<Response | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [rarities, setRarities] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await adminFetchJson<Response>(
        `/api/admin/tcg/fanart?status=${status}`
      );
      setData(res);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [adminFetchJson, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    async (item: Item, action: 'approve' | 'reject' | 'revoke') => {
      const note = (notes[item.id] ?? '').trim();
      if ((action === 'reject' || action === 'revoke') && note.length < 3) {
        addToast(t.notesRequired, 'error');
        return;
      }
      setBusy(item.id);
      try {
        await adminFetchJson('/api/admin/tcg/fanart', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            id: item.id,
            ...(action === 'approve'
              ? { rarity: rarities[item.id] ?? data?.defaultRarity }
              : {}),
            ...(note ? { notes: note } : {}),
          }),
        });
        addToast(
          action === 'approve'
            ? t.toastApproved
            : action === 'reject'
              ? t.toastRejected
              : t.toastRevoked,
          'success'
        );
        await load();
      } catch (err) {
        addToast(err instanceof Error ? err.message : t.toastError, 'error');
      } finally {
        setBusy(null);
      }
    },
    [adminFetchJson, addToast, data?.defaultRarity, load, notes, rarities, t]
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
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              status === value
                ? 'border-violet-400 bg-violet-600/30 text-white'
                : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
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
              className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60"
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
                  className="aspect-[3/4] w-full bg-neutral-800"
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
                      className="text-xs text-violet-300 underline underline-offset-2"
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
                          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
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
                        className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {item.status === 'pending' ? (
                        <>
                          <button
                            type="button"
                            disabled={busy === item.id}
                            onClick={() => void decide(item, 'approve')}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            {t.approve}
                          </button>
                          <button
                            type="button"
                            disabled={busy === item.id}
                            onClick={() => void decide(item, 'reject')}
                            className="rounded-lg border border-red-500/50 px-3 py-2 text-sm text-red-200 hover:border-red-400 disabled:opacity-50"
                          >
                            {t.reject}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={busy === item.id}
                          onClick={() => void decide(item, 'revoke')}
                          className="rounded-lg border border-amber-500/50 px-3 py-2 text-sm text-amber-100 hover:border-amber-400 disabled:opacity-50"
                        >
                          {t.revoke}
                        </button>
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
