// pages/player/teams.tsx
//
// Annuaire d'équipes connecté (R4 + R5 + R7), archétype LISTE (lot P13).
//
// C'est la page qui manquait : jusqu'ici, « je cherche un adversaire » passait
// par /scrim — une page publique en ISR 10 min qui liste les équipes sans dire
// qui veut jouer, ni quand, ni à quel niveau.
//
// Trois choses s'y croisent :
//   1. MON annonce (créneaux datés qui expirent seuls) — je la pose ici ;
//   2. les équipes qui cherchent un scrim, triées par compatibilité (créneaux
//      EN COMMUN avec la mienne en tête) ;
//   3. les équipes qui recrutent, pour une joueuse sans équipe (R7) : « Annonce
//      publiée » (elle CHERCHE) vs « Accepte les demandes » (`is_joinable`,
//      vrai par défaut — elle ne dit pas non, sans rien promettre).
//
// État et gestes : features/player/scrims/hooks/useTeamsDirectoryScreen ;
// panneaux : features/player/scrims/ui.

import Head from 'next/head';
import { useRouter } from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useManagedTeam } from '@/hooks/useManagedTeam';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { OpponentReason } from '@/utils/teams/opponentMatch';
import nsPlayerTeams from '@/lib/i18n/locales/fr/playerTeams';
import nsSpecialty from '@/lib/i18n/locales/fr/specialty';
import { withPlayerShell } from '@/features/player/_shared/shell/PlayerShell';
import { withPlayerQuery } from '@/features/player/_shared/query';
import { ListeView } from '@/features/player/_shared/ui';
import { usePlayerErrorText } from '@/features/player/_shared/useErrorText';
import { Button, Card, ListSearch } from '@/features/ruban';
import {
  useTeamsDirectoryScreen,
  type DirectoryFilter,
} from '@/features/player/scrims/hooks/useTeamsDirectoryScreen';
import MyScrimSearchPanel from '@/features/player/scrims/ui/MyScrimSearchPanel';
import DirectoryTeamRow from '@/features/player/scrims/ui/DirectoryTeamRow';
import NetworkTeamsSection from '@/features/player/scrims/ui/NetworkTeamsSection';

function PlayerTeamsPage() {
  const t = useT(nsPlayerTeams);
  // Libellés des postes : mêmes termes que /recrutement et les fiches joueuses.
  const tRole = useT(nsSpecialty);
  const locale = useLocale();
  const router = useRouter();
  const { ready, loading: authLoading } = usePlayerSession();
  const { data: managedTeam } = useManagedTeam();
  const { addToast } = useToast();
  const errorText = usePlayerErrorText();

  // Poser une annonce demande `manage_scrims` — le serveur la re-vérifie ;
  // ici on évite seulement d'afficher un formulaire inutile.
  const managesTeam = !!(managedTeam?.isCaptain || managedTeam?.isManager);
  const s = useTeamsDirectoryScreen({
    ready,
    managesTeam,
    urlFilter: router.query.filter,
  });

  // `useLocale()` renvoie déjà un tag BCP-47 ('fr-FR' | 'en-GB').
  const fmtSlot = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  /** Libellé d'une raison de score. Les codes viennent de l'API. */
  const reasonLabel = (code: OpponentReason): string =>
    ({
      common_slots: t.reasonCommonSlots,
      common_rhythm: t.reasonCommonRhythm,
      no_common_slots: t.reasonNoCommonSlots,
      similar_level: t.reasonSimilarLevel,
      level_gap: t.reasonLevelGap,
      reliable: t.reasonReliable,
      slow_to_answer: t.reasonSlowToAnswer,
      never_played: t.reasonNeverPlayed,
      played_recently: t.reasonPlayedRecently,
    })[code] ?? '';

  if (authLoading || s.directory.isPending) {
    return <PlayerPageSkeleton rows={4} />;
  }

  const filters: { key: DirectoryFilter; label: string; count: number }[] = [
    { key: 'all', label: t.filterAll, count: s.counts.all },
    { key: 'scrim', label: t.filterScrim, count: s.counts.scrim },
    {
      key: 'recruiting',
      label: t.filterRecruiting,
      count: s.counts.recruiting,
    },
    // Seulement si MON équipe a déclaré un niveau : sans point de comparaison,
    // « à mon niveau » ne voudrait rien dire.
    ...(s.mySkill
      ? [{ key: 'level' as const, label: t.filterLevel, count: s.counts.level }]
      : []),
  ];

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>
      <ListeView
        title={t.heading}
        subtitle={t.subtitle}
        labels={{
          filters: t.listFilters,
          closeFilters: t.listCloseFilters,
          loadMore: t.listLoadMore,
          loading: t.listLoading,
        }}
        summary={format(t.listSummary, { count: s.visibleTeams.length })}
        lead={
          managesTeam ? (
            <MyScrimSearchPanel
              t={t}
              pickerLabels={{
                slotsLabel: t.slotsLabel,
                removeSlot: t.removeSlot,
                maxSlotsHint: t.maxSlotsHint,
                timezoneNote: t.timezoneNote,
                prevWeek: t.prevWeek,
                nextWeek: t.nextWeek,
                weekOf: t.weekOf,
                maxReached: t.maxReached,
                empty: t.slotsEmpty,
              }}
              search={s.search}
              busy={s.busy}
              fmtSlot={fmtSlot}
              format={format}
              onPublish={async (values) => {
                const data = await s.save.mutateAsync(values);
                addToast(
                  data.matchedTeams > 0
                    ? format(t.publishedWithMatches, {
                        count: data.matchedTeams,
                      })
                    : t.published,
                  'success'
                );
              }}
              onClose={async () => {
                try {
                  await s.close.mutateAsync();
                  addToast(t.closed, 'success');
                  return true;
                } catch (err) {
                  addToast(errorText(err, t.errorClose), 'error');
                  return false;
                }
              }}
            />
          ) : null
        }
        search={
          <ListSearch
            value={s.query}
            onChange={s.setQuery}
            placeholder={t.searchPlaceholder}
            label={t.searchPlaceholder}
          />
        }
        filters={filters.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={s.filter === f.key ? 'primary' : 'secondary'}
            aria-pressed={s.filter === f.key}
            onClick={() => s.setFilter(f.key)}
          >
            {f.label} ({f.count})
          </Button>
        ))}
        empty={
          s.directory.isError ? (
            <Card role="alert">
              <p className="text-sm">{t.errorLoad}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => void s.directory.refetch()}
              >
                {t.retry}
              </Button>
            </Card>
          ) : (
            <Card>
              <p className="text-center text-sm text-[var(--t3,#a39ba6)]">
                {t.empty}
              </p>
            </Card>
          )
        }
        after={
          <NetworkTeamsSection teams={s.networkTeams} t={t} format={format} />
        }
      >
        {s.visibleTeams.map((team) => (
          <DirectoryTeamRow
            key={team.id}
            team={team}
            t={t}
            roleLabel={(r) => tRole[r as keyof typeof tRole] ?? r}
            reasonLabel={reasonLabel}
            fmtSlot={fmtSlot}
            format={format}
            managesTeam={managesTeam}
            hasTeam={Boolean(s.myTeamId)}
          />
        ))}
      </ListeView>
    </>
  );
}

const playerTeamsSeo: SeoProps = {
  title: { fr: 'Annuaire des équipes', en: 'Team directory' },
  description: {
    fr: 'Trouve un adversaire disponible ou une équipe qui recrute.',
    en: 'Find an available opponent or a team that is recruiting.',
  },
  noindex: true,
};

PlayerTeamsPage.seo = playerTeamsSeo;

// Cache joueuse (lot P13) + coquille (lot P8). La page garde sa propre
// session (pas de redirection imposée) : `redirectTo` absent.
export default withPlayerQuery(withPlayerShell(PlayerTeamsPage));
