// features/player/profile/schemas.ts — profil de la joueuse (lot P4).
// Zod seul : importé par la route en chemin RELATIF (non migrée), par le
// registre OpenAPI (lib/apiContracts) et, demain, le client.

import * as z from 'zod';
import { stringOrIgnored } from '../_shared/zod';
import {
  HERO_PREFERENCE_SLOTS,
  isOverwatchHero,
} from '../../../utils/heroes/overwatch';

/**
 * Corps de POST /api/player/update-profile. Seules les clés PRÉSENTES sont
 * appliquées ; une valeur non textuelle de `display_name`, `battle_tag` ou
 * `avatar_url` est ignorée (historique). Le format du BattleTag, le SR, le
 * poste, la chaîne Twitch (et `clear_twitch`) et l'hébergeur d'avatar sont
 * vérifiés par la route, avec leurs messages et codes.
 */
export const UpdatePlayerProfileBody = z.object({
  display_name: stringOrIgnored(
    z
      .string()
      .trim()
      .max(50, 'Le nom affiche ne peut pas depasser 50 caracteres.')
  ),
  battle_tag: stringOrIgnored(z.string()),
  avatar_url: stringOrIgnored(z.string()),
  skill_rating: z.unknown().optional(),
  specialty: z.unknown().optional(),
  twitch: z.unknown().optional(),
  clear_twitch: z.unknown().optional(),
});
export type UpdatePlayerProfileInput = z.infer<typeof UpdatePlayerProfileBody>;

/**
 * Une liste de héros : bornée, sans doublon, et ne contenant que des héros qui
 * existent. `refine` plutôt qu'un `Set` en aval — un message d'erreur ciblé vaut
 * mieux qu'un rejet global qui ne dit pas laquelle des deux listes fautait.
 */
const heroList = z
  .array(z.string().trim().min(1).max(64))
  .max(HERO_PREFERENCE_SLOTS)
  .default([])
  .refine((list) => new Set(list).size === list.length, {
    message: 'Doublon dans la liste.',
  })
  .refine((list) => list.every(isOverwatchHero), {
    message: 'Héros inconnu.',
  });

/**
 * Corps de PUT /api/player/hero-preferences (les DEUX listes d'un bloc). La
 * route et la carte « Mes héros » (lot P6, `.pipe()` du formulaire) partagent
 * ce schéma : mêmes règles, mêmes messages, même champ (`bans`) en faute.
 */
export const HeroPreferencesBody = z
  .object({ picks: heroList, bans: heroList })
  // La base porte déjà cette règle, mais un 400 explicite vaut mieux qu'un 500
  // sur violation de contrainte : la joueuse doit savoir CE qui ne va pas.
  .refine((d) => !d.picks.some((p) => d.bans.includes(p)), {
    message: 'Un héros ne peut pas être à la fois préféré et banni.',
    path: ['bans'],
  });
export type HeroPreferencesInput = z.infer<typeof HeroPreferencesBody>;

/**
 * Formulaire de la carte « Mes héros » : ses valeurs SONT le corps (deux
 * listes), le `.pipe()` applique les règles de la route avant l'envoi.
 */
export const HeroPreferencesForm = z
  .object({
    // `optional` côté formulaire pour s'aligner sur l'entrée du corps
    // (`default([])`) — la carte envoie toujours les deux listes.
    picks: z.array(z.string()).optional(),
    bans: z.array(z.string()).optional(),
  })
  .pipe(HeroPreferencesBody);

/* -------------------------------------------------------------------------
 * Lot P9 — contrats de lecture/écriture du profil et formulaires de l'écran.
 * ---------------------------------------------------------------------- */

/** Origine de la chaîne Twitch publiée (cf. utils/rating/readPlayerProfile). */
export type TwitchOrigin = 'self' | 'roster';

/** Réponse de GET /api/player/update-profile. */
export type TwitchSourceResponse = {
  twitch: string | null;
  twitchOrigin: TwitchOrigin | null;
};

/** Réponse de PATCH /api/player/update-profile (champs modifiés en écho). */
export type UpdateProfileResponse = {
  success: true;
  rosterSynced: boolean;
} & Record<string, unknown>;

/** Réponse de DELETE /api/player/delete-account. */
export type DeleteAccountResponse = { success: true };

/**
 * Code stable du refus de suppression (409) : la joueuse est capitaine d'une
 * équipe qui compte d'autres membres. Le corps porte aussi
 * `teams: { id, name }[]` — les équipes à transférer d'abord.
 */
export const CAPTAIN_MUST_TRANSFER = 'captain_must_transfer';

/**
 * Formulaire « Modifier mon profil » : ses valeurs sont des CHAÎNES (les
 * champs) ; les règles partagées du corps de la route (`UpdatePlayerProfileBody`)
 * s'appliquent avant l'envoi, sous le champ en faute. (Pas de `.pipe()` : le
 * corps accepte `unknown` par champ, zod refuse de le brancher sur des chaînes.) `twitch` n'est envoyé que s'il a changé : c'est l'écran qui
 * compose le corps final (cf. `buildProfilePatch`).
 */
export const ProfileEditForm = z
  .object({
    display_name: z.string(),
    battle_tag: z.string(),
    specialty: z.string(),
    skill_rating: z.string(),
    twitch: z.string(),
    avatar_url: z.string(),
  })
  .superRefine((values, ctx) => {
    const parsed = UpdatePlayerProfileBody.safeParse(values);
    if (parsed.success) return;
    for (const issue of parsed.error.issues)
      ctx.addIssue({
        code: 'custom',
        message: issue.message,
        path: issue.path,
      });
  });
export type ProfileEditValues = z.input<typeof ProfileEditForm>;

/**
 * Corps du PATCH à partir des valeurs du formulaire — MÊME corps qu'avant la
 * migration : chaîne vide = effacer le SR / le poste ; Twitch seulement s'il
 * a CHANGÉ (vider = retirer le lien publié, roster compris).
 */
export function buildProfilePatch(
  values: ProfileEditValues,
  twitchInitial: string
): Record<string, unknown> {
  const nextTwitch = values.twitch.trim();
  const twitchChanged = nextTwitch !== twitchInitial.trim();
  return {
    display_name: values.display_name,
    battle_tag: values.battle_tag,
    skill_rating: values.skill_rating.trim() || null,
    specialty: values.specialty || null,
    ...(twitchChanged
      ? nextTwitch
        ? { twitch: nextTwitch }
        : { twitch: null, clear_twitch: true }
      : {}),
    avatar_url: values.avatar_url,
  };
}

/** Messages (traduits) des formulaires de sécurité du compte. */
export type AccountFormMessages = {
  currentPasswordRequired: string;
  passwordTooShort: string;
  passwordMismatch: string;
};

/**
 * « Changer mon email » : ré-authentification par le mot de passe actuel
 * AVANT tout changement (une session volée ne doit pas pouvoir détourner le
 * compte). Pas de route : Supabase Auth côté navigateur.
 */
export const makeEmailChangeForm = (m: AccountFormMessages) =>
  z.object({
    current_password: z.string().min(1, m.currentPasswordRequired),
    new_email: z.string().trim().min(1),
  });

/** « Changer mon mot de passe » : même ordre de contrôles qu'avant. */
export const makePasswordChangeForm = (m: AccountFormMessages) =>
  z
    .object({
      current_password: z.string().min(1, m.currentPasswordRequired),
      new_password: z.string().min(8, m.passwordTooShort),
      confirm_password: z.string(),
    })
    .refine((d) => d.new_password === d.confirm_password, {
      message: m.passwordMismatch,
      path: ['confirm_password'],
    });
