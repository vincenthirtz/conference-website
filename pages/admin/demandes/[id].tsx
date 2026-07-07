// pages/admin/demandes/[id].tsx
// Page de détail d'une demande admin (tous types)

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { RegistrationField } from '@/utils/registrationFields';
import RegistrationAnswers from '@/components/admin/RegistrationAnswers';

type Dict = ReturnType<typeof useAdminT<'adminDemandeDetail'>>;

type DemandeType =
  | 'join_team'
  | 'leave_team'
  | 'captain_request'
  | 'team_registration'
  | 'scrim'
  | 'other';

type DemandeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

type Demande = {
  id: string;
  type: DemandeType | string;
  status: DemandeStatus;
  comment: string | null;
  staff_note: string | null;
  source: string | null;
  payload: Record<string, any> | null;
  created_at: string;
  updated_at: string | null;
  processed_at: string | null;
  user_id: string | null;
  team_id: string | null;
  tournament_id: string | null;
  user?: {
    id: string;
    email: string | null;
    display_name: string | null;
    battle_tag: string | null;
    discord: string | null;
  } | null;
  team?: {
    id: string;
    name: string;
    short_name: string | null;
    logo_url: string | null;
  } | null;
  tournament?: {
    id: string;
    name: string;
    slug: string | null;
  } | null;
  handled_by?: {
    id: string;
    display_name: string | null;
    role: string | null;
  } | null;
};

export const getServerSideProps = withStaffPage('caster');

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function typeLabel(type: string, t: Dict) {
  switch (type) {
    case 'join_team':
    case 'join':
      return t.typeJoin;
    case 'leave_team':
    case 'leave':
      return t.typeLeave;
    case 'captain_request':
      return t.typeCaptainRequest;
    case 'team_registration':
      return t.typeTeamRegistration;
    case 'scrim':
      return t.typeScrim;
    case 'other':
      return t.typeOther;
    default:
      return type;
  }
}

function typeColor(type: string) {
  switch (type) {
    case 'join_team':
    case 'join':
      return 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30';
    case 'leave_team':
    case 'leave':
      return 'bg-amber-600/20 text-amber-300 border border-amber-500/30';
    case 'captain_request':
      return 'bg-purple-600/20 text-purple-300 border border-purple-500/30';
    case 'team_registration':
      return 'bg-blue-600/20 text-blue-300 border border-blue-500/30';
    case 'scrim':
      return 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30';
    default:
      return 'bg-neutral-700 text-neutral-100';
  }
}

function statusLabel(status: DemandeStatus, t: Dict) {
  switch (status) {
    case 'pending':
      return t.statusPending;
    case 'approved':
      return t.statusApproved;
    case 'rejected':
      return t.statusRejected;
    case 'cancelled':
      return t.statusCancelled;
    default:
      return status;
  }
}

function statusColor(status: DemandeStatus) {
  switch (status) {
    case 'pending':
      return 'bg-blue-600 text-white';
    case 'approved':
      return 'bg-emerald-600 text-white';
    case 'rejected':
      return 'bg-red-600 text-white';
    case 'cancelled':
      return 'bg-neutral-600 text-neutral-200';
    default:
      return 'bg-neutral-700 text-neutral-100';
  }
}

type ForwardCandidate = {
  id: string;
  name: string;
  short_name: string | null;
};

function AdminDemandeDetailPage() {
  const t = useAdminT('adminDemandeDetail');
  const router = useRouter();
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const id = typeof router.query.id === 'string' ? router.query.id : null;

  const [loading, setLoading] = useState(true);
  const [demande, setDemande] = useState<Demande | null>(null);
  const [tournamentFields, setTournamentFields] = useState<RegistrationField[]>(
    []
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [staffNote, setStaffNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardTeams, setForwardTeams] = useState<ForwardCandidate[]>([]);
  const [forwardTargetId, setForwardTargetId] = useState('');
  const [forwarding, setForwarding] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchDemande();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchDemande() {
    if (!id) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const json = await adminFetchJson<{ demande: Demande }>(
        `/api/admin/demandes/${id}`
      );
      setDemande(json.demande);
      setStaffNote(json.demande?.staff_note || '');

      // Best-effort: load the tournament's field definitions so submitted
      // answers can be rendered by label. Silently ignored if unavailable
      // (e.g. caster role can't read the tournament endpoint).
      const tournamentId = json.demande?.tournament_id;
      if (
        json.demande?.type === 'team_registration' &&
        tournamentId &&
        json.demande?.payload?.field_values
      ) {
        try {
          const tj = await adminFetchJson<{
            tournament?: { registration_fields?: RegistrationField[] | null };
          }>(`/api/admin/tournament/${tournamentId}`);
          setTournamentFields(tj.tournament?.registration_fields ?? []);
        } catch {
          setTournamentFields([]);
        }
      } else {
        setTournamentFields([]);
      }
    } catch (err) {
      setErrorMsg((err as Error)?.message ?? t.errorUnexpected);
    } finally {
      setLoading(false);
    }
  }

  async function openForwardPanel() {
    setForwardOpen(true);
    setForwardTargetId('');
    if (forwardTeams.length > 0) return;
    try {
      const json = await adminFetchJson<{
        teams?: ForwardCandidate[];
        data?: ForwardCandidate[];
      }>('/api/admin/teams?limit=200&isActive=true&includeTotal=0');
      const teams = (json.teams || json.data || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        short_name: t.short_name ?? null,
      }));
      setForwardTeams(
        teams
          .filter((t: ForwardCandidate) => t.id !== demande?.team_id)
          .sort((a: ForwardCandidate, b: ForwardCandidate) =>
            a.name.localeCompare(b.name)
          )
      );
    } catch (err) {
      addToast((err as Error)?.message || t.errorLoadTeams, 'error');
    }
  }

  async function submitForward() {
    if (!id || !forwardTargetId) return;
    setForwarding(true);
    try {
      const json = await adminFetchJson<{ targetTeam?: { name?: string } }>(
        '/api/admin/scrims/forward',
        {
          method: 'POST',
          body: JSON.stringify({
            demandeId: id,
            targetTeamId: forwardTargetId,
          }),
        }
      );
      addToast(
        format(t.toastForwarded, {
          team: json.targetTeam?.name || t.fallbackTeam,
        }),
        'success'
      );
      setForwardOpen(false);
      await fetchDemande();
    } catch (err) {
      addToast((err as Error)?.message || t.error, 'error');
    } finally {
      setForwarding(false);
    }
  }

  async function updateStatus(newStatus: 'approved' | 'rejected') {
    if (!id) return;
    setProcessing(true);
    setErrorMsg(null);
    try {
      await adminFetchJson('/api/admin/demandes', {
        method: 'POST',
        body: JSON.stringify({
          action: 'updateStatus',
          demandeIds: [id],
          newStatus,
          staffComment: staffNote.trim() || null,
        }),
      });
      addToast(
        newStatus === 'approved' ? t.toastApproved : t.toastRejected,
        'success'
      );
      await fetchDemande();
    } catch (err) {
      setErrorMsg((err as Error)?.message ?? t.error);
    } finally {
      setProcessing(false);
    }
  }

  if (loading || !demande) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {errorMsg ? (
            <div className="max-w-2xl mx-auto rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {errorMsg}
            </div>
          ) : (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    );
  }

  const isPending = demande.status === 'pending';
  const payload = demande.payload || {};

  return (
    <>
      <Head>
        <title>{format(t.pageTitle, { id: demande.id.slice(0, 8) })}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <Link
            href="/admin/demandes"
            className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {t.backToList}
          </Link>

          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {errorMsg}
            </div>
          )}

          {/* Header */}
          <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${typeColor(
                    demande.type
                  )}`}
                >
                  {typeLabel(demande.type, t)}
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor(
                    demande.status
                  )}`}
                >
                  {statusLabel(demande.status, t)}
                </span>
                {demande.source && (
                  <span className="px-2.5 py-1 rounded-full text-xs bg-neutral-700/60 text-neutral-300 border border-neutral-600/50">
                    {demande.source}
                  </span>
                )}
              </div>
              <div className="text-right text-xs text-neutral-500">
                <div>
                  {t.idLabel}{' '}
                  <code className="text-neutral-400">{demande.id}</code>
                </div>
                <div className="mt-1">
                  {format(t.createdOn, {
                    date: formatDateTime(demande.created_at),
                  })}
                </div>
              </div>
            </div>

            {demande.comment && (
              <div className="mt-2 p-4 bg-neutral-900/50 border border-neutral-700 rounded-xl">
                <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                  {t.message}
                </p>
                <p className="text-sm whitespace-pre-line">{demande.comment}</p>
              </div>
            )}
          </div>

          {/* Acteurs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* User */}
            {demande.user && (
              <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">
                  {t.user}
                </h3>
                <div className="space-y-1 text-sm">
                  <div className="text-base font-semibold">
                    {demande.user.display_name ||
                      demande.user.email ||
                      demande.user.id}
                  </div>
                  {demande.user.email && (
                    <div className="text-neutral-400">{demande.user.email}</div>
                  )}
                  {demande.user.battle_tag && (
                    <div className="text-neutral-400">
                      {t.battleTagLabel}{' '}
                      <span className="text-neutral-200">
                        {demande.user.battle_tag}
                      </span>
                    </div>
                  )}
                  {demande.user.discord && (
                    <div className="text-neutral-400">
                      {t.discordLabel}{' '}
                      <span className="text-neutral-200">
                        {demande.user.discord}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Team */}
            {demande.team && (
              <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">
                  {demande.type === 'scrim' ? t.teamTarget : t.team}
                </h3>
                <div className="flex items-center gap-3">
                  {demande.team.logo_url && (
                    <Image
                      src={demande.team.logo_url}
                      alt={demande.team.name}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-xl object-cover border border-neutral-700"
                    />
                  )}
                  <div>
                    <Link
                      href={`/admin/teams/${demande.team.id}/edit`}
                      className="text-base font-semibold hover:text-blue-400 transition-colors"
                    >
                      {demande.team.name}
                    </Link>
                    {demande.team.short_name && (
                      <div className="text-sm text-neutral-400">
                        {demande.team.short_name}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tournament */}
            {demande.tournament && (
              <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">
                  {t.tournament}
                </h3>
                <Link
                  href={`/admin/tournament/${demande.tournament.id}/edit`}
                  className="text-base font-semibold hover:text-blue-400 transition-colors"
                >
                  {demande.tournament.name}
                </Link>
                {demande.tournament.slug && (
                  <div className="text-sm text-neutral-500 mt-1">
                    {demande.tournament.slug}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payload type-specific */}
          {demande.type === 'scrim' && (
            <div className="bg-neutral-800/50 backdrop-blur border border-cyan-500/20 rounded-2xl p-6 mb-6">
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <h3 className="text-xs uppercase tracking-wide text-cyan-300/80">
                  {t.scrimDetails}
                </h3>
                {demande.source === 'public' && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40 text-[10px] uppercase tracking-wide">
                    {t.externalRequest}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {payload.from_team_name && (
                  <div>
                    <div className="text-neutral-500 text-xs">
                      {t.requestingTeam}
                    </div>
                    <div className="font-medium">{payload.from_team_name}</div>
                  </div>
                )}
                {(payload.target_team_name || demande.team?.name) && (
                  <div>
                    <div className="text-neutral-500 text-xs">
                      {t.teamTarget}
                    </div>
                    <div className="font-medium">
                      {payload.target_team_name || demande.team?.name}
                    </div>
                  </div>
                )}
                {payload.preferred_date && (
                  <div>
                    <div className="text-neutral-500 text-xs">
                      {t.preferredDate}
                    </div>
                    <div className="font-medium">
                      {formatDate(payload.preferred_date)}
                    </div>
                  </div>
                )}
                {payload.format && (
                  <div>
                    <div className="text-neutral-500 text-xs">{t.format}</div>
                    <div className="font-medium">{payload.format}</div>
                  </div>
                )}
                {demande.source === 'public' && (
                  <>
                    {payload.requester_name && (
                      <div>
                        <div className="text-neutral-500 text-xs">
                          {t.contact}
                        </div>
                        <div className="font-medium">
                          {payload.requester_name}
                        </div>
                      </div>
                    )}
                    {payload.requester_email && (
                      <div>
                        <div className="text-neutral-500 text-xs">
                          {t.email}
                        </div>
                        <a
                          href={`mailto:${payload.requester_email}`}
                          className="font-medium text-cyan-300 hover:underline break-all"
                        >
                          {payload.requester_email}
                        </a>
                      </div>
                    )}
                    {payload.requester_discord && (
                      <div>
                        <div className="text-neutral-500 text-xs">
                          {t.discord}
                        </div>
                        <div className="font-medium break-all">
                          {payload.requester_discord}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {payload.forwarded_from && (
                <div className="mt-4 rounded-lg bg-neutral-900/60 border border-neutral-700 px-3 py-2 text-xs text-neutral-400">
                  {t.forwardedFromPrefix}
                  <Link
                    href={`/admin/demandes/${payload.forwarded_from.demande_id}`}
                    className="text-cyan-300 hover:underline"
                  >
                    {t.forwardedFromLink}
                  </Link>
                  {payload.forwarded_from.forwarded_at &&
                    format(t.forwardedFromDate, {
                      date: formatDateTime(payload.forwarded_from.forwarded_at),
                    })}
                  .
                </div>
              )}

              {/* Forward action — only for external scrims */}
              {demande.source === 'public' && (
                <div className="mt-5 pt-4 border-t border-neutral-700/60">
                  {!forwardOpen ? (
                    <button
                      type="button"
                      onClick={openForwardPanel}
                      className="px-4 py-2 rounded-lg bg-cyan-600/80 hover:bg-cyan-500 text-sm font-medium"
                    >
                      {t.forwardToOther}
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <label className="block text-xs uppercase tracking-wide text-neutral-500">
                        {t.chooseTargetTeam}
                      </label>
                      <select
                        value={forwardTargetId}
                        onChange={(e) => setForwardTargetId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-neutral-900/60 border border-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      >
                        <option value="">{t.selectPlaceholder}</option>
                        {forwardTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                            {t.short_name ? ` (${t.short_name})` : ''}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!forwardTargetId || forwarding}
                          onClick={submitForward}
                          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-sm font-medium"
                        >
                          {forwarding ? t.forwarding : t.confirmForward}
                        </button>
                        <button
                          type="button"
                          onClick={() => setForwardOpen(false)}
                          className="px-4 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-sm"
                        >
                          {t.cancel}
                        </button>
                      </div>
                      <p className="text-xs text-neutral-500">
                        {t.forwardHelp}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {demande.type === 'team_registration' && (
            <div className="bg-neutral-800/50 backdrop-blur border border-blue-500/20 rounded-2xl p-6 mb-6">
              <h3 className="text-xs uppercase tracking-wide text-blue-300/80 mb-3">
                {t.registrationDetails}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {payload.team_name && (
                  <div>
                    <div className="text-neutral-500 text-xs">{t.teamName}</div>
                    <div className="font-medium">{payload.team_name}</div>
                  </div>
                )}
                {payload.user_email && (
                  <div>
                    <div className="text-neutral-500 text-xs">
                      {t.contactEmail}
                    </div>
                    <div className="font-medium">{payload.user_email}</div>
                  </div>
                )}
              </div>
              {Array.isArray(payload.members) && payload.members.length > 0 && (
                <div className="mt-4">
                  <div className="text-neutral-500 text-xs mb-2">
                    {format(t.membersCount, { count: payload.members.length })}
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    {payload.members.map((m: any, i: number) => (
                      <li
                        key={i}
                        className="px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-700"
                      >
                        <div className="font-medium">
                          {m.display_name || m.email}
                        </div>
                        <div className="text-xs text-neutral-400 flex flex-wrap gap-x-3">
                          {m.email && <span>{m.email}</span>}
                          {m.battle_tag && (
                            <span>
                              {format(t.memberBt, { tag: m.battle_tag })}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {payload.field_values &&
                typeof payload.field_values === 'object' && (
                  <RegistrationAnswers
                    fieldValues={
                      payload.field_values as Record<string, unknown>
                    }
                    fields={tournamentFields}
                  />
                )}
            </div>
          )}

          {demande.type === 'captain_request' && (
            <div className="bg-neutral-800/50 backdrop-blur border border-purple-500/20 rounded-2xl p-6 mb-6">
              <h3 className="text-xs uppercase tracking-wide text-purple-300/80 mb-3">
                {t.requestDetails}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {payload.request_type && (
                  <div>
                    <div className="text-neutral-500 text-xs">{t.type}</div>
                    <div className="font-medium">
                      {payload.request_type === 'existing_team'
                        ? t.existingTeam
                        : t.newTeamToCreate}
                    </div>
                  </div>
                )}
                {(payload.existing_team_name || payload.team_name) && (
                  <div>
                    <div className="text-neutral-500 text-xs">{t.team}</div>
                    <div className="font-medium">
                      {payload.existing_team_name || payload.team_name}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Raw payload toggle for fallback */}
          {payload && Object.keys(payload).length > 0 && (
            <details className="mb-6">
              <summary className="text-xs text-neutral-500 cursor-pointer hover:text-neutral-300">
                {t.viewRawPayload}
              </summary>
              <pre className="mt-2 p-4 bg-neutral-900/70 border border-neutral-700 rounded-xl overflow-x-auto text-xs text-neutral-300">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </details>
          )}

          {/* Staff note + actions */}
          <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">
              {t.staffNoteHeading}
            </h3>
            <textarea
              rows={3}
              value={staffNote}
              onChange={(e) => setStaffNote(e.target.value)}
              disabled={!isPending && demande.status !== 'pending'}
              placeholder={t.staffNotePlaceholder}
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />

            {isPending ? (
              <div className="flex flex-wrap gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => updateStatus('approved')}
                  disabled={processing}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {t.approve}
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus('rejected')}
                  disabled={processing}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  {t.reject}
                </button>
              </div>
            ) : (
              <div className="mt-4 text-sm text-neutral-400">
                {t.treated}
                {demande.handled_by?.display_name && (
                  <>
                    {t.treatedBy}
                    <span className="text-neutral-200 font-medium">
                      {demande.handled_by.display_name}
                    </span>
                  </>
                )}
                {demande.processed_at &&
                  format(t.treatedOn, {
                    date: formatDateTime(demande.processed_at),
                  })}
                .
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default AdminDemandeDetailPage;
