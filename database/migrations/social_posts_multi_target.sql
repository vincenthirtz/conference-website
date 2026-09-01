-- Publication multi-cibles : un post rédigé une fois, plusieurs destinations.
--
-- POURQUOI DEUX TABLES. Le découpage est celui des campagnes email
-- (`broadcasts` / `broadcast_recipients`) : la composition d'un côté, une ligne
-- par destination de l'autre. C'est la seule forme qui laisse un envoi
-- PARTIELLEMENT réussi être décrit honnêtement — Discord passé, site en échec
-- n'est ni un succès ni un échec, et un statut global unique obligerait à tout
-- republier pour rejouer la seule ligne fautive. Republier, ici, veut dire
-- poster deux fois là où ça avait déjà marché : sur un réseau public, ça se
-- voit et ça se supprime à la main.
--
-- CE QUI N'EST PAS ICI. Pas de table `social_accounts` : les deux cibles de ce
-- lot n'ont aucun identifiant à stocker (le site écrit dans sa propre table, le
-- bot est déjà connecté au serveur Discord). Elle viendra avec l'OAuth Meta /
-- TikTok, quand il y aura enfin un jeton à ranger — une table qu'on n'interroge
-- pas est pire que pas de table.
--
-- Le catalogue des plateformes vit dans le code (`utils/social/platforms.ts`),
-- pas dans un CHECK SQL : un enum ici imposerait une migration à chaque cible
-- ajoutée, et ferait échouer un déploiement dont le code est déjà en avance.
--
-- RLS : activée sans aucune policy. Ces tables ne sont lues et écrites que par
-- la service role, depuis les routes admin. Aucun client porteur d'un JWT
-- anon/authenticated ne doit les voir.
--
-- Idempotent : re-jouable sans effet.

CREATE TABLE IF NOT EXISTS social_posts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  -- Le texte commun, celui dont chaque cible hérite tant qu'elle ne le surcharge pas.
  base_text     text NOT NULL,
  -- URL publique de l'image commune. Publique et pas un chemin de bucket :
  -- Instagram (cible à venir) refuse une image qu'il ne peut pas aller chercher
  -- lui-même, donc autant que la colonne porte dès maintenant la forme utile.
  base_image_url text,
  -- 'done' = toutes les cibles ont abouti ; 'partial' = au moins une a échoué
  -- alors qu'une autre est passée ; 'failed' = aucune n'est passée.
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'publishing', 'done', 'partial', 'failed')),
  created_by    uuid REFERENCES staff(id) ON DELETE SET NULL,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_post_targets (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id       uuid NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  -- Clé de `utils/social/platforms.ts` : 'site_news', 'discord_announce', …
  platform      text NOT NULL,
  -- NULL = hérite de social_posts.base_text / base_image_url. On distingue donc
  -- « pas de surcharge » d'une surcharge volontairement vide.
  text_override  text,
  image_override text,
  -- Le site attend un titre, pas seulement du texte : c'est la seule cible qui
  -- n'a pas la forme d'un tweet, et la seule dont l'oubli produirait une
  -- actualité au titre tronqué à chaque publication.
  title_override text,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  -- Identifiant rendu par la destination (id de l'actualité, id du message
  -- Discord). Écrit AVANT de considérer la cible faite : c'est lui qui empêche
  -- un rejeu de publier une seconde fois.
  external_id   text,
  permalink     text,
  error         text,
  attempts      smallint NOT NULL DEFAULT 0,
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Une cible par plateforme et par post : deux lignes 'discord_announce' sur
  -- le même post seraient deux messages identiques dans le même salon.
  UNIQUE (post_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_social_posts_tenant_created
  ON social_posts (tenant_id, created_at DESC);

-- Sert le rejeu : « les cibles encore à traiter », tous posts confondus.
CREATE INDEX IF NOT EXISTS idx_social_post_targets_pending
  ON social_post_targets (post_id)
  WHERE status = 'pending';

ALTER TABLE social_posts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_targets ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE social_posts IS
  'Composition d''un post multi-cibles (admin › Communication › Réseaux). Le statut agrégé se déduit des lignes social_post_targets.';
COMMENT ON TABLE social_post_targets IS
  'Une destination d''un social_post. Le statut vit ICI : un envoi partiellement réussi se rejoue cible par cible, jamais en bloc.';
COMMENT ON COLUMN social_post_targets.external_id IS
  'Id rendu par la destination. Écrit avant de marquer la cible envoyée — c''est la garde contre un double post, qui sur un réseau public est irrattrapable.';
