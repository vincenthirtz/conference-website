// features/admin/teams/ui/MyTeamHeader.tsx — la tête de l'espace « mon
// équipe » (pages/admin/teams/my.tsx) en « Le Ruban » : retour à la liste,
// en-tête d'entité (écusson, nom, mode d'accès, rafraîchir), sélecteur
// d'équipe réservé au staff, puis les états chargement / erreur / vide.
//
// Purement présentationnel : la page garde le chargement, la sélection et la
// remise à zéro ; ce fichier ne fait que les rendre.

import Image from 'next/image';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTeamsMy from '@/lib/i18n/locales/admin-fr/adminTeamsMy';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  MY_TEAM_CARD,
  MY_TEAM_HELP,
  MY_TEAM_INPUT,
  MY_TEAM_LABEL,
  MY_TEAM_SPINNER,
} from './MyTeamClasses';

type HeaderTeam = {
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

const TEAM_ICON_PATH =
  'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z';

/** Pictogramme « équipe » (état vide, roster vide). */
export function MyTeamIcon({ className }: { className: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d={TEAM_ICON_PATH}
      />
    </svg>
  );
}

export default function MyTeamHeader({
  team,
  subtitle,
  onBack,
  onRefresh,
}: {
  team: HeaderTeam | null;
  subtitle: string;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const t = useAdminT(nsAdminTeamsMy);

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-2 text-sm text-[var(--t3,#a39ba6)] transition-colors hover:text-[var(--t1,#f4edf7)]"
      >
        <svg
          className="h-4 w-4"
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
      </button>

      <EntityHeader
        crest={
          team?.logo_url ? (
            <Image
              src={team.logo_url}
              alt={team.name}
              width={52}
              height={52}
              className="h-full w-full object-cover"
            />
          ) : team ? (
            (team.short_name || team.name).slice(0, 3).toUpperCase()
          ) : undefined
        }
        title={team ? team.name : t.headingFallback}
        meta={subtitle}
        actions={
          <AdminButton variant="ghost" size="sm" onClick={onRefresh}>
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {t.refresh}
          </AdminButton>
        }
      />
    </>
  );
}

/** Sélecteur d'équipe du staff (admin / owner / manager). */
export function MyTeamSelector({
  teams,
  selectedTeamId,
  loadingTeams,
  onSelect,
  onReset,
}: {
  teams: { id: string; name: string; short_name: string | null }[];
  selectedTeamId: string;
  loadingTeams: boolean;
  onSelect: (teamId: string) => void;
  onReset: () => void;
}) {
  const t = useAdminT(nsAdminTeamsMy);

  return (
    <section className={`${MY_TEAM_CARD} mb-6`}>
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[250px] flex-1">
          <label className={MY_TEAM_LABEL}>{t.selectTeamToManage}</label>
          <select
            value={selectedTeamId}
            onChange={(e) => onSelect(e.target.value)}
            className={MY_TEAM_INPUT}
            disabled={loadingTeams}
          >
            <option value="">
              {loadingTeams ? t.loading : t.chooseTeamPlaceholder}
            </option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
                {team.short_name ? ` (${team.short_name})` : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedTeamId && (
          <AdminButton variant="ghost" size="sm" onClick={onReset}>
            {t.reset}
          </AdminButton>
        )}
      </div>

      <p className={`${MY_TEAM_HELP} mt-3`}>{t.adminHint}</p>
    </section>
  );
}

/** Chargement, erreur, ou aucune équipe à afficher. */
export function MyTeamStatus({
  loading,
  error,
  hasTeam,
  isStaffAdmin,
  onCreateTeam,
}: {
  loading: boolean;
  error: string | null;
  hasTeam: boolean;
  isStaffAdmin: boolean;
  onCreateTeam: () => void;
}) {
  const t = useAdminT(nsAdminTeamsMy);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className={`h-8 w-8 ${MY_TEAM_SPINNER}`} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]"
      >
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--err,#ff6b6b)]"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
        <div className="space-y-2">
          <p>{error}</p>
          {!isStaffAdmin && (
            <AdminButton variant="primary" size="sm" onClick={onCreateTeam}>
              {t.createMyTeam}
            </AdminButton>
          )}
        </div>
      </div>
    );
  }

  if (!hasTeam) {
    return (
      <div className={`${MY_TEAM_CARD} text-center`}>
        <MyTeamIcon className="mx-auto mb-4 h-12 w-12 text-[var(--t4,#807984)]" />
        <p className="text-[var(--t3,#a39ba6)]">
          {isStaffAdmin ? t.selectTeamHint : t.noCaptainTeam}
        </p>
      </div>
    );
  }

  return null;
}
