// features/player/scrims/ui/DirectoryTeamRow.tsx — une équipe de l'annuaire
// connecté : signaux (cherche un scrim, annonce publiée / accepte les
// demandes, score de compatibilité et ses raisons), créneaux communs, gestes.
// Présentationnel.

import { ButtonLink, Card, Chip, type ChipTone } from '@/features/ruban';
import SkillRatingBadge from '@/components/Team/SkillRatingBadge';
import { acceptsRequests } from '@/utils/teams/directoryRecruitment';
import type { OpponentReason } from '@/utils/teams/opponentMatch';
import type { DirectoryTeam } from '../schemas';

export type DirectoryRowTexts = Record<
  | 'badgeScrim'
  | 'badgeOpening'
  | 'badgeOpeningRoles'
  | 'badgeAcceptsRequests'
  | 'badgeAcceptsRequestsHelp'
  | 'matchScore'
  | 'matchScoreHelp'
  | 'membersCount'
  | 'ratingLabel'
  | 'responseRate'
  | 'commonRhythm'
  | 'commonSlots'
  | 'proposeCta'
  | 'viewOpeningCta'
  | 'joinCta'
  | 'scoutCta'
  | 'viewCta',
  string
>;

/**
 * Trois bandes seulement : au-delà, la nuance devient du bruit — le score
 * sert à trier, pas à noter au point près.
 */
function scoreTone(score: number): ChipTone {
  if (score >= 70) return 'ok';
  if (score >= 45) return 'brand';
  return 'neutral';
}

const MUTED = 'text-[var(--t3,#a39ba6)]';

export default function DirectoryTeamRow({
  team,
  t,
  roleLabel,
  reasonLabel,
  fmtSlot,
  format,
  managesTeam,
  hasTeam,
}: {
  team: DirectoryTeam;
  t: DirectoryRowTexts;
  roleLabel: (role: string) => string;
  reasonLabel: (code: OpponentReason) => string;
  fmtSlot: (iso: string) => string;
  format: (tpl: string, vars: Record<string, string | number>) => string;
  managesTeam: boolean;
  hasTeam: boolean;
}) {
  const rate = team.reliability?.responseRate;
  const search = team.scrim_search;

  return (
    <Card as="li" padding="sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{team.name}</span>
            {search && <Chip tone="ok">{t.badgeScrim}</Chip>}
            {/* Signal FORT : une annonce existe — la seule équipe de la
                liste qui attend réellement une candidature. */}
            {team.opening && (
              <span data-test="badge-opening">
                <Chip tone="brand">
                  {team.opening.roles.length > 0
                    ? format(t.badgeOpeningRoles, {
                        roles: team.opening.roles.map(roleLabel).join(', '),
                      })
                    : t.badgeOpening}
                </Chip>
              </span>
            )}
            {/* Signal DISCRET : `is_joinable` vaut true par défaut. Masqué
                quand une annonce existe, volontairement terne. */}
            {!team.opening && acceptsRequests(team) && (
              <span data-test="badge-accepts-requests">
                <Chip tone="neutral" title={t.badgeAcceptsRequestsHelp}>
                  {t.badgeAcceptsRequests}
                </Chip>
              </span>
            )}
            {/* Score de compatibilité (N4) : il porte le tri, il doit se voir. */}
            <Chip tone={scoreTone(team.match.score)} title={t.matchScoreHelp}>
              {format(t.matchScore, { score: team.match.score })}
            </Chip>
          </div>
          <div
            className={`mt-1 flex flex-wrap items-center gap-2 text-xs ${MUTED}`}
          >
            {team.country && <span>{team.country}</span>}
            <span>{format(t.membersCount, { count: team.member_count })}</span>
            {typeof team.rating === 'number' && (
              <span>
                {format(t.ratingLabel, { rating: Math.round(team.rating) })}
              </span>
            )}
            <SkillRatingBadge skillRating={team.skill_average?.average} />
            {/* Fiabilité (R10) : seulement au-dessus du seuil d'échantillon. */}
            {rate !== null && rate !== undefined && (
              <Chip tone={rate >= 70 ? 'ok' : 'warn'}>
                {format(t.responseRate, { rate })}
              </Chip>
            )}
          </div>

          {team.match.reasons.length > 0 && (
            <p className={`mt-1 text-xs ${MUTED}`}>
              {team.match.reasons.map(reasonLabel).filter(Boolean).join(' · ')}
            </p>
          )}

          {/* Créneaux d'habitude en commun (N1) : le repli quand personne
              n'a d'annonce vivante — le cas normal. */}
          {!search && team.common_rhythm_slots.length > 0 && (
            <p className="mt-1 text-xs">
              {format(t.commonRhythm, {
                count: team.common_rhythm_slots.length,
              })}
            </p>
          )}

          {search && (
            <div className="mt-2">
              {search.common_slots.length > 0 ? (
                <p className="text-xs font-semibold">
                  {format(t.commonSlots, {
                    count: search.common_slots.length,
                  })}{' '}
                  <span className={`font-normal ${MUTED}`}>
                    {search.common_slots.slice(0, 3).map(fmtSlot).join(' · ')}
                  </span>
                </p>
              ) : (
                <p className={`text-xs ${MUTED}`}>
                  {search.slots.slice(0, 3).map(fmtSlot).join(' · ')}
                </p>
              )}
              {search.note && (
                <p className={`mt-1 text-xs italic ${MUTED}`}>
                  « {search.note} »
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-wrap gap-2">
          {managesTeam && (
            <ButtonLink
              variant="primary"
              size="sm"
              href={`/player/requests?tab=scrim&team=${encodeURIComponent(team.id)}`}
            >
              {t.proposeCta}
            </ButtonLink>
          )}
          {/* L'annonce vit sur /recrutement, qui porte le contact. */}
          {team.opening && (
            <ButtonLink variant="secondary" size="sm" href="/recrutement">
              {t.viewOpeningCta}
            </ButtonLink>
          )}
          {!hasTeam && acceptsRequests(team) && (
            <ButtonLink variant="primary" size="sm" href="/player/join-team">
              {t.joinCta}
            </ButtonLink>
          )}
          {/* Dossier d'adversaire (N5) — réservé à qui a une équipe. */}
          {hasTeam && (
            <ButtonLink
              variant="secondary"
              size="sm"
              href={`/player/scouting/${encodeURIComponent(team.id)}`}
            >
              {t.scoutCta}
            </ButtonLink>
          )}
          {team.slug && (
            <ButtonLink
              variant="secondary"
              size="sm"
              href={`/team/${team.slug}`}
            >
              {t.viewCta}
            </ButtonLink>
          )}
        </div>
      </div>
    </Card>
  );
}
