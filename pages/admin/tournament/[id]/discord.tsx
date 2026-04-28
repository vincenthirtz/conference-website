// pages/admin/tournament/[id]/discord.tsx
// Configuration des webhooks Discord par type de channel pour un tournoi.

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import type { StaffProps } from '@/types/admin';

type ChannelType =
  | 'match_announcements'
  | 'match_results'
  | 'bracket_updates'
  | 'general_announcements'
  | 'veto_live'
  | 'checkin_reminders'
  | 'support_tickets'
  | 'mvp_polls';

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

const CHANNEL_LABELS: Record<ChannelType, { label: string; description: string }> = {
  match_announcements: {
    label: 'Annonces de match',
    description: 'Ping J-15min : code lobby, stream URL, ping des deux équipes (rôles Discord).',
  },
  match_results: {
    label: 'Résultats de match',
    description: 'Embed avec score final + équipe gagnante (et logo) à chaque match terminé.',
  },
  bracket_updates: {
    label: 'Mise à jour bracket',
    description: 'Annonce de progression : qui avance, prochain round, prochain adversaire.',
  },
  general_announcements: {
    label: 'Annonces générales',
    description: 'Crosspost automatique des annonces créées dans /admin/announcements.',
  },
  veto_live: {
    label: 'Veto en direct',
    description: 'Un message par étape : ban, pick, decider — au fil de l\'eau.',
  },
  checkin_reminders: {
    label: 'Rappels check-in',
    description: 'Rappels T-30min / T-15min avant chaque match + annonce de forfait auto à T-0.',
  },
  support_tickets: {
    label: 'Tickets de support',
    description: 'Signalements (litiges, comportement, technique). Sévérité HAUTE = ping du rôle modération.',
  },
  mvp_polls: {
    label: 'Sondages MVP',
    description: 'Sondage Discord natif (24h) pour élire la MVP, posté automatiquement à la fin de chaque match.',
  },
};

export const getServerSideProps = withStaffPage('admin');

function DiscordConfigPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Per-channel form state
  const [drafts, setDrafts] = useState<
    Record<ChannelType, { webhookUrl: string; roleMention: string; isActive: boolean }>
  >({
    match_announcements: { webhookUrl: '', roleMention: '', isActive: true },
    match_results: { webhookUrl: '', roleMention: '', isActive: true },
    bracket_updates: { webhookUrl: '', roleMention: '', isActive: true },
    general_announcements: { webhookUrl: '', roleMention: '', isActive: true },
    veto_live: { webhookUrl: '', roleMention: '', isActive: true },
    checkin_reminders: { webhookUrl: '', roleMention: '', isActive: true },
    support_tickets: { webhookUrl: '', roleMention: '', isActive: true },
    mvp_polls: { webhookUrl: '', roleMention: '', isActive: true },
  });

  const [saving, setSaving] = useState<Record<ChannelType, boolean>>({
    match_announcements: false,
    match_results: false,
    bracket_updates: false,
    general_announcements: false,
    veto_live: false,
    checkin_reminders: false,
    support_tickets: false,
    mvp_polls: false,
  });

  const fetchData = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/tournament/${tournamentId}/discord-webhooks`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Impossible de charger les webhooks');
      }
      const json: ApiResponse = await res.json();
      setData(json);

      // Hydrate drafts from scoped webhooks
      const next = { ...drafts };
      for (const w of json.scoped) {
        next[w.channel_type] = {
          webhookUrl: w.webhook_url,
          roleMention: w.role_mention || '',
          isActive: w.is_active,
        };
      }
      setDrafts(next);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function save(channelType: ChannelType) {
    if (!tournamentId) return;
    const draft = drafts[channelType];
    if (!draft.webhookUrl.trim()) {
      addToast('URL du webhook requise', 'error');
      return;
    }

    setSaving((s) => ({ ...s, [channelType]: true }));
    try {
      const res = await fetch(`/api/admin/tournament/${tournamentId}/discord-webhooks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelType,
          webhookUrl: draft.webhookUrl.trim(),
          roleMention: draft.roleMention.trim() || null,
          isActive: draft.isActive,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Échec de la sauvegarde');
      addToast('Webhook enregistré', 'success');
      await fetchData();
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setSaving((s) => ({ ...s, [channelType]: false }));
    }
  }

  async function remove(channelType: ChannelType) {
    if (!tournamentId) return;
    if (!confirm(`Supprimer le webhook "${CHANNEL_LABELS[channelType].label}" ?`)) return;

    setSaving((s) => ({ ...s, [channelType]: true }));
    try {
      const res = await fetch(
        `/api/admin/tournament/${tournamentId}/discord-webhooks?channelType=${channelType}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Échec de la suppression');
      }
      addToast('Webhook supprimé', 'success');
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
      const res = await fetch(`/api/admin/tournament/${tournamentId}/discord-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelType }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Échec du test');
      addToast('Message de test envoyé', 'success');
    } catch (err) {
      addToast((err as Error).message, 'error');
    }
  }

  function fallbackUrl(channelType: ChannelType): string | null {
    return data?.globals.find((g) => g.channel_type === channelType)?.webhook_url || null;
  }

  return (
    <>
      <Head>
        <title>Admin – Discord</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <button
            type="button"
            onClick={() => router.push(`/admin/tournament/${tournamentId}`)}
            className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour au tournoi
          </button>

          <h1 className="text-3xl font-bold tracking-tight mb-1">Webhooks Discord</h1>
          <p className="text-sm text-neutral-400 mb-8">
            Configurez un webhook par type de channel. Si rien n&apos;est configuré pour un type,
            une éventuelle configuration globale (sans tournoi associé) sera utilisée en
            fallback. Réservé au rôle <code className="bg-neutral-800 px-1 rounded">admin</code>.
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
                const meta = CHANNEL_LABELS[ct];
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
                        <p className="text-xs text-neutral-400 mt-1">{meta.description}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {scoped ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                            Configuré
                          </span>
                        ) : fallback ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30">
                            Fallback global
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-600/20 text-neutral-400 border border-neutral-500/30">
                            Non configuré
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
                        Rôle à pinger (optionnel) — ID Discord, &quot;everyone&quot;, ou
                        &quot;here&quot;
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
                        Astuce : pour récupérer un ID de rôle Discord, tape{' '}
                        <code className="bg-neutral-900 px-1 rounded">\@LeRole</code> dans
                        Discord puis envoie le message — il affichera l&apos;ID brut.
                      </p>
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
                        disabled={saving[ct]}
                        className="px-4 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        Tester
                      </button>
                      {scoped && (
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

export default DiscordConfigPage;
