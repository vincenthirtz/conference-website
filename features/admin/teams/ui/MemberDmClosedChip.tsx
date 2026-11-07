// features/admin/teams/ui/MemberDmClosedChip.tsx — « MP fermés » sur une
// ligne du roster admin (lot 3). Discord refuse les messages privés de cette
// personne : ses rappels partent dans le salon de l'équipe, et le staff doit
// le savoir avant de compter sur un MP.
//
// `discordDmClosedAt` arrive avec le contrat C5 de l'API ; tant que la copie
// synchronisée de `TeamMemberRow` ne le porte pas, il est lu ici, absent = rien.

import Chip from '@/features/admin/_shared/ui/Chip';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsAdminTeamDetail from '@/lib/i18n/locales/admin-fr/adminTeamDetail';

type DmClosedFields = { discordDmClosedAt?: string | null };

export function dmClosedAt(member: object): string | null {
  const value = (member as DmClosedFields).discordDmClosedAt;
  return typeof value === 'string' && value ? value : null;
}

function formatDay(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });
}

export default function MemberDmClosedChip({ member }: { member: object }) {
  const t = useAdminT(nsAdminTeamDetail);
  const locale = useLocale();
  const since = dmClosedAt(member);
  if (!since) return null;
  const date = formatDay(since, locale);
  return (
    <Chip
      tone="warn"
      title={format(t.dmClosedTitle, { date })}
      data-testid="member-dm-closed"
    >
      {format(t.dmClosed, { date })}
    </Chip>
  );
}
