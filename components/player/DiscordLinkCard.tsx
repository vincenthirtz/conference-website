// components/player/DiscordLinkCard.tsx
// Shows whether the current user has linked their Discord, and lets them
// link or unlink it. Used to allow the bot to DM reminders to email-only
// accounts that never went through Discord OAuth on signup.

import { useCallback, useEffect, useState } from 'react';
import { supabaseClient } from '@/utils/supabase';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { logger } from '../../utils/logger';

type LinkState = {
  linked: boolean;
  discordUsername: string | null;
  linkedAt: string | null;
};

export default function DiscordLinkCard() {
  const { adminFetchJson } = useAdminFetch();
  const [state, setState] = useState<LinkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetchJson<LinkState>('/api/auth/discord-link');
      setState(data);
    } catch (e) {
      logger.error('[DiscordLinkCard] refresh', e);
      setError('Impossible de charger le statut.');
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson]);

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
      const msg = (e as Error).message || 'Échec du lien Discord';
      setError(msg);
      logger.error('[DiscordLinkCard] link', e);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlink() {
    if (
      !confirm(
        'Délier ton compte Discord ? Tu ne recevras plus de DM de rappel.'
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await adminFetchJson('/api/auth/discord-link', { method: 'DELETE' });
      await refresh();
    } catch (e) {
      setError((e as Error).message || 'Échec');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Discord</h2>
        {state?.linked && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-600/30 text-indigo-200 border border-indigo-500/40">
            Lié
          </span>
        )}
      </div>

      <p className="text-sm text-gray-400 mb-4">
        Lie ton compte Discord pour recevoir en DM les rappels de check-in et
        les notifications du tournoi.
      </p>

      {loading ? (
        <div className="text-sm text-neutral-500">Chargement…</div>
      ) : state?.linked ? (
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Compte</span>
            <span className="font-mono text-indigo-200">
              @{state.discordUsername || 'inconnu'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleUnlink}
            disabled={busy}
            className="w-full px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-sm transition"
          >
            {busy ? '…' : 'Délier'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleLink}
          disabled={busy}
          className="w-full px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition"
        >
          {busy ? '…' : 'Lier mon compte Discord'}
        </button>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
