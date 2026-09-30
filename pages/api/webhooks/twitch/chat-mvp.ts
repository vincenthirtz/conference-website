// POST /api/webhooks/twitch/chat-mvp — les « !mvp » du chat Twitch, comptés
// CÔTÉ SERVEUR pour le vote « coup de cœur du public ».
//
// POURQUOI. Le chat n'était lu que par le cockpit caster, dans un onglet du
// navigateur : fermé ou jamais ouvert, aucun vote Twitch ne comptait. EventSub
// `channel.chat.message` (transport webhook) livre ici le chat de la chaîne
// connectée, PENDANT qu'un vote est ouvert seulement
// (utils/twitch/chatVoteSubscription.ts : abonné à l'ouverture, désabonné à la
// clôture).
//
// UN MESSAGE SUR MILLE EST UN VOTE. La route tranche donc AVANT toute requête
// en base : un message qui n'est pas `!mvp …` repart aussitôt en 200.
//
// MÊME CLÉ DE VOTANT QUE LE COCKPIT (login Twitch en minuscules) : si le
// cockpit est ouvert en même temps, les deux chemins écrivent la MÊME voix
// (upsert, dernière voix gagnante) — aucun double compte.
//
// ACQUITTER LARGEMENT (cf. la route des alertes) : tout ce qui est signé mais
// inexploitable repart en 200, sinon Twitch retente puis désactive
// l'abonnement. Une panne de base demande un réessai.

import type { NextApiRequest, NextApiResponse } from 'next';
import * as z from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  EVENTSUB_SECRET_ENV,
  verifyEventSubRequest,
} from '@/utils/twitch/eventsubRequest';
import { removeChatVoteSubscription } from '@/utils/twitch/chatVoteSubscription';
import {
  parseMvpCommand,
  resolveChatCandidate,
} from '@/utils/mvp/twitchChatVote';
import { listMvpCandidates } from '@/utils/mvp/service';
import { castPublicVotes } from '@/utils/mvp/publicVote';

/** Le corps doit rester brut : la signature couvre les octets reçus. */
export const config = { api: { bodyParser: false } };

const VerificationSchema = z.object({ challenge: z.string().min(1) });

const ChatEventSchema = z.object({
  subscription: z.object({ type: z.string() }),
  event: z.object({
    broadcaster_user_id: z.string().min(1),
    chatter_user_login: z.string().min(1),
    message: z.object({ text: z.string() }),
  }),
});

/**
 * Dernière vérification « aucun vote ouvert » par chaîne, dans CETTE instance :
 * un chat qui continue de parler après une fenêtre échue ne doit pas coûter une
 * requête par message pour constater qu'il n'y a plus rien à compter.
 */
const idleCheckedAt = new Map<string, number>();
const IDLE_CHECK_MS = 60_000;

async function tenantOf(broadcasterId: string) {
  const { data, error } = await supabaseAdmin
    .from('twitch_broadcaster_connections')
    .select('tenant_id')
    .eq('broadcaster_id', broadcasterId)
    .maybeSingle();
  if (error) return undefined;
  return (data?.tenant_id as string | undefined) ?? null;
}

async function openPollOf(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from('match_public_mvp_polls')
    .select('match_id, candidate_member_ids')
    .eq('tenant_id', tenantId)
    .is('closed_at', null)
    .gt('closes_at', new Date().toISOString())
    .order('opened_at', { ascending: false })
    .limit(1);
  if (error) return undefined;
  return data?.[0] ?? null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res
      .status(405)
      .json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  const verified = await verifyEventSubRequest(req, {
    secret: process.env[EVENTSUB_SECRET_ENV],
  });
  if (!verified.ok) {
    return res
      .status(verified.status)
      .json({ error: verified.error, code: verified.code });
  }
  if (verified.messageType === null) {
    return res.status(200).json({ ok: true, status: 'ignored_message_type' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(verified.rawBody.toString('utf8'));
  } catch {
    return res
      .status(400)
      .json({ error: 'Invalid JSON', code: 'INVALID_JSON' });
  }

  if (verified.messageType === 'webhook_callback_verification') {
    const parsed = VerificationSchema.safeParse(payload);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid challenge', code: 'INVALID_CHALLENGE' });
    }
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(parsed.data.challenge);
  }

  if (verified.messageType === 'revocation') {
    logger.warn('[twitch/chat-mvp] abonnement au chat révoqué');
    return res.status(200).json({ ok: true, status: 'revoked' });
  }

  const parsed = ChatEventSchema.safeParse(payload);
  if (!parsed.success) {
    return res.status(200).json({ ok: true, status: 'ignored_payload' });
  }
  const { broadcaster_user_id: broadcasterId, chatter_user_login: login } =
    parsed.data.event;
  const arg = parseMvpCommand(parsed.data.event.message.text);

  if (!arg) {
    // Pas un vote. Au plus une fois par minute et par chaîne, on vérifie
    // qu'un vote est encore ouvert — sinon on se désabonne du chat.
    const last = idleCheckedAt.get(broadcasterId) ?? 0;
    if (Date.now() - last > IDLE_CHECK_MS) {
      idleCheckedAt.set(broadcasterId, Date.now());
      const tenantId = await tenantOf(broadcasterId);
      if (tenantId && (await openPollOf(tenantId)) === null) {
        await removeChatVoteSubscription({ broadcasterId });
      }
    }
    return res.status(200).json({ ok: true, status: 'not_a_vote' });
  }

  const tenantId = await tenantOf(broadcasterId);
  if (tenantId === undefined) {
    res.setHeader('Retry-After', '30');
    return res
      .status(503)
      .json({ error: 'Channel lookup failed', code: 'CHANNEL_LOOKUP_FAILED' });
  }
  if (tenantId === null) {
    return res.status(200).json({ ok: true, status: 'unknown_channel' });
  }

  const poll = await openPollOf(tenantId);
  if (poll === undefined) {
    res.setHeader('Retry-After', '30');
    return res.status(503).json({ error: 'Read failed', code: 'READ_FAILED' });
  }
  if (poll === null) {
    await removeChatVoteSubscription({ broadcasterId });
    return res.status(200).json({ ok: true, status: 'no_open_vote' });
  }

  const matchId = poll.match_id as string;
  const { candidates } = await listMvpCandidates(tenantId, matchId);
  // ORDRE FIGÉ du scrutin : c'est lui que désignent les numéros (`!mvp 2`).
  const frozen = (poll.candidate_member_ids as string[] | null) ?? [];
  const byId = new Map(candidates.map((c) => [c.memberId, c]));
  const ordered = (
    frozen.length > 0 ? frozen : candidates.map((c) => c.memberId)
  )
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c);

  const memberId = resolveChatCandidate(ordered, arg);
  if (!memberId) {
    return res.status(200).json({ ok: true, status: 'unknown_candidate' });
  }

  const result = await castPublicVotes(tenantId, matchId, 'twitch', [
    { voterKey: login.toLowerCase(), memberId },
  ]);
  return res
    .status(200)
    .json({ ok: true, status: result.accepted > 0 ? 'counted' : 'rejected' });
}
