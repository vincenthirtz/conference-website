// features/admin/identity/ui/IdentityOverviewSection.tsx — « État et chiffres » de la page owner
// « Comptes et connexion » : les tables de Better Auth en nombres (aucun secret), le staff actif
// encore sans double authentification, et ce qui est fixé dans le code.

import { Card, Chip, FicheSection, StatTile } from '@/features/ruban';
import { format, useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminIdentity from '@/lib/i18n/locales/admin-fr/adminIdentity';
import type { IdentityOverview } from '../model';

export default function IdentityOverviewSection({
  overview,
}: {
  overview: IdentityOverview;
}) {
  const t = useAdminT(nsAdminIdentity);
  const { stats, staff, fixed } = overview;

  return (
    <FicheSection title={t.overviewTitle}>
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatTile
            label={t.statAccounts}
            value={stats.accounts}
            hint={format(t.statAccountsHint, {
              unverified: stats.unverified,
              banned: stats.banned,
            })}
          />
          <StatTile
            label={t.statSessions}
            value={stats.activeSessions}
            hint={format(t.statSessionsHint, {
              people: stats.signedInPeople,
              aal2: stats.aal2Sessions,
            })}
          />
          <StatTile
            label={t.statSignIns}
            value={stats.sessions7d}
            hint={format(t.statSignInsHint, {
              day: stats.sessions24h,
              people: stats.signedIn7d,
            })}
          />
          <StatTile
            label={t.statTwoFactor}
            value={stats.twoFactor}
            hint={t.statTwoFactorHint}
            tone={stats.twoFactor > 0 ? 'ok' : 'warn'}
          />
          <StatTile
            label={t.statMethods}
            value={`${stats.withPassword} / ${stats.withDiscord}`}
            hint={format(t.statMethodsHint, { discordOnly: stats.discordOnly })}
          />
          <StatTile
            label={t.statThrottled}
            value={stats.throttled}
            hint={t.statThrottledHint}
            tone={stats.throttled > 0 ? 'warn' : 'neutral'}
          />
        </div>
      )}

      <Card padding="sm" className="mt-4">
        <p className="text-[13px] font-semibold text-[var(--t1,#f4edf7)]">
          {t.staffTitle}
        </p>
        {staff.withoutTwoFactor.length === 0 ? (
          <p className="mt-1 text-[13px] text-[var(--t3,#a39ba6)]">
            {format(t.staffAll, { count: staff.active })}
          </p>
        ) : (
          <>
            <p className="mt-1 text-[13px] text-[var(--t3,#a39ba6)]">
              {format(t.staffSome, {
                missing: staff.withoutTwoFactor.length,
                count: staff.active,
              })}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {staff.withoutTwoFactor.map((member) => (
                <li key={member.staffId}>
                  <Chip tone="warn">
                    {member.displayName || t.staffNoName} · {member.role}
                  </Chip>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card padding="sm" className="mt-4">
        <p className="text-[13px] font-semibold text-[var(--t1,#f4edf7)]">
          {t.fixedTitle}
        </p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-[var(--t3,#a39ba6)]">
          <li>
            {format(t.fixedMfa, {
              value: fixed.staffMfaEnforced ? t.yes : t.no,
            })}
          </li>
          <li>{format(t.fixedToken, { minutes: fixed.tokenMinutes })}</li>
          <li>
            {format(t.fixedCache, { seconds: fixed.sessionCacheSeconds })}
          </li>
          <li>
            {format(t.fixedSettings, { seconds: fixed.settingsDelaySeconds })}
          </li>
          <li>
            {format(t.fixedAttempts, {
              attempts: fixed.signInAttemptsPerFiveMinutes,
            })}
          </li>
        </ul>
      </Card>
    </FicheSection>
  );
}
