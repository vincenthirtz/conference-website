// pages/api/teams/update-member-specialty.ts
// PATCH : le capitaine ou un manager peut definir/effacer la specialite in-game
// d'un membre de son equipe (tank | dps | support | flex | null).
//
// Miroir de update-member-role.ts : meme middleware (withAuthRoute), meme
// resolution de tenant, meme controle d'acces (getManagedTeam), meme pattern
// de rate-limit. La specialite est purement cosmetique (carte publique) : pas
// d'anti-escalation a appliquer ici.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID, validateSpecialty } from '@/utils/apiHelpers';
import { withSubjectRoute } from '@/utils/subject';
import {
  getManagedTeam,
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';

import { logger } from '../../../utils/logger';

const ALLOWED_SPECIALTIES = new Set(['tank', 'dps', 'support', 'flex']);

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
        'update-member-specialty'
      )
    )
      return;

    // Sujet = l'appelant, ou le membre inspecté quand le staff agit à sa place
    // (`?as=…&act=1`, cf. utils/subject.ts). L'accès est donc résolu sur l'équipe
    // du SUJET : c'est tout l'intérêt — dépanner une capitaine bloquée.
    const { userId, tenantId } = subject;

    // Check if user can manage a team (captain or manager)
    const access = await getManagedTeam(userId, tenantId);
    if (!access) {
      return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
    }

    // Permission fine (R2) : le rôle doit couvrir `manage_roster` — un rôle
    // à privilèges partiels n'ouvre plus l'ensemble de la gestion d'équipe.
    const denied = assertTeamPermission(access, 'manage_roster');
    if (denied) return res.status(denied.status).json({ error: denied.error });

    const { data: managedTeam, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, name, captain_id')
      .eq('id', access.teamId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (teamErr || !managedTeam) {
      return res.status(404).json({ error: 'Team introuvable.' });
    }

    const { memberId } = req.body || {};
    const rawSpecialty = (req.body || {}).specialty;

    if (!memberId || typeof memberId !== 'string' || !isValidUUID(memberId)) {
      return res.status(400).json({ error: 'memberId invalide.' });
    }

    // `specialty` accepte une valeur de l'enum OU null (pour effacer). Tout le
    // reste (chaine inconnue, nombre, etc.) est rejete en 400 — on ne "corrige"
    // pas silencieusement vers null, contrairement au helper public de creation,
    // pour que le client soit averti d'une valeur erronee.
    let specialty: string | null;
    if (rawSpecialty === null || rawSpecialty === undefined) {
      specialty = null;
    } else if (
      typeof rawSpecialty === 'string' &&
      ALLOWED_SPECIALTIES.has(rawSpecialty.trim().toLowerCase())
    ) {
      specialty = validateSpecialty(rawSpecialty);
    } else {
      return res.status(400).json({
        error:
          'specialty invalide. Attendu : tank | dps | support | flex | null.',
      });
    }

    // Fetch the member to verify they belong to this team
    const { data: member, error: memberErr } = await supabaseAdmin
      .from('team_members')
      .select('id, user_id')
      .eq('id', memberId)
      .eq('team_id', managedTeam.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (memberErr || !member) {
      return res
        .status(404)
        .json({ error: 'Membre introuvable dans ton equipe.' });
    }

    // Seul le capitaine peut modifier sa propre ligne de membre. Le privilege du
    // capitaine vit dans teams.captain_id (et non dans son role de membre), donc
    // un manager qui cible la ligne du capitaine doit etre bloque ici (403).
    if (member.user_id === managedTeam.captain_id && !access.isCaptain) {
      return res.status(403).json({
        error: 'Seul le capitaine peut modifier sa propre ligne de membre.',
      });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('team_members')
      .update({ specialty })
      .eq('id', memberId)
      .eq('team_id', managedTeam.id)
      .eq('tenant_id', tenantId);

    if (updateErr) {
      logger.error('[update-member-specialty] error:', updateErr);
      return res
        .status(500)
        .json({ error: 'Echec de la mise a jour de la specialite.' });
    }

    return res.status(200).json({
      success: true,
      memberId,
      specialty,
      message: specialty
        ? `Specialite mise a jour vers "${specialty}".`
        : 'Specialite effacee.',
    });
  },
  { tenantResolution: 'async', allowActAs: true }
);
