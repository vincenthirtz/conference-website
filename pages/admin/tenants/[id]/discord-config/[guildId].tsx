import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSidePropsContext } from 'next';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AlertBanner from '@/components/admin/AlertBanner';
import Breadcrumb from '@/components/admin/Breadcrumb';
import LoadingSpinner from '@/components/admin/LoadingSpinner';

import { logger } from '../../../../../utils/logger';
import nsAdminTenantDiscordConfig from '@/lib/i18n/locales/admin-fr/adminTenantDiscordConfig';
import PlacementRolesEditor from '@/components/admin/tenants/PlacementRolesEditor';
import {
  parsePlacementRules,
  type PlacementRule,
} from '@/utils/discord/placementRoles';
import WelcomeCardPreview, {
  DEFAULT_WELCOME_MESSAGE,
  renderWelcomePreview,
} from '@/components/admin/tenants/WelcomeCardPreview';
import {
  CHANNEL_TYPES,
  getDiscordConfigFields,
  type DiscordConfig,
  type FieldDef,
  type FieldSection,
} from '@/utils/discord/discordConfigFields';

const SNOWFLAKE_RE = /^\d{15,21}$/;

type DiscordConfigResponse = {
  configs: DiscordConfig[];
};

type Props = {
  staff: { id: string; role: string; display_name: string };
  tenantId: string;
  guildId: string;
};

// Inventaire salons/rôles renvoyé par le bot (via /discord-config/[guildId]/channels).
// Discord ChannelType (numérique) : 0 texte, 2 vocal, 4 catégorie, 5 annonces,
// 13 stage, 15 forum, 16 media.
type InvChannel = {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
};
type InvRole = {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
};
type Inventory = {
  guild: { id: string; name: string };
  channels: InvChannel[];
  roles: InvRole[];
};

function splitList(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function AdminDiscordConfigPage({ tenantId, guildId }: Props) {
  const t = useAdminT(nsAdminTenantDiscordConfig);
  const FIELDS = useMemo(() => getDiscordConfigFields(t), [t]);
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
  const [placementRules, setPlacementRules] = useState<PlacementRule[]>([]);
  const [welcomeChannelId, setWelcomeChannelId] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [welcomeDmMessage, setWelcomeDmMessage] = useState('');
  // Inventaire salons/rôles du serveur (chargé à la demande via le bot) pour
  // remplacer la saisie de snowflakes par des sélecteurs.
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const json = await adminFetchJson<Inventory>(
        `/api/admin/tenants/${tenantId}/discord-config/${guildId}/channels`
      );
      setInventory(json);
    } catch (err) {
      logger.error('AdminDiscordConfigPage: inventory error', err);
      setInventoryError((err as Error)?.message || t.inventoryError);
    } finally {
      setInventoryLoading(false);
    }
  }, [adminFetchJson, tenantId, guildId, t]);

  // Options de <select> pour un champ donné, à partir de l'inventaire chargé.
  // Rôles (section 'roles') triés par position décroissante ; salons filtrés
  // par famille (channelKind) et préfixés d'un glyphe pour lisibilité.
  const optionsForField = useCallback(
    (f: FieldDef): { id: string; label: string }[] => {
      if (!inventory) return [];
      if (f.section === 'roles') {
        return [...inventory.roles]
          .sort((a, b) => b.position - a.position)
          .map((r) => ({
            id: r.id,
            label: r.managed
              ? `@${r.name}${t.roleManagedSuffix}`
              : `@${r.name}`,
          }));
      }
      if (!f.channelKind) return [];
      const types = CHANNEL_TYPES[f.channelKind];
      const glyph =
        f.channelKind === 'voice'
          ? '🔊 '
          : f.channelKind === 'forum'
            ? '📋 '
            : f.channelKind === 'category'
              ? '📁 '
              : '# ';
      return inventory.channels
        .filter((c) => types.includes(c.type))
        .sort((a, b) => a.position - b.position)
        .map((c) => ({ id: c.id, label: glyph + c.name }));
    },
    [inventory, t]
  );

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
        matches_live_channel_id: null,
        disputes_forum_channel_id: null,
        news_ingest_channel_id: null,
        scrims_announce_channel_id: null,
        free_players_channel_id: null,
        teams_voice_category_id: null,
        captain_role_id: null,
        substitute_role_id: null,
        staff_role_owner_id: null,
        staff_role_admin_id: null,
        staff_role_caster_id: null,
        disputes_forum_tag_open_id: null,
        disputes_forum_tag_pending_id: null,
        disputes_forum_tag_resolved_id: null,
        member_leave_channel_id: null,
        welcome_enabled: false,
        welcome_channel_id: null,
        welcome_message: null,
        welcome_dm_message: null,
        placement_roles: null,
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
      setPlacementRules(parsePlacementRules(effective.placement_roles));
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
      setError((err as Error)?.message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, tenantId, guildId, FIELDS, t]);

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
          errs[f.key as string] = t.errorSnowflakeInvalid;
        }
      } else {
        const items = splitList(raw);
        const bad = items.find((v) => !SNOWFLAKE_RE.test(v));
        if (bad)
          errs[f.key as string] = format(t.errorSnowflakeInvalidItem, {
            value: bad,
          });
      }
    }
    const wc = welcomeChannelId.trim();
    if (wc && !SNOWFLAKE_RE.test(wc)) {
      errs.welcome_channel_id = t.errorSnowflakeInvalid;
    }
    return errs;
  }, [form, welcomeChannelId, FIELDS, t]);

  const handleClear = (key: string) => {
    setForm((prev) => ({ ...prev, [key]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(invalid).length > 0) {
      setError(t.errorFixSnowflakes);
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
      // Les règles incomplètes (rôle vide) ne partent pas : elles sont en cours
      // de saisie, et le serveur refuserait la liste entière.
      body.placement_roles = placementRules.filter((r) => r.roleId.trim());
      await mutateJson(
        `/api/admin/tenants/${tenantId}/discord-config/${guildId}`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        }
      );
      addToast(t.saveSuccess, 'success');
      await fetchData();
    } catch (err) {
      setError((err as Error)?.message || t.errorSave);
    } finally {
      setSaving(false);
    }
  };

  const sections: { key: FieldSection; label: string }[] = [
    { key: 'channels', label: t.sectionChannels },
    { key: 'voice', label: t.sectionVoice },
    { key: 'roles', label: t.sectionRoles },
    { key: 'tags', label: t.sectionTags },
  ];

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <Breadcrumb
            items={[
              { label: t.breadcrumbAdmin, href: '/admin' },
              { label: t.breadcrumbTenants, href: '/admin/tenants' },
              {
                label: tenantId.slice(0, 8) + '…',
                href: `/admin/tenants/${tenantId}`,
              },
              { label: t.breadcrumbDiscordConfig },
            ]}
          />

          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">{t.heading}</h1>
            <p className="mt-1 text-sm text-neutral-400">
              {t.guildIdLabel}{' '}
              <span className="font-mono text-purple-300">{guildId}</span>
              {config?.guild_name && (
                <>
                  {' '}
                  · <span className="text-white">{config.guild_name}</span>
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-neutral-500">{t.fallbackNote}</p>
          </div>

          {/* Sélecteur de salons : interroge le bot pour lister salons + rôles
              du serveur → évite de coller des snowflakes à la main. */}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={loadInventory}
              disabled={inventoryLoading}
              className="px-4 py-2 rounded-lg border border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20 text-sm font-medium text-purple-200 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {inventoryLoading
                ? t.inventoryLoading
                : inventory
                  ? t.inventoryReload
                  : t.inventoryList}
            </button>
            {inventory && !inventoryLoading && (
              <span className="text-xs text-green-400">
                {format(t.inventoryLoaded, {
                  channels: inventory.channels.length,
                  roles: inventory.roles.length,
                })}
              </span>
            )}
            {inventoryError && (
              <span className="text-xs text-red-400">{inventoryError}</span>
            )}
          </div>

          {loading && (
            <div className="py-12">
              <LoadingSpinner label={t.loadingConfig} />
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
                      const opts = optionsForField(f);
                      const unknownValue =
                        value !== '' && !opts.some((o) => o.id === value);
                      return (
                        <div key={key}>
                          <label
                            htmlFor={`f-${key}`}
                            className="block text-sm font-medium text-neutral-300 mb-1"
                          >
                            {f.label}
                          </label>
                          {inventory && opts.length > 0 && (
                            <select
                              value={value}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }))
                              }
                              className="w-full mb-2 px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            >
                              <option value="">{t.selectNoneFallback}</option>
                              {opts.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.label}
                                </option>
                              ))}
                              {unknownValue && (
                                <option value={value}>
                                  {format(t.currentId, { value })}
                                </option>
                              )}
                            </select>
                          )}
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
                                title={t.clearFallbackTitle}
                              >
                                {t.clear}
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
                  {t.welcomeHeading}
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
                        {t.welcomeEnableLabel}
                      </span>
                    </label>
                    <p className="text-xs text-neutral-500 mt-1">
                      {t.welcomeEnableHelp}
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="welcome-channel-id"
                      className="block text-sm font-medium text-neutral-300 mb-1"
                    >
                      {t.welcomeChannelLabel}
                    </label>
                    {inventory && (
                      <select
                        value={welcomeChannelId}
                        onChange={(e) => setWelcomeChannelId(e.target.value)}
                        className="w-full mb-2 px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      >
                        <option value="">{t.selectNoneNoMessage}</option>
                        {inventory.channels
                          .filter((c) => CHANNEL_TYPES.text.includes(c.type))
                          .sort((a, b) => a.position - b.position)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              # {c.name}
                            </option>
                          ))}
                        {welcomeChannelId !== '' &&
                          !inventory.channels.some(
                            (c) => c.id === welcomeChannelId
                          ) && (
                            <option value={welcomeChannelId}>
                              {format(t.currentId, { value: welcomeChannelId })}
                            </option>
                          )}
                      </select>
                    )}
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
                          title={t.clearTitle}
                        >
                          {t.clear}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      {t.welcomeChannelHelp}
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
                      {t.welcomeMessageLabel}
                    </label>
                    <textarea
                      id="welcome-message"
                      value={welcomeMessage}
                      onChange={(e) => setWelcomeMessage(e.target.value)}
                      rows={3}
                      placeholder={t.welcomeExample1}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      {t.welcomeMessageHelp}
                    </p>

                    {/* Aperçu live de la carte de bienvenue */}
                    <div className="mt-3">
                      <p className="text-xs font-medium text-neutral-400 mb-1.5">
                        {t.previewLabel}
                      </p>
                      {!welcomeChannelId.trim() && (
                        <p className="text-xs text-amber-400/80 mb-2">
                          {t.previewNoChannelWarning}
                        </p>
                      )}
                      <WelcomeCardPreview
                        message={welcomeMessage}
                        serverName={config?.guild_name || t.serverFallback}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="welcome-dm-message"
                      className="block text-sm font-medium text-neutral-300 mb-1"
                    >
                      {t.welcomeDmLabel}
                    </label>
                    <textarea
                      id="welcome-dm-message"
                      value={welcomeDmMessage}
                      onChange={(e) => setWelcomeDmMessage(e.target.value)}
                      rows={3}
                      placeholder={t.welcomeExample2}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      {t.welcomeDmHelp}
                    </p>

                    {welcomeDmMessage.trim() && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-neutral-400 mb-1.5">
                          {t.previewDmLabel}
                        </p>
                        <div className="rounded-lg bg-[#313338] p-3 text-sm text-[#dbdee1] whitespace-pre-wrap break-words font-sans">
                          {renderWelcomePreview(
                            welcomeDmMessage,
                            config?.guild_name || t.serverFallback
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving || Object.keys(invalid).length > 0}
                  className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {saving ? t.saving : t.saveSubmit}
                </button>
                <Link
                  href={`/admin/tenants/${tenantId}`}
                  className="px-6 py-3 rounded-xl border border-neutral-600 text-sm font-semibold text-white text-center transition hover:bg-neutral-800"
                >
                  {t.backToTenant}
                </Link>
              </div>{' '}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <PlacementRolesEditor
                  rules={placementRules}
                  onChange={setPlacementRules}
                  disabled={saving}
                  labels={{
                    title: t.placementTitle,
                    help: t.placementHelp,
                    empty: t.placementEmpty,
                    addRule: t.placementAdd,
                    removeRule: t.placementRemove,
                    fromLabel: t.placementFrom,
                    toLabel: t.placementTo,
                    toPlaceholder: t.placementToPlaceholder,
                    roleLabel: t.placementRole,
                    rolePlaceholder: t.placementRolePlaceholder,
                    nameLabel: t.placementName,
                    namePlaceholder: t.placementNamePlaceholder,
                    invalidRole: t.placementInvalidRole,
                  }}
                />
              </section>
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
}>(
  { permission: 'manage_settings' },
  async (ctx: GetServerSidePropsContext) => {
    const id = ctx.params?.id;
    const guildId = ctx.params?.guildId;
    return {
      tenantId: typeof id === 'string' ? id : '',
      guildId: typeof guildId === 'string' ? guildId : '',
    };
  }
);

export default AdminDiscordConfigPage;
