// components/admin/tcg/TcgAssociationPanel.tsx
//
// La catégorie « L'association » du TCG : importer un logo d'événement en
// carte, déposer une image, et gérer les cartes existantes (titre, crédit,
// rareté, retrait). Droit `manage_tcg`, comme les fan arts.
//
// PAS DE FILE D'ATTENTE : ce que le staff dépose ici est publié tout de suite
// (cf. `pages/api/admin/tcg/association.ts`). Retirer n'est pas supprimer — les
// exemplaires déjà tirés restent dans les collections, face neutre.

import { useCallback, useRef, useState } from 'react';
import {
  type TcgAssociationWrite,
  tcgAdminClient,
} from '@/features/admin/tcg/client';
import {
  tcgAdminKeys,
  useReloadTcg,
  useTcgAssociation,
} from '@/features/admin/tcg/hooks/useTcgAdmin';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTcgAssociation from '@/lib/i18n/locales/admin-fr/adminTcgAssociation';
import { FANART_LIMITS } from '@/utils/tcg/fanart';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanCard,
  rubanCardFlush,
  rubanInset,
  rubanMuted,
} from '@/features/admin/_shared/ui/ruban';

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
  /** Optionnel : une API plus ancienne (déploiement en cours) ne le rend pas. */
  voxelLogo?: { previewUrl: string; cardId: string | null };
  rarities: string[];
  defaultRarity: string;
  defaultCredit: string;
  maxBytes: number;
};

const INPUT =
  'mt-1 w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';

export default function TcgAssociationPanel() {
  const t = useAdminT(nsAdminTcgAssociation);
  const association = useTcgAssociation<Response>();
  const reloadTcg = useReloadTcg();
  const { addToast } = useToast();

  const data: Response | null = association.data ?? null;
  const state: 'loading' | 'ready' | 'error' = association.isPending
    ? 'loading'
    : association.error
      ? 'error'
      : 'ready';
  const [busy, setBusy] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [credit, setCredit] = useState('');
  const [rarity, setRarity] = useState('');
  const [edits, setEdits] = useState<
    Record<string, { title?: string; credit?: string; rarity?: string }>
  >({});

  const load = useCallback(
    () => reloadTcg(tcgAdminKeys.association),
    [reloadTcg]
  );

  const run = useCallback(
    async (key: string, init: TcgAssociationWrite, success: string) => {
      setBusy(key);
      try {
        await tcgAdminClient.associationWrite(init);
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
    [addToast, load, t.toastError]
  );

  const importLogo = (logo: EventLogo) =>
    run(
      `logo:${logo.id}`,
      {
        method: 'POST',
        json: {
          action: 'import_logo',
          logoId: logo.id,
          rarity: data?.defaultRarity,
        },
      },
      t.toastImported
    );

  const createVoxel = () =>
    run(
      'voxel',
      {
        method: 'POST',
        json: {
          action: 'voxel_logo',
          rarity: data?.defaultRarity,
        },
      },
      t.toastVoxelCreated
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
        json: {
          action: 'upload',
          data: payload,
          mimeType: file.type,
          title: cleanTitle,
          ...(credit.trim() ? { credit: credit.trim() } : {}),
          rarity: rarity || data?.defaultRarity,
        },
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
        json: {
          action: 'update',
          id: item.id,
          ...(edit.title?.trim() ? { title: edit.title.trim() } : {}),
          ...(edit.credit?.trim() ? { credit: edit.credit.trim() } : {}),
          ...(edit.rarity ? { rarity: edit.rarity } : {}),
        },
      },
      t.toastSaved
    );
  };

  const toggle = (item: Item) =>
    run(
      `status:${item.id}`,
      {
        method: 'PATCH',
        json: {
          action: item.status === 'approved' ? 'revoke' : 'restore',
          id: item.id,
        },
      },
      item.status === 'approved' ? t.toastRevoked : t.toastRestored
    );

  if (state === 'loading') {
    return <p className={`text-sm ${rubanMuted}`}>{t.working}</p>;
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
      <div className={`p-4 ${rubanCard}`}>
        <h3 className="font-semibold">{t.eventLogosTitle}</h3>
        <p className="mt-1 text-sm text-neutral-400">{t.eventLogosIntro}</p>
        {data.eventLogos.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">{t.eventLogosEmpty}</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.eventLogos.map((logo) => (
              <li
                key={logo.id}
                className={`flex items-center gap-3 p-3 ${rubanInset}`}
              >
                {/* biome-ignore lint/performance/noImgElement: bucket public ou chemin du site, hors remotePatterns */}
                <img
                  src={logo.url}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-[3px] bg-[var(--s1,#100812)] object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{logo.name}</p>
                  {logo.cardId ? (
                    <p className="text-xs text-emerald-300">
                      {t.eventLogoImported}
                    </p>
                  ) : logo.importable ? (
                    <AdminButton
                      variant="secondary"
                      size="xs"
                      disabled={busy !== null}
                      onClick={() => void importLogo(logo)}
                      className="mt-1"
                    >
                      {busy === `logo:${logo.id}` ? t.working : t.importLogo}
                    </AdminButton>
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

      {/* Le logo par défaut, en voxel */}
      {data.voxelLogo && (
        <div className={`flex flex-wrap items-center gap-4 p-4 ${rubanCard}`}>
          {/* biome-ignore lint/performance/noImgElement: SVG rendu par nos soins — next/image n'optimise pas le SVG */}
          <img
            src={data.voxelLogo.previewUrl}
            alt=""
            className="h-28 w-20 shrink-0 rounded-[3px] bg-[var(--s2,#1d1520)] object-contain"
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">{t.voxelTitle}</h3>
            <p className="mt-1 text-sm text-neutral-400">{t.voxelIntro}</p>
            {data.voxelLogo.cardId ? (
              <p className="mt-2 text-xs text-emerald-300">
                {t.eventLogoImported}
              </p>
            ) : (
              <AdminButton
                variant="secondary"
                size="xs"
                disabled={busy !== null}
                onClick={() => void createVoxel()}
                className="mt-2"
              >
                {busy === 'voxel' ? t.working : t.voxelCreate}
              </AdminButton>
            )}
          </div>
        </div>
      )}

      {/* Dépôt staff */}
      <div className={`p-4 ${rubanCard}`}>
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
            <AdminButton
              variant="primary"
              size="sm"
              disabled={busy !== null}
              onClick={() => void upload()}
            >
              {busy === 'upload' ? t.working : t.upload}
            </AdminButton>
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
                  className={`${rubanCardFlush} ${
                    item.status === 'approved' ? '' : 'opacity-70'
                  }`}
                >
                  {item.imageUrl ? (
                    // biome-ignore lint/performance/noImgElement: bucket public hors remotePatterns
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="aspect-[3/4] w-full bg-[var(--s2,#1d1520)] object-contain p-4"
                    />
                  ) : (
                    <div
                      className="aspect-[3/4] w-full bg-[var(--s2,#1d1520)]"
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
                      <AdminButton
                        variant="primary"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => void save(item)}
                      >
                        {t.save}
                      </AdminButton>
                      <AdminButton
                        variant={
                          item.status === 'approved' ? 'danger' : 'ghost'
                        }
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => void toggle(item)}
                      >
                        {item.status === 'approved' ? t.revoke : t.restore}
                      </AdminButton>
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
