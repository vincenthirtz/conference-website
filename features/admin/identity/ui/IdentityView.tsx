// features/admin/identity/ui/IdentityView.tsx — la page owner « Comptes et connexion »
// (/admin/connexion) : état et chiffres de Better Auth, réglages, un compte, et l'urgence.

import { useToast } from '@/components/Toast';
import { DangerZone, PageHeader } from '@/features/ruban';
import { format, useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminIdentity from '@/lib/i18n/locales/admin-fr/adminIdentity';
import { adminErrorMessage } from '@/utils/admin/adminHttp';
import { useSignOutEveryone } from '../hooks/useIdentity';
import type { IdentityOverview } from '../model';
import IdentityAccountsSection from './IdentityAccountsSection';
import IdentityOverviewSection from './IdentityOverviewSection';
import IdentitySettingsSection from './IdentitySettingsSection';

/** La phrase exigée par l'API (features/admin/identity/schemas.ts). */
export const SIGN_OUT_EVERYONE_CONFIRMATION = 'DECONNECTER TOUT LE MONDE';

/** Le temps de lire le message avant le retour à la connexion. */
const BACK_TO_LOGIN_MS = 2500;

export default function IdentityView({
  overview,
}: {
  overview: IdentityOverview;
}) {
  const t = useAdminT(nsAdminIdentity);
  const { addToast } = useToast();
  const signOutEveryone = useSignOutEveryone();

  const signOutAll = async () => {
    try {
      const { revoked } = await signOutEveryone.mutateAsync(
        SIGN_OUT_EVERYONE_CONFIRMATION
      );
      addToast(format(t.signOutAllDone, { count: revoked }), 'success');
      // Sa propre session vient de fermer avec les autres.
      window.setTimeout(() => {
        window.location.assign('/login?next=%2Fadmin%2Fconnexion');
      }, BACK_TO_LOGIN_MS);
    } catch (err) {
      addToast(
        format(t.actionError, { error: adminErrorMessage(err, t.loadError) }),
        'error'
      );
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader title={t.title} subtitle={t.subtitle} />

      {!overview.available && (
        <p className="rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.08)] p-3 text-[13px] text-[#ffc2c2]">
          {t.unavailable}
        </p>
      )}

      <IdentityOverviewSection overview={overview} />

      {overview.settings && (
        <IdentitySettingsSection
          settings={overview.settings}
          stored={overview.settingsStored}
          discordOnly={overview.stats?.discordOnly ?? 0}
        />
      )}

      {overview.available && <IdentityAccountsSection />}

      {overview.available && (
        <DangerZone
          confirmName={SIGN_OUT_EVERYONE_CONFIRMATION}
          labels={{
            title: t.dangerTitle,
            intro: t.dangerIntro,
            typeToConfirm: t.typeToConfirm,
            cancel: t.cancel,
          }}
          actions={[
            {
              id: 'sign-out-everyone',
              title: t.signOutAllTitle,
              description: t.signOutAllDescription,
              actionLabel: t.signOutAllAction,
              onConfirm: signOutAll,
            },
          ]}
        />
      )}
    </div>
  );
}
