-- Migration: player_discovery_profiles
--            (Feature « Réseau joueur cross-tenant & découverte » — le moat vs start.gg)
--
-- WHY:
--   On veut permettre à une joueuse de se rendre DÉCOUVRABLE dans TOUT le réseau
--   (toutes orgs / tenants confondus) : profils, suivi cross-org, head-to-head
--   réservés aux membres CONNECTÉS. Arbitrage produit verrouillé le 2026-07-13 :
--     - PAS d'annuaire public / indexé SEO. Aucune route publique ne liste les
--       joueurs. La découverte est DERRIÈRE LE LOGIN (routes withAuthRoute).
--     - Opt-in GLOBAL (et non par-tenant) : un flag unique par joueur la rend
--       visible dans l'ensemble du réseau — maximise l'effet réseau.
--     - INVISIBLE PAR DÉFAUT : l'opt-in est explicite et réversible (kill-switch).
--       C'est le choix de la joueuse, jamais imposé par l'org.
--
--   L'identité est déjà globale (auth.users + user_discord_links, cf.
--   add_user_discord_links.sql) ; tout le reste (player_ratings, team_members,
--   free_players) est TENANT-SCOPED. Cette table est le premier objet réellement
--   GLOBAL côté « profil joueur » : une ligne par auth.users, sans tenant_id.
--
-- SCHEMA:
--   player_discovery_profiles (UNE ligne par utilisateur, PK = auth_user_id)
--     - auth_user_id uuid PK -> auth.users(id) ON DELETE CASCADE
--         MIROIR EXACT de user_discord_links / user_battlenet_links : même FK
--         cross-schema vers auth.users, même ON DELETE CASCADE (si le compte
--         Supabase Auth disparaît, sa carte de découverte disparaît avec).
--     - discoverable boolean NOT NULL DEFAULT false
--         LE flag opt-in GLOBAL. false = invisible (défaut). Le « kill-switch »
--         = repasser à false : la carte est conservée mais retirée de l'annuaire.
--         Convention « absent = défaut » (cf. notification_prefs) : une joueuse
--         sans ligne est, par construction, non découvrable.
--     - display_name text NULL      -- override d'affichage GLOBAL (sinon fallback
--                                      user_metadata / profil tenant côté API)
--     - avatar_url text NULL        -- idem, override global
--     - tagline text NULL           -- courte bio contrôlée par la joueuse (<=160)
--     - show_ratings boolean NOT NULL DEFAULT true
--         La joueuse peut masquer ses stats de classement (agrégat cross-tenant)
--         tout en restant découvrable.
--     - show_teams boolean NOT NULL DEFAULT true
--         Idem pour la liste de ses équipes / participations.
--     - opted_in_at timestamptz NULL  -- horodatage du 1er passage discoverable=true
--                                        (audit RGPD : consentement explicite daté)
--     - created_at / updated_at timestamptz NOT NULL DEFAULT now()
--
-- RLS:
--   Donnée de profil + consentement de visibilité → RLS ACTIVÉE dès la création,
--   AUCUNE policy = pattern « service-role only » (deny-by-default pour
--   anon/authenticated), identique à user_battlenet_links / free_players /
--   player_ratings. TOUT l'accès (lecture de l'annuaire, toggle opt-in) passe par
--   supabaseAdmin (service_role) depuis des routes API withAuthRoute qui scopent
--   manuellement sur auth.users.id. AUCUN client anon/auth ne lit cette table en
--   direct → garantit qu'aucune surface publique/SEO ne peut lister les joueurs,
--   même par erreur PostgREST.
--
-- INDEX:
--   L'annuaire ne liste QUE les découvrables et trie par activité récente
--   -> index partiel sur (updated_at DESC) WHERE discoverable = true. Restreint
--   l'index aux seules lignes visibles (petite fraction), scan de l'annuaire O(log n).
--
-- POSTGREST FK NAMES:
--   FK inline -> player_discovery_profiles_auth_user_id_fkey (-> auth.users).
--   PostgREST n'embed pas auth.users ; l'API joint via service_role. Pas d'autre FK.
--
-- DEPLOY NOTES:
--   - Idempotent : CREATE TABLE / INDEX IF NOT EXISTS, ENABLE RLS ré-affirmable.
--   - Ajout de table -> recharger le schema cache PostgREST : NOTIFY pgrst en fin.
--   - Rollback = DROP TABLE public.player_discovery_profiles;

CREATE TABLE IF NOT EXISTS public.player_discovery_profiles (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  discoverable boolean NOT NULL DEFAULT false,
  display_name text,
  avatar_url   text,
  tagline      text,
  show_ratings boolean NOT NULL DEFAULT true,
  show_teams   boolean NOT NULL DEFAULT true,
  opted_in_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_discovery_tagline_len CHECK (tagline IS NULL OR char_length(tagline) <= 160)
);

COMMENT ON TABLE public.player_discovery_profiles IS
  'Carte de découverte joueur GLOBALE (cross-tenant). Opt-in explicite (discoverable), invisible par défaut, derrière login. Aucune surface publique/SEO. Une ligne par auth.users.';
COMMENT ON COLUMN public.player_discovery_profiles.discoverable IS
  'Flag opt-in GLOBAL. false = invisible (défaut). Kill-switch RGPD = repasser à false.';
COMMENT ON COLUMN public.player_discovery_profiles.opted_in_at IS
  'Horodatage du premier consentement (discoverable passé à true). Audit RGPD.';

-- Donnée de profil + consentement sensible -> service-role only (aucune policy).
ALTER TABLE public.player_discovery_profiles ENABLE ROW LEVEL SECURITY;

-- L'annuaire ne parcourt que les découvrables, triés par activité récente.
CREATE INDEX IF NOT EXISTS player_discovery_profiles_discoverable_idx
  ON public.player_discovery_profiles (updated_at DESC)
  WHERE discoverable = true;

NOTIFY pgrst, 'reload schema';
