-- Migration: player_follows
--            (Feature « Réseau joueur cross-tenant & découverte » — le graphe de suivi,
--             suite directe de player_discovery_profiles, cf. create_player_discovery_profiles.sql)
--
-- WHY:
--   player_discovery_profiles rend une joueuse DÉCOUVRABLE (opt-in global, derrière
--   login). L'étape suivante du moat vs start.gg, c'est de laisser les membres
--   TISSER DES LIENS entre eux : « suivre » une joueuse pour retrouver son profil,
--   ses équipes, ses futurs matchs. player_follows est l'ARÊTE de ce graphe social.
--
--   Décisions produit (héritées de l'arbitrage du 2026-07-13, cf.
--   create_player_discovery_profiles.sql) :
--     - ARÊTE GLOBALE / CROSS-TENANT : un suivi lie deux comptes auth.users du
--       réseau ENTIER, sans notion d'org. AUCUNE colonne tenant_id, exactement comme
--       user_discord_links / user_battlenet_links / player_discovery_profiles — c'est
--       un objet de la couche identité GLOBALE, pas de la couche tenant-scoped
--       (team_members, player_ratings, free_players, eux, restent scoped).
--     - DÉRIVÉ DE L'OPT-IN, PAS UN CONTOURNEMENT : suivre quelqu'un ne le rend pas
--       visible. Les surfaces de listing (« qui je suis », « qui me suit »,
--       suggestions) ne renvoient QUE des joueuses actuellement discoverable=true.
--       Un opt-out (discoverable -> false) fait DISPARAÎTRE la joueuse des listes
--       SANS supprimer l'arête : le filtrage est appliqué dans l'API (jointure sur
--       player_discovery_profiles), JAMAIS matérialisé dans ce schéma. Ainsi un
--       ré-opt-in restaure les liens tels quels, et le kill-switch reste instantané.
--     - Le suivi est UNIDIRECTIONNEL (follower -> followee), à la Twitter/GitHub :
--       pas de demande d'ami à accepter. La réciprocité éventuelle = deux arêtes.
--
-- SCHEMA:
--   player_follows (UNE ligne par couple orienté ; PK composite)
--     - follower_id uuid NOT NULL -> auth.users(id) ON DELETE CASCADE
--         Le compte qui suit. FK cross-schema vers auth.users, ON DELETE CASCADE
--         MIROIR EXACT des autres tables d'identité (user_discord_links,
--         user_battlenet_links, player_discovery_profiles) : si le compte Supabase
--         Auth disparaît, toutes ses arêtes sortantes disparaissent avec lui.
--     - followee_id uuid NOT NULL -> auth.users(id) ON DELETE CASCADE
--         Le compte suivi. Même FK / même CASCADE : la suppression d'un compte purge
--         aussi toutes les arêtes entrantes qui le pointaient.
--     - created_at timestamptz NOT NULL DEFAULT now()  -- horodatage du suivi
--     - PRIMARY KEY (follower_id, followee_id)
--         Un suivi est IDEMPOTENT : suivre deux fois = une seule arête. La PK
--         composite garantit l'unicité ET sert d'index couvrant pour les lookups
--         « qui je suis » (préfixe follower_id-first, cf. INDEX ci-dessous).
--     - CONSTRAINT player_follows_no_self CHECK (follower_id <> followee_id)
--         On ne se suit pas soi-même : garde-fou schéma, pas seulement API.
--
-- INDEX:
--   - La PK composite (follower_id, followee_id) couvre déjà « qui je suis »
--     (WHERE follower_id = ? — préfixe gauche de la PK). PAS d'index dédié à créer.
--   - « Qui me suit » / follower-count (WHERE followee_id = ?) N'EST PAS couvert par
--     la PK (followee_id n'est pas préfixe gauche) -> index dédié sur (followee_id).
--     Seul index spéculatif-évité ajouté : il correspond à une requête de listing réelle.
--
-- RLS:
--   Arête sociale rattachée à des identités -> RLS ACTIVÉE dès la création, AUCUNE
--   policy = pattern « service-role only » (deny-by-default pour anon/authenticated),
--   identique à player_discovery_profiles / user_battlenet_links / free_players /
--   player_ratings. TOUT l'accès (créer/retirer un suivi, lister followers/following,
--   compter) passe par supabaseAdmin (service_role) depuis des routes withAuthRoute
--   qui scopent manuellement sur auth.users.id ET filtrent le listing sur
--   discoverable=true. AUCUN client anon/auth ne lit ce graphe en direct → aucune
--   surface publique/SEO ne peut énumérer le réseau social, même par erreur PostgREST.
--
-- POSTGREST FK NAMES (embeds côté API) :
--   FK déclarées inline -> Postgres génère les noms standard attendus par PostgREST :
--     - player_follows_follower_id_fkey  (player_follows -> auth.users)
--     - player_follows_followee_id_fkey  (player_follows -> auth.users)
--   (Rappel : PostgREST n'embed pas auth.users par défaut ; l'API joint via le
--    service_role — typiquement player_follows -> player_discovery_profiles côté
--    followee pour n'exposer que les découvrables.)
--
-- DEPLOY NOTES:
--   - Idempotent : CREATE TABLE / INDEX IF NOT EXISTS, ENABLE RLS ré-affirmable.
--     Re-jouable depuis un état propre sans cleanup manuel.
--   - Ajout d'une table + FK vers auth.users => RELOAD du cache schéma PostgREST
--     REQUIS après apply, sinon PostgREST ne « voit » pas la nouvelle table /
--     relation : Supabase Studio → Settings → API → « Reload schema cache » (ou le
--     NOTIFY pgrst en fin de fichier si appliqué en session).
--   - Rollback = DROP TABLE public.player_follows;

CREATE TABLE IF NOT EXISTS public.player_follows (
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT player_follows_no_self CHECK (follower_id <> followee_id)
);

COMMENT ON TABLE public.player_follows IS
  'Graphe de suivi joueur GLOBAL (cross-tenant, sans tenant_id). Arête orientée follower -> followee entre deux auth.users. Le listing ne renvoie que les joueuses discoverable=true (filtre API, cf. player_discovery_profiles). Accès service_role only.';
COMMENT ON COLUMN public.player_follows.follower_id IS
  'auth.users qui suit. FK ON DELETE CASCADE : la suppression du compte purge ses arêtes sortantes.';
COMMENT ON COLUMN public.player_follows.followee_id IS
  'auth.users suivi. FK ON DELETE CASCADE : la suppression du compte purge ses arêtes entrantes. Non préfixe de la PK -> index dédié pour « qui me suit ».';

-- Arête sociale rattachée à l'identité -> service-role only (aucune policy).
ALTER TABLE public.player_follows ENABLE ROW LEVEL SECURITY;

-- « Qui me suit » / follower-count : WHERE followee_id = ?. Non couvert par la PK
-- (composite préfixée par follower_id), d'où cet index dédié.
CREATE INDEX IF NOT EXISTS player_follows_followee_id_idx
  ON public.player_follows (followee_id);

-- Recharge le cache PostgREST : nouvelle table + FK vers auth.users. Étape
-- INVISIBLE depuis le SQL — à confirmer côté Supabase Studio → Settings → API →
-- « Reload schema cache » si besoin.
NOTIFY pgrst, 'reload schema';
