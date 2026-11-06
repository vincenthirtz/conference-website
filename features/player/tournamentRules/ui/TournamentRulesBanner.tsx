// features/player/tournamentRules/ui/TournamentRulesBanner.tsx — « Le
// règlement de <tournoi> attend ta validation », en tête de l'espace joueuse.
//
// Parle tant que `required && me.mustValidate && !me.accepted` pour un
// tournoi ouvert ; se tait sinon (rien à faire, lecture en échec, inspection).
// Pas de bouton « masquer » : sans la validation de chacun·e, l'inscription
// de l'équipe reste incomplète — offrir de cacher le rappel reviendrait à
// offrir de rater le tournoi (même règle que RegistrationDeadlineBanner).

import { ButtonLink, rubanWarnBox } from '@/features/ruban';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerTournamentRules from '@/lib/i18n/locales/fr/playerTournamentRules';
import { tournamentRulesUrls } from '../client';
import { usePendingRulesValidations } from '../hooks/useTournamentRules';

export default function TournamentRulesBanner({
  enabled,
}: {
  /** Faux en inspection, ou sans équipe : aucune lecture. */
  enabled: boolean;
}) {
  const t = useT(nsPlayerTournamentRules);
  const pending = usePendingRulesValidations(enabled);
  if (!enabled || pending.length === 0) return null;

  return (
    <div className="flex flex-col gap-3" data-testid="tournament-rules-banner">
      {pending.map(({ tournament, rules }) => (
        <section
          key={tournament.id}
          aria-labelledby={`rules-banner-${tournament.id}`}
          className={`${rubanWarnBox} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}
        >
          <div className="min-w-0">
            <h2
              id={`rules-banner-${tournament.id}`}
              className="text-[15px] font-semibold text-[var(--t1,#f4edf7)]"
            >
              {format(t.bannerTitle, { tournament: tournament.name })}
            </h2>
            <p className="mt-1">
              {format(t.bannerBody, { team: rules.me?.teamName ?? '' })}
            </p>
            {rules.version?.note && rules.version.requiresRevalidation && (
              <p className="mt-1 text-xs">
                {format(t.bannerNewVersion, { note: rules.version.note })}
              </p>
            )}
          </div>
          <ButtonLink
            size="sm"
            variant="primary"
            href={tournamentRulesUrls.readerPage(tournament.id)}
          >
            {t.bannerCta}
          </ButtonLink>
        </section>
      ))}
    </div>
  );
}
