// features/player/library/ui/arena/ArenaLobby.tsx — le SALON de l'arène
// (lot 12 de docs/PLAN-tcg-2.md) : la gardienne et ses trois défis, le paquet
// de la semaine (« à gagner » ou « déjà gagné »), le duel en cours, et MON
// historique — privé, sans classement.
//
// Présentationnel : la lecture et le lancement arrivent par les props.

import type { UseQueryResult } from '@tanstack/react-query';
import { useT, format } from '@/lib/i18n/useT';
import nsArena from '@/lib/i18n/locales/fr/playerLibraryArena';
import { Button, Card, Chip } from '@/features/ruban';
import type { ArenaLobbyResponse } from '../../arena/responses';
import type { ArenaOpponentId } from '../../arena/rules';
import { weekText } from '../../arena/viewModel';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { formatSiteDate } from '@/utils/timezone';
import { TEXT_ERROR, TEXT_MUTED } from './styles';
import ArenaCardFace, {
  useArenaCardLabels,
  useProfileNames,
} from './ArenaCardFace';

const H2 = 'text-lg font-bold text-[var(--t1,#f4edf7)]';
/** L'échéance d'un duel en cours (48 h après le dernier coup), heure de Paris. */
const EXPIRES: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
};

export default function ArenaLobby({
  query,
  starting,
  startError,
  onEditDeck,
  onStart,
  onResume,
}: {
  query: UseQueryResult<ArenaLobbyResponse, unknown>;
  starting: boolean;
  startError: string | null;
  onEditDeck: () => void;
  onStart: (opponent: ArenaOpponentId) => void;
  onResume: (duelId: string, opponent: string) => void;
}) {
  const t = useT(nsArena);
  const { lang } = useLang();
  const labels = useArenaCardLabels();
  const profiles = useProfileNames();

  if (query.isPending) {
    return (
      <p role="status" className={TEXT_MUTED}>
        {t.loading}
      </p>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-4">
        <p className={TEXT_ERROR}>{t.error}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void query.refetch()}
        >
          {t.retry}
        </Button>
      </div>
    );
  }

  const lobby = query.data;
  const week = weekText(lobby.weekly.week, t.weekLabel);
  const nameOf = (id: string) =>
    (t.lobby.challenges as Record<string, { name: string }>)[id]?.name ?? id;
  const canChallenge = lobby.deckReady && !lobby.active && !starting;
  const errorText = startError
    ? ((t.errors as Record<string, string>)[startError] ?? t.error)
    : null;

  return (
    <div className="flex flex-col gap-8" data-arena-lobby="">
      <div className="grid gap-4 md:grid-cols-3">
        <Card
          as="section"
          aria-labelledby="arena-guardian"
          className="md:col-span-2"
        >
          <h2 id="arena-guardian" className={H2}>
            {t.lobby.guardianTitle}
          </h2>
          <p className={`mt-2 ${TEXT_MUTED}`}>{t.lobby.guardianIntro}</p>
        </Card>
        <Card
          as="section"
          aria-labelledby="arena-weekly"
          data-arena-weekly={lobby.weekly.claimed ? 'claimed' : 'open'}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="arena-weekly" className={H2}>
              {t.lobby.weeklyTitle}
            </h2>
            <Chip tone={lobby.weekly.claimed ? 'neutral' : 'brand'}>
              {week}
            </Chip>
          </div>
          <p className={`mt-2 ${TEXT_MUTED}`}>
            {format(
              lobby.weekly.claimed ? t.lobby.weeklyClaimed : t.lobby.weeklyOpen,
              { week }
            )}
          </p>
        </Card>
      </div>

      <Card as="section" aria-labelledby="arena-deck-status">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="arena-deck-status" className={H2}>
              {t.lobby.deckTitle}
            </h2>
            <p className={TEXT_MUTED}>
              {lobby.deckReady
                ? format(t.lobby.deckReady, { count: lobby.deckCount })
                : format(t.lobby.deckIncomplete, {
                    count: lobby.deckCount,
                    size: lobby.rules.deckSize,
                  })}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onEditDeck}>
            {t.lobby.deckEdit}
          </Button>
        </div>
      </Card>

      {lobby.active && (
        <Card
          as="section"
          live
          aria-labelledby="arena-active"
          data-arena-active=""
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="arena-active" className={H2}>
                {t.lobby.activeTitle}
              </h2>
              <p className={TEXT_MUTED}>
                {format(t.lobby.activeBody, {
                  name: nameOf(lobby.active.opponent),
                })}
              </p>
              <p className={TEXT_MUTED} data-arena-expires="">
                {format(t.lobby.activeExpires, {
                  date: formatSiteDate(lobby.active.expiresAt, lang, EXPIRES),
                })}
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                lobby.active && onResume(lobby.active.id, lobby.active.opponent)
              }
            >
              {t.lobby.resume}
            </Button>
          </div>
        </Card>
      )}

      <section
        aria-labelledby="arena-challenges"
        className="flex flex-col gap-3"
      >
        <h2 id="arena-challenges" className={H2}>
          {t.lobby.challengesTitle}
        </h2>
        {!lobby.deckReady && (
          <p className={TEXT_MUTED}>
            {format(t.lobby.needDeck, { size: lobby.rules.deckSize })}
          </p>
        )}
        {starting && (
          <p role="status" className={TEXT_MUTED}>
            {t.lobby.starting}
          </p>
        )}
        {errorText && (
          <p role="alert" className={TEXT_ERROR}>
            {errorText}
          </p>
        )}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lobby.opponents.map((o) => {
            const words = t.lobby.challenges[o.id];
            return (
              <li key={o.id}>
                <Card
                  className="flex h-full flex-col gap-3"
                  data-arena-opponent={o.id}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-24 shrink-0" aria-hidden="true">
                      <ArenaCardFace
                        card={o.signature}
                        face={lobby.faces[o.signature.key]}
                        labels={labels}
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <h3 className="font-bold text-[var(--t1,#f4edf7)]">
                        {words.name}
                      </h3>
                      <p className={TEXT_MUTED}>{words.hint}</p>
                      <p className="text-xs text-[var(--t2,#c7bfca)]">
                        {format(t.lobby.profile, {
                          profile: profiles[o.profile],
                        })}
                        {' · '}
                        {format(t.lobby.cardCount, { count: o.cardCount })}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-auto self-start"
                    disabled={!canChallenge}
                    aria-label={format(t.lobby.challengeAria, {
                      name: words.name,
                    })}
                    onClick={() => onStart(o.id)}
                  >
                    {t.lobby.challenge}
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="arena-history" className="flex flex-col gap-3">
        <h2 id="arena-history" className={H2}>
          {t.lobby.historyTitle}
        </h2>
        <p className={TEXT_MUTED}>{t.lobby.historyPrivate}</p>
        {lobby.history.length === 0 ? (
          <p className={TEXT_MUTED}>{t.lobby.historyEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-arena-history="">
            {lobby.history.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] px-3 py-2"
              >
                <Chip
                  tone={
                    h.status === 'won'
                      ? 'ok'
                      : h.status === 'draw'
                        ? 'neutral'
                        : 'warn'
                  }
                >
                  {t.outcome[h.status]}
                </Chip>
                <span className="font-semibold text-[var(--t1,#f4edf7)]">
                  {nameOf(h.opponent)}
                </span>
                {h.finalTurn !== null &&
                  h.playerLp !== null &&
                  h.npcLp !== null && (
                    <span className={TEXT_MUTED}>
                      {format(t.lobby.historyLine, {
                        turn: h.finalTurn,
                        player: h.playerLp,
                        npc: h.npcLp,
                      })}
                    </span>
                  )}
                {h.reward && (
                  <span className="text-sm font-semibold text-[var(--color-yellow,#f5c542)]">
                    {h.reward === 'granted'
                      ? t.lobby.rewardGranted
                      : t.lobby.rewardWeekAlready}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
