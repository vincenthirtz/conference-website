// features/admin/teams/ui/TeamEditInfoForm.tsx — la carte « Informations
// générales » de l'édition d'une équipe (pages/admin/teams/[teamId]/edit.tsx),
// passée en « Le Ruban » et sortie de la page (règle A7 : elle est gelée en
// taille).
//
// Purement présentationnel : la page garde l'état du formulaire, la soumission
// (PATCH) et l'upload du logo. Le champ logo arrive en slot parce que
// LogoUpload tient son propre appel réseau — il n'a rien à faire dans ui/.
// Le bouton « Enregistrer » vit dans l'en-tête de la fiche et vise ce
// formulaire par son `id`.

import type { FormEvent, ReactNode } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTeamEdit from '@/lib/i18n/locales/admin-fr/adminTeamEdit';
import { FicheSection } from '@/features/admin/_shared/ui/Fiche';
import TeamLogoCreditFields, {
  type LogoCreditDraft,
} from '@/components/admin/teams/TeamLogoCreditFields';
import TeamCommsFields, {
  type TeamLocaleValue,
} from '@/components/admin/teams/TeamCommsFields';

export const TEAM_EDIT_LABEL = 'mb-1 block text-sm text-[var(--t2,#c7bfca)]';
export const TEAM_EDIT_HELP = 'mt-1 text-xs text-[var(--t3,#a39ba6)]';
export const TEAM_EDIT_INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';

export type TeamEditFormValues = {
  name: string;
  shortName: string;
  logoCredit: LogoCreditDraft;
  bannerUrl: string;
  country: string;
  description: string;
  twitter: string;
  discord: string;
  discordRoleId: string;
  preferredLocale: TeamLocaleValue;
  website: string;
  isActive: boolean;
  skillRating: string;
};

export type TeamEditFormSetters = {
  setName: (v: string) => void;
  setShortName: (v: string) => void;
  setLogoCredit: (v: LogoCreditDraft) => void;
  setBannerUrl: (v: string) => void;
  setCountry: (v: string) => void;
  setDescription: (v: string) => void;
  setTwitter: (v: string) => void;
  setDiscord: (v: string) => void;
  setDiscordRoleId: (v: string) => void;
  setPreferredLocale: (v: TeamLocaleValue) => void;
  setWebsite: (v: string) => void;
  setIsActive: (v: boolean) => void;
  setSkillRating: (v: string) => void;
};

export default function TeamEditInfoForm({
  formId,
  onSubmit,
  values: v,
  setters: s,
  logoSlot,
}: {
  formId: string;
  onSubmit: (e: FormEvent) => void;
  values: TeamEditFormValues;
  setters: TeamEditFormSetters;
  /** Le champ LogoUpload, rendu par la page (il porte son propre upload). */
  logoSlot: ReactNode;
}) {
  const t = useAdminT(nsAdminTeamEdit);

  return (
    <FicheSection title={t.generalInfo}>
      <form id={formId} onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={TEAM_EDIT_LABEL}>{t.nameLabel}</label>
            <input
              type="text"
              required
              value={v.name}
              onChange={(e) => s.setName(e.target.value)}
              className={TEAM_EDIT_INPUT}
              placeholder={t.namePlaceholder}
            />
          </div>
          <div>
            <label className={TEAM_EDIT_LABEL}>{t.shortNameLabel}</label>
            <input
              type="text"
              value={v.shortName}
              onChange={(e) => s.setShortName(e.target.value)}
              className={TEAM_EDIT_INPUT}
              placeholder="PHX"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {logoSlot}
          <div>
            <label className={TEAM_EDIT_LABEL}>{t.bannerLabel}</label>
            <input
              type="text"
              value={v.bannerUrl}
              onChange={(e) => s.setBannerUrl(e.target.value)}
              className={`${TEAM_EDIT_INPUT} font-mono`}
              placeholder="https://..."
            />
          </div>
        </div>

        <TeamLogoCreditFields value={v.logoCredit} onChange={s.setLogoCredit} />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={TEAM_EDIT_LABEL}>{t.countryLabel}</label>
            <input
              type="text"
              value={v.country}
              onChange={(e) => s.setCountry(e.target.value)}
              className={TEAM_EDIT_INPUT}
              placeholder="FR"
            />
          </div>
          <div className="mt-6 flex items-center gap-2">
            <input
              id="active"
              type="checkbox"
              checked={v.isActive}
              onChange={(e) => s.setIsActive(e.target.checked)}
              className="h-4 w-4 accent-[var(--lf,#7fca65)]"
            />
            <label
              htmlFor="active"
              className="text-sm text-[var(--t1,#f4edf7)]"
            >
              {t.teamActive}
            </label>
          </div>
        </div>

        <div>
          <label className={TEAM_EDIT_LABEL}>{t.descriptionLabel}</label>
          <textarea
            value={v.description}
            onChange={(e) => s.setDescription(e.target.value)}
            className={`${TEAM_EDIT_INPUT} min-h-[100px] resize-y`}
            placeholder={t.descriptionPlaceholder}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className={TEAM_EDIT_LABEL}>{t.twitterLabel}</label>
            <input
              type="text"
              value={v.twitter}
              onChange={(e) => s.setTwitter(e.target.value)}
              className={TEAM_EDIT_INPUT}
              placeholder="@team"
            />
          </div>
          <div>
            <label className={TEAM_EDIT_LABEL}>{t.discordLabel}</label>
            <input
              type="text"
              value={v.discord}
              onChange={(e) => s.setDiscord(e.target.value)}
              className={TEAM_EDIT_INPUT}
              placeholder="discord.gg/..."
            />
          </div>
          <TeamCommsFields
            discordRoleId={v.discordRoleId}
            onDiscordRoleIdChange={s.setDiscordRoleId}
            locale={v.preferredLocale}
            onLocaleChange={s.setPreferredLocale}
            t={t as unknown as Record<string, string>}
          />
          <div>
            <label className={TEAM_EDIT_LABEL}>{t.websiteLabel}</label>
            <input
              type="text"
              value={v.website}
              onChange={(e) => s.setWebsite(e.target.value)}
              className={TEAM_EDIT_INPUT}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className={TEAM_EDIT_LABEL}>{t.skillRatingLabel}</label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={5000}
              step={50}
              value={v.skillRating}
              onChange={(e) => s.setSkillRating(e.target.value)}
              className={TEAM_EDIT_INPUT}
              placeholder="3500"
            />
            <p className={TEAM_EDIT_HELP}>{t.skillRatingHint}</p>
          </div>
        </div>
      </form>
    </FicheSection>
  );
}
