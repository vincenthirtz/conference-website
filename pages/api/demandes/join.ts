// pages/api/demandes/join.ts
// API pour les demandes de rejoindre une equipe (sans etre capitaine)
// - POST : creer une demande pour rejoindre une equipe
// - GET : recuperer ses propres demandes de type "join"

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { findExclusiveMembership } from '@/utils/teams/memberships';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';
import {
  BATTLE_TAG_REGEX,
  roleRequiresBattleTag,
} from '@/utils/teams/roleKind';

import { logger } from '../../../utils/logger';
export type JoinRequestBody = {
  teamId: string;
  message?: string;
  desiredRole?: 'player' | 'substitute' | 'coach';
  /**
   * BattleTag saisi dans le formulaire. Facultatif dans le type parce que le
   * profil peut deja le porter : c'est la RESOLUTION plus bas (corps, puis
   * metadonnees) qui decide s'il en manque un.
   */
  battleTag?: string;
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

      // Verifier si l'utilisateur est deja membre d'une equipe.
      // « Membre » au sens de la base : un siège de MANAGER ne compte pas —
      // l'index unique partiel l'autorise à rejoindre une équipe comme
      // joueuse, ce serait incohérent de le refuser ici.
      const existingMember = await findExclusiveMembership(userId, tenantId);

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

      // BattleTag. Sans lui, la ligne de roster creee a l'approbation nait
      // vide (payload.user_battle_tag -> team_members.battle_tag) et la
      // joueuse decouvre ensuite un « BattleTag manquant » qu'elle croyait
      // avoir renseigne. Une inscription par Discord ne le demande jamais
      // (pages/auth/discord-member.tsx ne pose que `role`) : rejoindre un
      // roster est le dernier moment ou on peut l'exiger avant que le trou
      // n'existe. Meme regle que le lien d'auto-inscription
      // (api/teams/invite-links/by-token.ts) : exige des roles JOUANTS.
      const metaBattleTag =
        (typeof user.user_metadata?.battle_tag === 'string'
          ? user.user_metadata.battle_tag
          : ''
        ).trim() || null;
      const submittedBattleTag =
        (typeof body.battleTag === 'string' ? body.battleTag : '').trim() ||
        null;
      const battleTag = submittedBattleTag || metaBattleTag;

      if (battleTag && !BATTLE_TAG_REGEX.test(battleTag)) {
        return res.status(400).json({
          error: 'Format BattleTag invalide (ex: Pseudo#1234).',
          code: 'BATTLE_TAG_INVALID',
        });
      }

      if (!battleTag && roleRequiresBattleTag(desiredRole)) {
        return res.status(400).json({
          error: 'Ton BattleTag est necessaire pour rejoindre un roster.',
          code: 'BATTLE_TAG_REQUIRED',
        });
      }

      // Construire le payload
      const payload: Record<string, any> = {
        user_email: user.email,
        user_display_name:
          user.user_metadata?.display_name ||
          user.user_metadata?.full_name ||
          null,
        user_battle_tag: battleTag,
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

      // Le tag donne ici devient celui du profil : on ne le redemande pas a
      // l'ecran suivant, et /player/profile cesse de l'afficher vide. Best
      // effort — la demande est deja creee, une metadonnee non ecrite ne doit
      // pas la faire echouer.
      if (battleTag && battleTag !== metaBattleTag) {
        const { error: metaErr } =
          await supabaseAdmin.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...(user.user_metadata ?? {}),
              battle_tag: battleTag,
            },
          });
        if (metaErr) {
          logger.warn('[demandes/join] battle_tag metadata update:', metaErr);
        }
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
