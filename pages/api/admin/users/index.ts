// @ts-nocheck
// pages/api/admin/users/index.ts
// Admin: création d'un utilisateur Supabase à la volée

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';

type CreateUserResponse =
  | {
      userId: string;
      email: string;
      tempPassword?: string;
    }
  | { error: string };

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateUserResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Supabase service role not configured' });
  }

  const { email, password, display_name, role } = req.body || {};

  if (typeof email !== 'string' || email.trim().length === 0) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const safeEmail = email.trim();
  const plainPassword =
    typeof password === 'string' && password.trim().length >= 6
      ? password.trim()
      : generatePassword(16);

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: safeEmail,
      password: plainPassword,
      email_confirm: true,
      user_metadata: {
        display_name: typeof display_name === 'string' ? display_name : null,
        role: typeof role === 'string' ? role : 'player',
      },
    });

    if (error || !data?.user?.id) {
      console.error('[/api/admin/users] createUser error:', error);
      return res
        .status(500)
        .json({ error: error?.message || 'Failed to create user' });
    }

    return res.status(201).json({
      userId: data.user.id,
      email: safeEmail,
      tempPassword: plainPassword,
    });
  } catch (err: any) {
    console.error('[/api/admin/users] internal error:', err);
    return res
      .status(500)
      .json({ error: err?.message || 'Internal server error' });
  }
}

function generatePassword(length = 16) {
  const buffer = crypto.randomBytes(length);
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@$%^*';
  return Array.from(buffer)
    .map((byte) => alphabet[byte % alphabet.length])
    .join('')
    .slice(0, length);
}
