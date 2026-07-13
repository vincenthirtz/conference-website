-- Migration: user_battlenet_links + flag de vérification dénormalisé sur team_members
--            (Feature « Vérification d'identité BattleTag via Battle.net OAuth », anti-smurf Tier 1)
--
-- WHY:
--   Pour un tournoi Overwatch, on veut prouver qu'une joueuse contrôle bien le
--   compte Blizzard derrière le BattleTag qu'elle déclare dans son roster. Le
--   BattleTag saisi à la main dans team_members.battle_tag n'est aujourd'hui
--   qu'une CHAÎNE non vérifiée (CHECK de format uniquement) : rien n'empêche un
--   smurf de recopier le tag d'une autre personne, ni une même personne de
--   remplir plusieurs rosters sous des identités différentes.
--
--   On ajoute donc une couche d'identité vérifiée par OAuth Battle.net, calquée
--   EXACTEMENT sur le lien identité Discord existant (user_discord_links,
--   cf. add_user_discord_links.sql) :
--     - user_battlenet_links = table AUTORITAIRE du lien auth.users <-> compte
--       Blizzard. Le cœur anti-smurf est la contrainte UNIQUE sur battle_net_id :
--       un compte Blizzard donné ne peut être lié qu'à UNE seule joueuse/un seul
--       compte Supabase. Impossible de smurfer deux inscriptions avec le même
--       compte Battle.net.
--     - team_members.battle_tag_verified_at / verified_battle_net_id = FLAG
--       d'affichage DÉNORMALISÉ (source du badge « vérifié »), posé par le
--       callback OAuth. La table user_battlenet_links reste la source de vérité ;
--       ces colonnes ne servent qu'à afficher le badge et à repérer un mismatch
--       roster ⇄ compte vérifié sans refaire la jointure à chaque rendu.
--
-- SCHEMA:
--   user_battlenet_links (UNE ligne par utilisateur, PK = auth_user_id)
--     - auth_user_id  uuid PK -> auth.users(id) ON DELETE CASCADE
--         MIROIR EXACT de user_discord_links.auth_user_id (même FK cross-schema
--         vers auth.users, même ON DELETE CASCADE : si le compte Supabase Auth
--         disparaît, le lien identité disparaît avec).
--     - battle_net_id text NOT NULL UNIQUE
--         Id de compte Blizzard (le `sub`/`id` renvoyé par l'OAuth Battle.net,
--         stable même si la joueuse renomme son BattleTag). UNIQUE = pivot
--         anti-smurf (miroir du UNIQUE sur user_discord_links.discord_user_id).
--     - battle_tag text NOT NULL
--         Le BattleTag vérifié renvoyé par Blizzard (format Pseudo#0000). NON
--         unique : Blizzard autorise les renommages et deux tags peuvent
--         historiquement coïncider ; l'identité stable, c'est battle_net_id.
--     - region text NULL         -- eu | us | kr (renseigné si l'OAuth le fournit)
--     - verified_at timestamptz NOT NULL DEFAULT now()  -- moment de la vérif OAuth
--     - created_at / updated_at timestamptz NOT NULL DEFAULT now()
--
--   team_members (colonnes ajoutées, flag d'affichage dénormalisé)
--     - battle_tag_verified_at timestamptz NULL
--         NULL = ligne non vérifiée (pas de badge). Posé par le callback OAuth
--         quand le battle_tag vérifié de la joueuse (via user_battlenet_links)
--         matche — normalisé en lowercase — le team_members.battle_tag de sa/ses
--         ligne(s).
--     - verified_battle_net_id text NULL
--         Quel compte Blizzard a vérifié cette ligne. Permet à l'admin de
--         détecter un mismatch (compte vérifié X mais le roster affiche un tag
--         appartenant à Y). Pas de FK vers user_battlenet_links : c'est un
--         snapshot d'audit, il doit survivre à une éventuelle suppression du lien.
--
-- RLS:
--   user_battlenet_links contient de la DONNÉE D'IDENTITÉ sensible → RLS ACTIVÉE
--   dès la création, AUCUNE policy = pattern « service-role only » (deny-by-default
--   pour anon/authenticated), identique à match_evidence / prize_pool_* /
--   match_score_reports. Tout l'accès (upsert au callback OAuth, lecture pour le
--   badge) passe par supabaseAdmin (service_role) depuis les routes API ; aucun
--   client anon/auth ne lit ni n'écrit ce lien en direct.
--
--   NOTE sur user_discord_links : son fichier versionné (add_user_discord_links.sql)
--   n'a PAS de statement ENABLE ROW LEVEL SECURITY et aucune policy. On NE reproduit
--   PAS cette lacune : une table d'identité doit être fermée par défaut (cf. règle
--   RLS baseline du repo + idiome des migrations récentes). On applique donc le
--   patron service-role-only explicite. Si user_discord_links a effectivement RLS
--   activée en prod, c'est un ajout hors-migration à régulariser séparément — hors
--   scope de cette migration.
--
-- POSTGREST FK NAMES (embeds côté API) :
--   FK déclarée inline -> Postgres génère le nom standard attendu par PostgREST :
--     - user_battlenet_links_auth_user_id_fkey   (user_battlenet_links -> auth.users)
--   (Rappel : PostgREST n'embed pas auth.users par défaut ; l'API joint via le
--    service_role. Aucune autre FK sur cette table — battle_net_id n'est pas une FK.)
--   Les colonnes ajoutées sur team_members ne créent AUCUNE FK
--   (verified_battle_net_id = snapshot d'audit volontairement sans FK).
--
-- DEPLOY NOTES:
--   - Idempotent : CREATE TABLE / INDEX / ADD COLUMN IF NOT EXISTS, ENABLE RLS
--     ré-exécutable. Re-jouable depuis un état propre sans cleanup manuel.
--   - Ajout d'une FK (auth_user_id -> auth.users) + de colonnes => RELOAD du cache
--     schéma PostgREST REQUIS après apply, sinon PostgREST ne « voit » pas la
--     nouvelle table / relation : Supabase Studio → Settings → API → « Reload
--     schema cache » (ou NOTIFY pgrst, 'reload schema'; — déclenché en fin de
--     fichier si appliqué en session).
--   - Pas de backfill ici : les lignes team_members existantes restent non
--     vérifiées (battle_tag_verified_at NULL) tant que la joueuse n'a pas fait
--     l'OAuth. Aucune donnée écrasée.
--   - Rollback = migration inverse dédiée (DROP TABLE user_battlenet_links ;
--     ALTER TABLE team_members DROP COLUMN ...), pas d'édition en place.

BEGIN;

-- ─── Lien identité autoritaire auth.users <-> compte Blizzard ────────────────
CREATE TABLE IF NOT EXISTS public.user_battlenet_links (
  auth_user_id  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Id de compte Blizzard (sub/id OAuth, stable). UNIQUE = cœur anti-smurf :
  -- un compte Blizzard ne peut être lié qu'à un seul compte Supabase Auth.
  battle_net_id text NOT NULL UNIQUE,
  -- BattleTag vérifié renvoyé par Blizzard (format Pseudo#0000). Non unique.
  battle_tag    text NOT NULL,
  region        text,                                 -- eu | us | kr (nullable)
  verified_at   timestamptz NOT NULL DEFAULT now(),   -- moment de la vérif OAuth
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_battlenet_links IS
  'Lien identité AUTORITAIRE auth.users <-> compte Blizzard, vérifié par OAuth Battle.net (anti-smurf). Calqué sur user_discord_links. Accès service_role only.';
COMMENT ON COLUMN public.user_battlenet_links.battle_net_id IS
  'Id de compte Blizzard (sub/id OAuth, stable même après renommage du tag). UNIQUE = pivot anti-smurf : un compte Blizzard ne se lie qu''à une seule joueuse.';
COMMENT ON COLUMN public.user_battlenet_links.battle_tag IS
  'BattleTag vérifié renvoyé par Blizzard (format Pseudo#0000). NON unique (renommages Blizzard possibles) ; l''identité stable est battle_net_id.';
COMMENT ON COLUMN public.user_battlenet_links.region IS
  'Région du compte : eu | us | kr. NULL si non fournie par l''OAuth.';
COMMENT ON COLUMN public.user_battlenet_links.verified_at IS
  'Horodatage de la vérification OAuth réussie.';

-- RLS : service-role only, aucune policy (deny-by-default anon/authenticated).
ALTER TABLE public.user_battlenet_links ENABLE ROW LEVEL SECURITY;

-- ─── Flag d'affichage dénormalisé sur team_members (source du badge) ─────────
-- Posé par le callback OAuth quand le battle_tag vérifié (via user_battlenet_links)
-- matche, normalisé lowercase, le team_members.battle_tag de la/les ligne(s) de
-- la joueuse. user_battlenet_links reste la source de vérité ; ces colonnes ne
-- servent qu'à l'affichage du badge et à la détection de mismatch côté admin.
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS battle_tag_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_battle_net_id text;

COMMENT ON COLUMN public.team_members.battle_tag_verified_at IS
  'Flag d''affichage (badge « BattleTag vérifié »). NULL = non vérifié. Posé par le callback OAuth Battle.net quand le battle_tag vérifié (user_battlenet_links) matche lower(team_members.battle_tag). Source de vérité = user_battlenet_links.';
COMMENT ON COLUMN public.team_members.verified_battle_net_id IS
  'Snapshot d''audit : id du compte Blizzard ayant vérifié cette ligne. Permet à l''admin de repérer un mismatch (compte vérifié X vs tag roster de Y). Volontairement SANS FK (survit à une suppression du lien).';

COMMIT;

-- Recharge le cache PostgREST : nouvelle table + FK vers auth.users + nouvelles
-- colonnes team_members. Étape INVISIBLE depuis le SQL — à confirmer côté
-- Supabase Studio → Settings → API → « Reload schema cache » si besoin.
NOTIFY pgrst, 'reload schema';
