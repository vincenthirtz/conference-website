// pages/api/cron/domain-verify.ts
//
// Revérifie chaque jour les domaines propres.
//
// Un domaine vérifié une fois ne le reste pas : un client peut changer
// d'hébergeur, retirer le CNAME, laisser expirer le nom. Sans repasse, la
// plateforme continuerait de router — et surtout d'affirmer sur la fiche que
// tout va bien — pour un domaine qui ne pointe plus ici depuis des semaines.
//
// Deux populations traitées :
//   - `verified` → une régression le repasse en `failed` (et le domaine cesse
//     d'être routé, ce qui est le comportement voulu : mieux vaut le slug que
//     l'illusion) ;
//   - `pending`  → une preuve enfin posée le passe en `verified`, sans que
//     personne n'ait à revenir cliquer.
//
// Résilient : une erreur par espace n'arrête pas la boucle. Auth CRON_SECRET
// fail-closed, comme les autres crons.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { checkDomain } from '@/utils/tenants/domainVerification';
import { invalidateTenantHostCache } from '@/utils/tenant';

function checkAuth(req: NextApiRequest): 'missing' | 'ok' | 'mismatch' {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/domain-verify] CRON_SECRET not configured — refusing');
    return 'missing';
  }
  const header = req.headers.authorization;
  const bearer =
    typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice(7)
      : '';
  const query = typeof req.query.secret === 'string' ? req.query.secret : '';
  return bearer === secret || query === secret ? 'ok' : 'mismatch';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const auth = checkAuth(req);
  if (auth === 'missing') {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }
  if (auth === 'mismatch') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, custom_domain, custom_domain_state, custom_domain_token')
    .not('custom_domain', 'is', null)
    .in('custom_domain_state', ['verified', 'pending']);

  if (error) {
    logger.error('[cron/domain-verify] load error', error);
    return res.status(500).json({ error: 'Failed to load tenants.' });
  }

  const rows = (data ?? []) as Array<{
    id: string;
    slug: string;
    custom_domain: string;
    custom_domain_state: string;
    custom_domain_token: string | null;
  }>;

  let checked = 0;
  let changed = 0;
  const transitions: Array<{ slug: string; from: string; to: string }> = [];

  for (const row of rows) {
    if (!row.custom_domain_token) continue;
    try {
      const check = await checkDomain(
        row.custom_domain,
        row.custom_domain_token
      );
      checked += 1;
      const next = check.ok ? 'verified' : 'failed';

      await supabaseAdmin
        .from('tenants')
        .update({
          custom_domain_state: next,
          custom_domain_checked_at: new Date().toISOString(),
          custom_domain_error:
            check.ok && check.routingFound ? null : check.detail,
        })
        .eq('id', row.id);

      if (next !== row.custom_domain_state) {
        changed += 1;
        transitions.push({
          slug: row.slug,
          from: row.custom_domain_state,
          to: next,
        });
        // Une bascule change ce qui est routé : le cache mémoire doit lâcher.
        invalidateTenantHostCache();
        logger.warn('[cron/domain-verify] transition', {
          slug: row.slug,
          domain: row.custom_domain,
          from: row.custom_domain_state,
          to: next,
        });
      }
    } catch (err) {
      // Un DNS injoignable est une panne du réseau, pas du client : on ne
      // dégrade PAS son état sur une exception, on passe au suivant.
      logger.error('[cron/domain-verify] check failed', {
        slug: row.slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return res.status(200).json({ checked, changed, transitions });
}
