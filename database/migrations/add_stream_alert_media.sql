-- Migration : habillage et son ENVOYÉS pour la boîte d'alertes.
-- Date: 2026-09-18
--
-- WHY:
--   `stream_alert_settings.sound_url` demandait de COLLER une URL. Personne
--   n'héberge un son d'alerte quelque part avant de le coller : le fichier est
--   sur le disque de la régie. Même chose pour l'habillage, qui n'était pas
--   réglable du tout — il fallait passer par le dépôt pour en changer.
--
--   Ces colonnes accueillent donc des fichiers DÉPOSÉS, sur le modèle de
--   `tcg_overlay_themes` : le bucket public porte le fichier, la base n'en
--   garde que le CHEMIN. Jamais une URL complète — le domaine de stockage peut
--   changer, le chemin non.
--
-- LE NŒUD RESTE L'HABILLAGE PAR DÉFAUT. `frame_path` NULL ne veut pas dire
--   « pas d'habillage » mais « celui du code » (`public/overlay/alerts/
--   noeud.webm`, dont la bande verte est mesurée au pixel). Un envoi ne fait
--   que le RECOUVRIR ; retirer le fichier rétablit le nœud. C'est pour ça que
--   la valeur par défaut est NULL et non un chemin : le défaut vit dans le
--   code, à un seul endroit.
--
-- POURQUOI `frame_kind` EXISTE À CÔTÉ DU CHEMIN. La source rend un `<img>` ou
--   une `<video>` selon ce champ. Le déduire de l'extension marcherait presque
--   — et « presque » suffit à produire un rectangle vide en plein direct. La
--   base tranche, avec un CHECK.
--
-- POURQUOI `sound_path` NE REMPLACE PAS `sound_url`. Les deux coexistent et
--   répondent à deux besoins : un fichier déposé (le cas courant) et une URL
--   externe (un son déjà hébergé ailleurs). Le fichier déposé PRIME ; le
--   retirer fait retomber sur l'URL, si elle existe. Le dire ici, en commentaire
--   de colonne, évite d'avoir à le deviner en lisant deux routes.
--
-- CAVEATS:
--   - Idempotente : ADD COLUMN IF NOT EXISTS.
--   - Purement ADDITIVE : trois colonnes, aucune donnée touchée, aucune
--     contrainte existante modifiée.

BEGIN;

ALTER TABLE public.stream_alert_settings
  -- Chemin dans le bucket PUBLIC `teams-images` (préfixe `stream-alerts/`).
  ADD COLUMN IF NOT EXISTS frame_path TEXT,
  -- Close, parce que la source rend un <img> ou une <video> selon ce champ :
  -- une troisième valeur produirait un trou à l'écran, en direct.
  ADD COLUMN IF NOT EXISTS frame_kind TEXT,
  -- Le son déposé. PRIME sur `sound_url` quand les deux sont posés.
  ADD COLUMN IF NOT EXISTS sound_path TEXT;

-- Les CHECK à part : `ADD CONSTRAINT IF NOT EXISTS` n'existe pas en Postgres,
-- et rejouer la migration ne doit pas échouer sur une contrainte déjà là.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stream_alert_settings_frame_kind_check'
  ) THEN
    ALTER TABLE public.stream_alert_settings
      ADD CONSTRAINT stream_alert_settings_frame_kind_check
      CHECK (frame_kind IS NULL OR frame_kind IN ('image', 'video'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stream_alert_settings_frame_path_len'
  ) THEN
    ALTER TABLE public.stream_alert_settings
      ADD CONSTRAINT stream_alert_settings_frame_path_len
      CHECK (frame_path IS NULL OR char_length(frame_path) <= 500);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stream_alert_settings_sound_path_len'
  ) THEN
    ALTER TABLE public.stream_alert_settings
      ADD CONSTRAINT stream_alert_settings_sound_path_len
      CHECK (sound_path IS NULL OR char_length(sound_path) <= 500);
  END IF;
END $$;

COMMENT ON COLUMN public.stream_alert_settings.frame_path IS
  'Habillage déposé (chemin dans le bucket public). NULL = l''habillage du code (noeud.webm), pas « aucun ».';
COMMENT ON COLUMN public.stream_alert_settings.frame_kind IS
  'image | video — la source rend un <img> ou une <video> selon ce champ.';
COMMENT ON COLUMN public.stream_alert_settings.sound_path IS
  'Son déposé (chemin dans le bucket public). PRIME sur sound_url ; le retirer fait retomber sur l''URL externe si elle existe.';

COMMIT;

-- Pas de FK ajoutée ici, mais PostgREST doit revoir ses colonnes : sans ce
-- signal, un `.select()` sur les nouvelles colonnes échoue en 42703.
NOTIFY pgrst, 'reload schema';
