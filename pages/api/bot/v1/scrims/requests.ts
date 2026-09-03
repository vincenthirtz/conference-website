// pages/api/bot/v1/scrims/requests.ts
//
// POST — répondre à une demande de scrim depuis Discord.
//
// Pendant de `/api/teams/scrim-requests` (POST) pour le bot : même cœur métier
// (`utils/teams/scrimRequestActions.ts`), donc accepter depuis un message privé
// fait exactement ce qu'accepter depuis le site fait — même scrim draft, même
// `agreed_slot`, mêmes notifications.
//
// CE QUI CHANGE, C'EST L'AUTORISATION. Le site l'obtient de la session ; ici
// elle part de l'identifiant Discord de l'actrice :
//
//   discord_user_id → user_discord_links → auth user → équipes gérées
//   → celle qui participe à cette demande → permission `manage_scrims`.
//
// La résolution PAR LA DEMANDE et non par un teamId fourni est délibérée : le
// bouton du DM ne transporte que l'identifiant de la demande, et laisser
// l'appelant nommer son équipe ouvrirait la porte à répondre pour une autre.
//
// DEUXIÈME CHEMIN : LE STAFF. Une demande de scrim sans réponse bloque les deux
// équipes, et une capitaine injoignable ne doit pas geler le calendrier. Un
// admin/owner peut donc trancher depuis le salon d'actions du bot. Il agit AU
// NOM de l'équipe dont c'est le tour — celle qui n'a pas proposé — parce que
// c'est la seule décision qui a un sens : accepter à la place de qui a déjà
// proposé ne veut rien dire. La trace reste explicite (`staff_note`).
//
// Body : { actorDiscordUserId, demandeId, action, slot?, slots? }
// Auth : x-api-key (per-tenant) + compte Discord lié.

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotPlayer, resolveActorStaff } from '@/utils/botActor';
import { discordIdSchema } from '@/utils/botValidation';
import {
  accessHasPermission,
  getManagedTeams,
} from '@/utils/teams/managementAccess';
import {
  SCRIM_ACTIONS,
  applyScrimRequestAction,
} from '@/utils/teams/scrimRequestActions';
import { readScrimNego } from '@/utils/teams/scrimNegotiation';
import { fetchAdminUserProfiles } from '@/utils/adminUserProfiles';
import { logger } from '@/utils/logger';

const bodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  demandeId: z.string().uuid(),
  action: z.enum(SCRIM_ACTIONS),
  /** `accept` : ISO 8601 du créneau retenu. Facultatif si un seul en lice. */
  slot: z.string().min(1).max(64).nullable().optional(),
  /** `counter` : nouveaux créneaux. Validés par `normalizeSlots` dans le cœur. */
  slots: z.array(z.string().min(1).max(64)).max(5).nullable().optional(),
});

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service base de données indisponible.' });
  }
  const tenantId = req.botContext.tenantId;
  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotPlayer(req, res, body);
  if (!actor) return;

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Payload invalide.',
      code: 'INVALID_BODY',
    });
  }
  const input = parsed.data;

  // Les deux équipes de la demande, pour ne retenir que celle où l'actrice a
  // effectivement un rôle.
  const { data: demande } = await supabaseAdmin
    .from('demandes')
    .select('team_id, payload')
    .eq('id', input.demandeId)
    .eq('tenant_id', tenantId)
    .eq('type', 'scrim')
    .maybeSingle();

  if (!demande) {
    return res
      .status(404)
      .json({ error: 'Demande introuvable ou deja traitee.' });
  }
  const payload = (demande.payload as Record<string, unknown>) || {};
  const participantIds = [
    (demande.team_id as string | null) ?? null,
    (payload.from_team_id as string | null) ?? null,
  ].filter((v): v is string => Boolean(v));

  const managed = await getManagedTeams(actor.authUserId, tenantId);
  const access = managed.find((a) => participantIds.includes(a.teamId));

  let actingTeamId: string | null = null;
  let onBehalf = false;

  if (access) {
    // Même permission fine que côté site : une coach sans `manage_scrims` voit
    // le message mais ne décide pas à la place de l'équipe.
    if (!accessHasPermission(access, 'manage_scrims')) {
      return res.status(403).json({
        error: "Ton rôle dans l'équipe ne permet pas de gérer les scrims.",
        code: 'FORBIDDEN_PERMISSION',
      });
    }
    actingTeamId = access.teamId;
  } else {
    // Repli staff : l'admin tranche à la place de l'équipe attendue.
    const staff = await resolveActorStaff(input.actorDiscordUserId);
    if (!staff.staffId || !['admin', 'owner'].includes(staff.role || '')) {
      return res.status(403).json({
        error: 'Tu ne gères aucune des deux équipes de cette demande.',
        code: 'NOT_PARTICIPANT',
      });
    }
    const nego = readScrimNego(payload);
    const proposer =
      nego.proposed_by ?? ((payload.from_team_id as string | null) ?? null);
    // L'équipe dont c'est le tour : celle qui n'a pas proposé.
    actingTeamId =
      participantIds.find((id) => id !== proposer) ?? participantIds[0] ?? null;
    onBehalf = true;
  }

  if (!actingTeamId) {
    return res
      .status(400)
      .json({ error: 'Cette demande n’a pas deux équipes identifiables.' });
  }

  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('name')
    .eq('id', actingTeamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const profiles = await fetchAdminUserProfiles([actor.authUserId]);
  const profile = profiles.get(actor.authUserId);

  const result = await applyScrimRequestAction({
    tenantId,
    demandeId: input.demandeId,
    action: input.action,
    slot: input.slot ?? undefined,
    slots: input.slots ?? undefined,
    actor: {
      userId: actor.authUserId,
      teamId: actingTeamId,
      teamName: (team?.name as string) || 'Mon équipe',
      displayName: profile?.display_name || profile?.full_name || null,
      onBehalfOfTeam: onBehalf,
    },
  });

  if (!result.ok) {
    logger.info(
      '[bot/scrims/requests] refus action=%s demande=%s — %s',
      input.action,
      input.demandeId,
      result.error
    );
    return res.status(result.status).json({ error: result.error });
  }
  return res.status(result.status).json({
    ...result.body,
    teamName: team?.name ?? null,
    onBehalfOfTeam: onBehalf,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 30, key: 'bot-scrim-requests' },
  // Un double-clic sur « Accepter » ne doit pas créer deux scrims draft. Le
  // cœur est déjà idempotent sur `source_demande_id`, mais la clé évite le
  // travail en double et rejoue la même réponse.
  idempotent: true,
  bodySchema,
});
