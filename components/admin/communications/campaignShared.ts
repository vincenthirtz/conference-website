// components/admin/communications/campaignShared.ts
//
// Types et petits helpers partagés entre l'écran « Campagnes »
// (CampaignsPanel) et le tiroir d'envoi (CampaignDrawer), extrait du panneau
// au titre de la règle A7 (docs/PLAN-espace-admin.md) : tout lot qui touche un
// god-component en sort au moins un morceau.
//
// Rien d'autre n'a bougé : ce sont exactement les définitions qui vivaient en
// tête de CampaignsPanel.tsx.

import type nsAdminCampaigns from '@/lib/i18n/locales/admin-fr/adminCampaigns';

export type Dict = (typeof nsAdminCampaigns)['fr'];

export type CampaignStats = {
  totalSent: number;
  totalFailed: number;
  lastRunAt: string | null;
  runsCount: number;
};

export type CampaignSchedule = {
  waveSize: number;
  status: 'scheduled' | 'paused' | 'completed';
  lastWaveAt: string | null;
  totalRecipients: number;
  pending: number;
  sent: number;
  failed: number;
};

export type CampaignBody = {
  heading: string;
  greetingEnabled: boolean;
  bodyParagraphs: string[];
  ctaLabel: string | null;
  ctaUrl: string | null;
  footerNote: string | null;
  /** 'structured' (template assemblé) ou 'html' (corps rédigé à la main). */
  bodyFormat?: 'structured' | 'html';
  bodyHtml?: string | null;
};

export type CampaignSummary = {
  id: string;
  name: string;
  description: string;
  subject: string;
  status: 'active' | 'draft' | 'archived' | string;
  audience: string;
  source: 'builtin' | 'db';
  body: CampaignBody | null;
  stats: CampaignStats;
  schedule: CampaignSchedule | null;
};

export type DryRunResult = {
  totalConfirmedUsers: number;
  windowSize: number;
  withLabel: number;
  withoutLabel: number;
};

export type SendResult = {
  totalConfirmedUsers: number;
  windowSize: number;
  sent: number;
  failed: number;
  errors?: string[];
};

export function getAudienceLabels(t: Dict): Record<string, string> {
  return {
    'all-confirmed-users': t.audienceAllConfirmed,
    'team-captains': t.audienceTeamCaptains,
    'team-members': t.audienceTeamMembers,
    staff: t.audienceStaff,
    adherents: t.audienceAdherents,
    'tournament-never-logged-in': t.audienceTournamentNeverLoggedIn,
    'tournament-captains-incomplete-roster':
      t.audienceTournamentIncompleteRoster,
    'team-members-without-discord': t.audienceTeamMembersWithoutDiscord,
    'team-members-without-battletag': t.audienceTeamMembersWithoutBattleTag,
    'team-captains-managers': t.audienceTeamCaptainsManagers,
    'team-staff': t.audienceTeamStaff,
    newsletter: t.audienceNewsletter,
    'all-plus-newsletter': t.audienceAllPlusNewsletter,
    'adherents-plus-newsletter': t.audienceAdherentsPlusNewsletter,
  };
}

export function formatDateTime(iso: string | null) {
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
