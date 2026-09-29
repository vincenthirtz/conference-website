// features/admin/twitch/schemas.ts — actions Twitch de la régie
// (`/api/admin/twitch/**`) : connexion broadcaster, chat, modération, points
// de chaîne, predictions, clip/marker, EventSub, drop TCG.
//
// Les corps ne passent PAS par la validation de `defineAdminRoute` : leur
// erreur historique (`{ error: 'Invalid payload.', code: 'INVALID_PAYLOAD',
// details }`, ou `invalid_body` / `INVALID_BODY` côté drop TCG) est lue telle
// quelle par la régie et les tests. La route déclare le schéma strict rendu
// non bloquant (`documented`) pour la spec ; le service applique le schéma
// strict au corps brut, dans l'ordre d'origine (jeton et scope APRÈS le corps).
//
// zod seul, imports RELATIFS : ces schémas sont référencés par la spec
// OpenAPI (lib/apiContracts/admin/features.ts), assemblée par Node sans `@/`.

import { z } from 'zod';
import { looseQuery } from '../../../utils/admin/pathParams';

/* ---------------------------------------------------------------------------
 * Colonnes (listes explicites, reprises à l'identique des routes d'origine)
 * ------------------------------------------------------------------------ */

/** Statut de connexion : JAMAIS les jetons (ni chiffrés). */
export const CONNECTION_STATUS_COLUMNS =
  'broadcaster_login, scope, expires_at' as const;

/** Récompenses désignées pour le drop TCG. */
export const TCG_REWARD_COLUMNS =
  'tcg_reward_id, tcg_featured_reward_id, tcg_featured_fanart_id' as const;

export const FANART_TITLE_COLUMNS = 'title' as const;
export const FANART_CANDIDATE_COLUMNS = 'id, title' as const;

/* ---------------------------------------------------------------------------
 * Schémas appliqués par les services (messages / contraintes d'origine)
 * ------------------------------------------------------------------------ */

export const SendChatSchema = z.object({
  message: z.string().trim().min(1).max(500),
});

export const MarkerSchema = z.object({
  description: z.string().trim().max(140).optional(),
});

export const BanSchema = z.object({
  login: z.string().trim().min(1).max(25),
  duration: z.number().int().min(1).max(1_209_600).optional(),
  reason: z.string().trim().max(500).optional(),
});

export const ChatSettingsSchema = z
  .object({
    emote_mode: z.boolean().optional(),
    subscriber_mode: z.boolean().optional(),
    follower_mode: z.boolean().optional(),
    follower_mode_duration: z.number().int().min(0).max(129_600).optional(),
    slow_mode: z.boolean().optional(),
    slow_mode_wait_time: z.number().int().min(3).max(120).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one setting is required.',
  });

export const CreatePredictionSchema = z.object({
  title: z.string().trim().min(1).max(45),
  outcomes: z.array(z.string().trim().min(1).max(25)).min(2).max(10),
  prediction_window: z.number().int().min(30).max(1800),
});

export const PatchPredictionSchema = z
  .object({
    status: z.enum(['LOCKED', 'RESOLVED', 'CANCELED']),
    winning_outcome_id: z.string().trim().min(1).optional(),
  })
  .refine((v) => v.status !== 'RESOLVED' || !!v.winning_outcome_id, {
    message: 'winning_outcome_id is required when status is RESOLVED.',
    path: ['winning_outcome_id'],
  });

export const CreateRewardSchema = z.object({
  title: z.string().trim().min(1).max(45),
  cost: z.number().int().min(1),
  prompt: z.string().trim().max(200).optional(),
  is_enabled: z.boolean().optional().default(true),
  is_user_input_required: z.boolean().optional(),
  background_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Expected #RRGGBB')
    .optional(),
  should_redemptions_skip_request_queue: z.boolean().optional(),
});

export const UpdateRewardSchema = z
  .object({
    is_enabled: z.boolean().optional(),
    is_paused: z.boolean().optional(),
    title: z.string().trim().min(1).max(45).optional(),
    cost: z.number().int().min(1).optional(),
    prompt: z.string().trim().max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required.',
  });

export const PatchRedemptionsSchema = z.object({
  reward_id: z.string().trim().min(1),
  redemption_ids: z.array(z.string().trim().min(1)).min(1).max(50),
  status: z.enum(['FULFILLED', 'CANCELED']),
});

/**
 * `session_id` d'une session EventSub websocket : opaque, base64url-ish.
 * Validé au schéma — la valeur part telle quelle dans le corps envoyé à Helix.
 */
export const SubscribeSchema = z.object({
  session_id: z
    .string()
    .trim()
    .min(8)
    .max(300)
    .regex(/^[A-Za-z0-9_.=-]+$/, 'session_id has an unexpected format'),
});

export const TcgDropSubscribeSchema = z.object({
  /** Identifiant Twitch de la récompense à écouter. */
  rewardId: z.string().trim().min(1).max(200),
  /**
   * Présent = récompense « mise en avant » : enregistrée à part
   * (`tcg_featured_reward_id`) avec la carte que son paquet garantit.
   */
  featuredFanartId: z.string().uuid().optional(),
});

export const TcgDropSetupSchema = z.object({
  cost: z.number().int().min(1).max(1_000_000).optional(),
  /** Récompense « MISE EN AVANT » : son paquet garantit cette carte. */
  featuredFanartId: z.string().uuid().optional(),
});

/* ---------------------------------------------------------------------------
 * Schémas DÉCLARÉS par les routes (spec : `x-zod`, `x-zod-query`)
 * ------------------------------------------------------------------------ */

/** `/twitch/predictions/[id]`, `/twitch/channel-points/rewards/[id]`. */
export const TwitchIdQuery = looseQuery(['id']);
/** `/twitch/channel-points/rewards?all=1`. */
export const RewardsListQuery = looseQuery(['all']);

/**
 * Corps DOCUMENTÉ = le schéma strict du service, rendu non bloquant
 * (`.catch`) : la spec porte les vraies contraintes sans copie, et la route
 * ne refuse rien elle-même — le service rejoue le schéma strict sur le corps
 * brut et répond le 400 historique.
 */
function documented<S extends z.ZodType>(schema: S) {
  return schema.catch(() => ({}) as z.output<S>);
}

export const SendChatDoc = documented(SendChatSchema);
export const MarkerDoc = documented(MarkerSchema);
export const BanDoc = documented(BanSchema);
export const ChatSettingsDoc = documented(ChatSettingsSchema);
export const CreatePredictionDoc = documented(CreatePredictionSchema);
export const PatchPredictionDoc = documented(PatchPredictionSchema);
export const CreateRewardDoc = documented(CreateRewardSchema);
export const UpdateRewardDoc = documented(UpdateRewardSchema);
export const PatchRedemptionsDoc = documented(PatchRedemptionsSchema);
export const SubscribeDoc = documented(SubscribeSchema);
export const TcgDropSubscribeDoc = documented(TcgDropSubscribeSchema);
export const TcgDropSetupDoc = documented(TcgDropSetupSchema);
