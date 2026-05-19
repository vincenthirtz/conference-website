-- Migration: RLS baseline sur les tables métier sensibles
--
-- Avant cette migration, plusieurs tables (teams, team_members, staff,
-- cast_members, tournament_stages, scrims) avaient RLS désactivée. Tout
-- l'accès se faisait via supabaseAdmin (service_role, qui bypass RLS),
-- donc en pratique aucune route ne lisait/écrivait sur ces tables sans
-- passer par une route API authentifiée — sauf cas d'erreur de code futur.
--
-- Cette migration active RLS sans ajouter de policy : conséquence,
-- pour tout client NON service_role, l'accès devient interdit par défaut
-- (le moteur Postgres refuse tout SELECT/INSERT/UPDATE/DELETE en l'absence
-- de policy correspondante).
--
-- Pourquoi pas de policy ? Audit du code : 100% des accès en lecture/
-- écriture passent aujourd'hui par supabaseAdmin (cf. pages/*.tsx SSR,
-- pages/api/admin/*, pages/api/bot/*). Aucune lecture client direct.
-- Donc la baseline "tout refusé sauf service_role" suffit. Si on veut
-- ouvrir un accès anon (vitrine publique sans passer par l'API), on
-- ajoutera une policy SELECT ciblée dans une migration ultérieure.
--
-- Bénéfice : tout nouveau code qui essaierait d'utiliser supabaseClient
-- (anon) ou getServerClient (auth user) pour faire un SELECT direct sur
-- ces tables sera bloqué — la route doit obligatoirement passer par
-- supabaseAdmin via une API authentifiée.

-- 1) teams + team_members : peuvent contenir des infos sensibles
--    (battle_tag, captain_id, discord_role_id). RLS protège.
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- 2) staff : table critique sécurité (rôles, permissions). Ne doit
--    JAMAIS être exposée à un client non-admin.
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- 3) cast_members : moins critique mais on garde la cohérence.
ALTER TABLE cast_members ENABLE ROW LEVEL SECURITY;

-- 4) tournament_stages : settings JSONB qui peut contenir de la config
--    interne (advancement_rules, seeds…).
ALTER TABLE tournament_stages ENABLE ROW LEVEL SECURITY;

-- 5) scrims : statut (draft, scheduled…) et stream_url qui peuvent
--    être confidentiels avant la diffusion.
ALTER TABLE scrims ENABLE ROW LEVEL SECURITY;

-- Note : le service_role contourne automatiquement RLS (cf. Supabase
-- docs). Aucune action supplémentaire requise pour supabaseAdmin.

-- ===========================================================================
-- Policies SELECT publiques sur les tables vitrine
-- ===========================================================================
--
-- Ouvre une lecture limitée aux rows "publiques" pour les rôles anon et
-- authenticated. Permet à un futur composant client (sans passer par l'API)
-- d'afficher les données vitrine — par exemple un widget temps réel via
-- Supabase Realtime sur teams.is_active.
--
-- Tables NON exposées en lecture publique (volontairement) :
--   - team_members : peut contenir battle_tag (PII) → API only
--   - staff       : table sécurité → service_role only
--   - tournament_stages : settings JSONB avec advancement_rules internes
--                          → API only (qui peut filtrer les champs)

-- teams : équipes actives non soft-deleted
DROP POLICY IF EXISTS "teams_anon_read_active" ON teams;
CREATE POLICY "teams_anon_read_active"
  ON teams FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND deleted_at IS NULL);

-- cast_members : casters actifs
DROP POLICY IF EXISTS "cast_members_anon_read_active" ON cast_members;
CREATE POLICY "cast_members_anon_read_active"
  ON cast_members FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- scrims : scrims explicitement publics (is_public = true)
DROP POLICY IF EXISTS "scrims_anon_read_public" ON scrims;
CREATE POLICY "scrims_anon_read_public"
  ON scrims FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

-- Pas de policies INSERT/UPDATE/DELETE pour les rôles non-service_role :
-- toute mutation doit passer par une route API admin authentifiée.
--
-- Vérification post-migration :
--   - anon SELECT teams WHERE is_active=true : retourne des rows
--   - anon SELECT teams WHERE is_active=false : retourne []
--   - anon SELECT staff : retourne []
--   - anon INSERT/UPDATE/DELETE sur n'importe quelle table protégée : refus
--   - service_role : tout passe (bypass RLS)
-- cf. tests e2e/rls-baseline.spec.ts.
