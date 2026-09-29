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
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import {
  DISCORD_CHANNEL_TYPES,
  DISCORD_CHANNEL_META,
  type DiscordChannelType,
} from '@/utils/discord/channels';
import type { StaffProps } from '@/types/admin';
import nsAdminTournamentDiscord from '@/lib/i18n/locales/admin-fr/adminTournamentDiscord';

type ChannelType = DiscordChannelType;

const LABEL = 'mb-1 block text-xs text-[var(--t3,#a39ba6)]';
const INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 font-mono text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';

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

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

function DiscordConfigPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;
  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const t = useAdminT(nsAdminTournamentDiscord);

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

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div className="max-w-5xl">
          <TournamentTabsNav
            tournamentId={String(tournamentId ?? '')}
            active="settings"
          />

          <AdminPageHeader
            title={t.heading}
            subtitle={
              <>
                {t.introBefore}
                <Link
                  href="/admin/site-settings?tab=discord"
                  className="underline hover:text-[var(--t1,#f4edf7)]"
                >
                  {t.introLinkMaster}
                </Link>
                {t.introMiddle}
                <code className="rounded-[3px] bg-[var(--s2,#1d1520)] px-1">
                  admin
                </code>
                {t.introAfter}
              </>
            }
          />

          <div className="mb-8 flex items-start gap-3 rounded-[var(--r-card,14px)] border border-[rgba(180,103,209,.4)] bg-[rgba(180,103,209,.08)] p-4">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--or-300,#dea3f6)]"
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
            <div className="text-xs text-[var(--t2,#c7bfca)]">
              {t.strategyBefore}
              <Link
                href="/admin/site-settings?tab=discord"
                className="font-semibold underline hover:text-[var(--t1,#f4edf7)]"
              >
                {t.strategyLink}
              </Link>
              {t.strategyAfter}
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)]" />
            </div>
          )}

          {errorMsg && !loading && (
            <div className="rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] p-4 text-sm text-[#ffc2c2]">
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
                    className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-5"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="font-[family-name:var(--fd)] text-[15px] font-bold uppercase tracking-[0.06em] text-[var(--t1,#f4edf7)]">
                          {meta.label}
                        </h3>
                        <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
                          {meta.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {scoped ? (
                          <Chip tone="ok" title={t.overrideActiveTitle}>
                            {t.overrideActive}
                          </Chip>
                        ) : fallback ? (
                          <Link
                            href="/admin/site-settings?tab=discord"
                            title={t.masterFallbackTitle}
                            className="inline-flex h-[22px] items-center whitespace-nowrap rounded-[3px] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.13)] px-2 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] text-[#ffd9a3] transition-colors [font-stretch:75%] hover:bg-[rgba(245,165,36,.22)]"
                          >
                            {t.masterFallback}
                          </Link>
                        ) : (
                          <Chip title={t.notConfiguredTitle}>
                            {t.notConfigured}
                          </Chip>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[1fr_auto] mb-3">
                      <div>
                        <label className={LABEL}>{t.webhookUrlLabel}</label>
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
                          className={INPUT}
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--t2,#c7bfca)]">
                          <input
                            type="checkbox"
                            checked={draft.isActive}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [ct]: { ...d[ct], isActive: e.target.checked },
                              }))
                            }
                            className="h-4 w-4 accent-[var(--or,#b467d1)]"
                          />
                          {t.active}
                        </label>
                      </div>
                    </div>

                    <div className="mb-3">
                      <label className={LABEL}>{t.roleMentionLabel}</label>
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
                        className={INPUT}
                      />
                      <p className="mt-1 text-xs text-[var(--t4,#807984)]">
                        {t.roleHintBefore}
                        <code className="rounded-[3px] bg-[var(--s2,#1d1520)] px-1">
                          \@LeRole
                        </code>
                        {t.roleHintAfter}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <AdminButton
                        variant="secondary"
                        size="sm"
                        onClick={() => save(ct)}
                        disabled={saving[ct] || !draft.webhookUrl.trim()}
                      >
                        {saving[ct] ? t.saving : t.save}
                      </AdminButton>
                      <AdminButton
                        size="sm"
                        onClick={() => test(ct)}
                        disabled={saving[ct]}
                      >
                        {t.test}
                      </AdminButton>
                      {scoped && (
                        <AdminButton
                          variant="danger"
                          size="sm"
                          onClick={() => remove(ct)}
                          disabled={saving[ct]}
                        >
                          {t.delete}
                        </AdminButton>
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
