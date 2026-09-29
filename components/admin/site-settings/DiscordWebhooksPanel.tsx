// Global (master) Discord webhooks — fallback used when a tournament has no
// webhook configured for a given channel. Rendered as the "Discord" tab of the
// merged /admin/site-settings page.

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import {
  DISCORD_CHANNEL_TYPES,
  DISCORD_CHANNEL_META,
  type DiscordChannelType,
} from '@/utils/discord/channels';
import nsAdminSiteSettingsDiscord from '@/lib/i18n/locales/admin-fr/adminSiteSettingsDiscord';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

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

export default function DiscordWebhooksPanel() {
  const t = useAdminT(nsAdminSiteSettingsDiscord);
  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { adminFetchJson } = useAdminFetch();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftMap>(emptyDrafts());
  const [saving, setSaving] = useState<Record<DiscordChannelType, boolean>>(
    emptySaving()
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const json = await adminFetchJson<ApiResponse>(
        '/api/admin/site-settings/discord-webhooks'
      );
      setData(json);

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
      addToast(t.webhookUrlRequired, 'error');
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
      addToast(t.saveSuccess, 'success');
      await fetchData();
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setSaving((s) => ({ ...s, [channelType]: false }));
    }
  }

  async function remove(channelType: DiscordChannelType) {
    const ok = await confirm({
      title: format(t.deleteConfirmTitle, {
        label: DISCORD_CHANNEL_META[channelType].label,
      }),
      subtitle: t.deleteConfirmSubtitle,
      variant: 'danger',
      confirmLabel: t.deleteConfirmLabel,
    });
    if (!ok) return;

    setSaving((s) => ({ ...s, [channelType]: true }));
    try {
      await adminFetchJson(
        `/api/admin/site-settings/discord-webhooks?channelType=${channelType}`,
        { method: 'DELETE' }
      );
      addToast(t.deleteSuccess, 'success');
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
      addToast(t.testSuccess, 'success');
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  }

  return (
    <>
      {confirmDialog}

      <p className="text-sm text-neutral-400 mb-2">
        {t.introPart1} <strong>{t.introDefault}</strong> {t.introPart2}{' '}
        <Link href="/admin/tournaments" className="underline hover:text-white">
          {t.introLink}
        </Link>
        {t.introPart3}
      </p>
      <p className="text-xs text-neutral-500 mb-8">
        {t.reservedPrefix}{' '}
        <code className="bg-[var(--s2,#1d1520)] px-1 rounded-[var(--r-ctrl,4px)]">
          admin
        </code>
        {t.reservedSuffix}
      </p>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {errorMsg && !loading && (
        <div className="p-4 rounded-[var(--r-card,14px)] bg-red-900/40 border border-red-500/50 text-sm">
          {errorMsg}
        </div>
      )}

      {!loading && data && (
        <div className="space-y-4">
          {data.channelTypes.map((ct) => {
            const meta = DISCORD_CHANNEL_META[ct];
            const draft = drafts[ct];
            const existing = data.globals.find((g) => g.channel_type === ct);

            return (
              <div
                key={ct}
                className="bg-[var(--s1,#100812)] backdrop-blur border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-card,14px)] p-5"
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
                      <Chip tone="ok">{t.statusActive}</Chip>
                    ) : existing && !existing.is_active ? (
                      <Chip tone="warn">{t.statusConfiguredInactive}</Chip>
                    ) : (
                      <Chip>{t.statusNotConfigured}</Chip>
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
                      className="w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
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
                        className="w-4 h-4 rounded-[var(--r-ctrl,4px)] border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)]"
                      />
                      {t.checkboxActive}
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
                    className="w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <AdminButton
                    variant="primary"
                    size="sm"
                    type="button"
                    onClick={() => save(ct)}
                    disabled={saving[ct] || !draft.webhookUrl.trim()}
                  >
                    {saving[ct] ? t.saving : t.save}
                  </AdminButton>
                  <AdminButton
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => test(ct)}
                    disabled={saving[ct] || !existing}
                    title={existing ? undefined : t.testDisabledTitle}
                  >
                    {t.test}
                  </AdminButton>
                  {existing && (
                    <AdminButton
                      variant="danger"
                      size="sm"
                      type="button"
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
    </>
  );
}
