// pages/api/teams/join-requests.ts
// API pour le capitaine : gerer les demandes de joueurs voulant rejoindre son equipe
// - GET  : lister les demandes pending pour son equipe
// - POST : approuver ou rejeter une demande (ajoute le membre si approved)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID, validateRole } from '@/utils/apiHelpers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'join-requests')) return;
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  // Auth via Bearer token
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Token required.' });
  }

  const { data: userData, error: userErr } =
    await supabaseAdmin.auth.getUser(token);

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const userId = userData.user.id;

  // Check if user is captain of a team
  const { data: captainTeam, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name, logo_url')
    .eq('captain_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (teamErr || !captainTeam) {
    return res.status(403).json({ error: 'Tu dois etre capitaine d\'une equipe active.' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, captainTeam.id);
  }

  if (req.method === 'POST') {
    return handlePost(req, res, captainTeam, userId);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string
) {
  const statusFilter = req.query.status as string | undefined;

  let query = supabaseAdmin!
    .from('demandes')
    .select('*')
    .eq('team_id', teamId)
    .eq('type', 'join')
    .order('created_at', { ascending: false });

  if (statusFilter && ['pending', 'approved', 'rejected', 'cancelled'].includes(statusFilter)) {
    query = query.eq('status', statusFilter);
  } else {
    // Default: show pending
    query = query.eq('status', 'pending');
  }

  const { data: demandes, error: demandesErr } = await query;

  if (demandesErr) {
    console.error('[join-requests] GET error:', demandesErr);
    return res.status(500).json({ error: 'Echec du chargement des demandes.' });
  }

  // Enrich with user info
  const enriched = await Promise.all(
    (demandes || []).map(async (d: any) => {
      let userInfo = null;
      if (d.user_id) {
        try {
          const { data: u } = await supabaseAdmin!.auth.admin.getUserById(d.user_id);
          if (u?.user) {
            const meta = u.user.user_metadata ?? {};
            userInfo = {
              id: d.user_id,
              email: u.user.email || null,
              display_name: meta.display_name || meta.full_name || null,
              battle_tag: meta.battle_tag || null,
            };
          }
        } catch {
          // skip
        }
      }
      return {
        id: d.id,
        user_id: d.user_id,
        status: d.status,
        comment: d.comment,
        payload: d.payload,
        created_at: d.created_at,
        user: userInfo,
      };
    })
  );

  return res.status(200).json({ demandes: enriched });
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  captainTeam: { id: string; name: string; logo_url: string | null },
  captainUserId: string
) {
  const { demandeId, action } = req.body || {};

  if (!demandeId || typeof demandeId !== 'string' || !isValidUUID(demandeId)) {
    return res.status(400).json({ error: 'demandeId invalide.' });
  }

  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ error: 'Action invalide. Utilise "approve" ou "reject".' });
  }

  // Fetch the demande and verify it belongs to this team
  const { data: demande, error: fetchErr } = await supabaseAdmin!
    .from('demandes')
    .select('*')
    .eq('id', demandeId)
    .eq('team_id', captainTeam.id)
    .eq('type', 'join')
    .eq('status', 'pending')
    .maybeSingle();

  if (fetchErr || !demande) {
    return res.status(404).json({ error: 'Demande introuvable ou deja traitee.' });
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  // If approving, add the player to team_members
  if (action === 'approve') {
    // Check max_players limit
    const [{ count: currentMemberCount }, { data: teamTournaments }] = await Promise.all([
      supabaseAdmin!
        .from('team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', captainTeam.id),
      supabaseAdmin!
        .from('tournament_teams')
        .select('tournament_id, tournaments!inner(max_players)')
        .eq('team_id', captainTeam.id),
    ]);

    if (teamTournaments && teamTournaments.length > 0) {
      for (const tt of teamTournaments) {
        const maxPlayers = (tt as any).tournaments?.max_players;
        if (maxPlayers && (currentMemberCount ?? 0) >= maxPlayers) {
          return res.status(400).json({
            error: `L'equipe a atteint la limite de ${maxPlayers} joueur(s) imposee par un tournoi.`,
          });
        }
      }
    }

    // Determine role from payload
    const desiredRole = validateRole((demande.payload as any)?.desired_role);
    const battleTag = (demande.payload as any)?.user_battle_tag || null;

    const { error: insertErr } = await supabaseAdmin!
      .from('team_members')
      .insert({
        team_id: captainTeam.id,
        user_id: demande.user_id,
        role: desiredRole,
        battle_tag: battleTag,
      });

    if (insertErr) {
      const msg =
        insertErr.message?.includes('duplicate') || insertErr.message?.includes('unique')
          ? 'Ce joueur est deja dans une equipe.'
          : 'Echec de l\'ajout du membre.';
      return res.status(400).json({ error: msg });
    }

    // Auto news
    try {
      const playerName = battleTag?.split('#')[0] || (demande.payload as any)?.user_display_name || 'Joueur';
      const newsSlug = `team-${captainTeam.id}-join-${Date.now().toString(36)}`;
      await supabaseAdmin!.from('news').insert({
        title: `${playerName} rejoint ${captainTeam.name}`,
        slug: newsSlug,
        tag: 'teams',
        excerpt: `${playerName} rejoint ${captainTeam.name} en tant que ${desiredRole}.`,
        content: `${playerName} a rejoint ${captainTeam.name} en tant que ${desiredRole}. Bienvenue !`,
        image_url: captainTeam.logo_url ?? null,
        status: 'published',
        published_at: new Date().toISOString(),
      });
    } catch (newsErr) {
      console.error('[join-requests] create news error:', newsErr);
    }
  }

  // Update demande status
  const { error: updateErr } = await supabaseAdmin!
    .from('demandes')
    .update({
      status: newStatus,
      processed_at: new Date().toISOString(),
      staff_note: `Traite par le capitaine (${captainUserId})`,
    })
    .eq('id', demandeId);

  if (updateErr) {
    console.error('[join-requests] update error:', updateErr);
    return res.status(500).json({ error: 'Echec de la mise a jour de la demande.' });
  }

  return res.status(200).json({
    success: true,
    demandeId,
    newStatus,
    message: action === 'approve'
      ? 'Joueur accepte et ajoute a l\'equipe.'
      : 'Demande rejetee.',
  });
}
