/* ---------------------------------------------------------------------------
 * tcg_photo_purges.sql — la file des fichiers à effacer pour de bon
 *
 * POURQUOI. Un retrait de consentement (et un refus de modération) faisait
 * deux choses dans cet ordre : mettre `photo_path` à NULL en base, puis
 * supprimer le fichier du bucket. Le bucket `teams-images` est PUBLIC. Si le
 * `.remove()` échouait — réseau, 5xx du stockage, jeton expiré —, plus RIEN ne
 * portait le chemin : l'échec n'était que journalisé, aucune reprise n'était
 * possible, et la photo restait accessible par son URL pour toujours. C'est
 * l'exact inverse de la promesse « retrait rétroactif » que le produit affiche.
 *
 * L'ORDRE NE POUVAIT PAS SIMPLEMENT ÊTRE INVERSÉ. Supprimer le fichier d'abord
 * laisserait, en cas d'échec de l'écriture, une ligne pointant vers un fichier
 * disparu — une carte cassée. Il faut donc un troisième endroit qui survive
 * aux deux : cette file.
 *
 * CE QU'ELLE N'EST PAS. Pas un journal : une ligne n'existe que tant que le
 * fichier n'est pas effacé. Elle ne porte donc aucune donnée personnelle
 * au-delà d'un chemin de stockage, et disparaît au succès.
 *
 * IDEMPOTENT : `IF NOT EXISTS` partout.
 * ------------------------------------------------------------------------- */

BEGIN;

CREATE TABLE IF NOT EXISTS public.tcg_photo_purges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  -- La joueuse dont la photo part. Sert au diagnostic, JAMAIS à retrouver la
  -- photo : le chemin est la seule chose qui compte pour effacer.
  user_id uuid NOT NULL,
  -- Le chemin dans le bucket. C'est la donnée que le retrait perdait.
  storage_path text NOT NULL,
  -- Pourquoi ce fichier part : retrait par la joueuse, ou refus de modération.
  reason text NOT NULL CHECK (reason IN ('revoked', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Combien de fois le balayage a essayé. Une valeur qui grimpe est le signe
  -- d'un chemin qui ne s'efface jamais — à regarder, pas à ignorer.
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_error text
);

-- Un même chemin ne se met en file qu'une fois : deux retraits concurrents sur
-- la même photo ne doivent pas créer deux lignes que le balayage traiterait
-- toutes les deux (la seconde échouerait sur un fichier déjà parti, et sa
-- `attempts` grimperait pour rien).
CREATE UNIQUE INDEX IF NOT EXISTS tcg_photo_purges_path_uniq
  ON public.tcg_photo_purges (storage_path);

-- Le balayage lit les plus anciennes d'abord : une photo en attente depuis
-- hier passe avant une mise en file il y a une minute.
CREATE INDEX IF NOT EXISTS tcg_photo_purges_pending_idx
  ON public.tcg_photo_purges (created_at);

ALTER TABLE public.tcg_photo_purges ENABLE ROW LEVEL SECURITY;

-- AUCUNE POLITIQUE : la table n'est jamais lue par un client. Seul le service
-- role l'écrit (les routes de retrait) et la balaie (le cron). RLS activé sans
-- politique = refus par défaut pour `anon` et `authenticated`, ce qui est
-- exactement l'intention.

COMMENT ON TABLE public.tcg_photo_purges IS
  'Fichiers de photo à effacer du bucket public après un retrait de consentement ou un refus de modération. Une ligne survit tant que le fichier existe ; le balayage la supprime au succès. Sans elle, un `.remove()` en échec perdait le chemin et laissait la photo publique pour toujours.';

COMMIT;

NOTIFY pgrst, 'reload schema';
