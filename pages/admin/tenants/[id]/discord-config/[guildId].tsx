import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSidePropsContext } from 'next';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import AlertBanner from '@/components/admin/AlertBanner';
import Breadcrumb from '@/components/admin/Breadcrumb';
import LoadingSpinner from '@/components/admin/LoadingSpinner';

import { logger } from '../../../../../utils/logger';

const SNOWFLAKE_RE = /^\d{15,21}$/;

type DiscordConfig = {
  guild_id: string;
  guild_name?: string | null;
  staff_log_channel_id: string | null;
  staff_notif_channel_id: string | null;
  player_log_channel_id: string | null;
  results_channel_id: string | null;
  announcements_channel_id: string | null;
  cast_voice_channel_id: string | null;
  forum_channel_id: string | null;
  captain_role_id?: string | null;
  substitute_role_id?: string | null;
  staff_role_admin_id: string | null;
  staff_role_manager_id: string | null;
  staff_role_caster_id: string | null;
  staff_role_owner_id: string | null;
  welcome_enabled?: boolean | null;
  welcome_channel_id?: string | null;
  welcome_message?: string | null;
  welcome_dm_message?: string | null;
};

type DiscordConfigResponse = {
  configs: DiscordConfig[];
};

type Props = {
  staff: { id: string; role: string; display_name: string };
  tenantId: string;
  guildId: string;
};

// Fields rendered in the form. Single snowflake or list of snowflakes.
type FieldDef =
  | {
      key: keyof DiscordConfig;
      label: string;
      help?: string;
      kind: 'single';
      section: 'channels' | 'voice' | 'roles';
    }
  | {
      key: keyof DiscordConfig;
      label: string;
      help?: string;
      kind: 'list';
      section: 'channels' | 'voice' | 'roles';
    };

const FIELDS: FieldDef[] = [
  {
    key: 'staff_log_channel_id',
    label: 'Channel log staff',
    help: 'Logs admin (changements de rôles, audit).',
    kind: 'single',
    section: 'channels',
  },
  {
    key: 'staff_notif_channel_id',
    label: 'Channel notifications staff',
    help: 'Alertes opérationnelles (disputes, no-show…).',
    kind: 'single',
    section: 'channels',
  },
  {
    key: 'player_log_channel_id',
    label: 'Channel log joueurs',
    help: 'Inscriptions, départs, demandes capitaine.',
    kind: 'single',
    section: 'channels',
  },
  {
    key: 'results_channel_id',
    label: 'Channel résultats',
    help: 'Auto-post des résultats de match.',
    kind: 'single',
    section: 'channels',
  },
  {
    key: 'announcements_channel_id',
    label: 'Channel annonces',
    help: 'Annonces générales (publish news).',
    kind: 'single',
    section: 'channels',
  },
  {
    key: 'cast_voice_channel_id',
    label: 'Salon vocal cast',
    kind: 'single',
    section: 'voice',
  },
  {
    key: 'forum_channel_id',
    label: 'Forum (threads de match)',
    kind: 'single',
    section: 'voice',
  },
  {
    key: 'staff_role_owner_id',
    label: 'Staff role — Owner',
    help: 'Rôle Discord mappé sur le rôle staff owner.',
    kind: 'single',
    section: 'roles',
  },
  {
    key: 'staff_role_admin_id',
    label: 'Staff role — Admin',
    help: 'Rôle Discord mappé sur le rôle staff admin.',
    kind: 'single',
    section: 'roles',
  },
  {
    key: 'staff_role_manager_id',
    label: 'Staff role — Manager',
    help: 'Rôle Discord mappé sur le rôle staff manager.',
    kind: 'single',
    section: 'roles',
  },
  {
    key: 'staff_role_caster_id',
    label: 'Staff role — Caster',
    help: 'Rôle Discord mappé sur le rôle staff caster.',
    kind: 'single',
    section: 'roles',
  },
];

function splitList(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function AdminDiscordConfigPage({ tenantId, guildId }: Props) {
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<DiscordConfig | null>(null);
  const [saving, setSaving] = useState(false);
  // Form state — string for inputs (snowflakes or space-separated lists).
  const [form, setForm] = useState<Record<string, string>>({});
  // Welcome section state (heterogeneous types: bool + channel + 2 textareas).
  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [welcomeChannelId, setWelcomeChannelId] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [welcomeDmMessage, setWelcomeDmMessage] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await adminFetchJson<DiscordConfigResponse>(
        `/api/admin/tenants/${tenantId}/discord-config`
      );
      const found = (json.configs ?? []).find(
        (c) => String(c.guild_id) === String(guildId)
      );
      const effective: DiscordConfig = found ?? {
        guild_id: guildId,
        staff_log_channel_id: null,
        staff_notif_channel_id: null,
        player_log_channel_id: null,
        results_channel_id: null,
        announcements_channel_id: null,
        cast_voice_channel_id: null,
        forum_channel_id: null,
        captain_role_id: null,
        substitute_role_id: null,
        staff_role_admin_id: null,
        staff_role_manager_id: null,
        staff_role_caster_id: null,
        staff_role_owner_id: null,
        welcome_enabled: false,
        welcome_channel_id: null,
        welcome_message: null,
        welcome_dm_message: null,
      };
      setConfig(effective);
      const next: Record<string, string> = {};
      for (const f of FIELDS) {
        const v = effective[f.key];
        if (f.kind === 'list') {
          next[f.key as string] = Array.isArray(v) ? v.join(' ') : '';
        } else {
          next[f.key as string] = typeof v === 'string' ? v : '';
        }
      }
      setForm(next);
      setWelcomeEnabled(effective.welcome_enabled === true);
      setWelcomeChannelId(
        typeof effective.welcome_channel_id === 'string'
          ? effective.welcome_channel_id
          : ''
      );
      setWelcomeMessage(
        typeof effective.welcome_message === 'string'
          ? effective.welcome_message
          : ''
      );
      setWelcomeDmMessage(
        typeof effective.welcome_dm_message === 'string'
          ? effective.welcome_dm_message
          : ''
      );
    } catch (err) {
      logger.error('AdminDiscordConfigPage: fetch error', err);
      setError((err as Error)?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, tenantId, guildId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const invalid = useMemo(() => {
    const errs: Record<string, string> = {};
    for (const f of FIELDS) {
      const raw = (form[f.key as string] || '').trim();
      if (!raw) continue;
      if (f.kind === 'single') {
        if (!SNOWFLAKE_RE.test(raw)) {
          errs[f.key as string] = 'Snowflake invalide';
        }
      } else {
        const items = splitList(raw);
        const bad = items.find((v) => !SNOWFLAKE_RE.test(v));
        if (bad) errs[f.key as string] = `Snowflake invalide : ${bad}`;
      }
    }
    const wc = welcomeChannelId.trim();
    if (wc && !SNOWFLAKE_RE.test(wc)) {
      errs.welcome_channel_id = 'Snowflake invalide';
    }
    return errs;
  }, [form, welcomeChannelId]);

  const handleClear = (key: string) => {
    setForm((prev) => ({ ...prev, [key]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(invalid).length > 0) {
      setError("Corrige les snowflakes invalides avant d'enregistrer.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      for (const f of FIELDS) {
        const raw = (form[f.key as string] || '').trim();
        if (f.kind === 'single') {
          body[f.key as string] = raw ? raw : null;
        } else {
          body[f.key as string] = raw ? splitList(raw) : null;
        }
      }
      body.welcome_enabled = welcomeEnabled;
      body.welcome_channel_id = welcomeChannelId.trim()
        ? welcomeChannelId.trim()
        : null;
      body.welcome_message = welcomeMessage.trim() ? welcomeMessage : null;
      body.welcome_dm_message = welcomeDmMessage.trim()
        ? welcomeDmMessage
        : null;
      await mutateJson(
        `/api/admin/tenants/${tenantId}/discord-config/${guildId}`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        }
      );
      addToast('Configuration Discord enregistrée.', 'success');
      await fetchData();
    } catch (err) {
      setError((err as Error)?.message || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const sections: { key: 'channels' | 'voice' | 'roles'; label: string }[] = [
    { key: 'channels', label: 'Channels' },
    { key: 'voice', label: 'Voice / Forum' },
    { key: 'roles', label: 'Rôles Discord' },
  ];

  return (
    <>
      <Head>
        <title>Admin – Discord config</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <Breadcrumb
            items={[
              { label: 'Admin', href: '/admin' },
              { label: 'Tenants', href: '/admin/tenants' },
              {
                label: tenantId.slice(0, 8) + '…',
                href: `/admin/tenants/${tenantId}`,
              },
              { label: 'Discord config' },
            ]}
          />

          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">
              Configuration Discord
            </h1>
            <p className="mt-1 text-sm text-neutral-400">
              Guild ID :{' '}
              <span className="font-mono text-purple-300">{guildId}</span>
              {config?.guild_name && (
                <>
                  {' '}
                  · <span className="text-white">{config.guild_name}</span>
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Laisser un champ vide rétablit le fallback (variables
              d&apos;environnement bot).
            </p>
          </div>

          {loading && (
            <div className="py-12">
              <LoadingSpinner label="Chargement de la configuration…" />
            </div>
          )}

          <AlertBanner message={error} className="mb-4" />

          {!loading && config && (
            <form onSubmit={handleSubmit} className="space-y-6">
              {sections.map((sec) => (
                <section
                  key={sec.key}
                  className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6"
                >
                  <h2 className="text-lg font-semibold text-white mb-4">
                    {sec.label}
                  </h2>
                  <div className="space-y-4">
                    {FIELDS.filter((f) => f.section === sec.key).map((f) => {
                      const key = f.key as string;
                      const value = form[key] ?? '';
                      const err = invalid[key];
                      return (
                        <div key={key}>
                          <label
                            htmlFor={`f-${key}`}
                            className="block text-sm font-medium text-neutral-300 mb-1"
                          >
                            {f.label}
                          </label>
                          <div className="flex gap-2">
                            <input
                              id={`f-${key}`}
                              type="text"
                              value={value}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }))
                              }
                              placeholder={
                                f.kind === 'list'
                                  ? '123456789012345678 234567890123456789'
                                  : '123456789012345678'
                              }
                              className={`flex-1 px-3 py-2 rounded-lg bg-neutral-900/50 border focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono ${
                                err ? 'border-red-500/60' : 'border-neutral-600'
                              }`}
                            />
                            {value && (
                              <button
                                type="button"
                                onClick={() => handleClear(key)}
                                className="px-3 py-2 rounded-lg border border-neutral-600 hover:border-neutral-500 text-xs text-neutral-300 transition-colors"
                                title="Effacer (utiliser le fallback env)"
                              >
                                Effacer
                              </button>
                            )}
                          </div>
                          {f.help && (
                            <p className="text-xs text-neutral-500 mt-1">
                              {f.help}
                            </p>
                          )}
                          {err && (
                            <p className="text-xs text-red-400 mt-1">{err}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}

              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">
                  Accueil des nouveaux arrivants
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        id="welcome-enabled"
                        type="checkbox"
                        checked={welcomeEnabled}
                        onChange={(e) => setWelcomeEnabled(e.target.checked)}
                        className="h-4 w-4 rounded border-neutral-600 bg-neutral-900/50 text-purple-600 focus:ring-2 focus:ring-purple-500"
                      />
                      <span className="text-sm font-medium text-neutral-300">
                        Activer le message de bienvenue
                      </span>
                    </label>
                    <p className="text-xs text-neutral-500 mt-1">
                      Poste automatiquement un message quand un membre rejoint le
                      serveur.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="welcome-channel-id"
                      className="block text-sm font-medium text-neutral-300 mb-1"
                    >
                      Salon d&apos;arrivée
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="welcome-channel-id"
                        type="text"
                        value={welcomeChannelId}
                        onChange={(e) => setWelcomeChannelId(e.target.value)}
                        placeholder="123456789012345678"
                        className={`flex-1 px-3 py-2 rounded-lg bg-neutral-900/50 border focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono ${
                          invalid.welcome_channel_id
                            ? 'border-red-500/60'
                            : 'border-neutral-600'
                        }`}
                      />
                      {welcomeChannelId && (
                        <button
                          type="button"
                          onClick={() => setWelcomeChannelId('')}
                          className="px-3 py-2 rounded-lg border border-neutral-600 hover:border-neutral-500 text-xs text-neutral-300 transition-colors"
                          title="Effacer"
                        >
                          Effacer
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      ID du salon où poster le message de bienvenue
                    </p>
                    {invalid.welcome_channel_id && (
                      <p className="text-xs text-red-400 mt-1">
                        {invalid.welcome_channel_id}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="welcome-message"
                      className="block text-sm font-medium text-neutral-300 mb-1"
                    >
                      Message public
                    </label>
                    <textarea
                      id="welcome-message"
                      value={welcomeMessage}
                      onChange={(e) => setWelcomeMessage(e.target.value)}
                      rows={3}
                      placeholder="Bienvenue {user} sur {server} !"
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      placeholders : {'{user}'} = mention, {'{server}'} = nom du
                      serveur, {'{count}'} = numéro du membre
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="welcome-dm-message"
                      className="block text-sm font-medium text-neutral-300 mb-1"
                    >
                      Message privé (DM)
                    </label>
                    <textarea
                      id="welcome-dm-message"
                      value={welcomeDmMessage}
                      onChange={(e) => setWelcomeDmMessage(e.target.value)}
                      rows={3}
                      placeholder="Salut {user}, bienvenue sur {server} !"
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      laissé vide = pas de DM ; mêmes placeholders
                    </p>
                  </div>
                </div>
              </section>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving || Object.keys(invalid).length > 0}
                  className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {saving ? 'Sauvegarde…' : 'Enregistrer la configuration'}
                </button>
                <Link
                  href={`/admin/tenants/${tenantId}`}
                  className="px-6 py-3 rounded-xl border border-neutral-600 text-sm font-semibold text-white text-center transition hover:bg-neutral-800"
                >
                  Retour au tenant
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage<{
  tenantId: string;
  guildId: string;
}>('admin', async (ctx: GetServerSidePropsContext) => {
  const id = ctx.params?.id;
  const guildId = ctx.params?.guildId;
  return {
    tenantId: typeof id === 'string' ? id : '',
    guildId: typeof guildId === 'string' ? guildId : '',
  };
});

export default AdminDiscordConfigPage;
