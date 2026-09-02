// components/admin/communications/SocialPostsPanel.tsx
//
// Onglet « Réseaux » du hub /admin/communications : composer un post une fois
// et l'envoyer sur plusieurs destinations, chacune pouvant recevoir son propre
// texte et sa propre image.
//
// Même discipline que l'onglet « Équipes », et pour la même raison : « Publier »
// reste verrouillé tant que l'aperçu n'a pas été relu. Une actualité et une
// annonce Discord parties en double ne se rattrapent qu'à la main, sur deux
// surfaces publiques. Toute modification du contenu ou du ciblage périme
// l'aperçu et re-verrouille le bouton.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAdminT } from '@/lib/i18n/useAdminT';
import { format } from '@/lib/i18n/useT';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import AlertBanner from '@/components/admin/AlertBanner';
import { logger } from '@/utils/logger';
import type { SocialPlatform, SocialPlatformKey } from '@/utils/social/platforms';
import nsAdminSocialPosts from '@/lib/i18n/locales/admin-fr/adminSocialPosts';

type TargetStatus = 'sent' | 'failed' | 'pending' | 'skipped';

type HistoryTarget = {
  platform: SocialPlatformKey;
  status: TargetStatus;
  permalink: string | null;
  error: string | null;
  sent_at: string | null;
};

type HistoryPost = {
  id: string;
  base_text: string;
  status: string;
  published_at: string | null;
  created_at: string;
  targets: HistoryTarget[];
};

type ConnectionState = {
  connected: boolean;
  handle: string | null;
  expiresAt: string | null;
  status: string;
};

type StateResponse = {
  platforms: SocialPlatform[];
  connections: Record<string, ConnectionState>;
  posts: HistoryPost[];
};

type PreviewTarget = {
  platform: SocialPlatformKey;
  label: string;
  text: string;
  imageUrl: string | null;
  title: string | null;
  error: string | null;
};

type PostResponse = {
  dryRun: boolean;
  postId?: string;
  status?: 'done' | 'partial' | 'failed';
  targets: Array<
    PreviewTarget & { status?: TargetStatus; permalink?: string | null }
  >;
};

type Dict = typeof nsAdminSocialPosts.fr;

const ENDPOINT = '/api/admin/social-posts';
const SECRET_ENDPOINT = '/api/admin/instagram/secret';

/** Ce qui manque encore pour qu'Instagram puisse publier. */
type SetupState = {
  appIdSet: boolean;
  secretSet: boolean;
  encryptionReady: boolean;
};

/** Réglages d'une destination dans le formulaire. */
type TargetDraft = {
  enabled: boolean;
  /** null = hérite du texte commun. Une chaîne = surcharge assumée. */
  text: string | null;
  image: string | null;
  title: string | null;
};

const emptyDraft: TargetDraft = {
  enabled: true,
  text: null,
  image: null,
  title: null,
};

function statusLabel(status: TargetStatus | undefined, t: Dict): string {
  switch (status) {
    case 'sent':
      return t.statusSent;
    case 'failed':
      return t.statusFailed;
    case 'skipped':
      return t.statusSkipped;
    default:
      return t.statusPending;
  }
}

function statusClass(status: TargetStatus | undefined): string {
  switch (status) {
    case 'sent':
      return 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30';
    case 'failed':
      return 'bg-red-600/20 text-red-300 border-red-500/30';
    default:
      return 'bg-neutral-600/20 text-neutral-300 border-neutral-500/30';
  }
}

export default function SocialPostsPanel() {
  const t = useAdminT(nsAdminSocialPosts);
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [state, setState] = useState<StateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [baseText, setBaseText] = useState('');
  const [baseImage, setBaseImage] = useState('');
  const [drafts, setDrafts] = useState<Record<string, TargetDraft>>({});

  const [preview, setPreview] = useState<PreviewTarget[] | null>(null);
  const [busy, setBusy] = useState(false);

  // Mise en service Instagram : l'App Secret se pose ICI et pas dans un script
  // local, parce que la clé de chiffrement ne vit qu'en production. Le serveur
  // chiffre là où la clé est déjà.
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [appSecret, setAppSecret] = useState('');

  const saveSecret = useCallback(async () => {
    setBusy(true);
    try {
      await adminFetchJson(SECRET_ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appSecret: appSecret.trim() }),
      });
      // La valeur ne sert plus à rien côté client : on l'oublie tout de suite.
      setAppSecret('');
      setSetup((prev) => (prev ? { ...prev, secretSet: true } : prev));
      addToast(t.secretSaved, 'success');
    } catch (err) {
      logger.error('[admin/social-posts] secret save error', err);
      addToast(t.secretError, 'error');
    } finally {
      setBusy(false);
    }
  }, [adminFetchJson, addToast, appSecret, t.secretError, t.secretSaved]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetchJson<StateResponse>(ENDPOINT);
      setState(data);
      // Best-effort : l'état de mise en service ne doit pas empêcher le
      // composeur de s'afficher pour les cibles qui, elles, marchent déjà.
      try {
        setSetup(await adminFetchJson<SetupState>(SECRET_ENDPOINT));
      } catch (setupErr) {
        logger.error('[admin/social-posts] setup state error', setupErr);
      }
      setDrafts((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        return Object.fromEntries(
          data.platforms.map((p) => [
            p.key,
            {
              ...emptyDraft,
              // Une cible dont le compte n'est pas connecté part décochée :
              // la cocher ne mènerait qu'à un échec de publication.
              enabled:
                !p.needsConnection ||
                Boolean(data.connections?.[p.key]?.connected),
            },
          ])
        );
      });
    } catch (err) {
      logger.error('[admin/social-posts] load error', err);
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, t.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  // Le contenu a changé : l'aperçu affiché ne décrit plus ce qui partirait.
  const invalidate = useCallback(() => setPreview(null), []);

  const patchDraft = useCallback(
    (key: string, patch: Partial<TargetDraft>) => {
      setDrafts((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? emptyDraft), ...patch },
      }));
      invalidate();
    },
    [invalidate]
  );

  const selected = useMemo(
    () => (state?.platforms ?? []).filter((p) => drafts[p.key]?.enabled),
    [state, drafts]
  );

  const buildBody = useCallback(
    (dryRun: boolean) =>
      JSON.stringify({
        text: baseText,
        imageUrl: baseImage.trim() || null,
        targets: selected.map((p) => {
          const d = drafts[p.key] ?? emptyDraft;
          return {
            platform: p.key,
            textOverride: d.text,
            imageOverride: d.image?.trim() || null,
            titleOverride: d.title?.trim() || null,
          };
        }),
        dryRun,
      }),
    [baseText, baseImage, selected, drafts]
  );

  const runPreview = useCallback(async () => {
    if (!baseText.trim()) {
      addToast(t.baseTextLabel, 'error');
      return;
    }
    if (selected.length === 0) {
      addToast(t.previewEmpty, 'error');
      return;
    }
    setBusy(true);
    try {
      const data = await adminFetchJson<PostResponse>(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: buildBody(true),
      });
      setPreview(data.targets);
    } catch (err) {
      logger.error('[admin/social-posts] preview error', err);
      addToast(t.loadError, 'error');
    } finally {
      setBusy(false);
    }
  }, [adminFetchJson, addToast, baseText, buildBody, selected.length, t]);

  const blocking = useMemo(
    () => (preview ?? []).filter((p) => p.error),
    [preview]
  );

  const publish = useCallback(async () => {
    if (!preview || blocking.length > 0) return;

    const ok = await confirm({
      title: t.confirmTitle,
      subtitle: format(t.confirmBody, { count: String(selected.length) }),
      variant: 'warning',
      confirmLabel: t.confirmCta,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const data = await mutateJson<PostResponse>(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: buildBody(false),
      });

      const sent = data.targets.filter((x) => x.status === 'sent').length;
      if (data.status === 'done') {
        addToast(t.resultDone, 'success');
      } else if (data.status === 'partial') {
        addToast(
          format(t.resultPartial, {
            sent: String(sent),
            total: String(data.targets.length),
          }),
          'error'
        );
      } else {
        addToast(t.resultFailed, 'error');
      }

      setPreview(null);
      if (data.status === 'done') {
        setBaseText('');
        setBaseImage('');
        setDrafts(
          Object.fromEntries(
            (state?.platforms ?? []).map((p) => [p.key, { ...emptyDraft }])
          )
        );
      }
      await load();
    } catch (err) {
      logger.error('[admin/social-posts] publish error', err);
      addToast(t.resultFailed, 'error');
    } finally {
      setBusy(false);
    }
  }, [
    addToast,
    blocking.length,
    buildBody,
    confirm,
    load,
    mutateJson,
    preview,
    selected.length,
    state,
    t,
  ]);

  if (loading) return <LoadingSpinner />;
  if (error) return <AlertBanner message={error} variant="error" />;
  if (!state) return null;

  return (
    <div className="space-y-8">
      <p className="text-sm text-neutral-400 max-w-2xl">{t.intro}</p>

      {/* ---- Contenu commun ------------------------------------------- */}
      <fieldset className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 space-y-4">
        <legend className="px-2 text-sm font-semibold text-neutral-200">
          {t.baseLegend}
        </legend>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wide text-neutral-400">
            {t.baseTextLabel}
          </span>
          <textarea
            value={baseText}
            onChange={(e) => {
              setBaseText(e.target.value);
              invalidate();
            }}
            rows={5}
            placeholder={t.baseTextPlaceholder}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wide text-neutral-400">
            {t.baseImageLabel}
          </span>
          <input
            type="url"
            value={baseImage}
            onChange={(e) => {
              setBaseImage(e.target.value);
              invalidate();
            }}
            placeholder={t.baseImagePlaceholder}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <span className="block text-xs text-neutral-500">
            {t.baseImageHelp}
          </span>
        </label>
      </fieldset>

      {/* ---- Destinations ---------------------------------------------- */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-neutral-200">
          {t.targetsLegend}
        </legend>

        {state.platforms.map((p) => {
          const d = drafts[p.key] ?? emptyDraft;
          const effective = d.text ?? baseText;
          const length = effective.trim().length;
          const over = p.textLimit ? length - p.textLimit : 0;

          return (
            <div
              key={p.key}
              className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={d.enabled}
                    onChange={(e) =>
                      patchDraft(p.key, { enabled: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-neutral-600 bg-neutral-950 text-purple-500 focus:ring-purple-500"
                  />
                  <span className="font-medium text-white">{p.label}</span>
                </label>
                <span className="font-mono text-xs text-neutral-500">
                  {p.destination}
                </span>

                <span
                  className={`ml-auto font-mono text-xs ${
                    over > 0 ? 'text-red-300' : 'text-neutral-500'
                  }`}
                >
                  {p.textLimit
                    ? format(t.charCountLimited, {
                        count: String(length),
                        limit: String(p.textLimit),
                      })
                    : format(t.charCount, { count: String(length) })}
                  {over > 0
                    ? ` — ${format(t.charOver, { over: String(over) })}`
                    : ''}
                </span>
              </div>

              {p.needsConnection ? (
                (() => {
                  const conn = state.connections?.[p.key];
                  if (conn?.connected) {
                    return (
                      <p className="pl-7 text-xs text-neutral-500">
                        {format(t.connectedAs, { handle: conn.handle ?? '—' })}
                      </p>
                    );
                  }
                  // Le consentement Meta ne peut pas aboutir tant que l'App
                  // Secret n'est pas posé : on demande donc le secret AVANT
                  // d'offrir le bouton, plutôt que de laisser l'échange échouer
                  // avec un message de Meta qui n'accuse pas le secret.
                  if (setup && !setup.secretSet) {
                    return (
                      <div className="space-y-2 pl-7">
                        <p className="text-xs text-amber-300">
                          {t.secretMissing}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="password"
                            value={appSecret}
                            onChange={(e) => setAppSecret(e.target.value)}
                            placeholder={t.secretPlaceholder}
                            aria-label={t.secretLabel}
                            autoComplete="off"
                            className="w-72 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 font-mono text-xs text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                          />
                          <button
                            type="button"
                            onClick={saveSecret}
                            disabled={busy || !appSecret.trim()}
                            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                          >
                            {t.secretSaveCta}
                          </button>
                        </div>
                        <p className="text-xs text-neutral-500">
                          {t.secretHelp}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <p className="pl-7 text-xs text-amber-300">
                      {conn?.status === 'expired'
                        ? t.connectionExpired
                        : t.notConnected}{' '}
                      {/* Navigation de document volontaire, pas un <Link> :
                          cette route répond par une redirection 302 vers
                          l'écran de consentement Meta. Une navigation côté
                          client de Next resterait dans l'app et n'irait nulle
                          part. */}
                      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                      <a
                        href="/api/admin/instagram/authorize"
                        className="underline underline-offset-2"
                      >
                        {t.connectCta}
                      </a>
                    </p>
                  );
                })()
              ) : null}

              {d.enabled ? (
                <div className="space-y-3 pl-7">
                  <button
                    type="button"
                    onClick={() =>
                      patchDraft(p.key, { text: d.text === null ? baseText : null })
                    }
                    className="text-xs text-purple-300 underline underline-offset-2 hover:text-purple-200"
                  >
                    {d.text === null ? t.targetUseOwnText : t.targetUseBaseText}
                  </button>

                  {d.text !== null ? (
                    <textarea
                      value={d.text}
                      onChange={(e) => patchDraft(p.key, { text: e.target.value })}
                      rows={4}
                      aria-label={`${p.label} — ${t.targetOverride}`}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  ) : (
                    <p className="text-xs text-neutral-500">{t.targetInherits}</p>
                  )}

                  {p.needsTitle ? (
                    <label className="block space-y-1.5">
                      <span className="text-xs uppercase tracking-wide text-neutral-400">
                        {t.targetTitleLabel}
                      </span>
                      <input
                        type="text"
                        value={d.title ?? ''}
                        onChange={(e) =>
                          patchDraft(p.key, { title: e.target.value })
                        }
                        placeholder={t.targetTitlePlaceholder}
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </label>
                  ) : null}

                  {p.supportsImage ? (
                    <label className="block space-y-1.5">
                      <span className="text-xs uppercase tracking-wide text-neutral-400">
                        {t.targetOwnImage}
                      </span>
                      <input
                        type="url"
                        value={d.image ?? ''}
                        onChange={(e) =>
                          patchDraft(p.key, { image: e.target.value })
                        }
                        placeholder={t.baseImagePlaceholder}
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </fieldset>

      {/* ---- Aperçu puis publication ----------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runPreview}
          disabled={busy}
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {t.previewCta}
        </button>
        <button
          type="button"
          onClick={publish}
          disabled={busy || !preview || blocking.length > 0}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-40"
        >
          {busy ? t.publishing : t.publishCta}
        </button>
        {!preview ? (
          <span className="text-xs text-neutral-500">{t.publishLocked}</span>
        ) : null}
      </div>

      {preview ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-neutral-200">
            {t.previewTitle}
          </h3>
          {preview.map((p) => (
            <div
              key={p.platform}
              className={`rounded-xl border p-4 ${
                p.error
                  ? 'border-red-500/40 bg-red-950/20'
                  : 'border-neutral-800 bg-neutral-900/40'
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="font-medium text-white">{p.label}</span>
                {p.title ? (
                  <span className="font-mono text-xs text-neutral-400">
                    {p.title}
                  </span>
                ) : null}
              </div>
              {p.error ? (
                <p className="text-sm text-red-300">{p.error}</p>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-neutral-300">
                  {p.text}
                </pre>
              )}
            </div>
          ))}
        </section>
      ) : null}

      {/* ---- Historique -------------------------------------------------- */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-200">
          {t.historyTitle}
        </h3>
        {state.posts.length === 0 ? (
          <p className="text-sm text-neutral-500">{t.historyEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {state.posts.map((post) => (
              <li
                key={post.id}
                className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4"
              >
                <p className="mb-2 line-clamp-2 text-sm text-neutral-300">
                  {post.base_text}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {post.targets.map((target) => (
                    <span
                      key={target.platform}
                      className={`rounded border px-2 py-0.5 font-mono text-xs ${statusClass(target.status)}`}
                      title={target.error ?? undefined}
                    >
                      {target.platform} · {statusLabel(target.status, t)}
                      {target.permalink ? (
                        <>
                          {' '}
                          <a
                            href={target.permalink}
                            className="underline underline-offset-2"
                          >
                            {t.seePost}
                          </a>
                        </>
                      ) : null}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirmDialog}
    </div>
  );
}
