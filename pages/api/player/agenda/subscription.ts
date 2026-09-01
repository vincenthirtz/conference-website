// pages/api/player/agenda/subscription.ts
//
// L'abonnement calendrier de la personne (lot J2) :
//   GET    — le lien courant, ou `null` si elle n'en a jamais créé ;
//   POST   — en émet un neuf ET révoque le précédent (donc : « régénérer ») ;
//   DELETE — révoque, sans en émettre.
//
// Jamais inspectable par le staff (`?as=` refusé en écriture par le wrapper, et
// le GET n'est pas inscrit comme lecture inspectable) : un lien porteur ne se
// consulte pas au-dessus de l'épaule de quelqu'un. C'est la même règle que
// `player/data-export` et `player/push/*`.

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import {
  getActiveCalendarToken,
  revokeCalendarToken,
  rotateCalendarToken,
} from '@/utils/player/calendarToken';

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  'https://owwomenscup.fr'
).replace(/\/$/, '');

export type AgendaSubscription = {
  /** URL https du flux, ou `null` si aucun abonnement actif. */
  url: string | null;
  /** Même flux en `webcal://` — ce que les clients d'agenda savent ouvrir. */
  webcalUrl: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
};

function present(
  token: string | null,
  createdAt: string | null,
  lastUsedAt: string | null
): AgendaSubscription {
  if (!token) {
    return { url: null, webcalUrl: null, createdAt: null, lastUsedAt: null };
  }
  const url = `${SITE_URL}/api/player/agenda.ics?token=${token}`;
  return {
    url,
    webcalUrl: url.replace(/^https?:/, 'webcal:'),
    createdAt,
    lastUsedAt,
  };
}

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AgendaSubscription | { error: string }>,
  { user }
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 20, windowMs: 60_000 },
      'agenda-subscription'
    )
  ) {
    return;
  }

  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: user.id,
  });

  if (req.method === 'GET') {
    const row = await getActiveCalendarToken(user.id, tenantId);
    return res
      .status(200)
      .json(
        present(
          row?.token ?? null,
          row?.created_at ?? null,
          row?.last_used_at ?? null
        )
      );
  }

  if (req.method === 'POST') {
    const token = await rotateCalendarToken(user.id, tenantId);
    if (!token) {
      return res.status(500).json({ error: 'Impossible de créer le lien.' });
    }
    return res.status(200).json(present(token, new Date().toISOString(), null));
  }

  if (req.method === 'DELETE') {
    await revokeCalendarToken(user.id, tenantId);
    return res.status(200).json(present(null, null, null));
  }

  res.setHeader('Allow', 'GET,POST,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
});
