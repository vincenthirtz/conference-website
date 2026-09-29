// features/admin/billing/ui/PlanCapabilities.tsx — la liste des capacités
// d'un plan (coche / tiret), sortie de pages/admin/billing.tsx. Purement
// présentationnel : les capacités sont calculées par la page.

import { useAdminT } from '@/lib/i18n/useAdminT';
import type { PlanFeatures } from '@/utils/billing/planFeatures';
import nsAdminBilling from '@/lib/i18n/locales/admin-fr/adminBilling';

const CheckIcon = () => (
  <svg
    className="h-4 w-4 flex-shrink-0 text-[var(--lf,#7fca65)]"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.5}
      d="M5 13l4 4L19 7"
    />
  </svg>
);

const DashIcon = () => (
  <svg
    className="h-4 w-4 flex-shrink-0 text-[var(--t4,#807984)]"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.5}
      d="M18 12H6"
    />
  </svg>
);

function CapabilityRow({
  label,
  value,
}: {
  label: string;
  value: boolean | string;
}) {
  const off = typeof value === 'boolean' && !value;
  return (
    <li className="flex items-center gap-2 text-sm">
      {off ? <DashIcon /> : <CheckIcon />}
      <span
        className={
          off ? 'text-[var(--t4,#807984)]' : 'text-[var(--t1,#f4edf7)]'
        }
      >
        {label}
        {typeof value === 'string' && (
          <span className="ml-1 text-[var(--t3,#a39ba6)]">— {value}</span>
        )}
      </span>
    </li>
  );
}

export default function PlanCapabilities({
  features: f,
}: {
  features: PlanFeatures;
}) {
  const t = useAdminT(nsAdminBilling);
  const eventOps =
    f.discordEventOps === 'full' ? t.capEventOpsFull : t.capEventOpsNone;
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      <CapabilityRow label={t.capApiRead} value={f.apiRead} />
      <CapabilityRow label={t.capApiWrite} value={f.apiWrite} />
      <CapabilityRow label={t.capDiscordBot} value={f.discordBot} />
      <CapabilityRow
        label={`${t.capEventOps} (${eventOps})`}
        value={f.discordEventOps !== 'none'}
      />
      <CapabilityRow label={t.capWhiteLabel} value={f.whiteLabel} />
      <CapabilityRow label={t.capMultiTenant} value={f.multiTenant} />
      <CapabilityRow label={t.capArbitration} value={f.arbitration} />
      <CapabilityRow label={t.capRatings} value={f.ratings} />
      <CapabilityRow label={t.capBroadcastStudio} value={f.broadcastStudio} />
    </ul>
  );
}
