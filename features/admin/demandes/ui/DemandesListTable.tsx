// features/admin/demandes/ui/DemandesListTable.tsx — le corps de la liste staff
// des demandes (/admin/demandes), présentationnel : état vide, ligne « tout
// sélectionner » et une ligne par demande avec ses actions rapides.
//
// Il ne charge rien et n'appelle rien : la page passe les lignes, la sélection
// et les gestes (approuver, refuser, relancer, demander plus d'infos).
//
// Structure à garder : dans une ligne, le PREMIER lien vers la fiche et les
// boutons d'action sont frères — l'e2e admin-demandes remonte du lien à son
// parent pour y trouver « Approuver », `request-more-info` et
// `battletag-warning`.

import Image from 'next/image';
import Link from 'next/link';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminDemandesList from '@/lib/i18n/locales/admin-fr/adminDemandesList';
import EmptyState from '@/components/admin/EmptyState';
import DemandeAvatar from '@/components/admin/demandes/DemandeAvatar';
import {
  formatDateTime,
  statusLabel,
  typeLabel,
} from '@/components/admin/demandes/demandeChips';
import { isSystemNotification } from '@/utils/demandes/systemNotification';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { statusChipTone } from '@/features/admin/demandes/ui/DemandeDetailBlocks';
import {
  isBattleTagFlagged,
  type Demande,
} from '@/features/admin/demandes/listModel';

const CHECKBOX =
  'h-4 w-4 shrink-0 rounded-[3px] border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] accent-[var(--or,#b467d1)]';

function Icon({ d }: { d: string }) {
  return (
    <svg
      aria-hidden
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d={d}
      />
    </svg>
  );
}

const ICON_INFO =
  'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
const ICON_CHAT =
  'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 3v-3z';
const ICON_CHECK = 'M5 13l4 4L19 7';
const ICON_CROSS = 'M6 18L18 6M6 6l12 12';
const ICON_WARN =
  'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z';

export type DemandeRowActions = {
  onToggle: (id: string) => void;
  onRequestInfo: (d: Demande) => void;
  onNotifyCaptains: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

function DemandesListRow({
  d,
  selected,
  disabled,
  actions,
}: {
  d: Demande;
  selected: boolean;
  /** Ligne en cours de traitement, ou traitement en lot en cours. */
  disabled: boolean;
  actions: DemandeRowActions;
}) {
  const t = useAdminT(nsAdminDemandesList);
  const isNotification = isSystemNotification(d);
  return (
    <div
      className={`group flex items-center gap-4 p-4 transition-colors hover:bg-[var(--s2,#1d1520)] ${
        selected ? 'bg-[rgba(180,103,209,.06)]' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => actions.onToggle(d.id)}
        className={CHECKBOX}
      />

      <Link
        href={`/admin/demandes/${d.id}`}
        className="flex min-w-0 flex-1 items-center gap-4"
      >
        <DemandeAvatar
          avatarUrl={d.user?.avatar_url ?? null}
          name={d.user?.display_name ?? null}
          isNotification={isNotification}
        />

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-[var(--t1,#f4edf7)] transition-colors group-hover:text-[var(--or-200,#eec4ff)]">
              {isNotification
                ? d.payload?.from_team_name ||
                  d.team?.name ||
                  t.systemNotification
                : d.user?.display_name ||
                  d.user?.email ||
                  d.user_id ||
                  t.unknownUser}
            </h3>
            {isNotification && <Chip tone="brand">{t.systemNotification}</Chip>}
            <Chip tone={statusChipTone(d.status)}>
              {statusLabel(d.status, t)}
            </Chip>
            <Chip tone="neutral">{typeLabel(d.type, t)}</Chip>
            {d.source && d.source !== 'website' && (
              <Chip tone="neutral">{d.source}</Chip>
            )}
            {isBattleTagFlagged(d) && (
              <Chip
                tone="warn"
                title={t.battleTagWarnTitle}
                data-testid="battletag-warning"
              >
                <svg
                  aria-hidden
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={ICON_WARN}
                  />
                </svg>
                {t.battleTagLabel}
              </Chip>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--t3,#a39ba6)]">
            {(d.type === 'scrim' || isNotification) &&
              d.payload?.from_team_name && (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[var(--or-200,#eec4ff)]">
                      {d.payload.from_team_name}
                    </span>
                    <span className="text-[var(--t4,#807984)]">→</span>
                    <span>
                      {d.team?.name ||
                        d.payload.target_team_name ||
                        t.targetTeamFallback}
                    </span>
                  </span>
                  {d.payload.preferred_date && (
                    <>
                      <span>•</span>
                      <span className="text-xs text-[var(--t2,#c7bfca)]">
                        {new Date(d.payload.preferred_date).toLocaleDateString(
                          'fr-FR',
                          { day: 'numeric', month: 'short', year: 'numeric' }
                        )}
                      </span>
                    </>
                  )}
                  <span>•</span>
                </>
              )}
            {d.team && d.type !== 'scrim' && (
              <>
                <span className="flex items-center gap-1">
                  {d.team.logo_url && (
                    <Image
                      src={d.team.logo_url}
                      alt={d.team.name}
                      width={16}
                      height={16}
                      className="h-4 w-4 rounded-[3px] object-cover"
                    />
                  )}
                  {d.team.name}
                </span>
                <span>•</span>
              </>
            )}
            {d.type === 'captain_request' && d.payload && !d.team && (
              <>
                <span className="text-[var(--or-200,#eec4ff)]">
                  {d.payload.request_type === 'existing_team'
                    ? d.payload.existing_team_name
                    : d.payload.team_name}
                  {d.payload.request_type === 'new_team' && t.toCreate}
                </span>
                <span>•</span>
              </>
            )}
            {d.tournament && (
              <>
                <span>{d.tournament.name}</span>
                <span>•</span>
              </>
            )}
            <span className="text-xs" data-numeric>
              {formatDateTime(d.created_at)}
            </span>
          </div>
          {d.comment && (
            <p className="mt-1 max-w-xl truncate text-xs text-[var(--t4,#807984)]">
              {d.comment}
            </p>
          )}
        </div>

        {/* Handler info */}
        {d.processed_by && (
          <div className="hidden shrink-0 text-right text-xs text-[var(--t4,#807984)] sm:block">
            <div>
              {t.by}{' '}
              <span className="text-[var(--t2,#c7bfca)]">
                {d.processed_by.display_name || d.processed_by.id}
              </span>
            </div>
            {d.processed_at && (
              <div data-numeric>{formatDateTime(d.processed_at)}</div>
            )}
          </div>
        )}
      </Link>

      {/* Quick actions for pending demandes */}
      {d.status === 'pending' && (
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          <AdminButton
            variant="ghost"
            size="xs"
            onClick={() => actions.onRequestInfo(d)}
            disabled={disabled}
            title={t.requestMoreInfoTitle}
            data-testid="request-more-info"
          >
            <Icon d={ICON_INFO} />
          </AdminButton>
          {/* Relance Discord : seul le type scrim DM les capitaines. */}
          {d.type === 'scrim' && (
            <AdminButton
              variant="ghost"
              size="xs"
              onClick={() => actions.onNotifyCaptains(d.id)}
              disabled={disabled}
              title={t.notifyCaptainsTitle}
              data-testid="notify-captains"
            >
              <Icon d={ICON_CHAT} />
            </AdminButton>
          )}
          <AdminButton
            variant="secondary"
            size="xs"
            onClick={() => actions.onApprove(d.id)}
            disabled={disabled}
            title={t.approveTitle}
          >
            <Icon d={ICON_CHECK} />
          </AdminButton>
          <AdminButton
            variant="danger"
            size="xs"
            onClick={() => actions.onReject(d.id)}
            disabled={disabled}
            title={t.rejectTitle}
          >
            <Icon d={ICON_CROSS} />
          </AdminButton>
        </div>
      )}

      <Link
        href={`/admin/demandes/${d.id}`}
        className="shrink-0 text-[var(--t4,#807984)] transition-colors group-hover:text-[var(--t1,#f4edf7)]"
        aria-label={t.viewDetail}
      >
        <svg
          aria-hidden
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </Link>
    </div>
  );
}

export default function DemandesListTable({
  demandes,
  selected,
  processingId,
  batchProcessing,
  hasActiveFilters,
  onToggleSelectAll,
  onResetFilters,
  actions,
}: {
  demandes: Demande[];
  selected: Set<string>;
  /** Demande en cours de traitement unitaire. */
  processingId: string | null;
  batchProcessing: boolean;
  hasActiveFilters: boolean;
  onToggleSelectAll: () => void;
  onResetFilters: () => void;
  actions: DemandeRowActions;
}) {
  const t = useAdminT(nsAdminDemandesList);
  return (
    <section className="overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)]">
      {demandes.length === 0 ? (
        <EmptyState
          title={t.emptyTitle}
          action={
            hasActiveFilters ? (
              <AdminButton variant="ghost" size="sm" onClick={onResetFilters}>
                {t.resetFilters}
              </AdminButton>
            ) : undefined
          }
        />
      ) : (
        <div className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
          {/* Ligne « tout sélectionner » */}
          <div className="flex items-center gap-3 bg-[var(--s2,#1d1520)] px-4 py-3">
            <input
              type="checkbox"
              checked={selected.size === demandes.length && demandes.length > 0}
              onChange={onToggleSelectAll}
              className={CHECKBOX}
            />
            <span className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
              {t.selectAll}
            </span>
          </div>

          {demandes.map((d) => (
            <DemandesListRow
              key={d.id}
              d={d}
              selected={selected.has(d.id)}
              disabled={processingId === d.id || batchProcessing}
              actions={actions}
            />
          ))}
        </div>
      )}
    </section>
  );
}
