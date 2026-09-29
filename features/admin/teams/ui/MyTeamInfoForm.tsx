// features/admin/teams/ui/MyTeamInfoForm.tsx — la carte « Informations
// équipe » de l'espace « mon équipe » (pages/admin/teams/my.tsx) en « Le
// Ruban » : champs, interrupteur de recrutement, bouton Enregistrer (le SEUL
// primaire de l'écran).
//
// Purement présentationnel : la page garde le formulaire, la bascule du
// recrutement et la sauvegarde (PATCH).

import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTeamsMy from '@/lib/i18n/locales/admin-fr/adminTeamsMy';
import { FicheSection } from '@/features/admin/_shared/ui/Fiche';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { MY_TEAM_INPUT, MY_TEAM_LABEL, MY_TEAM_SPINNER } from './MyTeamClasses';

export type MyTeamForm = {
  name: string;
  short_name: string;
  bio: string;
  logo_url: string;
  country: string;
  description: string;
};

export default function MyTeamInfoForm({
  form,
  canEdit,
  onFieldChange,
  isJoinable,
  togglingJoinable,
  captainScopeUnavailable,
  onToggleJoinable,
  saving,
  onSave,
}: {
  form: MyTeamForm;
  canEdit: boolean;
  onFieldChange: (k: keyof MyTeamForm, v: string) => void;
  isJoinable: boolean;
  togglingJoinable: boolean;
  captainScopeUnavailable: boolean;
  onToggleJoinable: () => void;
  saving: boolean;
  onSave: () => void;
}) {
  const t = useAdminT(nsAdminTeamsMy);

  return (
    <FicheSection
      title={t.teamInfoTitle}
      aside={!canEdit ? <Chip>{t.readonly}</Chip> : undefined}
    >
      <div className="space-y-4">
        <div>
          <label className={MY_TEAM_LABEL}>{t.nameLabel}</label>
          <input
            value={form.name}
            onChange={(e) => onFieldChange('name', e.target.value)}
            disabled={!canEdit}
            className={MY_TEAM_INPUT}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={MY_TEAM_LABEL}>{t.shortNameLabel}</label>
            <input
              value={form.short_name}
              onChange={(e) => onFieldChange('short_name', e.target.value)}
              disabled={!canEdit}
              className={MY_TEAM_INPUT}
            />
          </div>
          <div>
            <label className={MY_TEAM_LABEL}>{t.countryLabel}</label>
            <input
              value={form.country}
              onChange={(e) => onFieldChange('country', e.target.value)}
              disabled={!canEdit}
              className={MY_TEAM_INPUT}
            />
          </div>
        </div>

        <div>
          <label className={MY_TEAM_LABEL}>{t.logoUrlLabel}</label>
          <input
            value={form.logo_url}
            onChange={(e) => onFieldChange('logo_url', e.target.value)}
            disabled={!canEdit}
            className={`${MY_TEAM_INPUT} font-mono`}
          />
        </div>

        <div>
          <label className={MY_TEAM_LABEL}>{t.bioLabel}</label>
          <textarea
            value={form.bio}
            onChange={(e) => onFieldChange('bio', e.target.value)}
            disabled={!canEdit}
            rows={3}
            className={`${MY_TEAM_INPUT} resize-y`}
          />
        </div>

        <div>
          <label className={MY_TEAM_LABEL}>{t.descriptionLabel}</label>
          <textarea
            value={form.description}
            onChange={(e) => onFieldChange('description', e.target.value)}
            disabled={!canEdit}
            rows={2}
            className={`${MY_TEAM_INPUT} resize-y`}
          />
        </div>
      </div>

      {canEdit && (
        <div className="mt-5 flex items-center justify-between gap-4 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--t1,#f4edf7)]">
              {t.recruitmentOpen}
            </p>
            <p className="text-xs text-[var(--t3,#a39ba6)]">
              {captainScopeUnavailable
                ? t.noCaptainScope
                : isJoinable
                  ? t.recruitmentOn
                  : t.recruitmentOff}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleJoinable}
            disabled={togglingJoinable || captainScopeUnavailable}
            className={`relative h-7 w-12 flex-shrink-0 rounded-full border transition-colors ${
              isJoinable
                ? 'border-[var(--lf-300,#8ed377)] bg-[var(--lf,#7fca65)]'
                : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s3,#2f2732)]'
            } ${togglingJoinable || captainScopeUnavailable ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-[22px] w-[22px] rounded-full bg-[var(--t1,#f4edf7)] transition-transform ${
                isJoinable ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
      )}

      {canEdit && (
        <div className="pt-5">
          <AdminButton
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <div className={`h-4 w-4 ${MY_TEAM_SPINNER}`} />
                {t.saving}
              </>
            ) : (
              <>
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {t.save}
              </>
            )}
          </AdminButton>
        </div>
      )}
    </FicheSection>
  );
}
