// pages/api/player/update-profile.ts
// PATCH : mise a jour du profil joueuse — display_name, battle_tag, niveau
// Overwatch declare, poste et chaine Twitch — dans user_metadata, avec
// propagation sur les fiches de roster.
// GET : la chaine Twitch EFFECTIVE (celle que publie la fiche) et son origine,
// pour que le formulaire « Mon profil » montre ce qui est reellement en ligne.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
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

import { logger } from '../../../utils/logger';
const BATTLE_TAG_RE = /^[A-Za-z0-9\u00C0-\u024F]+#[0-9]{4,6}$/;

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  // Formes positives (`===`) pour les deux verbes : c'est ce que lit le test de
  // dérive OpenAPI ↔ handlers pour savoir quelles méthodes la route accepte.
  const isPatch = req.method === 'PATCH';
  if (req.method === 'GET') {
    return handleGet(req, res, user);
  }

  if (!isPatch) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 10, windowMs: 60_000 },
      'player-update-profile'
    )
  )
    return;

  const {
    display_name,
    battle_tag,
    avatar_url,
    skill_rating,
    specialty,
    twitch,
    clear_twitch,
  } = req.body || {};
  const updates: Record<string, unknown> = {};

  if (typeof display_name === 'string') {
    const trimmed = display_name.trim();
    if (trimmed.length > 50) {
      return res
        .status(400)
        .json({ error: 'Le nom affiche ne peut pas depasser 50 caracteres.' });
    }
    updates.display_name = trimmed || null;
  }

  if (typeof battle_tag === 'string') {
    const trimmed = battle_tag.trim();
    if (trimmed && !BATTLE_TAG_RE.test(trimmed)) {
      return res
        .status(400)
        .json({ error: 'Format BattleTag invalide (ex: Pseudo#1234).' });
    }
    updates.battle_tag = trimmed || null;
  }

  // Niveau Overwatch. Une joueuse doit pouvoir annoncer le sien sans dependre
  // de sa capitaine : c'est SA donnee, et la faire transiter par quelqu'un
  // d'autre pour une valeur qu'elle seule connait n'avait pas de sens.
  // `null` / chaine vide effacent ; l'absence de cle ne touche a rien.
  if ('skill_rating' in (req.body || {})) {
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
        return res.status(400).json({
          error: `Le SR doit etre un entier entre ${SKILL_RATING_MIN} et ${SKILL_RATING_MAX}.`,
          code: 'SKILL_RATING_INVALID',
        });
      }
      updates.skill_rating = parsed;
    }
  }

  // Poste (tank / dps / support / flex). Une joueuse sait mieux que quiconque
  // a quel poste elle joue ; le lui faire demander a sa capitaine etait un
  // detour sans raison.
  //
  // Une valeur inconnue est REFUSEE, jamais ramenee silencieusement a null :
  // meme contrat que /api/teams/update-member-specialty cote capitaine. Corriger
  // en douce effacerait le poste de quelqu'un sans le lui dire.
  if ('specialty' in (req.body || {})) {
    if (specialty === null || specialty === '') {
      updates.specialty = null;
    } else if (
      typeof specialty === 'string' &&
      ALLOWED_SPECIALTIES.has(specialty.trim().toLowerCase())
    ) {
      updates.specialty = validateSpecialty(specialty);
    } else {
      return res.status(400).json({
        error:
          'specialty invalide. Attendu : tank | dps | support | flex | null.',
        code: 'SPECIALTY_INVALID',
      });
    }
  }

  // Chaine Twitch. C'est SA chaine : elle la declare elle-meme, sans passer
  // par sa capitaine — meme raisonnement que le SR et le poste juste au-dessus.
  // La capitaine (ou une manager avec `edit_public_page`) peut toujours la
  // renseigner de son cote via /api/teams/[teamId]/members/[memberId]/profile,
  // pour une joueuse qui ne l'a pas fait.
  //
  // On accepte un handle nu, un @handle ou une URL complete : c'est
  // `utils/social/profileHandles.ts` qui construit le lien a l'affichage, et
  // lui seul. Normaliser ici en plus donnerait deux verites pour une valeur.
  // `null` / chaine vide effacent ; l'absence de cle ne touche a rien.
  //
  // `clear_twitch: true` = RETIRER LE LIEN PUBLIE, qui que ce soit qui l'ait
  // saisi. Un simple `null` ne suffit pas a effacer la fiche de roster (voir la
  // garde plus bas, qui protege la saisie de la capitaine d'un formulaire qui
  // renvoie le champ a chaque enregistrement) ; or une joueuse dont la
  // capitaine a publie la chaine doit pouvoir la faire disparaitre. D'ou une
  // intention EXPLICITE, distincte du champ laisse vide.
  const clearTwitch = clear_twitch === true;
  if (clearTwitch && typeof twitch === 'string' && twitch.trim()) {
    return res.status(400).json({
      error: 'clear_twitch et une chaine Twitch non vide sont contradictoires.',
      code: 'TWITCH_INVALID',
    });
  }
  if (clearTwitch) {
    updates.twitch = null;
  } else if ('twitch' in (req.body || {})) {
    if (twitch === null || twitch === '') {
      updates.twitch = null;
    } else if (typeof twitch !== 'string') {
      return res.status(400).json({ error: 'twitch invalide.' });
    } else {
      const trimmed = twitch.trim();
      if (!trimmed) {
        updates.twitch = null;
      } else if (trimmed.length > TWITCH_MAX) {
        return res.status(400).json({
          error: `La chaine Twitch ne peut pas depasser ${TWITCH_MAX} caracteres.`,
          code: 'TWITCH_INVALID',
        });
      } else if (!isValidTwitchValue(trimmed)) {
        return res.status(400).json({
          error:
            'Chaine Twitch invalide. Attendu : un pseudo Twitch ou une URL twitch.tv.',
          code: 'TWITCH_INVALID',
        });
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
      return res.status(400).json({ error: "URL d'avatar invalide." });
    }
    // Un hote que l'affichage ne sait pas servir est REFUSE ici, plutot que
    // d'etre accepte puis rendu casse : `next/image` ne sert que les hotes de
    // `images.remotePatterns`, et un avatar Imgur passait la validation pour
    // finir en 400 sur `/_next/image`. La liste n'est PAS recopiee : c'est
    // `isOptimizableImageUrl`, synchronisee avec next.config.js par son test.
    //
    // Seulement quand la valeur CHANGE : le formulaire renvoie l'avatar a
    // chaque enregistrement, et une joueuse dont l'avatar historique est sur
    // un hote non declare ne doit pas se voir refuser la correction de son
    // BattleTag. L'existant reste affiche par `PlayerAvatar` (repli `<img>`).
    const currentAvatar =
      typeof user.user_metadata?.avatar_url === 'string'
        ? user.user_metadata.avatar_url.trim()
        : '';
    if (
      trimmed &&
      trimmed !== currentAvatar &&
      !isOptimizableImageUrl(trimmed)
    ) {
      return res.status(400).json({
        error:
          "Cet hebergeur d'image n'est pas pris en charge. Utilise une image Discord, Twitch ou hebergee sur le site.",
        code: 'AVATAR_HOST_UNSUPPORTED',
      });
    }
    updates.avatar_url = trimmed || null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Aucun champ a mettre a jour.' });
  }

  const existingMeta = user.user_metadata ?? {};
  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
    user.id,
    {
      user_metadata: { ...existingMeta, ...updates },
    }
  );

  if (updateErr) {
    logger.error('[player/update-profile] error:', updateErr);
    return res.status(500).json({ error: 'Echec de la mise a jour.' });
  }

  // Si battle_tag modifie, mettre a jour aussi team_members (scoped au tenant
  // courant — un user pourrait theoriquement avoir un BT different par tenant
  // a terme ; pour l'instant on update juste celui du tenant courant).
  const rosterUpdates: Record<string, unknown> = {};
  if ('battle_tag' in updates) rosterUpdates.battle_tag = updates.battle_tag;
  // Le SR suit le meme chemin que le BattleTag : il vit sur la FICHE de roster,
  // c'est elle qui alimente la moyenne d'equipe et l'annuaire des adversaires.
  // Le garder seulement dans les metadonnees du compte le rendrait invisible.
  if ('skill_rating' in updates)
    rosterUpdates.skill_rating = updates.skill_rating;
  if ('specialty' in updates) rosterUpdates.specialty = updates.specialty;
  // La chaine suit aussi : `team_members.twitch` est ce que lit la page
  // publique de l'equipe. Sans propagation, une joueuse aurait declare sa
  // chaine et ne la verrait nulle part sur le roster ou elle joue.
  //
  // SAUF un cas, et c'est important : un `null` alors qu'elle n'avait RIEN
  // declare n'efface pas la fiche de roster. Sa capitaine a le droit de
  // renseigner la chaine a sa place ; le formulaire de profil, lui, envoie le
  // champ a CHAQUE enregistrement. Sans cette garde, une joueuse qui vient
  // juste corriger son BattleTag effacerait au passage la chaine que sa
  // capitaine avait saisie — sans l'avoir demande ni meme l'avoir vu.
  //
  // Un `null` APRES avoir declare quelque chose, lui, efface bien : la elle
  // retire sa chaine, et c'est ce qu'elle veut.
  //
  // Et `clear_twitch` efface TOUJOURS : c'est la demande explicite de retirer
  // le lien publie, y compris celui que la capitaine avait saisi.
  if ('twitch' in updates) {
    const hadDeclaredTwitch =
      typeof existingMeta.twitch === 'string' && existingMeta.twitch.trim();
    if (clearTwitch || updates.twitch !== null || hadDeclaredTwitch) {
      rosterUpdates.twitch = updates.twitch;
    }
  }

  // `true` tant qu'aucune ecriture de roster n'a echoue (y compris quand il n'y
  // avait rien a propager).
  let rosterSynced = true;
  if (Object.keys(rosterUpdates).length > 0) {
    const tenantId = resolveTenantIdForUserRequest(req, {
      authUserId: user.id,
    });
    // L'erreur etait ignoree et la route repondait 200 : compte et roster
    // divergeaient en silence. Or c'est le roster qui alimente la page d'equipe
    // et l'eligibilite le jour du tournoi. Pas de 500 pour autant : les
    // metadonnees, elles, SONT ecrites, et un 500 ferait croire que rien n'a
    // ete enregistre. `rosterSynced: false` laisse le formulaire l'avertir ;
    // renvoyer le meme formulaire est sans risque (ecriture reentrante) et
    // retente la propagation.
    try {
      const { error: rosterErr } = await supabaseAdmin
        .from('team_members')
        .update(rosterUpdates)
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId);
      if (rosterErr) {
        rosterSynced = false;
        logger.error('[player/update-profile] roster sync error:', rosterErr);
      }
    } catch (rosterErr) {
      rosterSynced = false;
      logger.error('[player/update-profile] roster sync threw:', rosterErr);
    }
  }

  // Ce que montre la fiche publique a change : on la regenere sans attendre
  // l'ISR (5 min). Surtout pour un RETRAIT de lien Twitch, qui doit disparaitre
  // quand la joueuse le demande, pas cinq minutes plus tard. Best-effort : la
  // mutation est ecrite, un echec ici ne change pas la reponse.
  if ('twitch' in updates || 'avatar_url' in updates) {
    await revalidatePublicProfile(res, user.id);
  }

  return res.status(200).json({
    success: true,
    rosterSynced,
    ...updates,
  });
});

/**
 * Chaine Twitch effective + origine. Meme regle que la fiche publique
 * (`resolvePlayerTwitch`), meme lecture du roster : le formulaire ne peut plus
 * afficher un champ vide pendant que la fiche montre un bouton Twitch.
 *
 * Exposee ici plutot que lue cote client : l'origine `roster` vit dans
 * `team_members`, que la session ne porte pas, et c'est cette route qui resout
 * deja le tenant et ecrit la valeur — lecture et ecriture restent au meme
 * endroit, avec la meme resolution de tenant.
 */
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  user: { id: string; user_metadata?: Record<string, unknown> | null }
) {
  // Seau distinct de celui du PATCH : charger la page ne doit pas consommer
  // le quota d'enregistrement.
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'player-profile-twitch-source'
    )
  )
    return;

  const tenantId = resolveTenantIdForUserRequest(req, {
    authUserId: user.id,
  });
  try {
    const source = await readPlayerTwitchSource(
      user.id,
      tenantId,
      user.user_metadata?.twitch
    );
    return res.status(200).json({
      twitch: source?.value ?? null,
      twitchOrigin: source?.origin ?? null,
    });
  } catch {
    // Deja journalise par readPlayerTwitchSource. Pas de « rien de publie » par
    // defaut : ce serait peut-etre faux, et c'est exactement le decalage que
    // cette lecture corrige.
    return res.status(500).json({ error: 'Lecture du profil impossible.' });
  }
}

async function revalidatePublicProfile(
  res: NextApiResponse,
  userId: string
): Promise<void> {
  // `res.revalidate` n'existe pas partout (doubles de reponse en test).
  if (typeof res.revalidate !== 'function') return;
  const path = `/player/${encodeURIComponent(userId)}`;
  try {
    await res.revalidate(path);
  } catch (err) {
    logger.error(`[player/update-profile] revalidate ${path} failed`, err);
  }
}
