// Route cote utilisateur (capitaine ou manager) via withAuthRoute, pas une
// route staff. Le GET délègue à `loadManagedTeamSlice` (helper serveur partagé
// avec /api/player/dashboard) : source de vérité UNIQUE pour « mon équipe /
// suis-je capitaine ». La route est désormais scopée tenant (via
// resolveTenantIdForUserRequest), ce qui corrige l'ancien bug S5c où
// getManagedTeam était appelé sans tenantId et les queries non scopées.
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { sanitizeUrl } from '@/utils/apiHelpers';
import { withSubjectRoute } from '@/utils/subject';
import {
  assertTeamPermission,
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import type { TeamPermission } from '@/utils/teamRoles';
import {
  loadManagedTeamSlice,
  type ManagedTeamSummary,
} from '@/utils/teams/managedTeamSlice';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import {
  SKILL_RATING_MAX,
  SKILL_RATING_MIN,
  isValidSkillRating,
} from '@/utils/overwatchRank';

import { logger } from '../../../../utils/logger';
type MemberRow = {
  id: string;
  user_id: string | null;
  role: string | null;
  /** Pseudo affichable — l'encadrement n'a pas forcément de BattleTag. */
  display_name: string | null;
  battle_tag: string | null;
  battle_tag_verified_at: string | null;
  specialty: string | null;
  /** SR Overwatch déclaré (cf. utils/overwatchRank.ts), `null` si non renseigné. */
  skill_rating: number | null;
  is_substitute: boolean;
  captain?: boolean | null;
  is_captain?: boolean | null;
};

type TeamRow = {
  id: string;
  slug: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  /** SR d'ensemble déclaré (cf. utils/overwatchRank.ts), null si non déclaré. */
  skill_rating?: number | null;
  country: string | null;
  description: string | null;
};

type GetResponse = {
  team: TeamRow | null;
  members: MemberRow[];
  isCaptain: boolean;
  isManager: boolean;
  /**
   * Permissions EFFECTIVES de l'appelant sur `team`. Le client en a besoin
   * pour n'afficher que les gestes qu'il pourra réellement faire : avec les
   * seuls `isCaptain` / `isManager`, un coach voyait tout l'écran de gestion
   * et se prenait un 403 à chaque bouton.
   */
  permissions?: TeamPermission[];
  /**
   * Toutes les équipes gérées par l'appelant, `team` comprise — le sélecteur
   * d'équipe du cockpit s'y branche. Un seul élément dans le cas courant.
   *
   * Absent de la réponse du PATCH, qui ne renvoie que l'équipe modifiée (comme
   * `members`, déjà vide dans ce cas) : la liste ne change pas au fil d'une
   * édition d'infos, le client garde la sienne.
   */
  managedTeams?: ManagedTeamSummary[];
};

type UpdateBody = {
  teamId: string;
  name?: string;
  short_name?: string | null;
  logo_url?: string | null;
  country?: string | null;
  description?: string | null;
  discord?: string | null;
  website?: string | null;
  /**
   * SR d'ensemble déclaré (0-5000). `null` / chaîne vide effacent ; l'absence
   * de clé ne touche à rien. Court-circuite la moyenne des fiches à
   * l'affichage — cf. `resolveTeamSkillRating`.
   */
  skill_rating?: number | string | null;
};

export default withSubjectRoute(
  async function handler(
    req: NextApiRequest,
    res: NextApiResponse<GetResponse | { error: string }>,
    { user, subject }
  ) {
    if (
      applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-teams-my')
    )
      return;

    // GET inspectable par le staff (`?as=`) ; le PATCH plus bas reste
    // strictement l'affaire de l'appelant (le wrapper refuse `?as=` en écriture,
    // faute d'`allowActAs` — d'où `subject.userId === user.id` garanti côté
    // écriture).
    const userId = user.id;
    const tenantId = subject.tenantId;

    if (req.method === 'GET') {
      // `?teamId=` désigne l'équipe voulue quand l'appelant en gère plusieurs
      // (manager multi-équipes). Ignoré s'il n'y a pas droit — le helper
      // retombe alors sur sa première équipe gérée.
      const slice = await loadManagedTeamSlice(
        subject.userId,
        subject.tenantId,
        { teamId: readRequestedTeamId(req) }
      );

      // Payload public inchangé en forme : { team, members, isCaptain, isManager }.
      // La tranche renvoyée par le helper est un surensemble (team.captain_id /
      // open_for_scrim, member.battle_tag_verified_at / captain / is_captain,
      // et `managedTeams` pour le sélecteur) — ajouts additifs, non cassants
      // pour les consommateurs existants.
      return res.status(200).json({
        team: slice.team,
        members: slice.members,
        isCaptain: slice.isCaptain,
        isManager: slice.isManager,
        permissions: slice.permissions,
        managedTeams: slice.managedTeams,
      });
    }

    if (req.method === 'PATCH') {
      const body = req.body as UpdateBody;
      if (!body?.teamId) {
        return res.status(400).json({ error: 'teamId required.' });
      }

      // Vérifier que l'utilisateur peut gérer CETTE team (capitaine ou
      // manager). L'accès est résolu sur `body.teamId` : un manager peut en
      // gérer plusieurs, « sa » team ne veut plus rien dire.
      //
      // Scopé au tenant de l'appelant : l'appel passait `undefined`, donc
      // DEFAULT_TENANT_ID — le même bug S5c que le GET a corrigé de son côté.
      // Hors tenant par défaut, PERSONNE ne pouvait éditer les infos de son
      // équipe (403 systématique).
      const access = await getManagedTeam(userId, tenantId, body.teamId);
      if (!access || access.teamId !== body.teamId) {
        return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
      }

      // Permission fine (R2), qui manquait ici : cette route écrit le nom, le
      // logo, la description et le SR de l'équipe — c'est exactement
      // `manage_team_info`. Sans ce contrôle, tout rôle accordant AU MOINS UNE
      // permission (un coach, qui n'a que les scrims et la feuille de match)
      // pouvait renommer l'équipe.
      const denied = assertTeamPermission(access, 'manage_team_info');
      if (denied)
        return res.status(denied.status).json({ error: denied.error });

      const { data: teamData, error: teamErr } = await supabaseAdmin
        .from('teams')
        .select('captain_id')
        .eq('id', body.teamId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (teamErr || !teamData) {
        return res.status(404).json({ error: 'Team not found.' });
      }

      // Validations
      if (typeof body.name === 'string') {
        const trimmed = body.name.trim();
        if (trimmed.length < 2 || trimmed.length > 100) {
          return res
            .status(400)
            .json({ error: 'Le nom doit faire entre 2 et 100 caractères.' });
        }
      }

      // Bornes du sigle et du pays. Elles manquaient — ni ici ni à la création
      // d'équipe — parce que ces deux champs n'étaient saisis que par le staff.
      // Ils sont désormais offerts à l'encadrement de l'équipe : un champ libre
      // sans borne dans un formulaire public finit toujours par recevoir un
      // paragraphe. 16 et non 12 : un sigle existant fait déjà 13 caractères,
      // et une validation qui refuse des données en place est un piège.
      if (
        'short_name' in body &&
        body.short_name &&
        body.short_name.trim().length > 16
      ) {
        return res
          .status(400)
          .json({ error: 'Le sigle ne peut pas dépasser 16 caractères.' });
      }

      if ('country' in body && body.country && body.country.trim().length > 56) {
        return res
          .status(400)
          .json({ error: 'Le pays ne peut pas dépasser 56 caractères.' });
      }

      if (
        'description' in body &&
        body.description &&
        body.description.length > 2000
      ) {
        return res.status(400).json({
          error: 'La description ne peut pas dépasser 2000 caractères.',
        });
      }

      // Valider les URLs
      // SR d'ensemble : mêmes bornes et même contrat que le SR par joueuse.
      let skillRating: number | null = null;
      if ('skill_rating' in body) {
        const raw = body.skill_rating;
        if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
          skillRating = null;
        } else {
          const parsed = typeof raw === 'string' ? Number(raw.trim()) : raw;
          if (!isValidSkillRating(parsed)) {
            return res.status(400).json({
              error: `Le SR d'équipe doit être un entier entre ${SKILL_RATING_MIN} et ${SKILL_RATING_MAX}.`,
            });
          }
          skillRating = parsed;
        }
      }

      const urlFields = ['logo_url', 'website', 'discord'] as const;
      for (const field of urlFields) {
        if (field in body && body[field]) {
          const safe = sanitizeUrl(body[field] as string);
          if (!safe) {
            return res
              .status(400)
              .json({ error: `${field} doit être une URL http(s) valide.` });
          }
        }
      }

      const updatePayload: Record<string, any> = {};
      if (typeof body.name === 'string') updatePayload.name = body.name.trim();
      if ('short_name' in body)
        updatePayload.short_name = body.short_name?.trim() || null;
      if ('logo_url' in body)
        updatePayload.logo_url = body.logo_url
          ? sanitizeUrl(body.logo_url)
          : null;
      if ('country' in body) updatePayload.country = body.country || null;
      if ('description' in body)
        updatePayload.description = body.description || null;
      if ('discord' in body)
        updatePayload.discord = body.discord ? sanitizeUrl(body.discord) : null;
      if ('website' in body)
        updatePayload.website = body.website ? sanitizeUrl(body.website) : null;

      if ('skill_rating' in body) updatePayload.skill_rating = skillRating;

      updatePayload.updated_at = new Date().toISOString();

      const { data: updatedTeam, error: updateErr } = await supabaseAdmin
        .from('teams')
        .update(updatePayload)
        .eq('id', body.teamId)
        .eq('tenant_id', tenantId)
        .select('*')
        .maybeSingle();

      if (updateErr) {
        logger.error('[teams/my] update error:', updateErr);
        return res.status(500).json({ error: 'Failed to update team.' });
      }

      return res.status(200).json({
        team: updatedTeam,
        members: [],
        isCaptain: access.isCaptain,
        isManager: access.isManager,
      });
    }

    res.setHeader('Allow', 'GET,PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  },
  { auditAction: 'view_captain_data' }
);
