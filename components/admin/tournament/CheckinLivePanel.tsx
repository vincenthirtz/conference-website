// components/admin/tournament/CheckinLivePanel.tsx
//
// Live Check-In Console — large-display variant used during check-in J-1 / J-0.
// Polling 10s (onglet visible seulement), big numbers, one "Relance Discord"
// button per un-checked team, plus « Pointer pour l'équipe » (rattrapage staff,
// motif obligatoire) pour qui a la permission d'arbitrer.
// Extracted from the former /admin/tournament/[id]/checkin/live page; now the
// `live` sub-tab of the merged check-in route.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useStaffSession } from '@/hooks/useStaffSession';
import { useVisiblePoll } from '@/hooks/useVisiblePoll';
import {
  tournamentMatchUrls,
  tournamentUrls,
} from '@/features/admin/tournaments/client';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTournamentCheckinLive from '@/lib/i18n/locales/admin-fr/adminTournamentCheckinLive';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import StatTile from '@/features/admin/_shared/ui/StatTile';
import StaffCheckinModal, {
  type StaffCheckinTarget,
} from '@/features/admin/tournaments/ui/StaffCheckinModal';
import {
  rubanCardPadded,
  rubanErrBox,
  rubanFaint,
  rubanMuted,
} from '@/features/admin/_shared/ui/ruban';

type Dict = typeof nsAdminTournamentCheckinLive.fr;

type TeamSide = 1 | 2;

type CheckinRow = {
  matchId: string;
  scheduledAt: string | null;
  status: string;
  team1: { id: string | null; name: string | null; checkedInAt: string | null };
  team2: { id: string | null; name: string | null; checkedInAt: string | null };
  emailSentAt: string | null;
  reminder30At: string | null;
  reminder15At: string | null;
  forfeitProcessedAt: string | null;
  /** Forfait PROPOSÉ par le cron, en attente d'une décision staff. */
  forfeitProposalPending?: boolean;
};

type ApiResponse = { matches: CheckinRow[] };

const POLL_MS = 10_000;
// On garde les matchs visibles sur la fenêtre [now - 30 min, now + 2 h]
// par défaut : ce qui mérite l'oeil du staff pendant le check-in J-0.
const PAST_WINDOW_MIN = 30;
const FUTURE_WINDOW_MIN = 120;

export default function CheckinLivePanel() {
  const t = useAdminT(nsAdminTournamentCheckinLive);
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation({
    autoRegenerateOnSuccess: true,
  });
  // Instance distincte : une clé par intention de pointage (régénérée à
  // l'ouverture de la modale), sans interférer avec les relances.
  const staffCheckinMutation = useIdempotentMutation({
    autoRegenerateOnSuccess: true,
  });
  // Bouton visible pour qui peut arbitrer ; la route reste la vraie garde.
  const { staffPermissions } = useStaffSession();
  const canStaffCheckin = staffPermissions.includes('arbitrate_matches');

  const [rows, setRows] = useState<CheckinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nudging, setNudging] = useState<Set<string>>(new Set());
  const [lastNudgeAt, setLastNudgeAt] = useState<Date | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [staffTarget, setStaffTarget] = useState<StaffCheckinTarget | null>(
    null
  );

  const lastFetchRef = useRef<number>(0);

  const fetchData = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const json = await adminFetchJson<ApiResponse>(
        tournamentUrls.checkin(tournamentId)
      );
      setRows(json.matches ?? []);
      // `now` sert au fenetrage (windowedRows) et aux comptes a rebours
      // (minutes) : on le rafraichit au rythme du poll — la donnee elle-meme
      // n'est fraiche qu'a ce rythme. L'horloge des SECONDES de l'entete vit
      // dans la feuille <LiveClock> pour ne pas re-rendre tout le tableau.
      setNow(Date.now());
      setError(null);
      lastFetchRef.current = Date.now();
    } catch (err) {
      const e = err as AdminFetchError;
      setError(e.message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, tournamentId, t]);

  // Premier chargement (et rechargement si le tournoi change), puis sondage
  // 10 s : rien ne part onglet caché, relecture au retour sur l'onglet. Le
  // tick horloge 1s n'est plus ici : il est confine a la feuille <LiveClock>
  // (entete), pour ne pas re-rendre metriques + tableau chaque seconde.
  useEffect(() => {
    void fetchData();
  }, [fetchData]);
  useVisiblePoll(() => void fetchData(), POLL_MS);

  const windowedRows = useMemo(() => {
    return rows
      .filter((r) => {
        if (!r.scheduledAt) return false;
        const t = Date.parse(r.scheduledAt);
        if (!Number.isFinite(t)) return false;
        const diffMin = (t - now) / 60_000;
        if (diffMin < -PAST_WINDOW_MIN) return false;
        if (diffMin > FUTURE_WINDOW_MIN) return false;
        if (r.status !== 'pending' && r.status !== 'ongoing') return false;
        return true;
      })
      .sort(
        (a, b) =>
          (Date.parse(a.scheduledAt!) || 0) - (Date.parse(b.scheduledAt!) || 0)
      );
  }, [rows, now]);

  const stats = useMemo(() => {
    let teamsExpected = 0;
    let teamsCheckedIn = 0;
    let bothCheckedIn = 0;
    for (const r of windowedRows) {
      if (r.team1.id) {
        teamsExpected += 1;
        if (r.team1.checkedInAt) teamsCheckedIn += 1;
      }
      if (r.team2.id) {
        teamsExpected += 1;
        if (r.team2.checkedInAt) teamsCheckedIn += 1;
      }
      if (r.team1.checkedInAt && r.team2.checkedInAt) bothCheckedIn += 1;
    }
    const nextMatch = windowedRows.find(
      (r) => !(r.team1.checkedInAt && r.team2.checkedInAt)
    );
    const nextEta = nextMatch?.scheduledAt
      ? Math.round((Date.parse(nextMatch.scheduledAt) - now) / 60_000)
      : null;
    return {
      teamsExpected,
      teamsCheckedIn,
      bothCheckedIn,
      matches: windowedRows.length,
      nextEta,
    };
  }, [windowedRows, now]);

  async function nudge(matchId: string, side: TeamSide | 'both') {
    if (!matchId) return;
    const key = `${matchId}:${side}`;
    setNudging((prev) => new Set(prev).add(key));
    try {
      const json = await mutateJson<{
        success: boolean;
        nudgedSides: TeamSide[];
      }>(tournamentMatchUrls.checkinNudge(matchId), {
        method: 'POST',
        body: JSON.stringify({ teamSide: side }),
      });
      const count = json.nudgedSides?.length ?? 0;
      addToast(
        count === 0
          ? t.nudgeNone
          : format(count > 1 ? t.nudgeSent_other : t.nudgeSent_one, { count }),
        count > 0 ? 'success' : 'info'
      );
      setLastNudgeAt(new Date());
    } catch (err) {
      const e = err as AdminFetchError;
      const payloadError =
        typeof e.payload === 'object' && e.payload && 'error' in e.payload
          ? String((e.payload as { error: string }).error)
          : null;
      addToast(payloadError || e.message || t.nudgeError, 'error');
    } finally {
      setNudging((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function openStaffCheckin(target: StaffCheckinTarget) {
    staffCheckinMutation.regenerate();
    setStaffTarget(target);
  }

  async function submitStaffCheckin(reason: string): Promise<boolean> {
    if (!staffTarget) return false;
    const { matchId, side, teamName } = staffTarget;
    try {
      const json = await staffCheckinMutation.mutateJson<{
        success: boolean;
        checkedInAt: string;
        alreadyCheckedIn: boolean;
      }>(tournamentMatchUrls.checkinStaff(matchId), {
        method: 'POST',
        body: JSON.stringify({ teamSide: side, reason }),
      });
      // Reflet immédiat, sans attendre le prochain tour de sondage.
      setRows((prev) =>
        prev.map((r) => {
          if (r.matchId !== matchId) return r;
          return side === 1
            ? { ...r, team1: { ...r.team1, checkedInAt: json.checkedInAt } }
            : { ...r, team2: { ...r.team2, checkedInAt: json.checkedInAt } };
        })
      );
      addToast(
        format(
          json.alreadyCheckedIn ? t.staffCheckinAlready : t.staffCheckinDone,
          { team: teamName }
        ),
        json.alreadyCheckedIn ? 'info' : 'success'
      );
      setStaffTarget(null);
      void fetchData();
      return true;
    } catch (err) {
      const e = err as AdminFetchError;
      const payloadError =
        typeof e.payload === 'object' && e.payload && 'error' in e.payload
          ? String((e.payload as { error: string }).error)
          : null;
      addToast(payloadError || e.message || t.staffCheckinError, 'error');
      // L'état a pu bouger (forfait tombé entre-temps) : on relit.
      void fetchData();
      return false;
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-1">
            {t.pageTitle}
          </h1>
          <p className={`mt-1 text-sm ${rubanMuted}`}>
            {format(t.windowInfo, {
              past: PAST_WINDOW_MIN,
              future: FUTURE_WINDOW_MIN,
              poll: POLL_MS / 1000,
            })}
          </p>
        </div>
        <div className={`text-right font-mono text-xs ${rubanMuted}`}>
          <LiveClock template={t.nowLabel} />
          {lastNudgeAt && (
            <div>
              {format(t.lastNudgeLabel, {
                time: formatClock(lastNudgeAt.getTime()),
              })}
            </div>
          )}
        </div>
      </div>

      {/* Métriques header (gros chiffres stream-friendly) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <BigMetric
          label={t.metricMatchesInWindow}
          value={stats.matches}
          accent="neutral"
        />
        <BigMetric
          label={t.metricTeamsCheckedIn}
          value={`${stats.teamsCheckedIn} / ${stats.teamsExpected}`}
          accent="ok"
        />
        <BigMetric
          label={t.metricCompleteMatches}
          value={`${stats.bothCheckedIn} / ${stats.matches}`}
          accent="brand"
        />
        <BigMetric
          label={t.metricNextMatch}
          value={
            stats.nextEta === null
              ? '—'
              : stats.nextEta >= 0
                ? format(t.tMinusMin, { n: stats.nextEta })
                : format(t.tPlusMin, { n: Math.abs(stats.nextEta) })
          }
          accent={stats.nextEta !== null && stats.nextEta < 5 ? 'err' : 'warn'}
        />
      </div>

      {error && <div className={`mb-4 ${rubanErrBox}`}>{error}</div>}

      {loading && rows.length === 0 && (
        <div className={`${rubanCardPadded} text-center ${rubanMuted}`}>
          {t.loading}
        </div>
      )}

      {!loading && windowedRows.length === 0 && (
        <div className={`${rubanCardPadded} text-center ${rubanFaint}`}>
          {t.emptyWindow}
        </div>
      )}

      <div className="space-y-3">
        {windowedRows.map((r) => (
          <MatchRow
            key={r.matchId}
            row={r}
            now={now}
            onNudge={nudge}
            nudgingSet={nudging}
            onStaffCheckin={canStaffCheckin ? openStaffCheckin : null}
          />
        ))}
      </div>

      <StaffCheckinModal
        target={staffTarget}
        onClose={() => setStaffTarget(null)}
        onSubmit={submitStaffCheckin}
      />
    </>
  );
}

function BigMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent: 'neutral' | 'ok' | 'brand' | 'warn' | 'err';
}) {
  return <StatTile label={label} value={value} tone={accent} />;
}

function MatchRow({
  row,
  now,
  onNudge,
  nudgingSet,
  onStaffCheckin,
}: {
  row: CheckinRow;
  now: number;
  onNudge: (matchId: string, side: TeamSide | 'both') => void;
  nudgingSet: Set<string>;
  onStaffCheckin: ((target: StaffCheckinTarget) => void) | null;
}) {
  const t = useAdminT(nsAdminTournamentCheckinLive);
  const scheduledMs = row.scheduledAt
    ? Date.parse(row.scheduledAt)
    : Number.NaN;
  const tMinusMin = Number.isFinite(scheduledMs)
    ? Math.round((scheduledMs - now) / 60_000)
    : null;
  const tLabel =
    tMinusMin === null
      ? '—'
      : tMinusMin >= 0
        ? format(t.tMinusMin, { n: tMinusMin })
        : format(t.tPlusMin, { n: Math.abs(tMinusMin) });
  const urgent = tMinusMin !== null && tMinusMin <= 5;

  return (
    <div
      className={`rounded-[var(--r-card,14px)] border bg-[var(--s1,#100812)] px-4 py-3 ${
        urgent
          ? 'border-[rgba(255,107,107,.45)]'
          : 'border-[var(--line2,rgba(194,196,201,.2))]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-3">
          <Chip tone={urgent ? 'err' : 'neutral'}>{tLabel}</Chip>
          <span className={`font-mono text-xs ${rubanFaint}`}>
            {row.scheduledAt
              ? new Date(row.scheduledAt).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Europe/Paris',
                })
              : '—'}
          </span>
          {row.forfeitProposalPending && (
            // Le cron ne tranche plus : il propose. La décision se prend sur
            // la fiche du match (ou par le DM Discord des admins).
            <Link href={`/admin/matches/${row.matchId}`}>
              <Chip tone="warn">{t.forfeitProposalPending}</Chip>
            </Link>
          )}
        </div>
        <AdminButton
          variant="secondary"
          size="xs"
          onClick={() => onNudge(row.matchId, 'both')}
          disabled={
            !!(row.team1.checkedInAt && row.team2.checkedInAt) ||
            nudgingSet.has(`${row.matchId}:both`)
          }
        >
          {nudgingSet.has(`${row.matchId}:both`) ? t.nudgingShort : t.nudgeBoth}
        </AdminButton>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TeamLine
          side={1}
          name={row.team1.name}
          checkedInAt={row.team1.checkedInAt}
          matchId={row.matchId}
          onNudge={onNudge}
          loading={nudgingSet.has(`${row.matchId}:1`)}
          forfeitProcessed={!!row.forfeitProcessedAt}
          onStaffCheckin={onStaffCheckin}
        />
        <TeamLine
          side={2}
          name={row.team2.name}
          checkedInAt={row.team2.checkedInAt}
          matchId={row.matchId}
          onNudge={onNudge}
          loading={nudgingSet.has(`${row.matchId}:2`)}
          forfeitProcessed={!!row.forfeitProcessedAt}
          onStaffCheckin={onStaffCheckin}
        />
      </div>
    </div>
  );
}

function TeamLine({
  side,
  name,
  checkedInAt,
  matchId,
  onNudge,
  loading,
  forfeitProcessed,
  onStaffCheckin,
}: {
  side: TeamSide;
  name: string | null;
  checkedInAt: string | null;
  matchId: string;
  onNudge: (matchId: string, side: TeamSide | 'both') => void;
  loading: boolean;
  forfeitProcessed: boolean;
  onStaffCheckin: ((target: StaffCheckinTarget) => void) | null;
}) {
  const t = useAdminT(nsAdminTournamentCheckinLive);
  const checkedIn = !!checkedInAt;
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-[var(--r-ctrl,4px)] border bg-[var(--s2,#1d1520)] px-4 py-3 ${
        checkedIn
          ? 'border-[rgba(127,202,101,.36)]'
          : 'border-[rgba(245,165,36,.38)]'
      }`}
    >
      <div className="min-w-0">
        <div className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
          {format(t.teamSide, { side })}
        </div>
        <div className="truncate text-lg font-semibold text-[var(--t1,#f4edf7)]">
          {name ?? '—'}
        </div>
        <div className="text-xs mt-1">
          {checkedIn ? (
            <span className="text-[var(--lf-200,#b3e7a3)]">
              {format(t.checkedInRelative, {
                relative: formatRelative(t, checkedInAt),
              })}
            </span>
          ) : (
            <span className="text-[#ffd9a3]">{t.notCheckedIn}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <AdminButton
          size="xs"
          onClick={() => onNudge(matchId, side)}
          disabled={checkedIn || loading}
        >
          {loading ? '…' : t.nudgeDiscord}
        </AdminButton>
        {!checkedIn &&
          name &&
          onStaffCheckin &&
          (forfeitProcessed ? (
            <Chip tone="neutral">{t.forfeitProcessed}</Chip>
          ) : (
            <AdminButton
              variant="secondary"
              size="xs"
              onClick={() => onStaffCheckin({ matchId, side, teamName: name })}
            >
              {t.staffCheckin}
            </AdminButton>
          ))}
      </div>
    </div>
  );
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

// Feuille isolant le tick horloge 1s de l'entete. Seul ce petit noeud se
// re-rend chaque seconde pour afficher l'heure courante (HH:MM:SS) ; le reste
// du panneau (metriques + tableau) ne reconcilie qu'au rythme du poll. DOM et
// format de sortie strictement identiques a l'ancien inline.
const LiveClock = memo(function LiveClock({ template }: { template: string }) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  return <div>{format(template, { time: formatClock(now) })}</div>;
});

function formatRelative(t: Dict, iso: string | null): string {
  if (!iso) return '';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '';
  const diffMin = Math.round((Date.now() - parsed) / 60_000);
  if (diffMin < 1) return t.relativeNow;
  if (diffMin < 60) return format(t.relativeMinutes, { n: diffMin });
  const diffH = Math.round(diffMin / 60);
  return format(t.relativeHours, { n: diffH });
}
