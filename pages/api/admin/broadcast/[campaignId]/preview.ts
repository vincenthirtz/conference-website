// pages/api/admin/broadcast/[campaignId]/preview.ts
// Renvoie le HTML rendu d'une campagne, pour affichage en iframe dans l'admin.
// Param query optionnel : `label` (ex. "Vincent") pour personnaliser le greeting.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute } from '@/utils/staff';
import { getCampaign } from '@/utils/broadcasts';
import { applyBrand, resolveEmailBrand } from '@/utils/emailBrand';

export default withStaffRoute(handler, {
  permission: 'manage_broadcast',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  scope: 'platform',
});

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const campaignId = String(req.query.campaignId ?? '');
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return res.status(404).json({ error: 'Campagne inconnue.' });
  }

  const rawLabel = req.query.label;
  const label =
    typeof rawLabel === 'string' && rawLabel.trim()
      ? rawLabel.trim().slice(0, 80)
      : null;

  // Les gabarits portent des jetons de marque (`{{BRAND_LOGO_URL}}`,
  // `{{BRAND_SITE_URL}}`, `{{BRAND_NAME}}`) que seul `sendEmail` résolvait :
  // la preview affichait donc `<img src="{{BRAND_LOGO_URL}}">` — logo cassé,
  // liens morts et « {{BRAND_NAME}} » en toutes lettres dans le pied de page.
  // On refait ici ce que fait le transport, pour que la preview montre
  // exactement l'email envoyé. `resolveEmailBrand()` sans argument = marque
  // plateforme, comme `sendCampaignEmail` qui ne passe pas de tenantId.
  const brand = await resolveEmailBrand();
  const html = applyBrand(campaign.buildHtml(label), brand);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  // En-tête CSP léger : interdire toute exécution JS dans la preview
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src 'none'; frame-ancestors 'self'"
  );
  return res.status(200).send(html);
}
