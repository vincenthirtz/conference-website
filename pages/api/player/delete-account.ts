// pages/api/player/delete-account.ts
// DELETE : l'utilisateur supprime définitivement son propre compte (droit à l'oubli RGPD)
//
// Ce que « supprimer » veut dire table par table n'est PAS écrit ici : c'est le
// registre `utils/player/personalDataTables.ts`, que l'export lit aussi. Avant
// lui, cette route ne nettoyait que `staff`, `team_members` et `demandes`, et
// la photo TCG d'une joueuse restait dans le bucket public après son départ.
//
// ORDRE : registre (fichiers puis lignes) → `deleteUser` → email. Tout ce qui
// référence l'utilisatrice passe AVANT `deleteUser`, sans quoi l'identifiant
// servant à retrouver ses lignes sans clé étrangère disparaîtrait en route.
// L'email « compte supprimé » part APRÈS : il ne doit pas annoncer une
// suppression qui vient d'échouer.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { sendAccountDeletedEmail } from '@/utils/email';
import { withAuthRoute } from '@/utils/staff';
import { erasePersonalData } from '@/utils/player/erasePersonalData';
import { revalidatePlayerCard } from '@/utils/tcg/revalidatePlayerCard';

import { logger } from '../../../utils/logger';
export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 3, windowMs: 60_000 },
      'player-delete-account'
    )
  )
    return;

  const userId = user.id;

  // Owners cannot self-delete — too critical, must be removed by another owner
  const { data: staffEntry } = await supabaseAdmin
    .from('staff')
    .select('role')
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (staffEntry?.role === 'owner') {
    return res.status(403).json({
      error:
        'Les comptes owner ne peuvent pas être auto-supprimés. Contacte un autre owner.',
    });
  }

  // Un échec de FICHIER ne bloque pas (journalisé avec les chemins) ; un échec
  // de LIGNE bloque, compte intact, pour qu'un nouvel essai retrouve tout.
  // Détail et justification : utils/player/erasePersonalData.ts.
  const erased = await erasePersonalData(userId);
  if (!erased.ok) {
    return res.status(500).json({
      error:
        'Erreur lors de la suppression de tes données. Ton compte n’a pas été supprimé : réessaie dans quelques instants.',
      code: 'personal_data_erase_failed',
    });
  }

  // Delete auth user
  const { error: deleteErr } =
    await supabaseAdmin.auth.admin.deleteUser(userId);

  if (deleteErr) {
    logger.error('[player/delete-account] delete error:', deleteErr);
    return res
      .status(500)
      .json({ error: 'Erreur lors de la suppression du compte.' });
  }

  // La fiche publique `/player/<id>` est en ISR : sans régénération, elle
  // servirait encore nom et photo jusqu'à cinq minutes. Best-effort, ne lève pas.
  await revalidatePlayerCard(res, userId);

  // Send account deleted email (non-blocking)
  if (user.email) {
    sendAccountDeletedEmail(user.email).catch((err) => {
      logger.error('[player/delete-account] email error:', err);
    });
  }

  return res.status(200).json({ success: true });
});
