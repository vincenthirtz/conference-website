// components/admin/onboarding/ApiKeysPanel.tsx
//
// Onglet « Clés d'API » du hub : les clés de TOUS les espaces, par espace.
//
// POURQUOI ICI PLUTÔT QU'À /admin/api-tokens. Cette page-là ne montre que les
// clés de l'espace ACTIF du sélecteur, qu'elle ne nomme nulle part. C'est ce
// qui a produit une clé destinée à un partenaire rattachée à l'espace
// historique : le token étant autoritaire sur l'espace, elle servait des
// données valides et fausses. Elle garde son utilité — un admin d'organisation
// y gère les siennes — mais la vue d'opérateur, transverse, appartient au hub.
//
// CHARGEMENT PARESSEUX PAR ESPACE. La liste des espaces vient de l'endpoint de
// readiness, qui porte déjà le NOMBRE de clés vivantes ; les lignes ne sont
// lues qu'à l'ouverture d'un espace. On regarde les clés d'un espace à la fois,
// et un appel par espace au chargement serait un N+1 pour une information que
// personne ne lit d'un bloc.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AlertBanner from '@/components/admin/AlertBanner';
import ApiTokenRevealModal from '@/components/admin/ApiTokenRevealModal';
import MintApiKeyModal from '@/components/admin/onboarding/MintApiKeyModal';
import nsAdminOnboarding from '@/lib/i18n/locales/admin-fr/adminOnboarding';

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  apiTokenCount: number;
  apiTokenSoonestExpiry: string | null;
};

type TokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  comp: boolean;
  comp_note: string | null;
};

/** Une échéance en deçà de ce seuil mérite d'être vue avant, pas après. */
const EXPIRY_WARN_DAYS = 30;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.ceil((ms - Date.now()) / 86_400_000);
}

export default function ApiKeysPanel() {
  const t = useAdminT(nsAdminOnboarding);
  const { adminFetchJson } = useAdminFetch();

  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Record<string, TokenRow[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [mintFor, setMintFor] = useState<TenantRow | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);

  const loadTenants = useCallback(async () => {
    setError(null);
    try {
      const data = await adminFetchJson<{ tenants: TenantRow[] }>(
        '/api/admin/tenants/readiness'
      );
      setTenants(data.tenants);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.apiKeysLoadError);
      setTenants([]);
    }
  }, [adminFetchJson, t.apiKeysLoadError]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const loadTokens = useCallback(
    async (tenantId: string) => {
      setLoadingId(tenantId);
      try {
        const data = await adminFetchJson<{ tokens: TokenRow[] }>(
          `/api/admin/tenants/${tenantId}/api-tokens`
        );
        setTokens((prev) => ({ ...prev, [tenantId]: data.tokens }));
      } catch (err) {
        setError(err instanceof Error ? err.message : t.apiKeysLoadError);
      } finally {
        setLoadingId(null);
      }
    },
    [adminFetchJson, t.apiKeysLoadError]
  );

  const toggle = useCallback(
    (tenantId: string) => {
      const next = openId === tenantId ? null : tenantId;
      setOpenId(next);
      if (next && !tokens[next]) void loadTokens(next);
    },
    [loadTokens, openId, tokens]
  );

  const revoke = useCallback(
    async (tenantId: string, token: TokenRow) => {
      if (
        !window.confirm(format(t.apiKeysRevokeConfirm, { name: token.name }))
      ) {
        return;
      }
      try {
        await adminFetchJson(
          `/api/admin/tenants/${tenantId}/api-tokens?tokenId=${encodeURIComponent(token.id)}`,
          { method: 'DELETE' }
        );
        await loadTokens(tenantId);
        await loadTenants();
      } catch (err) {
        setError(err instanceof Error ? err.message : t.apiKeysRevokeError);
      }
    },
    [
      adminFetchJson,
      loadTenants,
      loadTokens,
      t.apiKeysRevokeConfirm,
      t.apiKeysRevokeError,
    ]
  );

  if (tenants === null) {
    return <p className="text-sm text-neutral-400">{t.readinessLoading}</p>;
  }

  return (
    <div>
      <AlertBanner message={error} variant="error" className="mb-4" />
      <p className="mb-4 text-sm text-neutral-400">{t.apiKeysIntro}</p>

      <ul className="space-y-3">
        {tenants.map((tenant) => {
          const isOpen = openId === tenant.id;
          const rows = tokens[tenant.id];
          const soon = daysUntil(tenant.apiTokenSoonestExpiry);

          return (
            <li
              key={tenant.id}
              className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40"
              data-testid="api-keys-tenant-row"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <button
                  type="button"
                  onClick={() => toggle(tenant.id)}
                  aria-expanded={isOpen}
                  className="flex items-center gap-2 text-left"
                >
                  <span aria-hidden className="text-neutral-500">
                    {isOpen ? '▾' : '▸'}
                  </span>
                  <span className="text-base font-semibold text-white">
                    {tenant.name}
                  </span>
                  <code className="rounded bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-400">
                    {tenant.slug}
                  </code>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs ${
                      tenant.apiTokenCount > 0
                        ? 'bg-emerald-500/15 text-emerald-200'
                        : 'bg-neutral-700/30 text-neutral-400'
                    }`}
                  >
                    {format(t.criterionApiKeys, {
                      count: tenant.apiTokenCount,
                    })}
                  </span>
                  {soon !== null && soon <= EXPIRY_WARN_DAYS && (
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs text-amber-100">
                      {format(t.apiKeysExpiringSoon, {
                        days: Math.max(0, soon),
                      })}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setMintFor(tenant)}
                    className="text-xs text-violet-300 underline hover:text-violet-200"
                    data-testid="api-keys-mint-cta"
                  >
                    {t.mintKeyCta}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-neutral-700/50 px-4 py-3">
                  {loadingId === tenant.id && !rows ? (
                    <p className="text-sm text-neutral-400">
                      {t.readinessLoading}
                    </p>
                  ) : !rows || rows.length === 0 ? (
                    <p className="text-sm text-neutral-400">{t.apiKeysEmpty}</p>
                  ) : (
                    <ul className="divide-y divide-neutral-700/40">
                      {rows.map((token) => {
                        const expired =
                          token.expires_at !== null &&
                          Date.parse(token.expires_at) <= Date.now();
                        const dead = Boolean(token.revoked_at) || expired;
                        return (
                          <li
                            key={token.id}
                            className={`flex flex-wrap items-center justify-between gap-3 py-2.5 ${
                              dead ? 'opacity-50' : ''
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-white">
                                  {token.name}
                                </span>
                                <code className="text-xs text-neutral-400">
                                  {token.token_prefix}…
                                </code>
                                {token.comp && (
                                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                                    {t.apiKeysCompTag}
                                  </span>
                                )}
                                {token.revoked_at && (
                                  <span className="rounded-full bg-neutral-700/40 px-2 py-0.5 text-[11px] text-neutral-300">
                                    {t.apiKeysRevokedTag}
                                  </span>
                                )}
                                {expired && !token.revoked_at && (
                                  <span className="rounded-full bg-neutral-700/40 px-2 py-0.5 text-[11px] text-neutral-300">
                                    {t.apiKeysExpiredTag}
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 truncate text-xs text-neutral-500">
                                {token.scopes.join(' · ')}
                              </p>
                            </div>

                            {!token.revoked_at && (
                              <button
                                type="button"
                                onClick={() => void revoke(tenant.id, token)}
                                className="text-xs text-red-300 underline hover:text-red-200"
                              >
                                {t.apiKeysRevokeCta}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {mintFor && (
        <MintApiKeyModal
          tenantId={mintFor.id}
          tenantName={mintFor.name}
          onClose={() => setMintFor(null)}
          onMinted={(token) => {
            const id = mintFor.id;
            setMintFor(null);
            setRevealed(token);
            void loadTokens(id);
            void loadTenants();
          }}
        />
      )}

      {revealed && (
        <ApiTokenRevealModal
          token={revealed}
          onClose={() => setRevealed(null)}
        />
      )}
    </div>
  );
}
