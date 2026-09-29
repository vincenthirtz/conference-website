import { useCallback, useMemo, useState } from 'react';
import Head from 'next/head';
import type { GetServerSidePropsContext } from 'next';
import { withStaffPage } from '@/utils/staff';
import { useQueryClient } from '@tanstack/react-query';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useHydrateOnce } from '@/features/admin/_shared/useHydrateOnce';
import { tenantsPaths } from '@/features/admin/tenants/client';
import {
  effectiveConfig,
  tenantsKeys,
  useDiscordInventory,
  useTenantDiscordConfigs,
} from '@/features/admin/tenants/hooks/useTenants';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AlertBanner from '@/components/admin/AlertBanner';
import Breadcrumb from '@/components/admin/Breadcrumb';
import LoadingSpinner from '@/components/admin/LoadingSpinner';

import nsAdminTenantDiscordConfig from '@/lib/i18n/locales/admin-fr/adminTenantDiscordConfig';
import nsAdminFiche from '@/lib/i18n/locales/admin-fr/adminFiche';
import SnowflakeField from '@/features/admin/tenants/ui/SnowflakeField';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import {
  FicheLayout,
  FicheSection,
  MetaList,
} from '@/features/admin/_shared/ui/Fiche';
import PlacementRolesEditor from '@/components/admin/tenants/PlacementRolesEditor';
import {
  parsePlacementRules,
  type PlacementRule,
} from '@/utils/discord/placementRoles';
import WelcomeCardPreview, {
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
  const tf = useAdminT(nsAdminFiche);
  const FIELDS = useMemo(() => getDiscordConfigFields(t), [t]);
  const { addToast } = useToast();
  const { mutateJson } = useIdempotentMutation();
  const queryClient = useQueryClient();

  const configsQuery = useTenantDiscordConfigs(tenantId);
  const loading = configsQuery.isPending || configsQuery.isFetching;
  const [error, setError] = useState<string | null>(null);
  const loadError = configsQuery.error
    ? configsQuery.error.message || t.errorLoad
    : null;
  const config = useMemo(
    () =>
      configsQuery.data ? effectiveConfig(configsQuery.data, guildId) : null,
    [configsQuery.data, guildId]
  );
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
  // Inventaire chargé à la demande (bouton), puis relu à chaque clic.
  const [inventoryRequested, setInventoryRequested] = useState(false);
  const inventoryQuery = useDiscordInventory(
    tenantId,
    guildId,
    inventoryRequested
  );
  const inventory: Inventory | null = inventoryQuery.data ?? null;
  const inventoryLoading = inventoryQuery.isFetching;
  const inventoryError = inventoryQuery.error
    ? inventoryQuery.error.message || t.inventoryError
    : null;
  const { refetch: refetchInventory } = inventoryQuery;
  const loadInventory = useCallback(() => {
    if (inventoryRequested) void refetchInventory();
    else setInventoryRequested(true);
  }, [inventoryRequested, refetchInventory]);

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

  // Copie la configuration du serveur dans le formulaire.
  const hydrate = useCallback(
    (effective: DiscordConfig) => {
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
    },
    [FIELDS]
  );
  useHydrateOnce(config ? guildId : null, config ?? undefined, hydrate);

  /** Relit la configuration et RÉ-HYDRATE le formulaire (après enregistrement). */
  const fetchData = useCallback(async () => {
    setError(null);
    await queryClient.invalidateQueries({
      queryKey: tenantsKeys.discordConfigs(tenantId),
    });
    const fresh = queryClient.getQueryData<DiscordConfig[]>(
      tenantsKeys.discordConfigs(tenantId)
    );
    if (fresh) hydrate(effectiveConfig(fresh, guildId));
  }, [queryClient, tenantId, guildId, hydrate]);

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
      await mutateJson(tenantsPaths.discordConfigGuild(tenantId, guildId), {
        method: 'PUT',
        body: JSON.stringify(body),
      });
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

  const formId = 'discord-config-form';
  const fieldClass =
    'rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] text-sm text-[var(--t1,#f4edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)]';
  const selectClass = `w-full mb-2 px-3 py-2 ${fieldClass}`;
  const textareaClass = `w-full px-3 py-2 ${fieldClass}`;
  const snowflakeClass = (hasError: boolean) =>
    `flex-1 px-3 py-2 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border text-sm font-mono text-[var(--t1,#f4edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)] ${
      hasError
        ? 'border-[rgba(255,107,107,.6)]'
        : 'border-[var(--line2,rgba(194,196,201,.2))]'
    }`;
  const labelClass = 'block text-sm font-medium text-[var(--t2,#c7bfca)] mb-1';
  const helpClass = 'text-xs text-[var(--t4,#807984)] mt-1';
  const errClass = 'text-xs text-[var(--err,#ff6b6b)] mt-1';
  const invalidCount = Object.keys(invalid).length;

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
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

        <div className="mt-4">
          <EntityHeader
            crest={
              config?.guild_name
                ? config.guild_name.slice(0, 3).toUpperCase()
                : undefined
            }
            title={t.heading}
            meta={
              <>
                {t.guildIdLabel}{' '}
                <span className="font-mono text-[var(--or-200,#eec4ff)]">
                  {guildId}
                </span>
                {config?.guild_name && (
                  <>
                    {' '}
                    ·{' '}
                    <span className="text-[var(--t1,#f4edf7)]">
                      {config.guild_name}
                    </span>
                  </>
                )}
              </>
            }
            actions={
              <>
                <AdminButtonLink href={`/admin/tenants/${tenantId}`}>
                  {t.backToTenant}
                </AdminButtonLink>
                <AdminButton
                  variant="primary"
                  type="submit"
                  form={formId}
                  disabled={saving || invalidCount > 0 || loading || !config}
                >
                  {saving ? t.saving : t.saveSubmit}
                </AdminButton>
              </>
            }
          />
        </div>

        {loading && (
          <div className="py-12">
            <LoadingSpinner label={t.loadingConfig} />
          </div>
        )}

        <AlertBanner message={error ?? loadError} className="mb-4" />

        {!loading && config && (
          <form id={formId} onSubmit={handleSubmit}>
            <FicheLayout
              main={
                <>
                  {sections.map((sec) => (
                    <FicheSection key={sec.key} title={sec.label}>
                      <div className="space-y-4">
                        {FIELDS.filter((f) => f.section === sec.key).map(
                          (f) => {
                            const key = f.key as string;
                            const value = form[key] ?? '';
                            return (
                              <SnowflakeField
                                key={key}
                                id={`f-${key}`}
                                label={f.label}
                                value={value}
                                onChange={(v) =>
                                  setForm((prev) => ({ ...prev, [key]: v }))
                                }
                                options={optionsForField(f)}
                                showOptions={Boolean(inventory)}
                                noneLabel={t.selectNoneFallback}
                                unknownLabel={format(t.currentId, { value })}
                                placeholder={
                                  f.kind === 'list'
                                    ? '123456789012345678 234567890123456789'
                                    : '123456789012345678'
                                }
                                help={f.help}
                                error={invalid[key]}
                                onClear={() => handleClear(key)}
                                clearLabel={t.clear}
                                clearTitle={t.clearFallbackTitle}
                              />
                            );
                          }
                        )}
                      </div>
                    </FicheSection>
                  ))}

                  <FicheSection title={t.welcomeHeading}>
                    <div className="space-y-4">
                      <div>
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            id="welcome-enabled"
                            type="checkbox"
                            checked={welcomeEnabled}
                            onChange={(e) =>
                              setWelcomeEnabled(e.target.checked)
                            }
                            className="h-4 w-4 rounded border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-[var(--or,#b467d1)] focus:ring-2 focus:ring-[var(--or,#b467d1)]"
                          />
                          <span className="text-sm font-medium text-[var(--t2,#c7bfca)]">
                            {t.welcomeEnableLabel}
                          </span>
                        </label>
                        <p className={helpClass}>{t.welcomeEnableHelp}</p>
                      </div>

                      <div>
                        <label
                          htmlFor="welcome-channel-id"
                          className={labelClass}
                        >
                          {t.welcomeChannelLabel}
                        </label>
                        {inventory && (
                          <select
                            value={welcomeChannelId}
                            onChange={(e) =>
                              setWelcomeChannelId(e.target.value)
                            }
                            className={selectClass}
                          >
                            <option value="">{t.selectNoneNoMessage}</option>
                            {inventory.channels
                              .filter((c) =>
                                CHANNEL_TYPES.text.includes(c.type)
                              )
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
                                  {format(t.currentId, {
                                    value: welcomeChannelId,
                                  })}
                                </option>
                              )}
                          </select>
                        )}
                        <div className="flex gap-2">
                          <input
                            id="welcome-channel-id"
                            type="text"
                            value={welcomeChannelId}
                            onChange={(e) =>
                              setWelcomeChannelId(e.target.value)
                            }
                            placeholder="123456789012345678"
                            className={snowflakeClass(
                              Boolean(invalid.welcome_channel_id)
                            )}
                          />
                          {welcomeChannelId && (
                            <AdminButton
                              size="sm"
                              onClick={() => setWelcomeChannelId('')}
                              title={t.clearTitle}
                            >
                              {t.clear}
                            </AdminButton>
                          )}
                        </div>
                        <p className={helpClass}>{t.welcomeChannelHelp}</p>
                        {invalid.welcome_channel_id && (
                          <p className={errClass}>
                            {invalid.welcome_channel_id}
                          </p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="welcome-message" className={labelClass}>
                          {t.welcomeMessageLabel}
                        </label>
                        <textarea
                          id="welcome-message"
                          value={welcomeMessage}
                          onChange={(e) => setWelcomeMessage(e.target.value)}
                          rows={3}
                          placeholder={t.welcomeExample1}
                          className={textareaClass}
                        />
                        <p className={helpClass}>{t.welcomeMessageHelp}</p>

                        {/* Aperçu live de la carte de bienvenue */}
                        <div className="mt-3">
                          <p className="mb-1.5 text-xs font-medium text-[var(--t3,#a39ba6)]">
                            {t.previewLabel}
                          </p>
                          {!welcomeChannelId.trim() && (
                            <p className="mb-2 text-xs text-[var(--warn,#f5a524)]">
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
                          className={labelClass}
                        >
                          {t.welcomeDmLabel}
                        </label>
                        <textarea
                          id="welcome-dm-message"
                          value={welcomeDmMessage}
                          onChange={(e) => setWelcomeDmMessage(e.target.value)}
                          rows={3}
                          placeholder={t.welcomeExample2}
                          className={textareaClass}
                        />
                        <p className={helpClass}>{t.welcomeDmHelp}</p>

                        {welcomeDmMessage.trim() && (
                          <div className="mt-3">
                            <p className="mb-1.5 text-xs font-medium text-[var(--t3,#a39ba6)]">
                              {t.previewDmLabel}
                            </p>
                            <div className="whitespace-pre-wrap break-words rounded-lg bg-[#313338] p-3 font-sans text-sm text-[#dbdee1]">
                              {renderWelcomePreview(
                                welcomeDmMessage,
                                config?.guild_name || t.serverFallback
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </FicheSection>

                  <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6">
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
                </>
              }
              aside={
                <FicheSection eyebrow title={tf.metaTitle}>
                  <MetaList items={[{ label: tf.metaId, value: guildId }]} />
                  <p className="mt-4 text-xs text-[var(--t4,#807984)]">
                    {t.fallbackNote}
                  </p>

                  {/* Sélecteur de salons : interroge le bot pour lister salons
                      + rôles du serveur → évite de coller des snowflakes à la
                      main. */}
                  <div className="mt-4 flex flex-col items-start gap-2">
                    <AdminButton
                      variant="secondary"
                      size="sm"
                      onClick={loadInventory}
                      disabled={inventoryLoading}
                    >
                      {inventoryLoading
                        ? t.inventoryLoading
                        : inventory
                          ? t.inventoryReload
                          : t.inventoryList}
                    </AdminButton>
                    {inventory && !inventoryLoading && (
                      <span
                        className="text-xs text-[var(--lf-200,#b3e7a3)]"
                        data-numeric
                      >
                        {format(t.inventoryLoaded, {
                          channels: inventory.channels.length,
                          roles: inventory.roles.length,
                        })}
                      </span>
                    )}
                    {inventoryError && (
                      <span className="text-xs text-[var(--err,#ff6b6b)]">
                        {inventoryError}
                      </span>
                    )}
                  </div>
                </FicheSection>
              }
            />
          </form>
        )}
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

export default withAdminQuery(AdminDiscordConfigPage);
