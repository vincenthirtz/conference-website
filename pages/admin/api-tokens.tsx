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
import { useAdminFetch } from '@/hooks/useAdminFetch';
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
  };
};

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
  void staff; // gate SSR uniquement ; pas lu côté client.

  const t = useAdminT('adminApiTokens');
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const [tokens, setTokens] = useState<ApiTokenRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

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

      setCreating(true);
      try {
        const res = await mutateJson<CreateResponse>('/api/admin/api-tokens', {
          method: 'POST',
          body: JSON.stringify({
            name: trimmedName,
            scopes: [...selectedScopes],
          }),
        });
        addToast(t.toastCreated, 'success');
        setName('');
        setSelectedScopes(new Set());
        setRevealedToken(res.token);
        await fetchTokens();
      } catch (err) {
        logger.error('[admin/api-tokens] create error', err);
        const msg = (err as Error)?.message || t.errorCreate;
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
      mutateJson,
      addToast,
      fetchTokens,
      t.errorNameRequired,
      t.errorScopesRequired,
      t.toastCreated,
      t.errorCreate,
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
                      <th className="px-6 py-3 font-medium">{t.colName}</th>
                      <th className="px-6 py-3 font-medium">{t.colPrefix}</th>
                      <th className="px-6 py-3 font-medium">{t.colScopes}</th>
                      <th className="px-6 py-3 font-medium">{t.colCreated}</th>
                      <th className="px-6 py-3 font-medium">{t.colLastUsed}</th>
                      <th className="px-6 py-3 font-medium">{t.colStatus}</th>
                      <th className="px-6 py-3 font-medium text-right">
                        {t.colActions}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700/50">
                    {tokens.map((token) => {
                      const revoked = Boolean(token.revoked_at);
                      return (
                        <tr
                          key={token.id}
                          className={
                            revoked ? 'opacity-50' : 'hover:bg-neutral-700/20'
                          }
                          data-testid={`api-token-row-${token.id}`}
                        >
                          <td className="px-6 py-4 font-medium text-white">
                            {token.name}
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
                            {formatDate(token.created_at, '—')}
                          </td>
                          <td className="px-6 py-4 text-neutral-400 whitespace-nowrap">
                            {formatDate(token.last_used_at, t.neverUsed)}
                          </td>
                          <td className="px-6 py-4">
                            {revoked ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-600/40 text-neutral-300 border border-neutral-500/40">
                                {t.statusRevoked}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                                {t.statusActive}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {!revoked && (
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
