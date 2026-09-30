// features/admin/diffusion/schemas.ts — chaînes Twitch de l'espace.
//
// DEUX schémas pour un même objet (lot L11) :
//   * `TwitchChannelBody` : le corps JSON que la route accepte ;
//   * `TwitchChannelForm` : les valeurs du formulaire (des chaînes, un
//     booléen), transformées PUIS passées au schéma du corps (`.pipe`).
// Les règles ne sont donc écrites qu'une fois, et les noms de champs sont
// les mêmes des deux côtés : une erreur `fields.label` du serveur retombe
// sous le champ `label` du formulaire.

import * as z from 'zod';
// Import relatif : ce fichier est lu par l'assemblage OpenAPI (Node seul).
import { looseBody } from '../../../utils/admin/pathParams';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `${max} caractères au maximum.` })
    .nullish()
    .transform((v) => v || null);

export const TwitchChannelBody = z.object({
  channel: z
    .string({ error: 'La chaîne est obligatoire.' })
    .trim()
    .toLowerCase()
    .min(1, { error: 'La chaîne est obligatoire.' })
    .max(50, { error: '50 caractères au maximum.' }),
  label: z
    .string({ error: 'Le nom affiché est obligatoire.' })
    .trim()
    .min(1, { error: 'Le nom affiché est obligatoire.' })
    .max(80, { error: '80 caractères au maximum.' }),
  badge: optionalText(40),
  description: optionalText(500),
  // Filtrée côté serveur (`sanitizeUrl`) : un schéma non http(s) devient
  // null plutôt qu'une erreur, comme avant la migration.
  backgroundUrl: optionalText(500),
  isActive: z.boolean().optional(),
  sortOrder: z
    .number()
    .int({ error: 'Nombre entier attendu.' })
    .min(0, { error: 'Positif ou nul.' })
    .optional(),
});
export type TwitchChannelBody = z.output<typeof TwitchChannelBody>;

/** PATCH : chaque champ est facultatif ; seuls ceux présents sont écrits. */
export const TwitchChannelPatch = TwitchChannelBody.partial();
export type TwitchChannelPatch = z.output<typeof TwitchChannelPatch>;

export const TwitchChannelIdQuery = z.object({
  id: z.uuid({ error: 'Missing or invalid ID.' }),
});

export const TwitchChannelListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).catch(100).default(100),
  includeInactive: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

/** Valeurs du formulaire (création et édition). */
export const TwitchChannelForm = z
  .object({
    channel: z.string(),
    label: z.string(),
    badge: z.string(),
    description: z.string(),
    backgroundUrl: z.string(),
    isActive: z.boolean(),
    sortOrder: z.string(),
  })
  .transform(
    (v): z.input<typeof TwitchChannelBody> => ({
      ...v,
      sortOrder: v.sortOrder.trim() === '' ? undefined : Number(v.sortOrder),
    })
  )
  .pipe(TwitchChannelBody);
export type TwitchChannelFormValues = z.input<typeof TwitchChannelForm>;

export const EMPTY_TWITCH_CHANNEL_FORM: TwitchChannelFormValues = {
  channel: '',
  label: '',
  badge: '',
  description: '',
  backgroundUrl: '',
  isActive: true,
  sortOrder: '',
};

/** Colonnes lues — jamais `select('*')`. */
export const TWITCH_CHANNEL_COLUMNS =
  'id, tenant_id, channel, label, badge, description, background_url, is_active, sort_order, created_at, updated_at';

export type TwitchChannelRow = {
  id: string;
  tenant_id: string;
  channel: string;
  label: string;
  badge: string | null;
  description: string | null;
  background_url: string | null;
  is_active: boolean | null;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
};

/** Ligne → valeurs du formulaire d'édition. */
export function twitchChannelToForm(
  row: TwitchChannelRow
): TwitchChannelFormValues {
  return {
    channel: row.channel ?? '',
    label: row.label ?? '',
    badge: row.badge ?? '',
    description: row.description ?? '',
    backgroundUrl: row.background_url ?? '',
    isActive: row.is_active ?? true,
    sortOrder: row.sort_order != null ? String(row.sort_order) : '',
  };
}

/* ---------------------------------------------------------------------------
 * Régie vidéo : état d'antenne (POST /api/admin/broadcast/state)
 * ------------------------------------------------------------------------ */

/**
 * Corps déclaré par la route (champs NOMMÉS pour la spec) ; chaque champ est
 * validé par le service, avec les messages d'origine
 * (`on_air must be a boolean`…), dans l'ordre d'origine.
 */
export const BroadcastStatePatchDoc = looseBody([
  'on_air',
  'lower_third',
  'pip',
  'scene',
  'auto_director',
]);

/** POST /api/admin/stream-alert-test — type d'alerte Twitch + pseudo affiché. */
export const StreamAlertTestDoc = looseBody(['kind', 'name']);

/* ---------------------------------------------------------------------------
 * Sondage MVP du public dans /overlay/regie (/api/admin/diffusion/mvp-overlay)
 * ------------------------------------------------------------------------ */

/** PUT — réglages d'affichage et durée par défaut du vote. */
export const MvpOverlaySettingsBody = z.object({
  window_minutes: z.number().int().min(1).max(360),
  position: z.enum(['top', 'center', 'bottom']),
  show_sources: z.boolean(),
});

/** POST — lancer ou arrêter le TEST (faux vote dans la source). */
export const MvpOverlayTestBody = z.object({
  action: z.enum(['test-start', 'test-stop']),
});

/** Réglages et test tels que la route les rend (ui, hooks, service). */
export type MvpOverlaySettings = {
  window_minutes: number;
  position: 'top' | 'center' | 'bottom';
  show_sources: boolean;
};

export type MvpOverlayState = {
  /**
   * Le chat Twitch vote-t-il sans cockpit ? `ready` : oui, dès l'ouverture
   * d'un vote ; sinon ce qui manque (chaîne, scopes, configuration).
   */
  twitchChat?: {
    status: 'ready' | 'not_configured' | 'not_connected' | 'missing_scope';
    missingScopes: string[];
  };
  settings: MvpOverlaySettings;
  /** TEST à l'écran, et jusqu'à quand. */
  demo: { active: boolean; until: string | null };
};

/* ---------------------------------------------------------------------------
 * Mise en page de la source Régie (/api/admin/diffusion/regie-layout)
 * ------------------------------------------------------------------------ */

const RegieSlotBody = z.object({
  anchor: z.enum(['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']),
  x: z.number().int().min(-1920).max(1920),
  y: z.number().int().min(-1080).max(1080),
  scale: z.number().min(0.4).max(2),
  visible: z.boolean(),
});

/** PUT — la mise en page complète (un emplacement par élément). */
export const RegieLayoutBody = z.object({
  alerts: RegieSlotBody,
  mvp: RegieSlotBody,
  partners: RegieSlotBody,
  don: RegieSlotBody,
});
