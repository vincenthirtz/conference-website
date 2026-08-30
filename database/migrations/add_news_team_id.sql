-- Migration: add_news_team_id.sql
-- Date: 2026-08-30
--
-- WHY:
--   Les actus auto-générées parlent d'une équipe — « X rejoint Eclypse »,
--   « LVN EMBERS rejoint le tournoi » — et les neuf générateurs qui les créent
--   posent tous `image_url: team.logo_url ?? null`. C'est une COPIE, prise à
--   l'instant de la publication.
--
--   L'équipe qui ajoute son logo APRÈS coup ne le voit donc jamais apparaître
--   sur ses articles : ils resteront gris pour toujours. Constaté en prod —
--   LVN EMBERS a publié son inscription au tournoi à 08:53 et posé son logo à
--   09:35 ; l'article est resté sans image. Idem LVN ASHES, Chocomates, 11Past.
--
--   Sur 12 articles sans image rattachables à une équipe, 3 de ces équipes ont
--   aujourd'hui un logo qui ne s'affiche nulle part.
--
--   C'est la même classe de défaut que `battle_tag_verified_at` avant
--   `sync_team_member_battletag_verification.sql` : un instantané dénormalisé
--   que rien ne rafraîchit.
--
-- WHAT:
--   L'article cesse de COPIER le logo pour DÉSIGNER l'équipe : `news.team_id`.
--   L'image affichée se résout à la lecture — `image_url` s'il y en a une
--   (choix éditorial explicite, prioritaire), sinon le logo de l'équipe liée,
--   lu en direct. Ajouter ou changer un logo se répercute alors sur tout
--   l'historique, sans reprise de données.
--
--   `image_url` n'est ni supprimé ni vidé : une actu écrite à la main garde son
--   visuel, et les articles déjà illustrés ne bougent pas.
--
--   Backfill : on rattache les articles existants en retrouvant l'id d'équipe
--   déjà présent dans leur slug — les générateurs les fabriquent sous la forme
--   `team-<uuid>-…` / `tournament-<uuid>-team-<uuid>-…`. Plutôt que de décoder
--   chaque motif, on teste l'appartenance de l'id : seul un vrai `teams.id`
--   peut correspondre, ce qui écarte au passage l'id de tournoi.
--
-- CAVEATS:
--   - `ON DELETE SET NULL` : supprimer une équipe ne doit pas emporter les
--     actus qui parlent d'elle. Elles perdent juste leur illustration dérivée.
--   - Le rattachement est scopé au tenant (`t.tenant_id = n.tenant_id`) : deux
--     tenants ne partagent pas leurs équipes.
--   - Reload du schema cache PostgREST OBLIGATOIRE : nouvelle FK, et les
--     lectures publiques s'appuient dessus pour l'embed `teams(logo_url)`.
--     Sans reload, l'embed échoue et la home perd ses actus.
--   - Idempotente : ADD COLUMN IF NOT EXISTS, contrainte créée seulement si
--     absente, backfill borné par `team_id IS NULL`.
--   - Rollback :
--       ALTER TABLE public.news DROP COLUMN IF EXISTS team_id;

BEGIN;

ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS team_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'news_team_id_fkey'
  ) THEN
    ALTER TABLE public.news
      ADD CONSTRAINT news_team_id_fkey
      FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_news_team_id
  ON public.news (team_id)
  WHERE team_id IS NOT NULL;

COMMENT ON COLUMN public.news.team_id IS
  'Equipe dont parle l''article. Sert a deriver l''illustration (logo) a la LECTURE : image_url reste prioritaire quand elle est renseignee.';

-- Backfill : l'id d'equipe est deja dans le slug des articles auto-generes.
UPDATE public.news n
   SET team_id = t.id
  FROM public.teams t
 WHERE n.team_id IS NULL
   AND t.tenant_id = n.tenant_id
   AND n.slug LIKE '%' || t.id::text || '%';

COMMIT;

-- Nouvelle FK : PostgREST doit la connaitre pour servir l'embed teams(logo_url).
NOTIFY pgrst, 'reload schema';
