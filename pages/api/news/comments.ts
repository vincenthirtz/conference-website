import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { verifyCaptcha } from '@/utils/captcha';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import { isMissingColumnError } from '@/utils/moderation/missingColumn';
import {
  getCommentModerationMode,
  initialCommentStatus,
} from '@/utils/moderation/newsComments';

import { logger } from '../../../utils/logger';
type Comment = {
  id: string;
  news_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
};

/**
 * `code` : identifiant STABLE de l'erreur, que le client traduit lui-même. Le
 * champ `error` reste un message technique, destiné aux journaux — il ne doit
 * plus être affiché tel quel (il l'était, en français, dans une interface
 * pouvant être en anglais).
 */
type ListResponse =
  | { items: Comment[]; commentsClosed?: boolean }
  | { error: string; code?: string };

type CreateResponse =
  | { comment: Comment; pending?: boolean }
  | { error: string; code?: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListResponse | CreateResponse>
) {
  if (req.method === 'GET') {
    return listComments(req, res);
  }
  if (req.method === 'POST') {
    return createComment(req, res);
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function listComments(
  req: NextApiRequest,
  res: NextApiResponse<ListResponse>
) {
  const newsId = (req.query.newsId || '').toString().trim();
  const limit = Math.min(
    100,
    Math.max(1, parseInt((req.query.limit || '50').toString(), 10) || 50)
  );

  if (!newsId) {
    return res.status(400).json({ error: 'newsId is required' });
  }

  const client = supabaseAdmin || getServerClient(req, res);
  if (!client) {
    return res.status(500).json({ error: 'Supabase client unavailable' });
  }

  const tenantId = await resolveTenantIdForPublicRequestAsync(req);

  // Seuls les commentaires VISIBLES sont publics : ni ceux en attente de
  // pré-modération, ni ceux masqués par le staff. Deux `neq` plutôt qu'un
  // `eq('visible')` : même résultat sur une colonne NOT NULL, et une ligne
  // sans statut (avant migration) reste lisible. Colonne absente → relecture
  // sans filtre (tout était publié avant la migration).
  const base = () =>
    client
      .from('news_comments')
      .select('id, news_id, author_name, content, created_at')
      .eq('news_id', newsId)
      .eq('tenant_id', tenantId);
  const [listed, closure] = await Promise.all([
    (async () => {
      const first = await base()
        .neq('status', 'pending')
        .neq('status', 'hidden')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (first.error && isMissingColumnError(first.error, 'status')) {
        return base().order('created_at', { ascending: false }).limit(limit);
      }
      return first;
    })(),
    readCommentsClosed(client, newsId, tenantId),
  ]);
  const { data, error } = listed;

  if (error) {
    logger.error('[/api/news/comments] list error:', error);
    return res.status(500).json({ error: 'Failed to fetch comments' });
  }

  // Deux caches, deux règles.
  //   - CDN Netlify : garde 60 s (+ 30 s de stale-while-revalidate) — la liste
  //     est lue par chaque lecteur d'un article. En-tête propre au CDN, retiré
  //     avant d'atteindre le navigateur ; la clé varie sur la query
  //     (`Netlify-Vary`, next.config.js — tests/unit/cdnCacheVary).
  //   - Navigateur : AUCUNE réutilisation. `s-maxage` + `stale-while-revalidate`
  //     dans `Cache-Control` laissaient Chrome resservir l'ancienne liste juste
  //     après une publication (SWR s'applique aussi au cache privé). L'autrice
  //     voit son commentaire par la réponse du POST, fusionnée côté client
  //     (pages/news/[slug].tsx), pas par une variante d'URL.
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader(
    'Netlify-CDN-Cache-Control',
    'public, s-maxage=60, stale-while-revalidate=30'
  );
  // `commentsClosed` : le formulaire disparaît sur un article fermé (les
  // commentaires existants restent lisibles).
  return res
    .status(200)
    .json({ items: data || [], commentsClosed: closure === true });
}

type CommentsClient = NonNullable<typeof supabaseAdmin>;

/**
 * `news.comments_closed` de l'article (null si illisible). Colonne absente
 * avant la migration : jamais fermé.
 */
async function readCommentsClosed(
  client: CommentsClient,
  newsId: string,
  tenantId: string
): Promise<boolean | null> {
  const { data, error } = await client
    .from('news')
    .select('comments_closed')
    .eq('id', newsId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    if (!isMissingColumnError(error, 'comments_closed')) {
      logger.warn('[/api/news/comments] closure lookup error:', error);
    }
    return null;
  }
  return data?.comments_closed === true;
}

async function createComment(
  req: NextApiRequest,
  res: NextApiResponse<CreateResponse>
) {
  const client = supabaseAdmin || getServerClient(req, res);
  if (!client) {
    return res.status(500).json({ error: 'Service unavailable.' });
  }

  // Rate limiting: 10 comments per 10 minutes
  if (
    applyRateLimit(req, res, { max: 10, windowMs: 10 * 60 * 1000 }, 'comments')
  )
    return;

  const { newsId, content, authorName, honeypot, captchaToken, captchaAnswer } =
    req.body || {};
  const trimmedContent = (content || '').toString().trim();
  const trimmedNewsId = (newsId || '').toString().trim();
  const trimmedAuthor = authorName ? authorName.toString().trim() : null;

  // Simple anti-bot: reject if honeypot filled
  if (honeypot && `${honeypot}`.trim().length > 0) {
    return res
      .status(400)
      .json({ error: 'Bot detected', code: 'BOT_DETECTED' });
  }

  // Verify CAPTCHA challenge-response
  const captchaResult = await verifyCaptcha(
    (captchaToken || '').toString(),
    (captchaAnswer || '').toString()
  );
  if (!captchaResult.valid) {
    return res.status(400).json({
      error: captchaResult.error || 'Invalid captcha',
      code: 'CAPTCHA_INVALID',
    });
  }

  if (!trimmedNewsId) {
    return res
      .status(400)
      .json({ error: 'newsId is required', code: 'NEWS_ID_REQUIRED' });
  }
  if (!trimmedContent || trimmedContent.length < 3) {
    return res.status(400).json({
      error: 'content must contain at least 3 characters',
      code: 'CONTENT_TOO_SHORT',
    });
  }

  if (trimmedContent.length > 2000) {
    return res.status(400).json({
      error: 'content must be at most 2000 characters',
      code: 'CONTENT_TOO_LONG',
    });
  }

  if (trimmedAuthor && trimmedAuthor.length > 50) {
    return res.status(400).json({
      error: 'author name must be at most 50 characters',
      code: 'AUTHOR_TOO_LONG',
    });
  }

  const tenantId = await resolveTenantIdForPublicRequestAsync(req);

  // Vérifie que l'article ciblé existe ET appartient au tenant résolu ET est
  // publié. Sans ce check, un POST pouvait attacher un commentaire à un
  // news_id arbitraire (autre tenant, brouillon, ou inexistant) → rows
  // orphelines / cross-tenant. On lit avec le client service-role (supabaseAdmin
  // si dispo) pour ne pas dépendre des RLS publiques.
  const { data: newsRow, error: newsErr } = await client
    .from('news')
    .select('id, status')
    .eq('id', trimmedNewsId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (newsErr) {
    logger.error('[/api/news/comments] news lookup error:', newsErr);
    return res.status(500).json({ error: 'Failed to create comment' });
  }
  // Messages TECHNIQUES en anglais + `code` stable : le client traduit le code,
  // il n'affiche plus la chaîne du serveur. Elle était en français ici, donc
  // une lectrice en anglais recevait « Les commentaires sont fermés sur cet
  // article. » au milieu d'une interface traduite.
  if (!newsRow) {
    return res
      .status(404)
      .json({ error: 'News article not found', code: 'NEWS_NOT_FOUND' });
  }
  if ((newsRow as { status?: string }).status !== 'published') {
    return res.status(403).json({
      error: 'Comments are closed on this article',
      code: 'COMMENTS_CLOSED',
    });
  }
  // Interrupteur staff « commentaires fermés » sur l'article.
  if ((await readCommentsClosed(client, trimmedNewsId, tenantId)) === true) {
    return res.status(403).json({
      error: 'Comments are closed on this article',
      code: 'COMMENTS_CLOSED',
    });
  }

  // Pré-modération (réglage du tenant) : le commentaire naît `pending` et
  // n'apparaît qu'une fois validé. Par défaut, publication directe : la clé
  // `status` est alors omise (défaut base `visible`), ce qui garde l'insert
  // valide avant la migration.
  const pending =
    initialCommentStatus(await getCommentModerationMode(tenantId)) ===
    'pending';
  const row = {
    news_id: trimmedNewsId,
    content: trimmedContent,
    author_name: trimmedAuthor,
    tenant_id: tenantId,
  };
  const insert = (payload: typeof row) =>
    client
      .from('news_comments')
      .insert(payload)
      .select('id, news_id, author_name, content, created_at')
      .maybeSingle();
  let { data, error } = await insert(
    pending ? ({ ...row, status: 'pending' } as typeof row) : row
  );
  let held = pending;
  if (pending && error && isMissingColumnError(error, 'status')) {
    // Pré-modération réglée mais migration absente : on publie plutôt que de
    // perdre le commentaire, et on le signale.
    logger.warn(
      '[/api/news/comments] pre-moderation set but status column missing'
    );
    ({ data, error } = await insert(row));
    held = false;
  }

  if (error || !data) {
    logger.error('[/api/news/comments] create error:', error);
    return res.status(500).json({ error: 'Failed to create comment' });
  }

  // `pending: true` : le client n'affiche pas le commentaire, il annonce
  // qu'il sera publié après relecture.
  return res
    .status(201)
    .json(held ? { comment: data, pending: true } : { comment: data });
}
