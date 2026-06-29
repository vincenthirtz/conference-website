// pages/admin/site-settings/discord.tsx
// Configuration des webhooks Discord *globaux* (maitres). Sert de fallback
// quand un tournoi n'a pas de webhook configure pour le channel donne.

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import {
  DISCORD_CHANNEL_TYPES,
  DISCORD_CHANNEL_META,
  type DiscordChannelType,
} from '@/utils/discord/channels';
import type { StaffProps } from '@/types/admin';

type WebhookRow = {
  id: string;
  tournament_id: string | null;
  channel_type: DiscordChannelType;
  webhook_url: string;
  role_mention: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ApiResponse = {
  channelTypes: readonly DiscordChannelType[];
  globals: WebhookRow[];
};

type DraftMap = Record<
  DiscordChannelType,
  { webhookUrl: string; roleMention: string; isActive: boolean }
>;

function emptyDrafts(): DraftMap {
  return Object.fromEntries(
    DISCORD_CHANNEL_TYPES.map((ct) => [
      ct,
      { webhookUrl: '', roleMention: '', isActive: true },
    ])
  ) as DraftMap;
}

function emptySaving(): Record<DiscordChannelType, boolean> {
  return Object.fromEntries(
    DISCORD_CHANNEL_TYPES.map((ct) => [ct, false])
  ) as Record<DiscordChannelType, boolean>;
}

export const getServerSideProps = withStaffPage('admin');

function DiscordGlobalConfigPage(_: StaffProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { adminFetchJson } = useAdminFetch();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftMap>(emptyDrafts());
  const [saving, setSaving] =
    useState<Record<DiscordChannelType, boolean>>(emptySaving());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const json = await adminFetchJson<ApiResponse>(
        '/api/admin/site-settings/discord-webhooks'
      );
      setData(json);

      // Hydrate les drafts depuis les globals existants
      setDrafts((prev) => {
        const next = { ...prev };
        for (const w of json.globals) {
          next[w.channel_type] = {
            webhookUrl: w.webhook_url,
            roleMention: w.role_mention || '',
            isActive: w.is_active,
          };
        }
        return next;
      });
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function save(channelType: DiscordChannelType) {
    const draft = drafts[channelType];
    if (!draft.webhookUrl.trim()) {
      addToast('URL du webhook requise', 'error');
      return;
    }

    setSaving((s) => ({ ...s, [channelType]: true }));
    try {
      await adminFetchJson('/api/admin/site-settings/discord-webhooks', {
        method: 'PUT',
        body: JSON.stringify({
          channelType,
          webhookUrl: draft.webhookUrl.trim(),
          roleMention: draft.roleMention.trim() || null,
          isActive: draft.isActive,
        }),
      });
      addToast('Webhook global enregistre', 'success');
      await fetchData();
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setSaving((s) => ({ ...s, [channelType]: false }));
    }
  }

  async function remove(channelType: DiscordChannelType) {
    const ok = await confirm({
      title: `Supprimer le webhook global "${DISCORD_CHANNEL_META[channelType].label}" ?`,
      subtitle:
        "Les tournois qui n'ont pas leur propre configuration n'auront plus aucune notification pour ce type de channel.",
      variant: 'danger',
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;

    setSaving((s) => ({ ...s, [channelType]: true }));
    try {
      await adminFetchJson(
        `/api/admin/site-settings/discord-webhooks?channelType=${channelType}`,
        { method: 'DELETE' }
      );
      addToast('Webhook global supprime', 'success');
      setDrafts((d) => ({
        ...d,
        [channelType]: { webhookUrl: '', roleMention: '', isActive: true },
      }));
      await fetchData();
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setSaving((s) => ({ ...s, [channelType]: false }));
    }
  }

  async function test(channelType: DiscordChannelType) {
    try {
      await adminFetchJson('/api/admin/site-settings/discord-test', {
        method: 'POST',
        body: JSON.stringify({ channelType }),
      });
      addToast('Message de test envoye', 'success');
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  }

  return (
    <>
      {confirmDialog}
      <Head>
        <title>Admin — Webhooks Discord (global)</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <button
            type="button"
            onClick={() => router.push('/admin/site-settings')}
            className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Retour aux parametres
          </button>

          <h1 className="text-3xl font-bold tracking-tight mb-1">
            Webhooks Discord — configuration maitre
          </h1>
          <p className="text-sm text-neutral-400 mb-2">
            Ces webhooks s&apos;appliquent <strong>par defaut</strong> a tous
            les tournois. Si un tournoi declare son propre webhook pour un
            channel donne (via{' '}
            <Link
              href="/admin/tournaments"
              className="underline hover:text-white"
            >
              /admin/tournament/:id/discord
            </Link>
            ), c&apos;est le webhook du tournoi qui prend la main pour ce
            channel.
          </p>
          <p className="text-xs text-neutral-500 mb-8">
            Reserve au role{' '}
            <code className="bg-neutral-800 px-1 rounded">admin</code>.
          </p>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {errorMsg && !loading && (
            <div className="p-4 rounded-xl bg-red-900/40 border border-red-500/50 text-sm">
              {errorMsg}
            </div>
          )}

          {!loading && data && (
            <div className="space-y-4">
              {data.channelTypes.map((ct) => {
                const meta = DISCORD_CHANNEL_META[ct];
                const draft = drafts[ct];
                const existing = data.globals.find(
                  (g) => g.channel_type === ct
                );

                return (
                  <div
                    key={ct}
                    className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-5"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="text-lg font-semibold">{meta.label}</h3>
                        <p className="text-xs text-neutral-400 mt-1">
                          {meta.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {existing && existing.is_active ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                            Actif
                          </span>
                        ) : existing && !existing.is_active ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30">
                            Configure (inactif)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-600/20 text-neutral-400 border border-neutral-500/30">
                            Non configure
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[1fr_auto] mb-3">
                      <div>
                        <label className="block text-xs text-neutral-400 mb-1">
                          URL du webhook Discord
                        </label>
                        <input
                          type="text"
                          placeholder="https://discord.com/api/webhooks/..."
                          value={draft.webhookUrl}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [ct]: { ...d[ct], webhookUrl: e.target.value },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.isActive}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [ct]: { ...d[ct], isActive: e.target.checked },
                              }))
                            }
                            className="w-4 h-4 rounded border-neutral-600 bg-neutral-900"
                          />
                          Actif
                        </label>
                      </div>
                    </div>

                    <div className="mb-3">
                      <label className="block text-xs text-neutral-400 mb-1">
                        Role a pinger (optionnel) — ID Discord,
                        &quot;everyone&quot; ou &quot;here&quot;
                      </label>
                      <input
                        type="text"
                        placeholder="1234567890123456789"
                        value={draft.roleMention}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [ct]: { ...d[ct], roleMention: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => save(ct)}
                        disabled={saving[ct] || !draft.webhookUrl.trim()}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {saving[ct] ? 'Enregistrement...' : 'Enregistrer'}
                      </button>
                      <button
                        type="button"
                        onClick={() => test(ct)}
                        disabled={saving[ct] || !existing}
                        title={
                          existing
                            ? undefined
                            : "Enregistre d'abord la configuration pour pouvoir la tester"
                        }
                        className="px-4 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        Tester
                      </button>
                      {existing && (
                        <button
                          type="button"
                          onClick={() => remove(ct)}
                          disabled={saving[ct]}
                          className="px-4 py-2 rounded-xl bg-red-700/50 hover:bg-red-700 text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default DiscordGlobalConfigPage;
