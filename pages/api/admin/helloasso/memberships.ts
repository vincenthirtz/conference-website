import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, StaffContext } from '@/utils/staff';
import { fetchMemberships, fetchForms } from '@/utils/helloasso';
import { applyRateLimit } from '@/utils/rateLimit';

/**
 * GET /api/admin/helloasso/memberships
 *
 * Fetches memberships (adhésions) from HelloAsso and returns them.
 *
 * Query params:
 *   - formSlug: slug of the Membership form (optional — auto-detects if omitted)
 *   - page: page number (default 1)
 *   - pageSize: items per page (default 100, max 100)
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  _ctx: StaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'admin-helloasso')
  )
    return;

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(req.query.pageSize) || 100)
  );
  let formSlug =
    typeof req.query.formSlug === 'string' ? req.query.formSlug : '';

  try {
    // Auto-detect the membership form slug if not provided
    if (!formSlug) {
      const forms = await fetchForms();
      const membershipForm = forms.find((f) => f.formType === 'Membership');
      if (!membershipForm) {
        return res.status(404).json({
          error: "Aucun formulaire d'adhésion trouvé sur HelloAsso.",
          forms: forms.map((f) => ({
            slug: f.formSlug,
            type: f.formType,
            title: f.title,
          })),
        });
      }
      formSlug = membershipForm.formSlug;
    }

    const result = await fetchMemberships(formSlug, page, pageSize);

    return res.status(200).json({
      formSlug,
      items: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error('[admin/helloasso/memberships]', err);
    return res.status(502).json({
      error: 'Impossible de récupérer les adhésions depuis HelloAsso.',
    });
  }
}

export default withStaffRoute(handler, 'admin');
