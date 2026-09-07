-- Mur « nos réseaux » : les publications de nos comptes, recopiées chez nous.
--
-- POURQUOI UNE TABLE, ALORS QUE LE MIROIR DISCORD N'EN AVAIT PAS BESOIN. Le
-- miroir est un tuyau : il lit, il émet, il oublie — un curseur lui suffit.
-- Afficher les publications SUR LE SITE change le besoin : il faut pouvoir les
-- relire sans rappeler quatre API, dont deux qui exigent un jeton (Instagram,
-- TikTok) qui n'a rien à faire dans un rendu public.
--
-- Le cron du miroir remplit cette table au passage, avec ce qu'il a déjà lu :
-- aucun appel réseau supplémentaire.
--
-- LES VIGNETTES SONT DES COPIES, pas des liens. La couverture d'une vidéo
-- TikTok expire au bout de six heures et une URL de média Instagram est signée :
-- stocker l'URL d'origine donnerait un mur d'images mortes le lendemain. La
-- colonne ne contient donc que des URLs de NOTRE bucket (ou NULL).
--
-- CLÉ NATURELLE (tenant, source, external_id) : c'est elle qui rend le cron
-- idempotent. Sans elle, quatre-vingts lignes s'ajouteraient tous les quarts
-- d'heure.
--
-- RLS : lecture ouverte à tous, y compris `anon`. Ce contenu est PUBLIC par
-- construction — il est déjà lisible par n'importe qui sur Bluesky, YouTube,
-- Instagram et TikTok. Aucune policy d'écriture : la service role seule écrit.
--
-- Idempotent : re-jouable sans effet.

CREATE TABLE IF NOT EXISTS social_feed_items (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Clé de `CURSOR_KEYS` (utils/social/feedMirror.ts) : bluesky | youtube |
  -- instagram | tiktok. Pas de CHECK — le catalogue vit dans le code, et un
  -- enum SQL imposerait une migration à chaque réseau ajouté.
  source        text NOT NULL,
  /* Identifiant chez la source : URI at:// (Bluesky), videoId (YouTube),
     media id (Instagram), video id (TikTok). */
  external_id   text NOT NULL,
  url           text NOT NULL,
  text          text NOT NULL DEFAULT '',
  /* URL dans NOTRE bucket, ou NULL. Jamais une URL tierce — voir l'en-tête. */
  thumbnail_url text,
  published_at  timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source, external_id)
);

-- La seule requête de lecture : « les N dernières, toutes sources confondues ».
CREATE INDEX IF NOT EXISTS idx_social_feed_items_recent
  ON social_feed_items (tenant_id, published_at DESC);

ALTER TABLE social_feed_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_feed_items_select_public ON social_feed_items;
CREATE POLICY social_feed_items_select_public
  ON social_feed_items FOR SELECT
  TO anon, authenticated
  USING (true);

COMMENT ON TABLE social_feed_items IS
  'Publications de nos comptes réseaux, recopiées par le cron /api/cron/social-mirror pour être affichées sur le site. Lecture publique ; écriture service role uniquement.';
COMMENT ON COLUMN social_feed_items.thumbnail_url IS
  'URL dans notre bucket public, ou NULL. JAMAIS l''URL d''origine : couverture TikTok (TTL 6 h) et média Instagram (signé) meurent, et next/image refuse les hôtes hors remotePatterns.';
