// components/player/DiscordLinkCard.tsx
// Shows whether the current user has linked their Discord, and lets them
// link or unlink it. Used to allow the bot to DM reminders to email-only
// accounts that never went through Discord OAuth on signup.

import { useCallback, useEffect, useState } from 'react';
import { supabaseClient } from '@/utils/supabase';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useT } from '@/lib/i18n/useT';
import { logger } from '../../utils/logger';

type LinkState = {
  linked: boolean;
  discordUsername: string | null;
  linkedAt: string | null;
};

export default function DiscordLinkCard() {
  const t = useT('discordLinkCard');
  const { adminFetchJson } = useAdminFetch();
  const [state, setState] = useState<LinkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetchJson<LinkState>('/api/auth/discord-link');
      setState(data);
    } catch (e) {
      logger.error('[DiscordLinkCard] refresh', e);
      setError(t.statusError);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleLink() {
    setBusy(true);
    setError(null);
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ||
        (typeof window !== 'undefined' ? window.location.origin : '');
      const redirectTo = baseUrl
        ? `${baseUrl}/auth/discord-member?next=/player`
        : undefined;

      // linkIdentity attaches Discord as a new provider to the EXISTING user
      // (vs signInWithOAuth which would log them in as a different account).
      const { data, error: linkErr } = await (
        supabaseClient.auth as unknown as {
          linkIdentity: (args: {
            provider: 'discord';
            options?: { redirectTo?: string; scopes?: string };
          }) => Promise<{ data: { url: string | null }; error: Error | null }>;
        }
      ).linkIdentity({
        provider: 'discord',
        options: { redirectTo, scopes: 'identify email' },
      });

      if (linkErr) throw linkErr;
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      // No URL returned → already linked, refresh state.
      await refresh();
    } catch (e) {
      const msg = (e as Error).message || t.linkError;
      setError(msg);
      logger.error('[DiscordLinkCard] link', e);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlink() {
    setBusy(true);
    setError(null);
    try {
      await adminFetchJson('/api/auth/discord-link', { method: 'DELETE' });
      await refresh();
    } catch (e) {
      setError((e as Error).message || t.unlinkError);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{t.title}</h2>
        {state?.linked && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-600/30 text-indigo-200 border border-indigo-500/40">
            {t.linkedBadge}
          </span>
        )}
      </div>

      <p className="text-sm text-gray-400 mb-4">{t.intro}</p>

      {loading ? (
        <div className="text-sm text-neutral-500">{t.loading}</div>
      ) : state?.linked ? (
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">{t.account}</span>
            <span className="font-mono text-indigo-200">
              @{state.discordUsername || t.unknown}
            </span>
          </div>
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="w-full px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-sm transition"
            >
              {t.unlink}
            </button>
          ) : (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 space-y-3">
              <p className="text-xs text-red-200">{t.unlinkConfirm}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleUnlink}
                  disabled={busy}
                  className="flex-1 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-sm font-medium transition"
                >
                  {busy ? t.busy : t.confirmUnlink}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-sm transition"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleLink}
          disabled={busy}
          className="w-full px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition"
        >
          {busy ? t.busy : t.link}
        </button>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
        >
          {error}
        </div>
      )}
    </div>
  );
}
