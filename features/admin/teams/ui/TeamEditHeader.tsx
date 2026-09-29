// features/admin/teams/ui/TeamEditHeader.tsx — la tête de la fiche d'édition
// d'une équipe (pages/admin/teams/[teamId]/edit.tsx) en « Le Ruban » : fil
// d'Ariane, retour, en-tête d'entité (écusson, tag, pays, état) et le SEUL
// bouton primaire de l'écran, « Enregistrer », qui vise le formulaire par son
// `id`. Puis le bandeau d'erreur et le chargement initial.
//
// Purement présentationnel. L'historique arrive en slot : son tiroir charge
// lui-même ses données, il n'a rien à faire dans ui/.

import type { ReactNode } from 'react';
import Image from 'next/image';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTeamEdit from '@/lib/i18n/locales/admin-fr/adminTeamEdit';
import Breadcrumb from '@/components/admin/Breadcrumb';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { FicheSection } from '@/features/admin/_shared/ui/Fiche';
import type { TeamRow } from '@/types/admin';

/** Même allure qu'un AdminButton ghost `sm`, pour le déclencheur d'historique. */
export const TEAM_EDIT_GHOST_SM =
  'inline-flex h-[38px] items-center rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-[14px] font-[family-name:var(--fd)] text-[12px] font-bold uppercase text-[var(--t2,#c7bfca)] transition-colors hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]';

export default function TeamEditHeader({
  team,
  teamId,
  formId,
  saving,
  loading,
  errorMsg,
  onBack,
  historySlot,
}: {
  team: TeamRow | null;
  teamId: string | undefined;
  formId: string;
  saving: boolean;
  loading: boolean;
  errorMsg: string | null;
  onBack: () => void;
  historySlot: ReactNode;
}) {
  const t = useAdminT(nsAdminTeamEdit);

  return (
    <>
      <Breadcrumb
        items={[
          { label: t.breadcrumbTeams, href: '/admin/teams' },
          {
            label: team?.name || t.breadcrumbTeam,
            href: `/admin/teams/${teamId}`,
          },
          { label: t.breadcrumbEdit },
        ]}
      />
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-2 text-sm text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]"
      >
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
        title={team?.name || t.loading}
        meta={
          team && (
            <>
              {team.short_name && (
                <span className="font-mono">{team.short_name}</span>
              )}
              {team.short_name && team.country && ' · '}
              {team.country}
            </>
          )
        }
        status={
          team ? (
            <Chip tone={team.is_active ? 'ok' : 'err'}>
              {team.is_active ? t.active : t.inactive}
            </Chip>
          ) : undefined
        }
        actions={
          team && (
            <>
              {historySlot}
              <AdminButton
                type="submit"
                form={formId}
                variant="primary"
                size="sm"
                disabled={saving}
              >
                {saving ? t.saving : t.save}
              </AdminButton>
            </>
          )
        }
      />

      {errorMsg && (
        <div
          role="alert"
          className="mb-6 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]"
        >
          {errorMsg}
        </div>
      )}
      {loading && !team && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)]" />
        </div>
      )}
    </>
  );
}

/** Colonne de droite : identifiant système et aperçu de la bannière. */
export function TeamEditSystemCards({ team }: { team: TeamRow }) {
  const t = useAdminT(nsAdminTeamEdit);
  return (
    <FicheSection eyebrow title={t.systemInfoTitle}>
      <p className="mb-1 text-xs text-[var(--t3,#a39ba6)]">{t.teamIdLabel}</p>
      <p className="break-all rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-3 py-2 font-mono text-xs text-[var(--t1,#f4edf7)]">
        {team.id}
      </p>
      {team.banner_url && (
        <>
          <p className="mt-4 mb-1 text-xs text-[var(--t3,#a39ba6)]">
            {t.bannerPreviewTitle}
          </p>
          <div className="relative h-24 w-full overflow-hidden rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)]">
            <Image src={team.banner_url} alt="" fill className="object-cover" />
          </div>
        </>
      )}
    </FicheSection>
  );
}
