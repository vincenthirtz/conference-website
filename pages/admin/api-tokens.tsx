// pages/admin/api-tokens.tsx
//
// Page /admin/api-tokens — gestion des tokens d'accès à l'API publique scopée
// (Lot 1 de « API publique élargie »).
//
// - Liste les tokens du tenant courant (métadonnées seules ; jamais le hash ni
//   le plain). Les tokens révoqués sont grisés + badge.
// - Formulaire de création : nom + cases à cocher des scopes (source :
//   utils/apiScopes.ts → ALL_SCOPES, jamais hardcodé). Le token en clair est
//   affiché UNE SEULE FOIS dans une modal (ApiTokenRevealModal).
// - Révocation par token actif → confirm → DELETE → refresh.
//
// Auth : minRole 'admin' (via withStaffPage). Le backend (withStaffRoute) est
// la vraie barrière ; ce gate SSR est le miroir côté page.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { hasAtLeastRole } from '@/utils/staffRoles';
import type { StaffRole } from '@/utils/staff';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Breadcrumb from '@/components/admin/Breadcrumb';
import AlertBanner from '@/components/admin/AlertBanner';
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable';
import ApiTokenRevealModal from '@/components/admin/ApiTokenRevealModal';
import { ALL_SCOPES } from '@/utils/apiScopes';
import { logger } from '@/utils/logger';
import nsAdminApiTokens from '@/lib/i18n/locales/admin-fr/adminApiTokens';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

// Planche « Le Ruban », archétype Liste : classes partagées par les deux cartes.
const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4';
const SECTION_TITLE =
  'font-[family-name:var(--fd)] text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--t1,#f4edf7)] [font-stretch:75%]';
const EYEBROW =
  'mb-2 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';
const LABEL = 'mb-1 block text-sm text-[var(--t3,#a39ba6)]';
const INPUT =
  'rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2.5 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';

type ApiTokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  comp?: boolean | null;
  comp_note?: string | null;
};

type ListResponse = { tokens: ApiTokenRow[] };
type CreateResponse = {
  token: string;
  tokenMeta: {
    id: string;
    name: string;
    token_prefix: string;
    scopes: string[];
    created_at: string;
    expires_at?: string | null;
    comp?: boolean | null;
    comp_note?: string | null;
  };
};

/** Options d'expiration (jours). `0` = pas d'expiration. */
const TTL_OPTIONS = [0, 30, 90, 365] as const;

function isExpired(token: ApiTokenRow): boolean {
  return (
    !token.revoked_at &&
    Boolean(token.expires_at) &&
    new Date(token.expires_at as string).getTime() <= Date.now()
  );
}

/** Détecte un refus 403 FORBIDDEN_COMP (activation d'exemption sans owner). */
function isForbiddenComp(err: unknown): boolean {
  return (
    err instanceof AdminFetchError &&
    err.status === 403 &&
    typeof err.payload === 'object' &&
    err.payload !== null &&
    (err.payload as { code?: unknown }).code === 'FORBIDDEN_COMP'
  );
}

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

function formatDate(s: string | null, fallback: string): string {
  if (!s) return fallback;
  try {
    return new Date(s).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s;
  }
}

export const getServerSideProps = withStaffPage({
  permission: 'manage_settings',
});

function AdminApiTokensPage({ staff }: Props) {
  // Le rôle SSR est le miroir UX du gate serveur : seul un owner peut ACTIVER
  // une exemption partenaire (comp). Défense en profondeur — l'API bloque
  // réellement (403 FORBIDDEN_COMP), l'UI masque/désactive pour éviter le
  // faux espoir.
  const isOwner = hasAtLeastRole(staff.role as StaffRole, 'owner');

  const t = useAdminT(nsAdminApiTokens);
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const [tokens, setTokens] = useState<ApiTokenRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());
  const [ttlDays, setTtlDays] = useState<number>(0);
  const [comp, setComp] = useState(false);
  const [compNote, setCompNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [togglingCompId, setTogglingCompId] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await adminFetchJson<ListResponse>('/api/admin/api-tokens');
      setTokens(res.tokens ?? []);
    } catch (err) {
      logger.error('[admin/api-tokens] load error', err);
      setTokens([]);
      setLoadError((err as Error)?.message || t.errorLoad);
    }
  }, [adminFetchJson, t.errorLoad]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const toggleScope = useCallback((scope: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }, []);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (creating) return;
      setFormError(null);

      const trimmedName = name.trim();
      if (!trimmedName) {
        setFormError(t.errorNameRequired);
        return;
      }
      if (selectedScopes.size === 0) {
        setFormError(t.errorScopesRequired);
        return;
      }

      // Une exemption partenaire n'est activable qu'avec le rôle owner : on
      // ignore la case côté client pour un non-owner (l'API refuserait de toute
      // façon avec 403 FORBIDDEN_COMP).
      const wantsComp = comp && isOwner;
      const trimmedNote = compNote.trim();

      setCreating(true);
      try {
        const res = await mutateJson<CreateResponse>('/api/admin/api-tokens', {
          method: 'POST',
          body: JSON.stringify({
            name: trimmedName,
            scopes: [...selectedScopes],
            comp: wantsComp,
            ...(wantsComp && trimmedNote ? { comp_note: trimmedNote } : {}),
            ...(ttlDays > 0 ? { expires_in_days: ttlDays } : {}),
          }),
        });
        addToast(t.toastCreated, 'success');
        setName('');
        setSelectedScopes(new Set());
        setTtlDays(0);
        setComp(false);
        setCompNote('');
        setRevealedToken(res.token);
        await fetchTokens();
      } catch (err) {
        logger.error('[admin/api-tokens] create error', err);
        const msg = isForbiddenComp(err)
          ? t.errorCompForbidden
          : (err as Error)?.message || t.errorCreate;
        setFormError(msg);
        addToast(msg, 'error');
      } finally {
        setCreating(false);
      }
    },
    [
      creating,
      name,
      selectedScopes,
      ttlDays,
      comp,
      compNote,
      isOwner,
      mutateJson,
      addToast,
      fetchTokens,
      t.errorNameRequired,
      t.errorScopesRequired,
      t.toastCreated,
      t.errorCreate,
      t.errorCompForbidden,
    ]
  );

  const handleRevoke = useCallback(
    async (token: ApiTokenRow) => {
      const ok = await confirm({
        title: t.confirmRevokeTitle,
        subtitle: t.confirmRevokeSubtitle,
        variant: 'danger',
        confirmLabel: t.confirmRevokeLabel,
      });
      if (!ok) return;

      setRevokingId(token.id);
      try {
        await mutateJson(`/api/admin/api-tokens/${token.id}`, {
          method: 'DELETE',
        });
        addToast(t.toastRevoked, 'success');
        await fetchTokens();
      } catch (err) {
        logger.error('[admin/api-tokens] revoke error', err);
        addToast((err as Error)?.message || t.errorRevoke, 'error');
      } finally {
        setRevokingId(null);
      }
    },
    [
      confirm,
      mutateJson,
      addToast,
      fetchTokens,
      t.confirmRevokeTitle,
      t.confirmRevokeSubtitle,
      t.confirmRevokeLabel,
      t.toastRevoked,
      t.errorRevoke,
    ]
  );

  const handleToggleComp = useCallback(
    async (token: ApiTokenRow) => {
      const nextComp = !token.comp;

      // Activer une exemption = bypass du modèle payant → owner requis + confirm.
      if (nextComp) {
        if (!isOwner) {
          addToast(t.errorCompForbidden, 'error');
          return;
        }
        const ok = await confirm({
          title: t.confirmCompTitle,
          subtitle: t.confirmCompSubtitle,
          variant: 'danger',
          confirmLabel: t.confirmCompLabel,
        });
        if (!ok) return;
      }

      setTogglingCompId(token.id);
      try {
        await mutateJson(`/api/admin/api-tokens/${token.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ comp: nextComp }),
        });
        addToast(
          nextComp ? t.toastCompEnabled : t.toastCompDisabled,
          'success'
        );
        await fetchTokens();
      } catch (err) {
        logger.error('[admin/api-tokens] toggle comp error', err);
        const msg = isForbiddenComp(err)
          ? t.errorCompForbidden
          : (err as Error)?.message || t.errorComp;
        addToast(msg, 'error');
      } finally {
        setTogglingCompId(null);
      }
    },
    [
      isOwner,
      confirm,
      mutateJson,
      addToast,
      fetchTokens,
      t.errorCompForbidden,
      t.confirmCompTitle,
      t.confirmCompSubtitle,
      t.confirmCompLabel,
      t.toastCompEnabled,
      t.toastCompDisabled,
      t.errorComp,
    ]
  );

  const sortedScopes = useMemo(() => [...ALL_SCOPES].sort(), []);

  // Colonnes déclaratives (lot A5). Les états de la LIGNE (révoquée) passent
  // par `rowClassName`, pas par une classe répétée dans chaque cellule.
  const columns: DataTableColumn<ApiTokenRow>[] = [
    {
      key: 'name',
      header: t.colName,
      value: (tk) => tk.name,
      className: 'font-medium text-white',
      render: (tk) => (
        <span className="flex items-center gap-2">
          <span>{tk.name}</span>
          {tk.comp && (
            <span
              title={tk.comp_note || undefined}
              data-testid={`api-token-comp-badge-${tk.id}`}
            >
              <Chip tone="brand">{t.badgePartner}</Chip>
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'prefix',
      header: t.colPrefix,
      value: (tk) => tk.token_prefix,
      render: (tk) => (
        <code className="font-mono text-xs text-[var(--t2,#c7bfca)]">
          {tk.token_prefix}…
        </code>
      ),
    },
    {
      key: 'scopes',
      header: t.colScopes,
      value: (tk) => tk.scopes.join(' '),
      render: (tk) => (
        <span className="flex max-w-xs flex-wrap gap-1.5">
          {tk.scopes.map((scope) => (
            <span
              key={scope}
              className="rounded-[3px] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 py-0.5 font-mono text-[11px] text-[var(--t2,#c7bfca)]"
            >
              {scope}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: 'created',
      header: t.colCreated,
      value: (tk) => tk.created_at ?? '',
      className: 'whitespace-nowrap text-[var(--t3,#a39ba6)]',
      render: (tk) => (
        <span>
          <span className="block">{formatDate(tk.created_at, '—')}</span>
          {tk.created_by_name && (
            <span className="block text-xs text-[var(--t4,#807984)]">
              {t.byCreator.replace('{name}', tk.created_by_name)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'expires',
      header: t.colExpires,
      value: (tk) => tk.expires_at ?? '',
      className: 'whitespace-nowrap',
      render: (tk) =>
        tk.expires_at ? (
          <span
            className={
              isExpired(tk)
                ? 'text-[var(--warn,#f5a524)]'
                : 'text-[var(--t3,#a39ba6)]'
            }
          >
            {formatDate(tk.expires_at, '—')}
          </span>
        ) : (
          <span className="text-[var(--t4,#807984)]">{t.expiryNever}</span>
        ),
    },
    {
      key: 'last_used',
      header: t.colLastUsed,
      value: (tk) => tk.last_used_at ?? '',
      className: 'whitespace-nowrap text-[var(--t3,#a39ba6)]',
      render: (tk) => <>{formatDate(tk.last_used_at, t.neverUsed)}</>,
    },
    {
      key: 'status',
      header: t.colStatus,
      value: (tk) =>
        tk.revoked_at
          ? t.statusRevoked
          : isExpired(tk)
            ? t.statusExpired
            : t.statusActive,
      render: (tk) =>
        tk.revoked_at ? (
          <Chip tone="err">{t.statusRevoked}</Chip>
        ) : isExpired(tk) ? (
          <span data-testid={`api-token-expired-badge-${tk.id}`}>
            <Chip tone="warn">{t.statusExpired}</Chip>
          </span>
        ) : (
          <Chip tone="ok">{t.statusActive}</Chip>
        ),
    },
    {
      key: 'actions',
      header: t.colActions,
      sortable: false,
      headerClassName: 'text-right',
      className: 'text-right',
      render: (tk) =>
        tk.revoked_at ? null : (
          <span className="flex items-center justify-end gap-2">
            {/* Exemption partenaire : un owner l'active ou la retire ; un admin
                non-owner ne peut que retirer une exemption existante. */}
            {(tk.comp || isOwner) && (
              <AdminButton
                size="xs"
                variant={tk.comp ? 'ghost' : 'secondary'}
                onClick={() => handleToggleComp(tk)}
                disabled={togglingCompId === tk.id}
                data-testid={`api-token-comp-toggle-btn-${tk.id}`}
              >
                {togglingCompId === tk.id
                  ? t.compUpdating
                  : tk.comp
                    ? t.compDisableButton
                    : t.compEnableButton}
              </AdminButton>
            )}
            <AdminButton
              size="xs"
              variant="danger"
              onClick={() => handleRevoke(tk)}
              disabled={revokingId === tk.id}
              data-testid={`api-token-revoke-btn-${tk.id}`}
            >
              {revokingId === tk.id ? t.revoking : t.revokeButton}
            </AdminButton>
          </span>
        ),
    },
  ];

  return (
    <>
      {dialog}
      {revealedToken && (
        <ApiTokenRevealModal
          token={revealedToken}
          onClose={() => setRevealedToken(null)}
        />
      )}
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div>
          <Breadcrumb
            items={[
              { label: t.breadcrumbAdmin, href: '/admin' },
              { label: t.breadcrumbTitle },
            ]}
          />

          <p className={EYEBROW}>{t.kicker}</p>
          <AdminPageHeader title={t.heading} subtitle={t.intro} />

          {/* ===== Création ===== */}
          <section
            className={`${CARD} mb-6`}
            data-testid="api-tokens-create-section"
          >
            <h2 className={SECTION_TITLE}>{t.createHeading}</h2>
            <p className="mt-1 mb-4 text-sm text-[var(--t3,#a39ba6)]">
              {t.createSubtitle}
            </p>

            <AlertBanner
              message={formError}
              variant="error"
              className="mb-4"
              onDismiss={() => setFormError(null)}
            />

            <form onSubmit={handleCreate} className="space-y-5">
              <div>
                <label htmlFor="api-token-name" className={LABEL}>
                  {t.nameLabel}
                </label>
                <input
                  id="api-token-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.namePlaceholder}
                  maxLength={120}
                  className={`${INPUT} w-full`}
                  data-testid="api-token-name-input"
                />
              </div>

              <div>
                <span className={LABEL}>{t.scopesLabel}</span>
                <p className="mb-3 text-xs text-[var(--t4,#807984)]">
                  {t.scopesHint}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sortedScopes.map((scope) => {
                    const checked = selectedScopes.has(scope);
                    return (
                      <label
                        key={scope}
                        className={`flex cursor-pointer items-center gap-3 rounded-[var(--r-ctrl,4px)] border px-3 py-2.5 transition-colors ${
                          checked
                            ? 'border-[rgba(180,103,209,.45)] bg-[rgba(180,103,209,.1)]'
                            : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] hover:border-[var(--t4,#807984)]'
                        }`}
                        data-testid={`api-token-scope-${scope}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleScope(scope)}
                          className="h-4 w-4 accent-[var(--or,#b467d1)]"
                        />
                        <span className="font-mono text-sm text-[var(--t1,#f4edf7)]">
                          {scope}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* ===== Expiration ===== */}
              <div>
                <label htmlFor="api-token-ttl" className={LABEL}>
                  {t.expiryLabel}
                </label>
                <select
                  id="api-token-ttl"
                  value={ttlDays}
                  onChange={(e) => setTtlDays(Number(e.target.value))}
                  className={`${INPUT} w-full sm:w-auto`}
                  data-testid="api-token-ttl-select"
                >
                  {TTL_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d === 0
                        ? t.expiryNever
                        : t.expiryInDays.replace('{d}', String(d))}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-[var(--t4,#807984)]">
                  {t.expiryHint}
                </p>
              </div>

              {/* ===== Exemption partenaire (owner uniquement) ===== */}
              <div
                className="rounded-[var(--r-ctrl,4px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.06)] p-3"
                data-testid="api-token-comp-section"
              >
                <label
                  className={`flex items-start gap-3 ${
                    isOwner ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
                  }`}
                  title={isOwner ? undefined : t.compOwnerOnly}
                >
                  <input
                    type="checkbox"
                    checked={comp}
                    disabled={!isOwner}
                    onChange={(e) => setComp(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[var(--warn,#f5a524)] disabled:cursor-not-allowed"
                    data-testid="api-token-comp-checkbox"
                  />
                  <span>
                    <span className="block text-sm font-medium text-amber-200">
                      {t.compLabel}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--t3,#a39ba6)]">
                      {t.compHint}
                    </span>
                    {!isOwner && (
                      <span
                        className="block text-xs text-amber-400/80 mt-1"
                        data-testid="api-token-comp-owner-hint"
                      >
                        {t.compOwnerOnly}
                      </span>
                    )}
                  </span>
                </label>

                {isOwner && comp && (
                  <div className="mt-3">
                    <label
                      htmlFor="api-token-comp-note"
                      className="mb-1 block text-xs text-[var(--t3,#a39ba6)]"
                    >
                      {t.compNoteLabel}
                    </label>
                    <input
                      id="api-token-comp-note"
                      type="text"
                      value={compNote}
                      onChange={(e) => setCompNote(e.target.value)}
                      placeholder={t.compNotePlaceholder}
                      maxLength={500}
                      className={`${INPUT} w-full`}
                      data-testid="api-token-comp-note-input"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <AdminButton
                  type="submit"
                  variant="primary"
                  disabled={creating}
                  data-testid="api-token-create-btn"
                >
                  {creating ? t.creating : t.createButton}
                </AdminButton>
              </div>
            </form>
          </section>

          {/* ===== Liste ===== */}
          <section className={CARD} data-testid="api-tokens-list-section">
            <h2 className={`${SECTION_TITLE} mb-3`}>{t.listHeading}</h2>

            <AlertBanner
              message={loadError}
              variant="error"
              className="mb-4"
              onDismiss={() => setLoadError(null)}
            />

            <DataTable<ApiTokenRow>
              rows={tokens ?? []}
              columns={columns}
              rowKey={(tk) => tk.id}
              rowTestId={(tk) => `api-token-row-${tk.id}`}
              rowClassName={(tk) => (tk.revoked_at ? 'opacity-50' : '')}
              loading={tokens === null}
              error={null}
              emptyTitle={t.emptyState}
              searchPlaceholder
              exportFilename="api-tokens"
            />
          </section>
        </div>
      </div>
    </>
  );
}

AdminApiTokensPage.displayName = 'AdminApiTokensPage';

export default AdminApiTokensPage;
