import { useState } from 'react';
import Link from 'next/link';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';

type TeamInfo = {
  id: string;
  slug?: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
} | null;

export type TeamMemberLite = {
  id: string;
  role: string | null;
  specialty?: string | null;
  is_substitute?: boolean;
  is_captain?: boolean;
};

type Demande = {
  id: string;
  type: 'captain_request' | 'join' | 'leave' | 'other';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
  payload?: {
    team_name?: string;
    existing_team_name?: string;
  };
  team?: {
    id: string;
    name: string;
  } | null;
};

type Props = {
  team: TeamInfo;
  isCaptain: boolean;
  pendingCaptainRequest: Demande | undefined;
  pendingJoinRequest: Demande | undefined;
  onLeaveTeam?: () => Promise<void>;
  members?: TeamMemberLite[];
};

type RosterCounts = {
  total: number;
  tank: number;
  dps: number;
  support: number;
  substitute: number;
  coach: number;
};

function computeRoster(members: TeamMemberLite[] | undefined): RosterCounts {
  const counts: RosterCounts = {
    total: 0,
    tank: 0,
    dps: 0,
    support: 0,
    substitute: 0,
    coach: 0,
  };
  for (const m of members ?? []) {
    counts.total += 1;
    const role = (m.role || '').toLowerCase();
    if (m.is_substitute || role === 'substitute') {
      counts.substitute += 1;
      continue;
    }
    if (role === 'coach') {
      counts.coach += 1;
      continue;
    }
    // In-game role lives in `specialty` ('tank'|'dps'|'support'|'flex'|null),
    // NOT in `role` (which is 'player'|'coach'|'substitute'|'manager').
    const specialty = (m.specialty || '').toLowerCase();
    if (specialty === 'tank') counts.tank += 1;
    else if (specialty === 'dps') counts.dps += 1;
    else if (specialty === 'support') counts.support += 1;
    // 'flex' (and null/unknown) are not tallied into tank/dps/support.
  }
  return counts;
}

export default function TeamCard({
  team,
  isCaptain,
  pendingCaptainRequest,
  pendingJoinRequest,
  onLeaveTeam,
  members,
}: Props) {
  const t = useT('teamCard');
  const locale = useLocale();
  const hasPendingRequest = pendingCaptainRequest || pendingJoinRequest;
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const roster = computeRoster(members);

  const handleLeave = async () => {
    if (!onLeaveTeam) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      await onLeaveTeam();
    } catch (err: unknown) {
      setLeaveError((err as Error).message || t.genericError);
    } finally {
      setLeaving(false);
      setLeaveConfirm(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
      <h2 className="text-lg font-semibold mb-4">{t.myTeam}</h2>

      {team ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {team.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={team.logo_url}
                alt={team.name}
                className="w-12 h-12 rounded-full object-cover border border-white/10"
              />
            )}
            <div>
              <div className="font-semibold">{team.name}</div>
              {team.short_name && (
                <div className="text-xs text-gray-400">{team.short_name}</div>
              )}
            </div>
          </div>

          {isCaptain && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30 text-xs text-purple-200">
              <span>{t.captain}</span>
            </div>
          )}

          {roster.total > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-sm font-semibold text-white tabular-nums">
                  {roster.total}
                </span>
                <span className="text-xs text-gray-400">
                  {roster.total > 1 ? t.members_other : t.members_one}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.12em]">
                <RoleBadge label={t.roleTank} count={roster.tank} tone="rose" />
                <RoleBadge label={t.roleDps} count={roster.dps} tone="orange" />
                <RoleBadge
                  label={t.roleSupport}
                  count={roster.support}
                  tone="emerald"
                />
                {roster.substitute > 0 && (
                  <RoleBadge
                    label={t.roleSub}
                    count={roster.substitute}
                    tone="slate"
                  />
                )}
                {roster.coach > 0 && (
                  <RoleBadge
                    label={t.roleCoach}
                    count={roster.coach}
                    tone="cyan"
                  />
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {isCaptain && (
              <Link
                href="/player/manage-team"
                className="block w-full text-center px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold transition"
              >
                {t.manageTeam}
              </Link>
            )}

            <Link
              href={`/team/${encodeURIComponent(team.slug || team.id)}`}
              className="block w-full text-center px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-gray-300 transition"
            >
              {t.viewTeamPage}
            </Link>

            {!isCaptain && (
              <Link
                href="/player/requests?tab=transfer"
                className="block w-full text-center px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-gray-300 transition"
              >
                {t.requestTransfer}
              </Link>
            )}

            {isCaptain && (
              <Link
                href="/player/requests?tab=scrim"
                className="block w-full text-center px-4 py-2 rounded-xl border border-blue-400/20 bg-blue-500/10 hover:bg-blue-500/20 text-sm text-blue-200 transition"
              >
                {t.proposeScrim}
              </Link>
            )}

            {isCaptain && (
              <Link
                href="/player/messages"
                className="block w-full text-center px-4 py-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 hover:bg-emerald-500/20 text-sm text-emerald-200 transition"
              >
                {t.captainMessages}
              </Link>
            )}

            {/* Quitter l'equipe (non-capitaine) */}
            {!isCaptain && onLeaveTeam && (
              <>
                {leaveError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
                  >
                    {leaveError}
                  </div>
                )}
                {!leaveConfirm ? (
                  <button
                    onClick={() => setLeaveConfirm(true)}
                    className="w-full px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-sm transition"
                  >
                    {t.leaveTeam}
                  </button>
                ) : (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 space-y-3">
                    <p className="text-xs text-red-200">
                      {format(t.leaveConfirm, { name: team.name })}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleLeave}
                        disabled={leaving}
                        className="flex-1 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-sm font-medium transition"
                      >
                        {leaving ? t.leaving : t.confirm}
                      </button>
                      <button
                        onClick={() => setLeaveConfirm(false)}
                        disabled={leaving}
                        className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm transition"
                      >
                        {t.cancel}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-400">
          <p className="mb-4">{t.notMember}</p>

          {hasPendingRequest && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-4">
              <div className="text-amber-200 font-medium mb-1">
                {pendingCaptainRequest ? t.pendingCaptain : t.pendingGeneric}
              </div>
              <div className="text-xs text-amber-300/70">
                {pendingCaptainRequest ? (
                  <>
                    {t.teamLabel}
                    {pendingCaptainRequest.payload?.team_name ||
                      pendingCaptainRequest.payload?.existing_team_name ||
                      '\u2014'}
                  </>
                ) : pendingJoinRequest ? (
                  <>
                    {t.joinLabel}
                    {pendingJoinRequest.team?.name ||
                      pendingJoinRequest.payload?.team_name ||
                      '\u2014'}
                  </>
                ) : null}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {format(t.sentOn, {
                  date: new Date(
                    (pendingCaptainRequest || pendingJoinRequest)!.created_at
                  ).toLocaleDateString(locale),
                })}
              </div>
            </div>
          )}

          {!hasPendingRequest && (
            <div className="space-y-3">
              <Link
                href="/player/join-team"
                className="block w-full text-center px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white text-sm font-semibold transition"
              >
                {t.joinTeam}
              </Link>
              <Link
                href="/player/request-captain"
                className="block w-full text-center px-4 py-3 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition"
              >
                {t.createTeam}
              </Link>
              {/* R7 : les équipes qui recrutent et les joueuses libres
                  s'ignoraient. L'annuaire les met face à face. */}
              <Link
                href="/player/teams?filter=recruiting"
                className="block w-full text-center px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/10 text-gray-200 text-sm font-medium transition"
              >
                {t.browseTeams}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ROLE_TONE: Record<string, string> = {
  rose: 'border-rose-300/40 bg-rose-500/10 text-rose-100',
  orange: 'border-orange-300/40 bg-orange-500/10 text-orange-100',
  emerald: 'border-emerald-300/40 bg-emerald-500/10 text-emerald-100',
  slate: 'border-slate-300/30 bg-white/5 text-slate-200',
  cyan: 'border-cyan-300/40 bg-cyan-500/10 text-cyan-100',
};

function RoleBadge({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: keyof typeof ROLE_TONE;
}) {
  const dimmed = count === 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
        dimmed
          ? 'border-white/10 bg-white/[0.03] text-gray-500'
          : ROLE_TONE[tone]
      }`}
    >
      <span className="font-semibold tabular-nums">{count}</span>
      <span>{label}</span>
    </span>
  );
}
