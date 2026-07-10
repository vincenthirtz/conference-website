// pages/admin/tournament/[id]/discord.tsx
// Configuration des webhooks Discord par type de channel pour un tournoi.

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import {
  DISCORD_CHANNEL_TYPES,
  DISCORD_CHANNEL_META,
  type DiscordChannelType,
} from '@/utils/discord/channels';
import type { StaffProps } from '@/types/admin';

type ChannelType = DiscordChannelType;

type WebhookRow = {
  id: string;
  tournament_id: string | null;
  channel_type: ChannelType;
  webhook_url: string;
  role_mention: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ApiResponse = {
  channelTypes: ChannelType[];
  scoped: WebhookRow[];
  globals: WebhookRow[];
};

export const getServerSideProps = withStaffPage('admin');

function DiscordConfigPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;
  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const t = useAdminT('adminTournamentDiscord');

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Per-channel form state — initialise une entree par DISCORD_CHANNEL_TYPES.
  const emptyDrafts = () =>
    Object.fromEntries(
      DISCORD_CHANNEL_TYPES.map((ct) => [
        ct,
        { webhookUrl: '', roleMention: '', isActive: true },
      ])
    ) as Record<
      ChannelType,
      { webhookUrl: string; roleMention: string; isActive: boolean }
    >;
  const emptySaving = () =>
    Object.fromEntries(
      DISCORD_CHANNEL_TYPES.map((ct) => [ct, false])
    ) as Record<ChannelType, boolean>;

  const [drafts, setDrafts] = useState(emptyDrafts);
  const [saving, setSaving] = useState(emptySaving);

  const fetchData = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/admin/tournament/${tournamentId}/discord-webhooks`
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || t.errorLoad);
      }
      const json: ApiResponse = await res.json();
      setData(json);

      // Hydrate drafts from scoped webhooks. Updater fonctionnel : on repart
      // du dernier état connu sans capturer `drafts` (sinon fetchData serait
      // recréé à chaque frappe et l'effet [fetchData] rechargerait en boucle).
      setDrafts((prev) => {
        const next = { ...prev };
        for (const w of json.scoped) {
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
  }, [tournamentId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function save(channelType: ChannelType) {
    if (!tournamentId) return;
    const draft = drafts[channelType];
    if (!draft.webhookUrl.trim()) {
      addToast(t.toastUrlRequired, 'error');
      return;
    }

    setSaving((s) => ({ ...s, [channelType]: true }));
    try {
      const res = await fetch(
        `/api/admin/tournament/${tournamentId}/discord-webhooks`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelType,
            webhookUrl: draft.webhookUrl.trim(),
            roleMention: draft.roleMention.trim() || null,
            isActive: draft.isActive,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t.errorSave);
      addToast(t.toastSaved, 'success');
      await fetchData();
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setSaving((s) => ({ ...s, [channelType]: false }));
    }
  }

  async function remove(channelType: ChannelType) {
    if (!tournamentId) return;
    const ok = await confirm({
      title: format(t.confirmDeleteTitle, {
        label: DISCORD_CHANNEL_META[channelType].label,
      }),
      subtitle: t.confirmDeleteSubtitle,
      variant: 'danger',
      confirmLabel: t.confirmDeleteLabel,
    });
    if (!ok) return;

    setSaving((s) => ({ ...s, [channelType]: true }));
    try {
      const res = await fetch(
        `/api/admin/tournament/${tournamentId}/discord-webhooks?channelType=${channelType}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || t.errorDelete);
      }
      addToast(t.toastDeleted, 'success');
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

  async function test(channelType: ChannelType) {
    if (!tournamentId) return;
    try {
      const res = await fetch(
        `/api/admin/tournament/${tournamentId}/discord-test`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelType }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t.errorTest);
      addToast(t.toastTestSent, 'success');
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  }

  function fallbackUrl(channelType: ChannelType): string | null {
    return (
      data?.globals.find((g) => g.channel_type === channelType)?.webhook_url ||
      null
    );
  }

  return (
    <>
      {confirmDialog}
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <TournamentTabsNav
            tournamentId={String(tournamentId ?? '')}
            active="discord"
          />

          <h1 className="text-3xl font-bold tracking-tight mb-1">
            {t.heading}
          </h1>
          <p className="text-sm text-neutral-400 mb-4">
            {t.introBefore}
            <Link
              href="/admin/site-settings?tab=discord"
              className="underline hover:text-white"
            >
              {t.introLinkMaster}
            </Link>
            {t.introMiddle}
            <code className="bg-neutral-800 px-1 rounded">admin</code>
            {t.introAfter}
          </p>

          <div className="mb-8 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4 flex items-start gap-3">
            <svg
              className="w-5 h-5 text-indigo-300 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-xs text-indigo-100/90">
              {t.strategyBefore}
              <Link
                href="/admin/site-settings?tab=discord"
                className="underline font-semibold hover:text-white"
              >
                {t.strategyLink}
              </Link>
              {t.strategyAfter}
            </div>
          </div>

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
                const scoped = data.scoped.find((s) => s.channel_type === ct);
                const fallback = fallbackUrl(ct);

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
                        {scoped ? (
                          <span
                            title={t.overrideActiveTitle}
                            className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/30"
                          >
                            {t.overrideActive}
                          </span>
                        ) : fallback ? (
                          <Link
                            href="/admin/site-settings?tab=discord"
                            title={t.masterFallbackTitle}
                            className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30 hover:bg-amber-600/30 transition-colors"
                          >
                            {t.masterFallback}
                          </Link>
                        ) : (
                          <span
                            title={t.notConfiguredTitle}
                            className="px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-600/20 text-neutral-400 border border-neutral-500/30"
                          >
                            {t.notConfigured}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[1fr_auto] mb-3">
                      <div>
                        <label className="block text-xs text-neutral-400 mb-1">
                          {t.webhookUrlLabel}
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
                          {t.active}
                        </label>
                      </div>
                    </div>

                    <div className="mb-3">
                      <label className="block text-xs text-neutral-400 mb-1">
                        {t.roleMentionLabel}
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
                      <p className="text-xs text-neutral-500 mt-1">
                        {t.roleHintBefore}
                        <code className="bg-neutral-900 px-1 rounded">
                          \@LeRole
                        </code>
                        {t.roleHintAfter}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => save(ct)}
                        disabled={saving[ct] || !draft.webhookUrl.trim()}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {saving[ct] ? t.saving : t.save}
                      </button>
                      <button
                        type="button"
                        onClick={() => test(ct)}
                        disabled={saving[ct]}
                        className="px-4 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {t.test}
                      </button>
                      {scoped && (
                        <button
                          type="button"
                          onClick={() => remove(ct)}
                          disabled={saving[ct]}
                          className="px-4 py-2 rounded-xl bg-red-700/50 hover:bg-red-700 text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          {t.delete}
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

export default DiscordConfigPage;
