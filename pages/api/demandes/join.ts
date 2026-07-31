// pages/api/demandes/join.ts
// API pour les demandes de rejoindre une equipe (sans etre capitaine)
// - POST : creer une demande pour rejoindre une equipe
// - GET : recuperer ses propres demandes de type "join"

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';

import { logger } from '../../../utils/logger';
export type JoinRequestBody = {
  teamId: string;
  message?: string;
  desiredRole?: 'player' | 'substitute' | 'coach';
};

export default withSubjectRoute(
  async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
    { user, subject }
  ) {
    if (
      applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'demandes-join')
    )
      return;

    // GET may be inspected by staff (`?as=`) ; the wrapper refuses `?as=` on
    // writes, so `userId` is always the caller in the write branch below.
    const { userId, tenantId } = subject;

    if (req.method === 'GET') {
      // Recuperer les demandes de type "join" de l'utilisateur
      const { data: demandes, error: demandesErr } = await supabaseAdmin
        .from('demandes')
        .select('*, team:teams!team_id(id, name, short_name, logo_url)')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .eq('type', 'join')
        .order('created_at', { ascending: false });

      if (demandesErr) {
        logger.error('[demandes/join] GET error:', demandesErr);
        return res.status(500).json({ error: 'Failed to load requests.' });
      }

      return res.status(200).json({ demandes: demandes || [] });
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
        return res
          .status(400)
          .json({ error: 'Message trop long (max 1000 caractères).' });
      }
      const message = rawMessage?.slice(0, 1000) || null;

      // Verifier que l'equipe existe et est rejoignable
      const { data: teamData, error: teamErr } = await supabaseAdmin
        .from('teams')
        .select('id, name, is_joinable')
        .eq('id', teamId)
        .eq('is_active', true)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (teamErr || !teamData) {
        return res
          .status(400)
          .json({ error: "L'equipe selectionnee n'existe pas." });
      }

      if (!teamData.is_joinable) {
        return res.status(400).json({
          error: "Cette equipe n'accepte pas les demandes pour le moment.",
        });
      }

      // Verifier si l'utilisateur est deja membre d'une equipe
      const { data: existingMember, error: memberErr } = await supabaseAdmin
        .from('team_members')
        .select('id, team_id')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (memberErr) {
        logger.error('[demandes/join] check member error:', memberErr);
      }

      if (existingMember) {
        return res.status(400).json({
          error:
            "Tu es deja membre d'une equipe. Quitte-la d'abord pour en rejoindre une autre.",
        });
      }

      // Verifier s'il existe deja une demande pending pour cette equipe
      const { data: existingDemande, error: existingErr } = await supabaseAdmin
        .from('demandes')
        .select('id, status, team_id')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .eq('type', 'join')
        .eq('status', 'pending')
        .maybeSingle();

      if (existingErr) {
        logger.error('[demandes/join] check existing error:', existingErr);
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
          error:
            "Tu as deja une demande en attente pour une autre equipe. Annule-la d'abord.",
          existingDemandeId: existingDemande.id,
        });
      }

      // Valider le role souhaite
      const rawRole = body.desiredRole?.trim().toLowerCase();
      const desiredRole =
        rawRole === 'substitute'
          ? 'substitute'
          : rawRole === 'coach'
            ? 'coach'
            : 'player';

      // Construire le payload
      const payload: Record<string, any> = {
        user_email: user.email,
        user_display_name:
          user.user_metadata?.display_name ||
          user.user_metadata?.full_name ||
          null,
        user_battle_tag: user.user_metadata?.battle_tag || null,
        team_name: teamData.name,
        desired_role: desiredRole,
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
          tenant_id: tenantId,
        })
        .select('*')
        .single();

      if (insertErr) {
        logger.error('[demandes/join] insert error:', insertErr);
        return res.status(500).json({ error: 'Failed to create request.' });
      }

      return res.status(201).json({
        success: true,
        demande: newDemande,
        message: `Ta demande pour rejoindre "${teamData.name}" a ete envoyee. Le capitaine de l'equipe la validera.`,
      });
    }

    res.setHeader('Allow', 'GET,POST');
    return res.status(405).json({ error: 'Method not allowed' });
  },
  { tenantResolution: 'async' }
);
