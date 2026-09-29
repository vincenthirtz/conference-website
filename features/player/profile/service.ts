// features/player/profile/service.ts — règles du profil de la joueuse et de
// ses droits RGPD (lot P9). Sans HTTP : la route passe `{ db, tenantId,
// logger }`, l'utilisatrice authentifiée et le corps validé.
//
// Reprise À L'IDENTIQUE de pages/api/player/{update-profile,data-export,
// delete-account}.ts : mêmes messages, mêmes codes, mêmes effets, même ordre.

import type { User } from '@supabase/supabase-js';
import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';
import { LegacyAdminError } from '@/utils/admin/errors';
import { isOptimizableImageUrl } from '@/utils/images/optimizableImage';
import { readPlayerTwitchSource } from '@/utils/rating/readPlayerProfile';
import { ALLOWED_SPECIALTIES, validateSpecialty } from '@/utils/apiHelpers';
import {
  SKILL_RATING_MAX,
  SKILL_RATING_MIN,
  isValidSkillRating,
} from '@/utils/overwatchRank';
import {
  TWITCH_HANDLE_MAX as TWITCH_MAX,
  isValidTwitchValue,
} from '@/utils/social/profileHandles';
import { exportPersonalData } from '@/utils/player/exportPersonalData';
import { erasePersonalData } from '@/utils/player/erasePersonalData';
import { sendAccountDeletedEmail } from '@/utils/email';
import {
  deleteAuthUser,
  readStaffRole,
  updateRosterEntries,
  writeUserMetadata,
} from './repository';
import type {
  TwitchSourceResponse,
  UpdatePlayerProfileInput,
  UpdateProfileResponse,
} from './schemas';

export type ProfileContext = {
  db: AdminDb;
  tenantId: string;
  logger: Logger;
};

const BATTLE_TAG_RE = /^[A-Za-z0-9À-ɏ]+#[0-9]{4,6}$/;

const bad = (message: string, code?: string) =>
  new LegacyAdminError(400, message, code ? { code } : {});

/**
 * Champs à écrire dans les métadonnées, à partir du corps. Seules les clés
 * PRÉSENTES sont appliquées ; lève une 400 (message + code historiques).
 */
export function computeProfileUpdates(
  body: UpdatePlayerProfileInput,
  currentMeta: Record<string, unknown>
): { updates: Record<string, unknown>; clearTwitch: boolean } {
  const {
    display_name,
    battle_tag,
    avatar_url,
    skill_rating,
    specialty,
    twitch,
    clear_twitch,
  } = body;
  const updates: Record<string, unknown> = {};

  if (typeof display_name === 'string') {
    const trimmed = display_name.trim();
    if (trimmed.length > 50) {
      throw bad('Le nom affiche ne peut pas depasser 50 caracteres.');
    }
    updates.display_name = trimmed || null;
  }

  if (typeof battle_tag === 'string') {
    const trimmed = battle_tag.trim();
    if (trimmed && !BATTLE_TAG_RE.test(trimmed)) {
      throw bad('Format BattleTag invalide (ex: Pseudo#1234).');
    }
    updates.battle_tag = trimmed || null;
  }

  // Niveau Overwatch : SA donnée. `null` / chaîne vide effacent ; l'absence
  // de clé ne touche à rien.
  if ('skill_rating' in body) {
    if (
      skill_rating === null ||
      (typeof skill_rating === 'string' && skill_rating.trim() === '')
    ) {
      updates.skill_rating = null;
    } else {
      const parsed =
        typeof skill_rating === 'string'
          ? Number(skill_rating.trim())
          : skill_rating;
      if (!isValidSkillRating(parsed)) {
        throw bad(
          `Le SR doit etre un entier entre ${SKILL_RATING_MIN} et ${SKILL_RATING_MAX}.`,
          'SKILL_RATING_INVALID'
        );
      }
      updates.skill_rating = parsed;
    }
  }

  // Poste : une valeur inconnue est REFUSÉE, jamais ramenée à null en douce
  // (même contrat que /api/teams/update-member-specialty).
  if ('specialty' in body) {
    if (specialty === null || specialty === '') {
      updates.specialty = null;
    } else if (
      typeof specialty === 'string' &&
      ALLOWED_SPECIALTIES.has(specialty.trim().toLowerCase())
    ) {
      updates.specialty = validateSpecialty(specialty);
    } else {
      throw bad(
        'specialty invalide. Attendu : tank | dps | support | flex | null.',
        'SPECIALTY_INVALID'
      );
    }
  }

  // Chaîne Twitch : handle nu, @handle ou URL (le lien se construit à
  // l'affichage). `clear_twitch: true` = RETIRER le lien publié, y compris
  // celui saisi par la capitaine — intention explicite, distincte du vide.
  const clearTwitch = clear_twitch === true;
  if (clearTwitch && typeof twitch === 'string' && twitch.trim()) {
    throw bad(
      'clear_twitch et une chaine Twitch non vide sont contradictoires.',
      'TWITCH_INVALID'
    );
  }
  if (clearTwitch) {
    updates.twitch = null;
  } else if ('twitch' in body) {
    if (twitch === null || twitch === '') {
      updates.twitch = null;
    } else if (typeof twitch !== 'string') {
      throw bad('twitch invalide.');
    } else {
      const trimmed = twitch.trim();
      if (!trimmed) {
        updates.twitch = null;
      } else if (trimmed.length > TWITCH_MAX) {
        throw bad(
          `La chaine Twitch ne peut pas depasser ${TWITCH_MAX} caracteres.`,
          'TWITCH_INVALID'
        );
      } else if (!isValidTwitchValue(trimmed)) {
        throw bad(
          'Chaine Twitch invalide. Attendu : un pseudo Twitch ou une URL twitch.tv.',
          'TWITCH_INVALID'
        );
      } else {
        updates.twitch = trimmed;
      }
    }
  }

  if (typeof avatar_url === 'string') {
    const trimmed = avatar_url.trim();
    if (
      trimmed &&
      (!(trimmed.startsWith('http://') || trimmed.startsWith('https://')) ||
        trimmed.length > 2048)
    ) {
      throw bad("URL d'avatar invalide.");
    }
    // Un hôte que `next/image` ne sait pas servir est refusé — seulement quand
    // la valeur CHANGE (l'avatar historique reste affiché par PlayerAvatar).
    const currentAvatar =
      typeof currentMeta.avatar_url === 'string'
        ? currentMeta.avatar_url.trim()
        : '';
    if (
      trimmed &&
      trimmed !== currentAvatar &&
      !isOptimizableImageUrl(trimmed)
    ) {
      throw bad(
        "Cet hebergeur d'image n'est pas pris en charge. Utilise une image Discord, Twitch ou hebergee sur le site.",
        'AVATAR_HOST_UNSUPPORTED'
      );
    }
    updates.avatar_url = trimmed || null;
  }

  if (Object.keys(updates).length === 0) {
    throw bad('Aucun champ a mettre a jour.');
  }
  return { updates, clearTwitch };
}

/**
 * PATCH du profil : métadonnées du compte, puis propagation au roster du
 * tenant (best-effort, signalée par `rosterSynced`). `revalidate` dit si la
 * fiche publique doit être régénérée (Twitch ou avatar modifiés).
 */
export async function updateProfile(
  ctx: ProfileContext,
  user: User,
  body: UpdatePlayerProfileInput
): Promise<{ response: UpdateProfileResponse; revalidate: boolean }> {
  const existingMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const { updates, clearTwitch } = computeProfileUpdates(body, existingMeta);

  const { error: updateErr } = await writeUserMetadata(ctx.db, user.id, {
    ...existingMeta,
    ...updates,
  });
  if (updateErr) {
    ctx.logger.error('[player/update-profile] error:', updateErr);
    throw new LegacyAdminError(500, 'Echec de la mise a jour.');
  }

  // Le roster alimente la page d'équipe, la moyenne de SR et l'éligibilité.
  const rosterUpdates: Record<string, unknown> = {};
  if ('battle_tag' in updates) rosterUpdates.battle_tag = updates.battle_tag;
  if ('skill_rating' in updates)
    rosterUpdates.skill_rating = updates.skill_rating;
  if ('specialty' in updates) rosterUpdates.specialty = updates.specialty;
  // Un `null` alors qu'elle n'avait RIEN déclaré n'efface pas la chaîne saisie
  // par sa capitaine ; un `null` après déclaration, ou `clear_twitch`, efface.
  if ('twitch' in updates) {
    const hadDeclaredTwitch =
      typeof existingMeta.twitch === 'string' && existingMeta.twitch.trim();
    if (clearTwitch || updates.twitch !== null || hadDeclaredTwitch) {
      rosterUpdates.twitch = updates.twitch;
    }
  }

  // Pas de 500 sur échec de roster : les métadonnées SONT écrites ; renvoyer
  // le même formulaire retente la propagation (écriture réentrante).
  let rosterSynced = true;
  if (Object.keys(rosterUpdates).length > 0) {
    try {
      const { error: rosterErr } = await updateRosterEntries(
        ctx.db,
        ctx.tenantId,
        user.id,
        rosterUpdates
      );
      if (rosterErr) {
        rosterSynced = false;
        ctx.logger.error(
          '[player/update-profile] roster sync error:',
          rosterErr
        );
      }
    } catch (rosterErr) {
      rosterSynced = false;
      ctx.logger.error('[player/update-profile] roster sync threw:', rosterErr);
    }
  }

  return {
    response: { success: true, rosterSynced, ...updates },
    revalidate: 'twitch' in updates || 'avatar_url' in updates,
  };
}

/**
 * Chaîne Twitch EFFECTIVE (celle que publie la fiche) et son origine. Une
 * lecture en échec n'est jamais « rien de publié » : 500.
 */
export async function readTwitchSource(
  ctx: ProfileContext,
  user: User
): Promise<TwitchSourceResponse> {
  try {
    const source = await readPlayerTwitchSource(
      user.id,
      ctx.tenantId,
      user.user_metadata?.twitch
    );
    return {
      twitch: source?.value ?? null,
      twitchOrigin: source?.origin ?? null,
    };
  } catch {
    // Déjà journalisé par readPlayerTwitchSource.
    throw new LegacyAdminError(500, 'Lecture du profil impossible.');
  }
}

/**
 * Droit d'accès RGPD : registre `utils/player/personalDataTables.ts` (le même
 * que la suppression), tous tenants. Les alias de l'ancien format restent.
 */
export async function buildDataExport(user: User) {
  const { tables, not_exported } = await exportPersonalData(user.id);
  return {
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      display_name: user.user_metadata?.display_name ?? null,
      battle_tag: user.user_metadata?.battle_tag ?? null,
      role: user.user_metadata?.role ?? null,
    },
    tables,
    not_exported,
    team_membership: tables.team_members?.rows ?? [],
    demandes: tables.demandes?.rows ?? [],
    staff: tables.staff?.rows[0] ?? null,
  };
}

/**
 * Droit à l'oubli. ORDRE : garde owner → registre (fichiers puis lignes) →
 * `deleteUser` → e-mail (après, pour ne jamais annoncer une suppression
 * échouée). La régénération de la fiche publique reste à la route (HTTP).
 */
export async function deleteAccount(
  ctx: Omit<ProfileContext, 'tenantId'>,
  user: User
): Promise<{ success: true }> {
  const userId = user.id;

  if ((await readStaffRole(ctx.db, userId)) === 'owner') {
    throw new LegacyAdminError(
      403,
      'Les comptes owner ne peuvent pas être auto-supprimés. Contacte un autre owner.'
    );
  }

  // Échec de FICHIER : journalisé, non bloquant ; échec de LIGNE : bloque,
  // compte intact (cf. utils/player/erasePersonalData.ts).
  const erased = await erasePersonalData(userId);
  if (!erased.ok) {
    throw new LegacyAdminError(
      500,
      'Erreur lors de la suppression de tes données. Ton compte n’a pas été supprimé : réessaie dans quelques instants.',
      { code: 'personal_data_erase_failed' }
    );
  }

  const { error: deleteErr } = await deleteAuthUser(ctx.db, userId);
  if (deleteErr) {
    ctx.logger.error('[player/delete-account] delete error:', deleteErr);
    throw new LegacyAdminError(500, 'Erreur lors de la suppression du compte.');
  }
  return { success: true };
}

/** E-mail « compte supprimé », non bloquant (après la suppression effective). */
export function notifyAccountDeleted(ctx: { logger: Logger }, user: User) {
  if (!user.email) return;
  sendAccountDeletedEmail(user.email).catch((err) => {
    ctx.logger.error('[player/delete-account] email error:', err);
  });
}
