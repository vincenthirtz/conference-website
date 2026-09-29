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

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  type ApiTokenRow,
  tenantsClient,
} from '@/features/admin/tenants/client';
import {
  tenantsKeys,
  useTenantsReadiness,
} from '@/features/admin/tenants/hooks/useTenants';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AlertBanner from '@/components/admin/AlertBanner';
import ApiTokenRevealModal from '@/components/admin/ApiTokenRevealModal';
import MintApiKeyModal from '@/components/admin/onboarding/MintApiKeyModal';
import nsAdminOnboarding from '@/lib/i18n/locales/admin-fr/adminOnboarding';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  apiTokenCount: number;
  apiTokenSoonestExpiry: string | null;
};

type TokenRow = ApiTokenRow;

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
  const qc = useQueryClient();
  // Même lecture que le panneau « Préparation » : une requête pour les deux.
  const readiness = useTenantsReadiness<{ tenants: TenantRow[] }>();
  const tenants: TenantRow[] | null = readiness.error
    ? []
    : (readiness.data?.tenants ?? null);
  const [error, setError] = useState<string | null>(null);
  const loadError = readiness.error
    ? readiness.error.message || t.apiKeysLoadError
    : null;
  const [openId, setOpenId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Record<string, TokenRow[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [mintFor, setMintFor] = useState<TenantRow | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);

  const loadTenants = useCallback(() => {
    setError(null);
    return qc.invalidateQueries({ queryKey: tenantsKeys.readiness });
  }, [qc]);

  const loadTokens = useCallback(
    async (tenantId: string) => {
      setLoadingId(tenantId);
      try {
        const data = await tenantsClient.apiTokens(tenantId);
        setTokens((prev) => ({ ...prev, [tenantId]: data.tokens ?? [] }));
      } catch (err) {
        setError(err instanceof Error ? err.message : t.apiKeysLoadError);
      } finally {
        setLoadingId(null);
      }
    },
    [t.apiKeysLoadError]
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
        await tenantsClient.revokeApiToken(tenantId, token.id);
        await loadTokens(tenantId);
        await loadTenants();
      } catch (err) {
        setError(err instanceof Error ? err.message : t.apiKeysRevokeError);
      }
    },
    [loadTenants, loadTokens, t.apiKeysRevokeConfirm, t.apiKeysRevokeError]
  );

  if (tenants === null) {
    return <p className="text-sm text-neutral-400">{t.readinessLoading}</p>;
  }

  return (
    <div>
      <AlertBanner
        message={error ?? loadError}
        variant="error"
        className="mb-4"
      />
      <p className="mb-4 text-sm text-neutral-400">{t.apiKeysIntro}</p>

      <ul className="space-y-3">
        {tenants.map((tenant) => {
          const isOpen = openId === tenant.id;
          const rows = tokens[tenant.id];
          const soon = daysUntil(tenant.apiTokenSoonestExpiry);

          return (
            <li
              key={tenant.id}
              className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]"
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
                  <code className="rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] px-1.5 py-0.5 text-xs text-neutral-400">
                    {tenant.slug}
                  </code>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={tenant.apiTokenCount > 0 ? 'ok' : 'neutral'}>
                    {format(t.criterionApiKeys, {
                      count: tenant.apiTokenCount,
                    })}
                  </Chip>
                  {soon !== null && soon <= EXPIRY_WARN_DAYS && (
                    <Chip tone="warn">
                      {format(t.apiKeysExpiringSoon, {
                        days: Math.max(0, soon),
                      })}
                    </Chip>
                  )}
                  <AdminButton
                    variant="secondary"
                    size="xs"
                    onClick={() => setMintFor(tenant)}
                    data-testid="api-keys-mint-cta"
                  >
                    {t.mintKeyCta}
                  </AdminButton>
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
                                  <Chip tone="warn">{t.apiKeysCompTag}</Chip>
                                )}
                                {token.revoked_at && (
                                  <Chip>{t.apiKeysRevokedTag}</Chip>
                                )}
                                {expired && !token.revoked_at && (
                                  <Chip>{t.apiKeysExpiredTag}</Chip>
                                )}
                              </div>
                              <p className="mt-0.5 truncate text-xs text-neutral-500">
                                {token.scopes.join(' · ')}
                              </p>
                            </div>

                            {!token.revoked_at && (
                              <AdminButton
                                variant="danger"
                                size="xs"
                                onClick={() => void revoke(tenant.id, token)}
                              >
                                {t.apiKeysRevokeCta}
                              </AdminButton>
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
