// pages/api/teams/update-member-role.ts
// PATCH : le capitaine peut changer le role d'un membre de son equipe
// - player <-> substitute : sans limite
// - coach : groupe separe, pas de limite de nombre

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { withSubjectRoute } from '@/utils/subject';
import {
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { getManagedTeamForRequest } from '@/utils/teams/teamScope';
import {
  TEAM_ROLE_VALUES,
  loadTeamRolesFromSupabase,
  roleHasAnyPermission,
} from '@/utils/teamRoles';

import { logger } from '../../../utils/logger';

// Roles acceptes par cet endpoint. On REJETTE toute valeur inconnue en 400
// plutot que de la corriger silencieusement vers 'player' (ce que ferait le
// helper partage validateRole, conserve pour les appelants comme
// create-with-member qui s'appuient sur sa coercition).
const ALLOWED_ROLES: ReadonlySet<string> = new Set(TEAM_ROLE_VALUES);
export default withSubjectRoute(
  async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
    { subject }
  ) {
    if (req.method !== 'PATCH') {
      res.setHeader('Allow', 'PATCH');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (
      applyRateLimit(
        req,
        res,
        { max: 30, windowMs: 60_000 },
        'update-member-role'
      )
    )
      return;

    // Sujet = l'appelant, ou le membre inspecté quand le staff agit à sa place
    // (`?as=…&act=1`, cf. utils/subject.ts). L'accès est donc résolu sur l'équipe
    // du SUJET : c'est tout l'intérêt — dépanner une capitaine bloquée.
    const { userId, tenantId } = subject;

    // Check if user can manage a team (captain or manager)
    const access = await getManagedTeamForRequest(req, userId, tenantId);
    if (!access) {
      return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
    }

    // Permission fine (R2) : le rôle doit couvrir `manage_roster` — un rôle
    // à privilèges partiels n'ouvre plus l'ensemble de la gestion d'équipe.
    const denied = assertTeamPermission(access, 'manage_roster');
    if (denied) return res.status(denied.status).json({ error: denied.error });

    const { data: captainTeam, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, name, captain_id')
      .eq('id', access.teamId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (teamErr || !captainTeam) {
      return res.status(404).json({ error: 'Team introuvable.' });
    }

    const { memberId, role } = req.body || {};

    if (!memberId || typeof memberId !== 'string' || !isValidUUID(memberId)) {
      return res.status(400).json({ error: 'memberId invalide.' });
    }

    if (!role || typeof role !== 'string') {
      return res.status(400).json({ error: 'role requis.' });
    }

    // Validation stricte au niveau de l'endpoint : une valeur inconnue est
    // rejetee (400) au lieu d'etre coercee silencieusement vers 'player' (ce qui
    // demoterait un membre sur une simple faute de frappe du capitaine).
    const newRole = role.trim().toLowerCase();
    if (!ALLOWED_ROLES.has(newRole)) {
      return res.status(400).json({
        error:
          'role invalide. Attendu : player | coach | substitute | manager.',
      });
    }

    const teamRoles = await loadTeamRolesFromSupabase(supabaseAdmin);

    // ACCORDER un rôle privilégié est ouvert à qui gère l'équipe — capitaine
    // OU manager (décision produit du 2026-08-20).
    //
    // Pourquoi c'était réservé au capitaine, et pourquoi ça ne tient plus :
    // la règle supposait qu'une équipe a toujours un capitaine à qui déléguer.
    // Depuis les équipes créées PAR UN MANAGER, `teams.captain_id` reste NULL
    // tant que la capitaine désignée n'a pas accepté — personne ne pouvait
    // donc promouvoir qui que ce soit pendant ce temps. Et l'autre chemin
    // contredisait déjà la règle : POST /api/teams/add-member laisse un
    // manager ajouter un NOUVEAU membre directement avec le rôle `manager`.
    // Interdire la promotion d'une joueuse déjà présente ne protégeait donc
    // rien — ça obligeait juste à passer par le détour « retirer puis
    // rajouter ».
    //
    // L'asymétrie qui suit est DÉLIBÉRÉE : accorder un rôle privilégié est une
    // délégation, retirer ou dégrader un pair est un conflit. Le second reste
    // réservé au capitaine (ici comme dans DELETE /api/teams/[teamId]/members)
    // pour que deux managers ne puissent pas se destituer l'un l'autre.
    //
    // `captain` n'est toujours pas accordable par cette route : le capitanat
    // vit dans `teams.captain_id`, et passe par transfer-captain.
    //
    // Aucune garde supplémentaire ici : `manage_roster` est déjà exigé plus
    // haut, et c'est exactement la permission que suppose le geste.

    // Fetch the member to verify they belong to this team
    const { data: member, error: memberErr } = await supabaseAdmin
      .from('team_members')
      .select('id, user_id, role, is_substitute')
      .eq('id', memberId)
      .eq('team_id', captainTeam.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (memberErr || !member) {
      return res
        .status(404)
        .json({ error: 'Membre introuvable dans ton equipe.' });
    }

    // Captain cannot change their own role
    if (member.user_id === userId) {
      return res
        .status(400)
        .json({ error: 'Tu ne peux pas changer ton propre role.' });
    }

    // Seul le capitaine peut modifier sa propre ligne de membre. Le privilege du
    // capitaine vit dans teams.captain_id (et non dans son role de membre), donc
    // un manager qui cible la ligne du capitaine doit etre bloque ici (403).
    if (member.user_id === captainTeam.captain_id && !access.isCaptain) {
      return res.status(403).json({
        error: 'Seul le capitaine peut modifier sa propre ligne de membre.',
      });
    }

    // Anti-escalation : un membre privilegie ne peut etre degrade que par le
    // capitaine.
    if (roleHasAnyPermission(teamRoles, member.role) && !access.isCaptain) {
      return res.status(403).json({
        error:
          "Seul le capitaine peut modifier le rôle d'un membre privilégié.",
      });
    }

    // Update role and is_substitute flag accordingly
    const isSubstitute = newRole === 'substitute';

    const { error: updateErr } = await supabaseAdmin
      .from('team_members')
      .update({ role: newRole, is_substitute: isSubstitute })
      .eq('id', memberId)
      .eq('team_id', captainTeam.id)
      .eq('tenant_id', tenantId);

    if (updateErr) {
      logger.error('[update-member-role] error:', updateErr);
      // Trigger PG enforce_team_max_players : passer un coach en non-coach peut
      // depasser max_players. On renvoie un message metier clair.
      const errMsg = updateErr.message?.toLowerCase() || '';
      if (updateErr.code === '23514' || errMsg.includes('max_players')) {
        return res.status(400).json({
          error:
            "L'equipe a atteint la limite de joueur(s) imposee par un tournoi : impossible de basculer ce coach en role joueur.",
        });
      }
      return res
        .status(500)
        .json({ error: 'Echec de la mise a jour du role.' });
    }

    return res.status(200).json({
      success: true,
      memberId,
      newRole,
      isSubstitute,
      message: `Role mis a jour vers "${newRole}".`,
    });
  },
  { tenantResolution: 'async', allowActAs: true }
);
