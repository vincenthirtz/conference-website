// pages/admin/demandes/[id].tsx
// Page de détail d'une demande admin (tous types)

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useHydrateOnce } from '@/features/admin/_shared/useHydrateOnce';
import { useActiveTeamOptions } from '@/features/admin/_shared/teamOptions';
import { demandesClient } from '@/features/admin/demandes/client';
import {
  useDemande,
  useDemandeTournamentFields,
  useInvalidateDemandes,
} from '@/features/admin/demandes/hooks/useDemandesQueries';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { RegistrationField } from '@/utils/registrationFields';
import nsAdminDemandeDetail from '@/lib/i18n/locales/admin-fr/adminDemandeDetail';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import EntityHistoryButton from '@/components/admin/EntityHistoryButton';
import { FicheLayout, FicheSection } from '@/features/admin/_shared/ui/Fiche';
import {
  CaptainRequestDetails,
  type Demande,
  DemandeActors,
  DemandeMessage,
  FIELD_LABEL,
  formatDateTime,
  LINK,
  RawPayload,
  RegistrationDetails,
  ScrimFacts,
  statusChipTone,
  statusLabel,
  typeLabel,
} from '@/features/admin/demandes/ui/DemandeDetailBlocks';

export const getServerSideProps = withStaffPage('caster');

const ERROR_BOX =
  'rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]';
const FIELD_CLASS =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2.5 text-sm text-[var(--t1,#f4edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)] disabled:opacity-60';

type ForwardCandidate = {
  id: string;
  name: string;
  short_name: string | null;
};

function AdminDemandeDetailPage() {
  const t = useAdminT(nsAdminDemandeDetail);
  const router = useRouter();
  const { addToast } = useToast();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const invalidateDemandes = useInvalidateDemandes();

  const demandeQuery = useDemande<Demande>(id);
  const demande = demandeQuery.data?.demande ?? null;
  // Best-effort: load the tournament's field definitions so submitted
  // answers can be rendered by label. Silently ignored if unavailable
  // (e.g. caster role can't read the tournament endpoint).
  const fieldsQuery = useDemandeTournamentFields(
    demande?.tournament_id,
    demande?.type === 'team_registration' && !!demande?.payload?.field_values
  );
  const tournamentFields: RegistrationField[] = fieldsQuery.data ?? [];
  const loading =
    demandeQuery.isFetching || (fieldsQuery.isFetching && !fieldsQuery.data);
  const [actionError, setErrorMsg] = useState<string | null>(null);
  const errorMsg =
    actionError ??
    (demandeQuery.error
      ? (demandeQuery.error.message ?? t.errorUnexpected)
      : null);
  const [staffNote, setStaffNote] = useState('');
  useHydrateOnce(id, demande ?? undefined, (d) =>
    setStaffNote(d.staff_note || '')
  );
  const [processing, setProcessing] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardTargetId, setForwardTargetId] = useState('');
  const [forwarding, setForwarding] = useState(false);

  // Équipes actives, en cache partagé avec les modales de scrim ; chargées à
  // la première ouverture du panneau.
  const forwardTeamsQuery = useActiveTeamOptions(forwardOpen);
  const forwardTeams: ForwardCandidate[] = (forwardTeamsQuery.data?.teams ?? [])
    .map((team) => ({
      id: team.id,
      name: team.name,
      short_name: team.short_name ?? null,
    }))
    .filter((team) => team.id !== demande?.team_id)
    .sort((x, y) => x.name.localeCompare(y.name));
  const forwardTeamsError = forwardTeamsQuery.error;
  useEffect(() => {
    if (forwardTeamsError)
      addToast(forwardTeamsError.message || t.errorLoadTeams, 'error');
  }, [forwardTeamsError, addToast, t.errorLoadTeams]);

  /** Relit la fiche après un geste (et les vues qui listent des demandes). */
  async function fetchDemande() {
    setErrorMsg(null);
    await Promise.all([demandeQuery.refetch(), invalidateDemandes()]);
  }

  function openForwardPanel() {
    setForwardOpen(true);
    setForwardTargetId('');
  }

  async function submitForward() {
    if (!id || !forwardTargetId) return;
    setForwarding(true);
    try {
      const json = await demandesClient.forwardScrim(id, forwardTargetId);
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
      await demandesClient.updateStatus({
        ids: [id],
        newStatus,
        staffComment: staffNote.trim() || null,
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
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        {errorMsg ? (
          <div className={`mx-auto max-w-2xl ${ERROR_BOX}`}>{errorMsg}</div>
        ) : (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--t1,#f4edf7)]" />
          </div>
        )}
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

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <Link
          href="/admin/demandes"
          className="mb-3 inline-flex items-center gap-2 text-sm text-[var(--t3,#a39ba6)] transition-colors hover:text-[var(--t1,#f4edf7)]"
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

        <EntityHeader
          title={typeLabel(demande.type, t)}
          meta={
            <>
              {format(t.createdOn, {
                date: formatDateTime(demande.created_at),
              })}
              {' · '}
              {t.idLabel} <code className="font-mono">{demande.id}</code>
            </>
          }
          status={
            <>
              <Chip tone={statusChipTone(demande.status)}>
                {statusLabel(demande.status, t)}
              </Chip>
              {demande.source && <Chip>{demande.source}</Chip>}
            </>
          }
          actions={
            <EntityHistoryButton entityType="demande" entityId={demande.id} />
          }
        />

        {errorMsg && <div className={`mb-6 ${ERROR_BOX}`}>{errorMsg}</div>}

        <FicheLayout
          main={
            <>
              {demande.comment && <DemandeMessage comment={demande.comment} />}

              {/* Payload type-specific */}
              {demande.type === 'scrim' && (
                <FicheSection
                  title={t.scrimDetails}
                  aside={
                    demande.source === 'public' ? (
                      <Chip tone="warn">{t.externalRequest}</Chip>
                    ) : undefined
                  }
                >
                  <ScrimFacts demande={demande} />

                  {/* Passer en grille de dispo (P4-14) : ouvre le flux de création
                      d'une grille « When2Meet » préremplie avec les deux équipes,
                      liée à cette négociation (source_demande_id). */}
                  {payload.from_team_id && demande.team_id && (
                    <div className="mt-4">
                      <Link
                        href={{
                          pathname: '/admin/scrims',
                          query: {
                            tab: 'plannings',
                            new: '1',
                            team1: payload.from_team_id,
                            team2: demande.team_id,
                            fromDemande: demande.id,
                          },
                        }}
                        className="inline-flex h-[38px] items-center rounded-[var(--r-ctrl,4px)] border border-[rgba(180,103,209,.45)] px-[14px] font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.02em] text-[var(--or-200,#eec4ff)] transition-colors hover:border-[var(--or,#b467d1)] hover:bg-[rgba(180,103,209,.08)]"
                      >
                        {t.createPlanningGrid}
                      </Link>
                    </div>
                  )}

                  {payload.forwarded_from && (
                    <div className="mt-4 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-xs text-[var(--t3,#a39ba6)]">
                      {t.forwardedFromPrefix}
                      <Link
                        href={`/admin/demandes/${payload.forwarded_from.demande_id}`}
                        className={LINK}
                      >
                        {t.forwardedFromLink}
                      </Link>
                      {payload.forwarded_from.forwarded_at &&
                        format(t.forwardedFromDate, {
                          date: formatDateTime(
                            payload.forwarded_from.forwarded_at
                          ),
                        })}
                      .
                    </div>
                  )}

                  {/* Forward action — only for external scrims */}
                  {demande.source === 'public' && (
                    <div className="mt-5 border-t border-[var(--line,rgba(194,196,201,.12))] pt-4">
                      {!forwardOpen ? (
                        <AdminButton size="sm" onClick={openForwardPanel}>
                          {t.forwardToOther}
                        </AdminButton>
                      ) : (
                        <div className="space-y-3">
                          <label className={`block ${FIELD_LABEL}`}>
                            {t.chooseTargetTeam}
                          </label>
                          <select
                            value={forwardTargetId}
                            onChange={(e) => setForwardTargetId(e.target.value)}
                            className={FIELD_CLASS}
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
                            <AdminButton
                              size="sm"
                              variant="secondary"
                              disabled={!forwardTargetId || forwarding}
                              onClick={submitForward}
                            >
                              {forwarding ? t.forwarding : t.confirmForward}
                            </AdminButton>
                            <AdminButton
                              size="sm"
                              onClick={() => setForwardOpen(false)}
                            >
                              {t.cancel}
                            </AdminButton>
                          </div>
                          <p className="text-xs text-[var(--t4,#807984)]">
                            {t.forwardHelp}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </FicheSection>
              )}

              {demande.type === 'team_registration' && (
                <RegistrationDetails
                  payload={payload}
                  tournamentFields={tournamentFields}
                />
              )}

              {demande.type === 'captain_request' && (
                <CaptainRequestDetails payload={payload} />
              )}

              {/* Raw payload toggle for fallback */}
              {payload && Object.keys(payload).length > 0 && (
                <RawPayload payload={payload} />
              )}

              {/* Staff note + actions */}
              <FicheSection title={t.staffNoteHeading}>
                <textarea
                  rows={3}
                  value={staffNote}
                  onChange={(e) => setStaffNote(e.target.value)}
                  disabled={!isPending && demande.status !== 'pending'}
                  placeholder={t.staffNotePlaceholder}
                  className={FIELD_CLASS}
                />

                {isPending ? (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <AdminButton
                      variant="primary"
                      onClick={() => updateStatus('approved')}
                      disabled={processing}
                    >
                      {t.approve}
                    </AdminButton>
                    <AdminButton
                      variant="danger"
                      onClick={() => updateStatus('rejected')}
                      disabled={processing}
                    >
                      {t.reject}
                    </AdminButton>
                  </div>
                ) : (
                  <div className="mt-4 text-sm text-[var(--t3,#a39ba6)]">
                    {t.treated}
                    {demande.handled_by?.display_name && (
                      <>
                        {t.treatedBy}
                        <span className="font-medium text-[var(--t1,#f4edf7)]">
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
              </FicheSection>
            </>
          }
          aside={<DemandeActors demande={demande} />}
        />
      </div>
    </>
  );
}

export default withAdminQuery(AdminDemandeDetailPage);
