-- Migration : habillage de la source navigateur OBS du TCG.
-- Date: 2026-09-14
--
-- WHY:
--   L'overlay (`pages/overlay/tcg/[token].tsx`) a une apparence ÉCRITE EN DUR :
--   une pastille noire, une étoile, deux formulations figées. Chaque régie a sa
--   charte, et la seule façon d'en changer était de modifier le dépôt. Cette
--   table déplace l'apparence de la compilation vers la configuration.
--
-- POURQUOI UNE TABLE SÉPARÉE DE `tcg_overlay_tokens`, et c'est le point le plus
--   important de cette migration : le JETON TOURNE. « Régénérer » insère une
--   ligne neuve et marque la précédente `revoked_at` — c'est le geste « le lien
--   a circulé ». Un thème logé sur la ligne du jeton serait donc PERDU à chaque
--   rotation, c'est-à-dire précisément au moment le plus tendu (un lien a fuité
--   pendant un direct). L'habillage appartient à l'espace, pas au lien.
--
-- POURQUOI DES COLONNES ET NON UN JSONB. Un JSONB accepterait n'importe quelle
--   forme, et l'overlay tourne pendant un direct : une valeur aberrante ne doit
--   pas pouvoir y arriver. Des colonnes portent des CHECK — couleur au format
--   hexadécimal, nature de média close, position close. La base refuse ce que
--   l'interface aurait laissé passer.
--
-- POURQUOI TOUT EST NULLABLE. `NULL` ne veut pas dire « vide » mais « garde le
--   défaut du code ». Un espace qui n'a jamais ouvert l'éditeur doit avoir
--   exactement l'overlay d'aujourd'hui, sans ligne en base. Le défaut vit donc
--   dans `utils/tcg/overlayTheme.ts`, un seul endroit, et la table n'enregistre
--   que les ÉCARTS voulus.
--
-- LE TEXTE EST DU CONTENU, PAS DE LA TRADUCTION. `drop_line` / `win_line`
--   remplacent des clés i18n par une phrase choisie par la régie. Conséquence
--   assumée : elles ne sont pas traduites — c'est le texte de CETTE chaîne, qui
--   diffuse dans SA langue. Elles sont rendues en TEXTE, jamais en HTML.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : elle ne stocke aucun média. Le fichier
--   va dans le bucket public `teams-images` (préfixe `tcg/overlay/`), comme les
--   photos de carte ; seul son CHEMIN est ici.
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS partout.
--   - Purement ADDITIVE : une table neuve, aucune existante touchée.
--   - RLS activée SANS policy : l'overlay est servi par une route en
--     service-role, aucun client anonyme ne lit cette table en direct.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tcg_overlay_themes (
  -- Un habillage par espace. Clé primaire directe : il n'y a rien à versionner,
  -- et l'unicité est le comportement voulu (pas de « deux thèmes actifs »).
  tenant_id     UUID PRIMARY KEY,

  -- Couleur d'accent, format `#RRGGBB`. NULL = celle du code.
  -- Le CHECK vaut mieux qu'une validation applicative seule : cette valeur part
  -- dans un attribut `style`, et une chaîne arbitraire n'y a pas sa place.
  accent_color  TEXT CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$'),

  -- Chemin dans le bucket PUBLIC `teams-images`. Jamais une URL complète : le
  -- domaine de stockage peut changer, le chemin non.
  media_path    TEXT,
  -- Close, parce que l'overlay rend un <img> ou une <video> selon ce champ :
  -- une troisième valeur produirait un trou à l'écran, en direct.
  media_kind    TEXT CHECK (media_kind IS NULL OR media_kind IN ('image', 'video')),

  -- Formulations. Interpolent `{name}`. Bornées à 120 caractères : au-delà, la
  -- phrase déborde de la pastille et devient illisible en surimpression — la
  -- borne est ici pour que l'interface ne soit pas seule à la tenir.
  drop_line     TEXT CHECK (drop_line IS NULL OR char_length(drop_line) <= 120),
  win_line      TEXT CHECK (win_line IS NULL OR char_length(win_line) <= 120),

  -- Coin d'ancrage dans la scène OBS. Close pour la même raison que media_kind.
  position      TEXT CHECK (position IS NULL OR position IN (
    'top-left', 'top-right', 'bottom-left', 'bottom-right'
  )),

  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Qui a modifié en dernier. Nullable : une écriture par script n'a pas
  -- d'auteur, et perdre le thème pour cette raison serait absurde.
  updated_by    UUID
);

ALTER TABLE public.tcg_overlay_themes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.tcg_overlay_themes IS
  'Habillage de la source navigateur OBS du TCG, par espace. Table SÉPARÉE des jetons parce que le jeton tourne (régénérer révoque) et emporterait le thème avec lui. NULL = garder le défaut du code, pas « vide ».';

COMMIT;

-- PostgREST doit revoir son cache de schéma, sinon la table reste invisible à
-- l'API jusqu'au prochain redémarrage.
NOTIFY pgrst, 'reload schema';
