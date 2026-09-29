// components/admin/billing/PlanOrderPanel.tsx
//
// Le SECOND temps du « double clic » (art. 1127-2 c. civ.).
//
// Le bouton d'une offre n'achète rien : il ouvre ce panneau. On y voit ce qu'on
// achète — offre, périodicité, montant total, durée ouverte — et on peut
// revenir en arrière. Ce n'est qu'ensuite, et seulement une fois les deux
// consentements donnés, que le bouton portant la mention légale devient
// actionnable.
//
// Pourquoi DEUX cases et non une. L'acceptation des CGV forme le contrat.
// La demande d'exécution immédiate assortie de la renonciation est ce qui, et
// seulement ce qui, éteint le droit de rétractation de quatorze jours sur un
// contenu numérique sans support matériel (art. L221-28 13° c. conso.). Les
// fondre dans un « j'accepte tout » ferait perdre l'exception : le délai
// courrait intégralement, malgré la case.
//
// La mention du bouton est IMPOSÉE, pas paraphrasée : l'article L221-14 exige
// une formule dénuée d'ambiguïté sur l'obligation de payer. « Valider »,
// « Continuer » ou « Souscrire » ne conviennent pas.

import { format } from '@/lib/i18n/useAdminT';
import { CGV_VERSION } from '@/utils/billing/cgv';
import type { PlanTerm, PurchasablePlan } from '@/utils/billing/planFeatures';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

type OrderDict = {
  orderSummaryTitle: string;
  orderOffer: string;
  orderTerm: string;
  orderTermMonth: string;
  orderTermYear: string;
  orderTotal: string;
  orderDuration: string;
  orderDurationMonth: string;
  orderDurationYear: string;
  orderNoRenewal: string;
  orderModify: string;
  orderCgvBefore: string;
  orderCgvLink: string;
  orderCgvAfter: string;
  orderWaiver: string;
  orderConsentRequired: string;
  orderSubmit: string;
  redirecting: string;
};

export default function PlanOrderPanel({
  plan,
  label,
  term,
  priceEur,
  busy,
  cgvAccepted,
  waiverAccepted,
  onCgvChange,
  onWaiverChange,
  onSubmit,
  onCancel,
  t,
}: {
  plan: PurchasablePlan;
  label: string;
  term: PlanTerm;
  /** Le montant EXACT qui sera débité, pour la périodicité choisie. */
  priceEur: number;
  busy: boolean;
  cgvAccepted: boolean;
  waiverAccepted: boolean;
  onCgvChange: (v: boolean) => void;
  onWaiverChange: (v: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
  t: OrderDict;
}) {
  const ready = cgvAccepted && waiverAccepted;

  return (
    <div
      className="mt-4 rounded-[var(--r-card,14px)] border border-[rgba(180,103,209,.45)] bg-[var(--s2,#1d1520)] p-4"
      data-testid={`billing-order-${plan}`}
    >
      <h4 className="font-[family-name:var(--fd)] text-sm font-bold uppercase tracking-[0.02em] text-[var(--t1,#f4edf7)]">
        {t.orderSummaryTitle}
      </h4>

      <dl className="mt-3 space-y-1.5 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-400">{t.orderOffer}</dt>
          <dd className="font-medium text-[var(--t1,#f4edf7)]">{label}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-400">{t.orderTerm}</dt>
          <dd className="font-medium text-[var(--t1,#f4edf7)]">
            {term === 'month' ? t.orderTermMonth : t.orderTermYear}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-400">{t.orderDuration}</dt>
          <dd className="font-medium text-[var(--t1,#f4edf7)]">
            {term === 'month' ? t.orderDurationMonth : t.orderDurationYear}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-[var(--line,rgba(194,196,201,.12))] pt-2">
          <dt className="text-neutral-300">{t.orderTotal}</dt>
          <dd className="text-base font-bold text-[var(--t1,#f4edf7)]">
            {priceEur} €
          </dd>
        </div>
      </dl>

      <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
        {t.orderNoRenewal}
      </p>

      {/* Case 1 — les CGV. Vierge : un consentement pré-coché n'en est pas un. */}
      <label className="mt-4 flex gap-2.5 text-xs leading-relaxed text-neutral-200">
        <input
          type="checkbox"
          checked={cgvAccepted}
          onChange={(e) => onCgvChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[var(--or,#b467d1)]"
          data-testid="billing-consent-cgv"
        />
        <span>
          {t.orderCgvBefore}
          <a
            href="/cgv"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-300 underline"
          >
            {t.orderCgvLink}
          </a>
          {format(t.orderCgvAfter, { version: CGV_VERSION })}
        </span>
      </label>

      {/* Case 2 — exécution immédiate + renonciation. Distincte, et elle seule
          éteint le délai de rétractation. */}
      <label className="mt-3 flex gap-2.5 text-xs leading-relaxed text-neutral-200">
        <input
          type="checkbox"
          checked={waiverAccepted}
          onChange={(e) => onWaiverChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[var(--or,#b467d1)]"
          data-testid="billing-consent-waiver"
        />
        <span>{t.orderWaiver}</span>
      </label>

      {!ready && (
        <p className="mt-3 text-[11px] text-amber-300/90">
          {t.orderConsentRequired}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <AdminButton
          variant="primary"
          onClick={onSubmit}
          disabled={!ready || busy}
          className="flex-1"
          data-testid={`billing-order-submit-${plan}`}
        >
          {busy ? t.redirecting : t.orderSubmit}
        </AdminButton>
        <AdminButton onClick={onCancel} data-testid="billing-order-cancel">
          {t.orderModify}
        </AdminButton>
      </div>
    </div>
  );
}
