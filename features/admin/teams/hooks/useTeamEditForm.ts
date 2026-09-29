// features/admin/teams/hooks/useTeamEditForm.ts — formulaire « infos » de la
// fiche d'édition d'une équipe (pages/admin/teams/[teamId]/edit.tsx), lot L10.
//
// UN seul objet d'état au lieu de quatorze `useState`, hydraté UNE fois par
// fiche (`useHydrateOnce`) : une relecture de l'équipe après un geste de
// roster n'écrase plus la saisie en cours. Les setters gardent la forme
// attendue par `TeamEditInfoForm` et `LogoUpload` (rendu inchangé).

import { useMemo, useState } from 'react';
import type { TeamRow } from '@/types/admin';
import {
  EMPTY_LOGO_CREDIT,
  logoCreditDraftFromRow,
  logoCreditPayload,
} from '@/components/admin/teams/TeamLogoCreditFields';
import type { TeamLocaleValue } from '@/components/admin/teams/TeamCommsFields';
import { useHydrateOnce } from '../../_shared/useHydrateOnce';

export type TeamEditForm = {
  name: string;
  shortName: string;
  logoUrl: string;
  logoCredit: typeof EMPTY_LOGO_CREDIT;
  bannerUrl: string;
  country: string;
  description: string;
  twitter: string;
  discord: string;
  discordRoleId: string;
  preferredLocale: TeamLocaleValue;
  website: string;
  isActive: boolean;
  // SR d'ensemble déclaré : saisi en chaîne (champ de formulaire), '' = effacer
  // la déclaration et rendre la main à la moyenne des fiches.
  skillRating: string;
};

const EMPTY_FORM: TeamEditForm = {
  name: '',
  shortName: '',
  logoUrl: '',
  logoCredit: EMPTY_LOGO_CREDIT,
  bannerUrl: '',
  country: '',
  description: '',
  twitter: '',
  discord: '',
  discordRoleId: '',
  preferredLocale: '',
  website: '',
  isActive: true,
  skillRating: '',
};

function formFromRow(row: TeamRow): TeamEditForm {
  return {
    name: row.name || '',
    shortName: row.short_name || '',
    logoUrl: row.logo_url || '',
    logoCredit: logoCreditDraftFromRow(row),
    bannerUrl: row.banner_url || '',
    country: row.country || '',
    description: row.description || '',
    twitter: row.twitter || '',
    discord: row.discord || '',
    discordRoleId: row.discord_role_id || '',
    preferredLocale: (row.preferred_locale as TeamLocaleValue) || '',
    website: row.website || '',
    isActive: row.is_active !== false,
    skillRating: row.skill_rating != null ? String(row.skill_rating) : '',
  };
}

/** Corps du PATCH, à l'identique de l'ancien `handleSubmit`. */
export function teamPayloadFromForm(f: TeamEditForm): Partial<TeamRow> {
  return {
    name: f.name,
    short_name: f.shortName || null,
    logo_url: f.logoUrl || null,
    ...logoCreditPayload(f.logoCredit),
    banner_url: f.bannerUrl || null,
    country: f.country || null,
    description: f.description || null,
    twitter: f.twitter || null,
    discord: f.discord || null,
    discord_role_id: f.discordRoleId.trim() || null,
    preferred_locale: f.preferredLocale || null,
    website: f.website || null,
    is_active: f.isActive,
    // Chaîne vide = effacer, pas « ne rien changer » : c'est la seule façon
    // de retirer une déclaration devenue fausse depuis l'écran staff.
    // Converti ici plutôt qu'envoyé en chaîne — l'API revalide de son côté.
    skill_rating: f.skillRating.trim() ? Number(f.skillRating.trim()) : null,
  };
}

export function useTeamEditForm(
  teamId: string | undefined,
  team: TeamRow | null
) {
  const [form, setForm] = useState<TeamEditForm>(EMPTY_FORM);
  useHydrateOnce(teamId ?? null, team ?? undefined, (row) =>
    setForm(formFromRow(row))
  );
  const setters = useMemo(() => {
    const set =
      <K extends keyof TeamEditForm>(k: K) =>
      (v: TeamEditForm[K]) =>
        setForm((prev) => ({ ...prev, [k]: v }));
    return {
      setName: set('name'),
      setShortName: set('shortName'),
      setLogoUrl: set('logoUrl'),
      setLogoCredit: set('logoCredit'),
      setBannerUrl: set('bannerUrl'),
      setCountry: set('country'),
      setDescription: set('description'),
      setTwitter: set('twitter'),
      setDiscord: set('discord'),
      setDiscordRoleId: set('discordRoleId'),
      setPreferredLocale: set('preferredLocale'),
      setWebsite: set('website'),
      setIsActive: set('isActive'),
      setSkillRating: set('skillRating'),
    };
  }, []);
  return { form, setters };
}
