// components/admin/tenants/PlanCheckoutModal.tsx
//
// Modal owner-only : génère un lien de paiement HelloAsso ciblé (tenant + plan)
// via POST /api/admin/tenants/[id]/plan-checkout, puis affiche l'URL de
// paiement de façon copiable pour l'envoyer au partenaire.
//
// Deux étapes dans la même modale :
//   1) Sélection du plan achetable (Régie / Circuit — dérivé de
//      PLAN_PRICES_EUR / PLAN_LABELS, jamais hardcodé) → « Générer le lien ».
//   2) Révélation : champ read-only + bouton « Copier » + montant.
//
// Owner-gate : l'API est la vraie barrière (withStaffRoute('owner')). Cette
// modale ne s'ouvre que pour un owner ; un 403 reste géré défensivement.

import { useCallback, useState } from 'react';
import Modal from '@/components/admin/Modal';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { AdminFetchError } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useAdminT } from '@/lib/i18n/useAdminT';
import {
  PLAN_PRICES_EUR,
  PLAN_LABELS,
  type PurchasablePlan,
} from '@/utils/billing/planFeatures';
import { logger } from '@/utils/logger';
import nsAdminTenantPlanCheckout from '@/lib/i18n/locales/admin-fr/adminTenantPlanCheckout';

type CheckoutResponse = {
  redirectUrl: string;
  checkoutIntentId: number;
  plan: PurchasablePlan;
  amountEur: number;
};

type Props = {
  tenant: { id: string; name: string; slug: string };
  onClose: () => void;
};

const PURCHASABLE_PLANS: PurchasablePlan[] = ['regie', 'circuit'];

function isForbidden(err: unknown): boolean {
  return err instanceof AdminFetchError && err.status === 403;
}

export default function PlanCheckoutModal({ tenant, onClose }: Props) {
  const t = useAdminT(nsAdminTenantPlanCheckout);
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();

  const [plan, setPlan] = useState<PurchasablePlan>('regie');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (generating) return;
    setError(null);
    setGenerating(true);
    try {
      const res = await mutateJson<CheckoutResponse>(
        `/api/admin/tenants/${tenant.id}/plan-checkout`,
        { method: 'POST', body: JSON.stringify({ plan }) }
      );
      setResult(res);
      addToast(t.toastGenerated, 'success');
    } catch (err) {
      logger.error('[admin/tenants] plan-checkout error', err);
      const msg = isForbidden(err)
        ? t.errorOwnerOnly
        : (err as Error)?.message || t.errorGenerate;
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setGenerating(false);
    }
  }, [generating, mutateJson, tenant.id, plan, addToast, t]);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.redirectUrl);
      setCopied(true);
      addToast(t.copiedToast, 'success');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      addToast(t.copyError, 'error');
    }
  }, [result, addToast, t]);

  return (
    <Modal
      open
      onClose={onClose}
      title={t.title}
      subtitle={result ? undefined : tenant.name}
      size="lg"
      dataTestId="tenant-plan-checkout-modal"
    >
      {result ? (
        // ===== Étape 2 : lien généré, copiable =====
        <div className="pb-6 space-y-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {t.resultHint}
          </div>

          <div>
            <span className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-1">
              {t.amountLabel}
            </span>
            <p className="text-lg font-semibold text-white">
              {result.amountEur} €{' '}
              <span className="text-sm font-normal text-neutral-400">
                ({PLAN_LABELS[result.plan]} · {t.perYear})
              </span>
            </p>
          </div>

          <div>
            <label
              htmlFor="plan-checkout-link"
              className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-1"
            >
              {t.linkLabel}
            </label>
            <div className="flex gap-2">
              <input
                id="plan-checkout-link"
                type="text"
                readOnly
                value={result.redirectUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-mono text-white"
                data-testid="tenant-plan-checkout-link-input"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                data-testid="tenant-plan-checkout-copy-btn"
              >
                {copied ? t.copied : t.copy}
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-semibold text-white transition-colors"
              data-testid="tenant-plan-checkout-done-btn"
            >
              {t.close}
            </button>
          </div>
        </div>
      ) : (
        // ===== Étape 1 : sélection du plan =====
        <div className="pb-6 space-y-4">
          <p className="text-sm text-neutral-400">{t.intro}</p>

          {error && (
            <div
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
              data-testid="tenant-plan-checkout-error"
            >
              {error}
            </div>
          )}

          <div>
            <span className="block text-sm text-neutral-400 mb-2">
              {t.planLabel}
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PURCHASABLE_PLANS.map((p) => {
                const selected = plan === p;
                return (
                  <label
                    key={p}
                    className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                      selected
                        ? 'bg-purple-600/15 border-purple-500/40'
                        : 'bg-neutral-900/40 border-neutral-700/50 hover:border-neutral-600'
                    }`}
                    data-testid={`tenant-plan-checkout-option-${p}`}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="plan-checkout-plan"
                        value={p}
                        checked={selected}
                        onChange={() => setPlan(p)}
                        className="w-4 h-4 border-neutral-600 bg-neutral-900 text-purple-500 focus:ring-purple-500/50"
                      />
                      <span className="text-sm font-medium text-white">
                        {PLAN_LABELS[p]}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-neutral-200 whitespace-nowrap">
                      {PLAN_PRICES_EUR[p]} € {t.perYear}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-semibold text-white transition-colors"
              data-testid="tenant-plan-checkout-cancel-btn"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="tenant-plan-checkout-generate-btn"
            >
              {generating ? t.generating : t.generate}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
