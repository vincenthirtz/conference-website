// pages/api/player/hero-preferences.ts
//
// GET  /api/player/hero-preferences
// PUT  /api/player/hero-preferences
//
// Les héros qu'une joueuse aime jouer, et ceux qu'elle refuse. Trois de chaque.
//
// POURQUOI CES CHOIX EXISTENT AILLEURS QUE DANS UN JEU. `/hero-picker` les
// proposait déjà, mais en mémoire du navigateur : rien n'était conservé. Une
// fois PERSISTÉS, ils décrivent la joueuse — et le TCG s'en sert pour
// recommander le personnage qui la représente quand elle ne dépose pas de
// photo (`utils/heroes/recommendCardHero.ts`).
//
// GLOBAL AU COMPTE, PAS AU TENANT. Un héros favori décrit la personne, pas son
// club du moment : la table est clavée sur `auth_user_id` seul, comme
// `user_discord_links` (cf. l'en-tête de la migration).
//
// LE PUT REMPLACE LES DEUX LISTES D'UN COUP, il ne les modifie pas élément par
// élément. Les deux sont liées — un héros ne peut pas être à la fois préféré et
// banni — et une écriture partielle laisserait passer un état contradictoire
// entre deux appels. Envoyer l'état complet rend la contradiction impossible.
//
// CE QUE LE SCHÉMA GARANTIT, ET CE QUE CETTE ROUTE GARANTIT. La base borne à
// trois et interdit qu'un héros soit dans les deux listes. Elle ne peut PAS
// vérifier l'unicité intra-liste (Postgres refuse toute sous-requête dans un
// CHECK, vérifié avant d'écrire la migration) ni l'existence d'un héros — c'est
// donc ici, au seul point d'écriture, que ces deux règles sont tenues.

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { logger } from '@/utils/logger';
import {
  HERO_PREFERENCE_SLOTS,
  isOverwatchHero,
} from '@/utils/heroes/overwatch';

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

const putSchema = z
  .object({ picks: heroList, bans: heroList })
  // La base porte déjà cette règle, mais un 400 explicite vaut mieux qu'un 500
  // sur violation de contrainte : la joueuse doit savoir CE qui ne va pas.
  .refine((d) => !d.picks.some((p) => d.bans.includes(p)), {
    message: 'Un héros ne peut pas être à la fois préféré et banni.',
    path: ['bans'],
  });

type PrefsRow = { picks: string[] | null; bans: string[] | null };

/** L'état courant, ou des listes vides — n'avoir rien choisi est normal. */
async function loadPrefs(
  authUserId: string
): Promise<{ picks: string[]; bans: string[] }> {
  const { data, error } = await supabaseAdmin!
    .from('player_hero_preferences')
    .select('picks, bans')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) throw error;

  const row = data as PrefsRow | null;
  return { picks: row?.picks ?? [], bans: row?.bans ?? [] };
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: { user: User }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'player-hero-prefs')
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  const authUserId = ctx.user.id;

  if (req.method === 'GET') {
    try {
      return res.status(200).json({
        ...(await loadPrefs(authUserId)),
        // Rendu par l'API pour que l'interface borne ses emplacements sans
        // recopier le nombre — le recopier la ferait mentir au premier réglage.
        slots: HERO_PREFERENCE_SLOTS,
      });
    } catch (err) {
      logger.error('[player/hero-preferences] GET error', err);
      return res.status(500).json({ error: 'Erreur serveur.' });
    }
  }

  if (req.method === 'PUT') {
    const parsed = putSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation échouée.',
        code: 'INVALID_BODY',
        fields: parsed.error.flatten().fieldErrors,
      });
    }

    const { picks, bans } = parsed.data;

    // Remplacement complet des deux listes : `upsert` sur la clé primaire.
    const { error } = await supabaseAdmin
      .from('player_hero_preferences')
      .upsert(
        {
          auth_user_id: authUserId,
          picks,
          bans,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'auth_user_id' }
      );

    if (error) {
      logger.error('[player/hero-preferences] PUT error', error);
      return res.status(500).json({ error: 'Erreur serveur.' });
    }

    // On relit plutôt que de renvoyer ce qu'on vient d'écrire : c'est l'état
    // RÉEL en base que l'interface doit afficher, contraintes appliquées.
    try {
      return res.status(200).json({
        ...(await loadPrefs(authUserId)),
        slots: HERO_PREFERENCE_SLOTS,
      });
    } catch (err) {
      logger.error('[player/hero-preferences] PUT reload error', err);
      return res.status(500).json({ error: 'Erreur serveur.' });
    }
  }

  res.setHeader('Allow', 'GET,PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuthRoute(handler);
