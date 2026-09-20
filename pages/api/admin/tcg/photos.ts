// pages/api/admin/tcg/photos.ts
//
// Relecture des photos de cartes TCG déposées par les joueuses.
//
//   GET   → la file d'attente (`photo_status = 'pending'`), la plus ancienne
//           d'abord : une photo déposée ne doit pas attendre derrière une plus
//           récente.
//   PATCH → approuver ou refuser une photo. Journalisé dans les deux cas.
//
// UNE PHOTO REFUSÉE EST SUPPRIMÉE DU BUCKET, pas seulement marquée. Le bucket
// est PUBLIC : un cliché refusé — précisément parce qu'il pose problème —
// resterait sinon atteignable par son URL, indéfiniment. La joueuse garde le
// motif du refus et peut redéposer ; c'est le fichier qui part, pas
// l'explication.
//
// ON N'APPROUVE QUE LA PHOTO QU'ON A VUE (correctif du 2026-09-15). La décision
// désignait la JOUEUSE, pas le fichier : la relectrice voyait la photo A, la
// joueuse la remplaçait par B (de nouveau `pending`), et « approuver »
// publiait B, que personne n'avait regardée — le consentement de modération
// contourné par un simple remplacement. Symétriquement, un refus concurrent
// vidait le chemin de B en base et supprimait A du bucket : B restait
// orpheline dans un bucket PUBLIC, sans ligne pour la retirer.
// Le PATCH porte donc `photoPath`, le chemin AFFICHÉ (rendu par le GET), et
// l'écriture est CONDITIONNELLE : `photo_status = 'pending' AND photo_path =
// <affiché>`, avec `.select()` pour savoir si une ligne a été touchée. Zéro
// ligne → `409 PHOTO_CHANGED` (ou `NOT_PENDING`), l'écran rafraîchit la file.
// Le fichier supprimé au refus est le chemin que l'écriture a CONFIRMÉ, jamais
// une relecture antérieure.
//
// LES PSEUDOS SONT UN ENRICHISSEMENT, PAS UNE CONDITION. Chaque élément porte
// `displayName` et `email`, résolus en UN aller-retour par la RPC
// `fetchAdminUserProfiles` (le profil vit dans `auth.users.raw_user_meta_data`,
// il n'existe pas de table `profiles`). Si la résolution échoue, les deux
// champs retombent sur `null` et la file s'affiche quand même : ce qu'une
// relectrice doit voir avant tout, c'est l'image — la priver de la file entière
// parce qu'un nom manque retarderait la relecture d'une photo, c'est-à-dire
// précisément ce que la file sert à éviter.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { applyRateLimit } from '@/utils/rateLimit';
import { formatZodError } from '@/utils/validation';
import { isValidUUID } from '@/utils/apiHelpers';
import { revalidatePlayerCard } from '@/utils/tcg/revalidatePlayerCard';
import {
  fetchAdminUserProfiles,
  type AdminUserProfile,
} from '@/utils/adminUserProfiles';
import { logger } from '@/utils/logger';
import {
  enqueuePhotoPurge,
  tryPurgeNow,
  cancelPhotoPurge,
} from '@/utils/tcg/photoPurge';

/** Même bucket public que les logos d'équipe (cf. l'endpoint joueuse). */
const BUCKET = 'teams-images';

const SELECT_COLS =
  'user_id, photo_path, photo_status, opted_in_at, updated_at';

const decisionSchema = z.object({
  userId: z.string().uuid(),
  decision: z.enum(['approve', 'reject']),
  // Le chemin de la photo AFFICHÉE à la relectrice (champ `photoPath` du GET).
  // Obligatoire : une décision sans lui porterait sur « la photo du moment »,
  // c'est-à-dire éventuellement une photo jamais vue (cf. l'en-tête).
  photoPath: z.string().trim().min(1).max(512),
  // Motif facultatif, mais fortement utile en cas de refus : sans lui, la
  // joueuse ne sait pas quoi corriger.
  reason: z.string().trim().max(500).optional().nullable(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }

  if (req.method === 'GET') return listPending(req, res, ctx);
  if (req.method === 'PATCH') return decide(req, res, ctx);

  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}

/* -------------------------------------------------------------------------- */
/* GET — la file d'attente                                                     */
/* -------------------------------------------------------------------------- */

async function listPending(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-tcg-list'))
    return;

  const { data, error } = await supabaseAdmin!
    .from('tcg_player_cards')
    .select(SELECT_COLS)
    .eq('tenant_id', ctx.tenantId)
    .eq('photo_status', 'pending')
    .order('updated_at', { ascending: true })
    .limit(100);

  if (error) {
    logger.error('[admin/tcg] list error: %s', error.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const rows = (data ?? []) as Array<{
    user_id: string;
    photo_path: string | null;
    updated_at: string | null;
  }>;

  const profiles = await resolveProfiles(rows.map((row) => row.user_id));

  const photos = rows.map((row) => {
    const profile = profiles.get(row.user_id);
    return {
      userId: row.user_id,
      // `display_name` PUIS `full_name` : un compte créé via Discord n'a que
      // le second (cf. `utils/teams/memberDisplayName.ts`).
      displayName: profile?.display_name || profile?.full_name || null,
      email: profile?.email ?? null,
      submittedAt: row.updated_at,
      // Le chemin exact de CE fichier : le PATCH le renvoie pour que la
      // décision porte sur l'image affichée, et pas sur une remplaçante.
      photoPath: row.photo_path,
      photoUrl: row.photo_path
        ? supabaseAdmin!.storage.from(BUCKET).getPublicUrl(row.photo_path).data
            .publicUrl
        : null,
    };
  });

  return res.status(200).json({ photos, total: photos.length });
}

/**
 * Les profils des joueuses de la file, sans jamais faire échouer la liste.
 *
 * `fetchAdminUserProfiles` rend déjà une Map vide sur erreur RPC ; le `try`
 * couvre ce qu'elle ne couvre pas (une exception levée avant l'appel). Une Map
 * vide n'est PAS « ces comptes n'existent pas » : c'est « noms inconnus », et
 * l'écran l'affiche comme tel (`null`), jamais comme un compte supprimé.
 */
async function resolveProfiles(
  userIds: string[]
): Promise<Map<string, AdminUserProfile>> {
  if (userIds.length === 0) return new Map();
  try {
    return await fetchAdminUserProfiles(userIds);
  } catch (err) {
    logger.warn('[admin/tcg] pseudos non résolus: %s', String(err));
    return new Map();
  }
}

/* -------------------------------------------------------------------------- */
/* PATCH — approuver ou refuser                                                */
/* -------------------------------------------------------------------------- */

async function decide(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'admin-tcg-decide')
  )
    return;

  const parsed = decisionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: formatZodError(parsed.error), code: 'INVALID_BODY' });
  }
  const { userId, decision, reason, photoPath } = parsed.data;
  if (!isValidUUID(userId)) {
    return res.status(400).json({ error: 'Identifiant invalide.' });
  }

  // Relecture : elle ne DÉCIDE de rien (l'écriture conditionnelle ci-dessous
  // tranche), elle sert à distinguer les deux conflits pour l'écran — la
  // joueuse a retiré sa photo (`NOT_PENDING`, sa décision prime) ou l'a
  // remplacée (`PHOTO_CHANGED`, la nouvelle doit être relue).
  const { data: existing, error: readError } = await supabaseAdmin!
    .from('tcg_player_cards')
    .select('photo_path, photo_status')
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (readError) {
    logger.error('[admin/tcg] read error: %s', readError.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  const row = existing as {
    photo_path?: string | null;
    photo_status?: string | null;
  } | null;

  if (!row || row.photo_status !== 'pending') {
    // 409 et non 404 : la ligne existe peut-être, mais l'état a changé sous les
    // yeux de la relectrice. Le panneau rafraîchit plutôt que d'écraser.
    return notPending(res);
  }
  if (row.photo_path !== photoPath) {
    return photoChanged(res);
  }

  const nowIso = new Date().toISOString();
  const approving = decision === 'approve';

  // LA FILE AVANT LE POINTEUR, pour un REFUS. Même raison que le retrait côté
  // joueuse : une fois `photo_path` à NULL, plus rien ne porte le chemin, et
  // un `.remove()` en échec laisserait la photo joignable dans un bucket
  // public. Une photo refusée l'a justement été parce qu'elle pose problème —
  // c'est le dernier fichier qu'on peut se permettre d'oublier.
  //
  // Mise en file AVANT l'écriture conditionnelle, qui peut PERDRE la course
  // (la joueuse a remplacé sa photo entre-temps). Il resterait alors une ligne
  // de file pour un fichier encore référencé, que le balayage effacerait —
  // une carte cassée. D'où le `cancelPhotoPurge` sur cette branche, plus bas.
  if (!approving) {
    const queued = await enqueuePhotoPurge({
      tenantId: ctx.tenantId,
      userId,
      storagePath: photoPath,
      reason: 'rejected',
    });
    if (!queued) {
      return res.status(500).json({ error: 'Enregistrement impossible.' });
    }
  }

  // L'ÉCRITURE CONDITIONNELLE — la seule garantie. Entre la relecture et ici,
  // la joueuse peut encore remplacer ou retirer sa photo : la condition sur le
  // CHEMIN fait alors toucher zéro ligne, au lieu d'approuver une inconnue.
  const { data: written, error: writeError } = await supabaseAdmin!
    .from('tcg_player_cards')
    .update({
      photo_status: approving ? 'approved' : 'rejected',
      // Un refus retire le fichier (cf. l'en-tête) : le chemin ne doit plus
      // pointer vers rien.
      photo_path: approving ? photoPath : null,
      photo_reviewed_by: ctx.staff.id,
      photo_reviewed_at: nowIso,
      photo_rejected_reason: approving ? null : (reason ?? null),
      updated_at: nowIso,
    })
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', userId)
    .eq('photo_status', 'pending')
    .eq('photo_path', photoPath)
    .select('user_id');

  if (writeError) {
    logger.error('[admin/tcg] decision error: %s', writeError.message);
    return res.status(500).json({ error: 'Enregistrement impossible.' });
  }
  if (!Array.isArray(written) || written.length === 0) {
    // Course perdue : la photo a changé entre la relecture et l'écriture.
    // Rien n'est approuvé, rien n'est supprimé — et la ligne de file posée
    // au-dessus doit partir, sans quoi le balayage effacerait un fichier que
    // la base référence toujours (une carte cassée, l'inverse du but).
    if (!approving) await cancelPhotoPurge(photoPath);
    return photoChanged(res);
  }

  // Le fichier part APRÈS que la base ne le référence plus : dans l'autre
  // ordre, un échec d'écriture laisserait une ligne pointant vers un fichier
  // disparu. C'est le chemin CONFIRMÉ par l'écriture conditionnelle — donc le
  // fichier que la relectrice a vu et refusé, jamais celui d'un remplacement.
  if (!approving) {
    // L'échec n'est plus une impasse : le chemin est en file, le balayage
    // horaire reprendra.
    await tryPurgeNow(photoPath);
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: approving ? 'tcg_photo_approve' : 'tcg_photo_reject',
    entity_type: 'user',
    entity_id: userId,
    tenant_id: ctx.tenantId,
    payload: approving ? {} : { reason: reason ?? null },
  });

  // La décision change ce que voient les visiteuses de la fiche publique : une
  // approbation y fait apparaître la photo, un refus l'en retire. Régénérer
  // maintenant évite qu'une photo refusée reste visible le temps de l'ISR.
  await revalidatePlayerCard(res, userId);

  return res.status(200).json({ status: approving ? 'approved' : 'rejected' });
}

function notPending(res: NextApiResponse) {
  return res.status(409).json({
    error: 'Cette photo n’est plus en attente.',
    code: 'NOT_PENDING',
  });
}

function photoChanged(res: NextApiResponse) {
  return res.status(409).json({
    error: 'La photo a été remplacée depuis l’affichage : relis la nouvelle.',
    code: 'PHOTO_CHANGED',
  });
}

export default withStaffRoute(handler, { permission: 'manage_tcg' });
