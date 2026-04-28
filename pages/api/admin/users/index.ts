// pages/api/admin/users/index.ts
// Admin: création d'un utilisateur Supabase à la volée

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { sendWelcomeEmail } from '@/utils/email';

type CreateUserResponse =
  | {
      userId: string;
      email: string;
      passwordSentByEmail: boolean;
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
    return res.status(503).json({ error: 'Service unavailable.' });
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
        role: typeof role === 'string' ? role.toLowerCase() : 'player',
      },
    });

    if (error || !data?.user?.id) {
      console.error('[/api/admin/users] createUser error:', error);
      return res.status(500).json({ error: 'Failed to create user' });
    }

    // Send password by email only — never expose it in the API response
    let passwordSentByEmail = false;
    try {
      await sendWelcomeEmail(safeEmail, plainPassword);
      passwordSentByEmail = true;
    } catch (emailErr) {
      console.error('[/api/admin/users] welcome email error:', emailErr);
    }

    return res.status(201).json({
      userId: data.user.id,
      email: safeEmail,
      passwordSentByEmail,
    });
  } catch (err: unknown) {
    console.error('[/api/admin/users] internal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function generatePassword(length = 16) {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@$%^*';
  const maxValid = 256 - (256 % alphabet.length);
  const result: string[] = [];
  while (result.length < length) {
    const bytes = crypto.randomBytes(length - result.length);
    for (const byte of bytes) {
      if (byte < maxValid && result.length < length) {
        result.push(alphabet[byte % alphabet.length]);
      }
    }
  }
  return result.join('');
}
