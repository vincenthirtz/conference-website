// components/admin/tcg/TcgAssociationPanel.tsx
//
// La catégorie « L'association » du TCG : importer un logo d'événement en
// carte, déposer une image, et gérer les cartes existantes (titre, crédit,
// rareté, retrait). Droit `manage_tcg`, comme les fan arts.
//
// PAS DE FILE D'ATTENTE : ce que le staff dépose ici est publié tout de suite
// (cf. `pages/api/admin/tcg/association.ts`). Retirer n'est pas supprimer — les
// exemplaires déjà tirés restent dans les collections, face neutre.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTcgAssociation from '@/lib/i18n/locales/admin-fr/adminTcgAssociation';
import { FANART_LIMITS } from '@/utils/tcg/fanart';

type Item = {
  id: string;
  title: string;
  credit: string;
  imageUrl: string | null;
  status: 'approved' | 'revoked' | string;
  rarity: string | null;
  sourceRef: string | null;
  createdAt: string;
};

type EventLogo = {
  id: string;
  name: string;
  url: string;
  importable: boolean;
  cardId: string | null;
};

type Response = {
  items: Item[];
  eventLogos: EventLogo[];
  rarities: string[];
  defaultRarity: string;
  defaultCredit: string;
  maxBytes: number;
};

const INPUT =
  'mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white';

export default function TcgAssociationPanel() {
  const t = useAdminT(nsAdminTcgAssociation);
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();

  const [data, setData] = useState<Response | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [credit, setCredit] = useState('');
  const [rarity, setRarity] = useState('');
  const [edits, setEdits] = useState<
    Record<string, { title?: string; credit?: string; rarity?: string }>
  >({});

  const load = useCallback(async () => {
    try {
      const res = await adminFetchJson<Response>('/api/admin/tcg/association');
      setData(res);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (key: string, init: RequestInit, success: string) => {
      setBusy(key);
      try {
        await adminFetchJson('/api/admin/tcg/association', {
          ...init,
          headers: { 'Content-Type': 'application/json' },
        });
        addToast(success, 'success');
        await load();
        return true;
      } catch (err) {
        addToast(err instanceof Error ? err.message : t.toastError, 'error');
        return false;
      } finally {
        setBusy(null);
      }
    },
    [adminFetchJson, addToast, load, t.toastError]
  );

  const importLogo = (logo: EventLogo) =>
    run(
      `logo:${logo.id}`,
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'import_logo',
          logoId: logo.id,
          rarity: data?.defaultRarity,
        }),
      },
      t.toastImported
    );

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      addToast(t.errorMissingFile, 'error');
      return;
    }
    if (data && file.size > data.maxBytes) {
      addToast(t.errorTooBig, 'error');
      return;
    }
    const cleanTitle = title.trim();
    if (cleanTitle.length < 2 || cleanTitle.length > FANART_LIMITS.title) {
      addToast(t.errorTitle, 'error');
      return;
    }
    const payload = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('read_error'));
      reader.readAsDataURL(file);
    });
    const ok = await run(
      'upload',
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'upload',
          data: payload,
          mimeType: file.type,
          title: cleanTitle,
          ...(credit.trim() ? { credit: credit.trim() } : {}),
          rarity: rarity || data?.defaultRarity,
        }),
      },
      t.toastCreated
    );
    if (ok) {
      setTitle('');
      setCredit('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = (item: Item) => {
    const edit = edits[item.id] ?? {};
    return run(
      `edit:${item.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'update',
          id: item.id,
          ...(edit.title?.trim() ? { title: edit.title.trim() } : {}),
          ...(edit.credit?.trim() ? { credit: edit.credit.trim() } : {}),
          ...(edit.rarity ? { rarity: edit.rarity } : {}),
        }),
      },
      t.toastSaved
    );
  };

  const toggle = (item: Item) =>
    run(
      `status:${item.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          action: item.status === 'approved' ? 'revoke' : 'restore',
          id: item.id,
        }),
      },
      item.status === 'approved' ? t.toastRevoked : t.toastRestored
    );

  if (state === 'loading') {
    return <p className="text-sm text-neutral-400">{t.working}</p>;
  }
  if (state === 'error' || !data) {
    return (
      <p role="alert" className="text-sm text-red-300">
        {t.loadError}
      </p>
    );
  }

  const setEdit = (id: string, patch: Record<string, string>) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  return (
    <section aria-labelledby="tcg-association-title" className="space-y-8">
      <div>
        <h2 id="tcg-association-title" className="text-xl font-semibold">
          {t.title}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-neutral-400">{t.intro}</p>
      </div>

      {/* Logos d'événement */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
        <h3 className="font-semibold">{t.eventLogosTitle}</h3>
        <p className="mt-1 text-sm text-neutral-400">{t.eventLogosIntro}</p>
        {data.eventLogos.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">{t.eventLogosEmpty}</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.eventLogos.map((logo) => (
              <li
                key={logo.id}
                className="flex items-center gap-3 rounded-lg border border-neutral-800 p-3"
              >
                {/* biome-ignore lint/performance/noImgElement: bucket public ou chemin du site, hors remotePatterns */}
                <img
                  src={logo.url}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded bg-neutral-950 object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{logo.name}</p>
                  {logo.cardId ? (
                    <p className="text-xs text-emerald-300">
                      {t.eventLogoImported}
                    </p>
                  ) : logo.importable ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void importLogo(logo)}
                      className="mt-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                    >
                      {busy === `logo:${logo.id}` ? t.working : t.importLogo}
                    </button>
                  ) : (
                    <p className="text-xs text-amber-200">
                      {t.eventLogoNotImportable}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Dépôt staff */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
        <h3 className="font-semibold">{t.uploadTitle}</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-neutral-400 sm:col-span-2">
            {format(t.labelFile, {
              max: Math.round(data.maxBytes / (1024 * 1024)),
            })}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className={INPUT}
            />
          </label>
          <label className="block text-xs text-neutral-400">
            {t.labelTitle}
            <input
              value={title}
              maxLength={FANART_LIMITS.title}
              onChange={(e) => setTitle(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className="block text-xs text-neutral-400">
            {t.labelCredit}
            <input
              value={credit}
              maxLength={FANART_LIMITS.artistName}
              placeholder={data.defaultCredit}
              onChange={(e) => setCredit(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className="block text-xs text-neutral-400">
            {t.labelRarity}
            <select
              value={rarity || data.defaultRarity}
              onChange={(e) => setRarity(e.target.value)}
              className={INPUT}
            >
              {data.rarities.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void upload()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy === 'upload' ? t.working : t.upload}
            </button>
          </div>
        </div>
      </div>

      {/* Les cartes */}
      <div>
        <h3 className="font-semibold">{t.cardsTitle}</h3>
        {data.items.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">{t.cardsEmpty}</p>
        ) : (
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((item) => {
              const edit = edits[item.id] ?? {};
              return (
                <li
                  key={item.id}
                  className={`overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60 ${
                    item.status === 'approved' ? '' : 'opacity-70'
                  }`}
                >
                  {item.imageUrl ? (
                    // biome-ignore lint/performance/noImgElement: bucket public hors remotePatterns
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="aspect-[3/4] w-full bg-neutral-950 object-contain p-4"
                    />
                  ) : (
                    <div
                      className="aspect-[3/4] w-full bg-neutral-800"
                      aria-hidden
                    />
                  )}
                  <div className="space-y-2 p-4">
                    <p className="text-xs text-neutral-400">
                      {item.status === 'approved'
                        ? t.statusApproved
                        : t.statusRevoked}
                      {item.sourceRef ? ` · ${t.fromEventLogo}` : ''}
                    </p>
                    <label className="block text-xs text-neutral-400">
                      {t.labelTitle}
                      <input
                        value={edit.title ?? item.title}
                        maxLength={FANART_LIMITS.title}
                        onChange={(e) =>
                          setEdit(item.id, { title: e.target.value })
                        }
                        className={INPUT}
                      />
                    </label>
                    <label className="block text-xs text-neutral-400">
                      {t.labelCredit}
                      <input
                        value={edit.credit ?? item.credit}
                        maxLength={FANART_LIMITS.artistName}
                        onChange={(e) =>
                          setEdit(item.id, { credit: e.target.value })
                        }
                        className={INPUT}
                      />
                    </label>
                    <label className="block text-xs text-neutral-400">
                      {t.labelRarity}
                      <select
                        value={edit.rarity ?? item.rarity ?? data.defaultRarity}
                        onChange={(e) =>
                          setEdit(item.id, { rarity: e.target.value })
                        }
                        className={INPUT}
                      >
                        {data.rarities.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void save(item)}
                        className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                      >
                        {t.save}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void toggle(item)}
                        className="rounded-lg border border-amber-500/50 px-3 py-2 text-sm text-amber-100 hover:border-amber-400 disabled:opacity-50"
                      >
                        {item.status === 'approved' ? t.revoke : t.restore}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
