-- Hashtags par destination sur un post multi-cibles.
--
-- POURQUOI UNE COLONNE, ET PAS DU TEXTE COLLÉ DANS `text_override`. Les tags
-- sont une donnée à part : ils sont ajoutés au texte au moment du rendu (donc
-- comptés dans la limite de la plateforme), mais on veut pouvoir les RELIRE —
-- c'est ce qui alimente les suggestions du champ de recherche. Noyés dans le
-- corps du message, il faudrait les redeviner à l'expression régulière, et on
-- confondrait un tag avec un `#` écrit dans une phrase.
--
-- Stockés SANS le croisillon et en minuscules : c'est la forme canonique qui
-- permet de dédoublonner « #Overwatch » et « #overwatch ».
--
-- Seules Bluesky et Instagram en portent (cf. `supportsHashtags` dans
-- utils/social/platforms.ts) : sur le site un tag n'a pas de sens (la table
-- `news` a déjà sa colonne `tag`), et sur Discord `#quelquechose` désigne un
-- salon — un tag y serait activement trompeur.

ALTER TABLE social_post_targets
  ADD COLUMN IF NOT EXISTS hashtags text[] NOT NULL DEFAULT '{}';

-- Les suggestions lisent « les tags déjà utilisés » : un index GIN rend le
-- dépliage rapide même quand l'historique grossit.
CREATE INDEX IF NOT EXISTS idx_social_post_targets_hashtags
  ON social_post_targets USING GIN (hashtags);

NOTIFY pgrst, 'reload schema';
