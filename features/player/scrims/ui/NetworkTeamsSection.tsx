// features/player/scrims/ui/NetworkTeamsSection.tsx — les équipes des autres
// espaces volontaires qui cherchent un scrim. Une SECTION à part, jamais
// mêlée à l'annuaire de l'espace : ni fiabilité ni historique commun ne s'y
// mesurent, les ranger côte à côte laisserait croire qu'elles se comparent.

import { ButtonLink, Card, Chip } from '@/features/ruban';
import type { NetworkDirectoryTeam } from '../schemas';

export type NetworkTexts = Record<
  | 'networkTitle'
  | 'networkIntro'
  | 'networkFrom'
  | 'networkCommonSlots'
  | 'networkContactCta'
  | 'networkNoContact',
  string
>;

export default function NetworkTeamsSection({
  teams,
  t,
  format,
}: {
  teams: NetworkDirectoryTeam[];
  t: NetworkTexts;
  format: (tpl: string, vars: Record<string, string | number>) => string;
}) {
  if (teams.length === 0) return null;
  return (
    <section className="mt-10" data-test="network-teams">
      <h2 className="text-lg font-bold">{t.networkTitle}</h2>
      <p className="mt-1 text-sm text-[var(--t3,#a39ba6)]">{t.networkIntro}</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {teams.map((team) => (
          <Card
            as="li"
            padding="sm"
            key={`${team.tenant.slug ?? 'x'}-${team.id}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{team.name}</span>
              <Chip tone="neutral">
                {format(t.networkFrom, { name: team.tenant.name })}
              </Chip>
            </div>
            {team.scrim_search.common_slots.length > 0 && (
              <p className="mt-2 text-xs font-semibold">
                {format(t.networkCommonSlots, {
                  n: team.scrim_search.common_slots.length,
                })}
              </p>
            )}
            {team.scrim_search.note && (
              <p className="mt-2 text-sm">{team.scrim_search.note}</p>
            )}
            {team.discord ? (
              <ButtonLink
                variant="secondary"
                size="sm"
                className="mt-3"
                href={team.discord}
                target="_blank"
              >
                {t.networkContactCta}
              </ButtonLink>
            ) : (
              <p className="mt-3 text-xs text-[var(--t3,#a39ba6)]">
                {t.networkNoContact}
              </p>
            )}
          </Card>
        ))}
      </ul>
    </section>
  );
}
