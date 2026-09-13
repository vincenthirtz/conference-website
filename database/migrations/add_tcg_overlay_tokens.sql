-- Migration : jeton d'overlay TCG pour OBS / Streamlabs.
-- Date: 2026-09-13
--
-- POURQUOI UN JETON, ET PAS L'IDENTIFIANT DU TENANT. Une source navigateur OBS
-- ne peut pas se connecter : elle charge une URL, point. L'URL est donc
-- PUBLIQUE, et quiconque l'a voit ce qu'elle affiche. Deux conséquences :
--
--   1. elle doit être RÉVOCABLE. Une URL collée dans une configuration OBS,
--      montrée à l'écran pendant un partage d'écran ou laissée dans un fichier
--      de scènes partagé, échappe ensuite à notre contrôle. Un identifiant de
--      tenant ne se révoque pas ; un jeton, si. Même raisonnement que
--      `add_player_calendar_tokens.sql` — un flux collé dans Google Calendar y
--      vit hors de notre portée.
--
--   2. elle ne doit porter QUE du déjà-public. Ce que l'overlay affiche est un
--      pseudo Twitch (visible de tout le chat) et un événement de jeu. Jamais
--      le nom du compte du site, jamais un email, jamais un identifiant. Cette
--      règle vit dans le code de lecture ; le jeton ne la remplace pas, il
--      limite la casse si l'URL circule.
--
-- PORTÉE TENANT, PAS JOUEUSE. C'est la différence avec les jetons d'agenda :
-- un overlay appartient à la régie d'un espace, pas à une personne. D'où
-- `tenant_id` seul en clé d'unicité active, et `created_by` conservé pour
-- savoir qui a émis le lien.
--
-- CAVEATS :
--   - Idempotente : IF NOT EXISTS partout.
--   - RLS activée SANS policy : la route de lecture passe par le service-role,
--     aucun client anonyme ne touche cette table. Le jeton est un secret
--     porteur, il ne se lit pas depuis le navigateur.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tcg_overlay_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  token        TEXT NOT NULL,
  -- Qui a émis le lien. Nullable : un jeton créé par un script d'exploitation
  -- n'a pas d'auteur, et perdre le jeton pour cette raison serait absurde.
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Permet de constater qu'un lien oublié sert encore, donc de le révoquer en
  -- connaissance de cause.
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

-- Le jeton identifie l'appelant à lui seul : il est unique globalement.
CREATE UNIQUE INDEX IF NOT EXISTS tcg_overlay_tokens_token_key
  ON public.tcg_overlay_tokens (token);

-- Au plus UN jeton actif par tenant. Index partiel : les jetons révoqués
-- restent en base (trace) sans bloquer la rotation. Régénérer EST le geste
-- « le lien a fuité ».
CREATE UNIQUE INDEX IF NOT EXISTS tcg_overlay_tokens_active_key
  ON public.tcg_overlay_tokens (tenant_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.tcg_overlay_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.tcg_overlay_tokens IS
  'Jeton porteur d''une source navigateur OBS pour le TCG. URL publique et révocable : elle ne doit exposer que du déjà-public (pseudo Twitch, événement de jeu).';

COMMIT;

-- PostgREST doit revoir son cache de schéma, sinon la table reste invisible à
-- l'API jusqu'au prochain redémarrage.
NOTIFY pgrst, 'reload schema';
