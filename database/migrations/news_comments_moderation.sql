-- Migration: modération des commentaires d'actualités
-- Date: 2026-10-06
--
-- Jusqu'ici un commentaire passant le captcha était publié aussitôt, et le
-- staff ne pouvait que le SUPPRIMER après coup : pas de mise en attente, pas
-- de masquage réversible, pas moyen de fermer les commentaires d'un article
-- qui dérape.
--
--   * `news_comments.status` : visible | pending | hidden. Défaut `visible` —
--     le comportement historique (publication directe) reste celui par défaut.
--     Le mode « pré-modération » est un réglage du tenant (site_settings,
--     clé `news_comments_moderation` = 'pre') qui fait naître les nouveaux
--     commentaires en `pending`. La lecture publique ne rend que `visible`.
--   * `news.comments_closed` : interrupteur par article. Fermé, l'article
--     refuse les nouveaux commentaires (403 COMMENTS_CLOSED) et le formulaire
--     disparaît ; les commentaires existants restent lisibles.
--
-- Avant application, le code se replie : lecture/écriture sans ces colonnes
-- (tout est visible, rien n'est fermé), et l'écran de modération masque les
-- actions qui en dépendent.
--
-- Idempotent.

ALTER TABLE public.news_comments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'visible';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'news_comments_status_check'
  ) THEN
    ALTER TABLE public.news_comments
      ADD CONSTRAINT news_comments_status_check
      CHECK (status IN ('visible', 'pending', 'hidden'));
  END IF;
END $$;

COMMENT ON COLUMN public.news_comments.status IS
  'visible (publié) | pending (en attente de modération) | hidden (masqué par le staff).';

-- Lecture publique : commentaires visibles d'un article, récents d'abord.
CREATE INDEX IF NOT EXISTS idx_news_comments_tenant_news_status_created
  ON public.news_comments (tenant_id, news_id, status, created_at DESC);

-- File de modération : commentaires en attente du tenant.
CREATE INDEX IF NOT EXISTS idx_news_comments_tenant_pending
  ON public.news_comments (tenant_id, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS comments_closed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.news.comments_closed IS
  'Commentaires fermés sur cet article : plus de nouveau commentaire, les existants restent lisibles.';
