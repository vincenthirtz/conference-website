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
import { withStaffPage, hasAtLeastRole } from '@/utils/staff';
import type { StaffRole } from '@/utils/staff';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Breadcrumb from '@/components/admin/Breadcrumb';
import AlertBanner from '@/components/admin/AlertBanner';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import EmptyState from '@/components/admin/EmptyState';
import ApiTokenRevealModal from '@/components/admin/ApiTokenRevealModal';
import { ALL_SCOPES } from '@/utils/apiScopes';
import { logger } from '@/utils/logger';

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

export const getServerSideProps = withStaffPage('admin');

function AdminApiTokensPage({ staff }: Props) {
  // Le rôle SSR est le miroir UX du gate serveur : seul un owner peut ACTIVER
  // une exemption partenaire (comp). Défense en profondeur — l'API bloque
  // réellement (403 FORBIDDEN_COMP), l'UI masque/désactive pour éviter le
  // faux espoir.
  const isOwner = hasAtLeastRole(staff.role as StaffRole, 'owner');

  const t = useAdminT('adminApiTokens');
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

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12 max-w-5xl mx-auto">
          <Breadcrumb
            items={[
              { label: t.breadcrumbAdmin, href: '/admin' },
              { label: t.breadcrumbTitle },
            ]}
          />

          <div className="mb-8">
            <p className="text-sm text-neutral-400">{t.kicker}</p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mt-1">
              {t.heading}
            </h1>
            <p className="text-sm text-neutral-400 mt-2 max-w-2xl">{t.intro}</p>
          </div>

          {/* ===== Création ===== */}
          <section
            className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6"
            data-testid="api-tokens-create-section"
          >
            <h2 className="text-xl font-semibold mb-1">{t.createHeading}</h2>
            <p className="text-sm text-neutral-400 mb-4">{t.createSubtitle}</p>

            <AlertBanner
              message={formError}
              variant="error"
              className="mb-4"
              onDismiss={() => setFormError(null)}
            />

            <form onSubmit={handleCreate} className="space-y-5">
              <div>
                <label
                  htmlFor="api-token-name"
                  className="block text-sm text-neutral-400 mb-1"
                >
                  {t.nameLabel}
                </label>
                <input
                  id="api-token-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.namePlaceholder}
                  maxLength={120}
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  data-testid="api-token-name-input"
                />
              </div>

              <div>
                <span className="block text-sm text-neutral-400 mb-1">
                  {t.scopesLabel}
                </span>
                <p className="text-xs text-neutral-500 mb-3">{t.scopesHint}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sortedScopes.map((scope) => {
                    const checked = selectedScopes.has(scope);
                    return (
                      <label
                        key={scope}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-purple-600/15 border-purple-500/40'
                            : 'bg-neutral-900/40 border-neutral-700/50 hover:border-neutral-600'
                        }`}
                        data-testid={`api-token-scope-${scope}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleScope(scope)}
                          className="w-4 h-4 rounded border-neutral-600 bg-neutral-900 text-purple-500 focus:ring-purple-500/50"
                        />
                        <span className="text-sm font-mono text-neutral-200">
                          {scope}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* ===== Expiration ===== */}
              <div>
                <label
                  htmlFor="api-token-ttl"
                  className="block text-sm text-neutral-400 mb-1"
                >
                  {t.expiryLabel}
                </label>
                <select
                  id="api-token-ttl"
                  value={ttlDays}
                  onChange={(e) => setTtlDays(Number(e.target.value))}
                  className="w-full sm:w-auto px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  data-testid="api-token-ttl-select"
                >
                  {TTL_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d === 0 ? t.expiryNever : t.expiryInDays.replace('{d}', String(d))}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-neutral-500 mt-1.5">{t.expiryHint}</p>
              </div>

              {/* ===== Exemption partenaire (owner uniquement) ===== */}
              <div
                className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3"
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
                    className="mt-0.5 w-4 h-4 rounded border-neutral-600 bg-neutral-900 text-amber-500 focus:ring-amber-500/50 disabled:cursor-not-allowed"
                    data-testid="api-token-comp-checkbox"
                  />
                  <span>
                    <span className="block text-sm font-medium text-amber-200">
                      {t.compLabel}
                    </span>
                    <span className="block text-xs text-neutral-400 mt-0.5">
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
                      className="block text-xs text-neutral-400 mb-1"
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
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                      data-testid="api-token-comp-note-input"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="api-token-create-btn"
                >
                  {creating ? t.creating : t.createButton}
                </button>
              </div>
            </form>
          </section>

          {/* ===== Liste ===== */}
          <section
            className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden"
            data-testid="api-tokens-list-section"
          >
            <div className="px-6 py-4 border-b border-neutral-700/50">
              <h2 className="text-xl font-semibold">{t.listHeading}</h2>
            </div>

            <AlertBanner
              message={loadError}
              variant="error"
              className="m-4"
              onDismiss={() => setLoadError(null)}
            />

            {tokens === null ? (
              <LoadingSpinner label={t.loading} className="py-16" />
            ) : tokens.length === 0 ? (
              <EmptyState title={t.emptyState} className="py-16" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-neutral-500 border-b border-neutral-700/50">
                      <th scope="col" className="px-6 py-3 font-medium">{t.colName}</th>
                      <th scope="col" className="px-6 py-3 font-medium">{t.colPrefix}</th>
                      <th scope="col" className="px-6 py-3 font-medium">{t.colScopes}</th>
                      <th scope="col" className="px-6 py-3 font-medium">{t.colCreated}</th>
                      <th scope="col" className="px-6 py-3 font-medium">{t.colExpires}</th>
                      <th scope="col" className="px-6 py-3 font-medium">{t.colLastUsed}</th>
                      <th scope="col" className="px-6 py-3 font-medium">{t.colStatus}</th>
                      <th scope="col" className="px-6 py-3 font-medium text-right">
                        {t.colActions}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700/50">
                    {tokens.map((token) => {
                      const revoked = Boolean(token.revoked_at);
                      const expired = isExpired(token);
                      return (
                        <tr
                          key={token.id}
                          className={
                            revoked ? 'opacity-50' : 'hover:bg-neutral-700/20'
                          }
                          data-testid={`api-token-row-${token.id}`}
                        >
                          <td className="px-6 py-4 font-medium text-white">
                            <div className="flex items-center gap-2">
                              <span>{token.name}</span>
                              {token.comp && (
                                <span
                                  className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap"
                                  title={token.comp_note || undefined}
                                  data-testid={`api-token-comp-badge-${token.id}`}
                                >
                                  {t.badgePartner}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <code className="text-xs font-mono text-neutral-300">
                              {token.token_prefix}…
                            </code>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1.5 max-w-xs">
                              {token.scopes.map((scope) => (
                                <span
                                  key={scope}
                                  className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-neutral-700/50 border border-neutral-600/50 text-neutral-300"
                                >
                                  {scope}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-neutral-400 whitespace-nowrap">
                            <div>{formatDate(token.created_at, '—')}</div>
                            {token.created_by_name && (
                              <div className="text-xs text-neutral-500">
                                {t.byCreator.replace('{name}', token.created_by_name)}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {token.expires_at ? (
                              <span
                                className={expired ? 'text-amber-300' : 'text-neutral-400'}
                              >
                                {formatDate(token.expires_at, '—')}
                              </span>
                            ) : (
                              <span className="text-neutral-500">{t.expiryNever}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-neutral-400 whitespace-nowrap">
                            {formatDate(token.last_used_at, t.neverUsed)}
                          </td>
                          <td className="px-6 py-4">
                            {revoked ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-600/40 text-neutral-300 border border-neutral-500/40">
                                {t.statusRevoked}
                              </span>
                            ) : expired ? (
                              <span
                                className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30"
                                data-testid={`api-token-expired-badge-${token.id}`}
                              >
                                {t.statusExpired}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                                {t.statusActive}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {!revoked && (
                              <div className="flex items-center justify-end gap-2">
                                {/* Toggle exemption partenaire : owner peut
                                    activer/désactiver ; un admin non-owner ne
                                    peut que retirer une exemption existante. */}
                                {(token.comp || isOwner) && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleComp(token)}
                                    disabled={togglingCompId === token.id}
                                    className={`px-3 py-1.5 rounded-lg border text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                      token.comp
                                        ? 'border-neutral-500/40 text-neutral-300 hover:border-neutral-400'
                                        : 'border-amber-500/40 text-amber-300 hover:border-amber-400'
                                    }`}
                                    data-testid={`api-token-comp-toggle-btn-${token.id}`}
                                  >
                                    {togglingCompId === token.id
                                      ? t.compUpdating
                                      : token.comp
                                        ? t.compDisableButton
                                        : t.compEnableButton}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleRevoke(token)}
                                  disabled={revokingId === token.id}
                                  className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:border-red-400 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  data-testid={`api-token-revoke-btn-${token.id}`}
                                >
                                  {revokingId === token.id
                                    ? t.revoking
                                    : t.revokeButton}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

AdminApiTokensPage.displayName = 'AdminApiTokensPage';

export default AdminApiTokensPage;
