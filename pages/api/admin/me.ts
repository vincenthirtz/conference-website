// @ts-nocheck
// @ts-nocheck
// pages/api/admin/me.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';

type MeResponse =
  | {
      id: string;
      auth_user_id: string;
      email: string;
      display_name: string | null;
      role: string;
      created_at: string;
    }
  | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MeResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 0) Vérifier que le client admin est dispo (service role non configuré)
  const adminClient = supabaseAdmin;
  if (!adminClient) {
    console.error(
      '[/api/admin/me] supabaseAdmin non configuré. Vérifie SUPABASE_SERVICE_ROLE_KEY.'
    );
    return res.status(500).json({
      error:
        'Configuration Supabase incomplète (service role manquant). Ajoute SUPABASE_SERVICE_ROLE_KEY.',
    });
  }

  // 1) Récupérer le token envoyé par le frontend
  //    (en général: Authorization: Bearer <access_token>)
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '')
    : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  // 2) Vérifier la validité du token et récupérer l'utilisateur
  const {
    data: { user },
    error: userError,
  } = await adminClient.auth.getUser(token);

  if (userError || !user) {
    console.error('[/api/admin/me] getUser error:', userError);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // 3) Chercher l'entrée dans la table staff liée à cet utilisateur
  const { data: staff, error: staffError } = await adminClient
    .from('staff')
    .select('id, auth_user_id, email, display_name, role, created_at')
    .eq('auth_user_id', user.id)
    .single();

  if (staffError || !staff) {
    console.error('[/api/admin/me] staff error:', staffError);
    return res.status(403).json({ error: 'Not a staff member' });
  }

  // 4) OK : renvoyer les infos staff (c’est ce que tu consommeras côté front)
  return res.status(200).json({
    id: staff.id,
    auth_user_id: staff.auth_user_id,
    email: staff.email,
    display_name: staff.display_name,
    role: staff.role,
    created_at: staff.created_at,
  });
}
