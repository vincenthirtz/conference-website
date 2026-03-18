// pages/api/demandes/join.ts
// API pour les demandes de rejoindre une equipe (sans etre capitaine)
// - POST : creer une demande pour rejoindre une equipe
// - GET : recuperer ses propres demandes de type "join"

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';

export type JoinRequestBody = {
  teamId: string;
  message?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'demandes-join')) return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database not configured (missing service role).' });
  }

  // Authentification via Bearer token
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

  const user = userData.user;
  const userId = user.id;

  if (req.method === 'GET') {
    // Recuperer les demandes de type "join" de l'utilisateur
    const { data: demandes, error: demandesErr } = await supabaseAdmin
      .from('demandes')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'join')
      .order('created_at', { ascending: false });

    if (demandesErr) {
      console.error('[demandes/join] GET error:', demandesErr);
      return res
        .status(500)
        .json({ error: 'Failed to load requests.' });
    }

    // Enrichir avec les infos d'equipe si team_id present
    const enrichedDemandes = await Promise.all(
      (demandes || []).map(async (d) => {
        if (d.team_id && supabaseAdmin) {
          const { data: teamData } = await supabaseAdmin
            .from('teams')
            .select('id, name, short_name, logo_url')
            .eq('id', d.team_id)
            .maybeSingle();
          return { ...d, team: teamData };
        }
        return { ...d, team: null };
      })
    );

    return res.status(200).json({ demandes: enrichedDemandes });
  }

  if (req.method === 'POST') {
    const body = req.body as JoinRequestBody;

    if (!body?.teamId?.trim()) {
      return res.status(400).json({
        error: 'Selectionne une equipe a rejoindre.',
      });
    }

    const teamId = body.teamId.trim();
    const rawMessage = body.message?.trim() || null;
    if (rawMessage && rawMessage.length > 1000) {
      return res.status(400).json({ error: 'Message trop long (max 1000 caractères).' });
    }
    const message = rawMessage?.slice(0, 1000) || null;

    // Verifier que l'equipe existe
    const { data: teamData, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .eq('id', teamId)
      .maybeSingle();

    if (teamErr || !teamData) {
      return res.status(400).json({ error: "L'equipe selectionnee n'existe pas." });
    }

    // Verifier si l'utilisateur est deja membre d'une equipe
    const { data: existingMember, error: memberErr } = await supabaseAdmin
      .from('team_members')
      .select('id, team_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (memberErr) {
      console.error('[demandes/join] check member error:', memberErr);
    }

    if (existingMember) {
      return res.status(400).json({
        error: 'Tu es deja membre d\'une equipe. Quitte-la d\'abord pour en rejoindre une autre.',
      });
    }

    // Verifier s'il existe deja une demande pending pour cette equipe
    const { data: existingDemande, error: existingErr } = await supabaseAdmin
      .from('demandes')
      .select('id, status, team_id')
      .eq('user_id', userId)
      .eq('type', 'join')
      .eq('status', 'pending')
      .maybeSingle();

    if (existingErr) {
      console.error('[demandes/join] check existing error:', existingErr);
      return res.status(500).json({ error: 'Verification error.' });
    }

    if (existingDemande) {
      if (existingDemande.team_id === teamId) {
        return res.status(400).json({
          error: 'Tu as deja une demande en attente pour cette equipe.',
          existingDemandeId: existingDemande.id,
        });
      }
      return res.status(400).json({
        error: 'Tu as deja une demande en attente pour une autre equipe. Annule-la d\'abord.',
        existingDemandeId: existingDemande.id,
      });
    }

    // Construire le payload
    const payload: Record<string, any> = {
      user_email: user.email,
      user_display_name:
        user.user_metadata?.display_name ||
        user.user_metadata?.full_name ||
        null,
      user_battle_tag: user.user_metadata?.battle_tag || null,
      team_name: teamData.name,
    };

    // Creer la demande
    const { data: newDemande, error: insertErr } = await supabaseAdmin
      .from('demandes')
      .insert({
        user_id: userId,
        team_id: teamId,
        type: 'join',
        status: 'pending',
        comment: message,
        source: 'website',
        payload,
      })
      .select('*')
      .single();

    if (insertErr) {
      console.error('[demandes/join] insert error:', insertErr);
      return res
        .status(500)
        .json({ error: 'Failed to create request.' });
    }

    return res.status(201).json({
      success: true,
      demande: newDemande,
      message: `Ta demande pour rejoindre "${teamData.name}" a ete envoyee. Le capitaine de l'equipe la validera.`,
    });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
