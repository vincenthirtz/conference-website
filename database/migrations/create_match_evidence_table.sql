-- Migration: table match_evidence (Feature « Intégrité des résultats & anti-triche » — Slice 1, preuve + réconciliation)
--
-- WHY:
--   Slice 1 ajoute une couche de PREUVE au flux de report de score existant
--   (match_score_reports + disputes portées par les colonnes dispute_* de
--   matches). Quand deux reports divergent — ou qu'un staff veut trancher un
--   litige — il faut pouvoir attacher au match des captures d'écran, des
--   fichiers de replay ou des liens de replay, et les réconcilier.
--
--   Chaque preuve est rattachée à un match (match_id) et scopée au tenant
--   (tenant_id, présent sur matches depuis add_tenant_id_to_match_domain.sql).
--   Une preuve peut venir :
--     - d'un capitaine  -> team_side ∈ {1,2}  (le camp qui la soumet) ;
--     - du staff         -> team_side IS NULL (preuve neutre / arbitrage).
--
--   Les fichiers binaires (screenshot, replay_file) vivent dans un bucket
--   Storage PRIVÉ `match-evidence` (voir create_match_evidence_storage_bucket.sql) :
--   la colonne stockée ici est le `storage_path` (chemin objet), pas le binaire.
--   Un replay hébergé ailleurs (kind='replay_url') porte son `external_url` et
--   n'a pas de storage_path. L'API écrit avec le service_role et remet aux staff
--   des URLs signées ; les capitaines ne touchent jamais le bucket directement.
--
--   `sha256` = empreinte du contenu, pour dédup et tamper-evidence (deux uploads
--   identiques se repèrent, une preuve altérée après coup ne matche plus).
--
-- SCHEMA / INVARIANTS:
--   - kind ∈ {screenshot, replay_file, replay_url} (TEXT + CHECK, pas d'ENUM PG,
--     conforme à la convention du repo : extensible sans migration de type).
--   - CONTRAINTE kind/emplacement (match_evidence_location_chk) :
--       * replay_url          => external_url NOT NULL  ET storage_path IS NULL
--       * screenshot|replay_file => storage_path NOT NULL ET external_url IS NULL
--     Impossible d'avoir une preuve « fantôme » sans emplacement, ou une preuve
--     à double emplacement incohérent.
--   - team_side : NULL (staff) ou 1/2 (camp capitaine).
--   - submitted_by_auth_user_id : MIROIR EXACT de
--     match_score_reports.reported_by_auth_user_id — uuid SANS FK vers
--     auth.users (le repo ne pose pas de FK cross-schema vers auth.users pour
--     ces colonnes ; on garde aussi discord_user_id pour l'audit si le lien
--     Discord est supprimé après coup). Nullable ici : une preuve peut être
--     posée par un flux système sans user auth attaché.
--
-- RLS:
--   Données sensibles (identité du soumetteur, chemins d'objets privés). RLS
--   ACTIVÉE dès la création, AUCUNE policy = pattern « service-role only »,
--   identique à match_score_reports / match_map_vetos / bot_idempotency (cf.
--   enable_rls_match_score_reports.sql). Tout l'accès passe par supabaseAdmin
--   (service_role) depuis les routes API ; aucun client anon/authenticated ne
--   lit ou écrit en direct. Pas de SELECT public : les preuves ne sont jamais
--   servies via PostgREST direct — le staff les consulte via /admin (URLs
--   signées générées côté serveur).
--
-- POSTGREST:
--   Deux FK single-column pour les embeds côté API :
--     - match_evidence_match_id_fkey   (match_evidence → matches)
--     - match_evidence_tenant_id_fkey  (match_evidence → tenants)
--   ON DELETE : CASCADE sur match_id (les preuves suivent la suppression du
--   match), RESTRICT sur tenant_id (convention repo — cf.
--   enforce_tenant_id_not_null_and_fk.sql : pas de cascade silencieuse tenant).
--
-- DEPLOY NOTES:
--   - Idempotent (CREATE TABLE / INDEX IF NOT EXISTS, ENABLE RLS ré-exécutable).
--   - AJOUT de FK => RELOAD du schema cache PostgREST requis après apply pour que
--     les embeds `?select=*,matches(*)` / `tenants(*)` fonctionnent :
--     Settings → API → « Reload schema cache » (ou NOTIFY pgrst, 'reload schema';).
--     Le NOTIFY final ci-dessous le déclenche si la migration est appliquée en
--     session (apply_migration MCP) ; le refaire côté Dashboard si besoin.
--   - Rollback = migration inverse dédiée (DROP TABLE match_evidence), pas
--     d'édition en place.

BEGIN;

CREATE TABLE IF NOT EXISTS match_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  match_id  uuid NOT NULL REFERENCES matches(id)  ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id)  ON DELETE RESTRICT,

  -- NULL = preuve soumise par le staff ; 1/2 = camp capitaine
  team_side smallint,

  -- Miroir de match_score_reports : uuid nu (pas de FK auth.users), + discord id
  submitted_by_auth_user_id uuid,
  discord_user_id           text,

  kind text NOT NULL,

  -- storage_path : chemin objet dans le bucket privé 'match-evidence'
  -- (screenshot / replay_file). external_url : replay hébergé ailleurs (replay_url).
  storage_path text,
  external_url text,

  mime_type  text,
  size_bytes integer,
  sha256     text,
  note       text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT match_evidence_team_side_chk
    CHECK (team_side IS NULL OR team_side IN (1, 2)),

  CONSTRAINT match_evidence_kind_chk
    CHECK (kind IN ('screenshot', 'replay_file', 'replay_url')),

  -- Invariant kind <-> emplacement
  CONSTRAINT match_evidence_location_chk CHECK (
    (kind = 'replay_url'
       AND external_url IS NOT NULL
       AND storage_path IS NULL)
    OR
    (kind IN ('screenshot', 'replay_file')
       AND storage_path IS NOT NULL
       AND external_url IS NULL)
  )
);

COMMENT ON TABLE match_evidence IS
  'Preuves attachées à un match (screenshot / replay_file dans le bucket privé match-evidence, ou replay_url externe). Slice 1 « Intégrité des résultats ». Accès service_role only.';
COMMENT ON COLUMN match_evidence.team_side IS
  'NULL = preuve soumise par le staff (neutre) ; 1 ou 2 = camp capitaine qui soumet.';
COMMENT ON COLUMN match_evidence.storage_path IS
  'Chemin objet dans le bucket Storage privé match-evidence. NON NULL pour screenshot/replay_file, NULL pour replay_url.';
COMMENT ON COLUMN match_evidence.external_url IS
  'URL externe du replay. NON NULL pour replay_url uniquement.';
COMMENT ON COLUMN match_evidence.sha256 IS
  'Empreinte SHA-256 du contenu : dédup + tamper-evidence.';

-- Index sur les FK jointes / filtrées par l'API
CREATE INDEX IF NOT EXISTS idx_match_evidence_match_id
  ON match_evidence (match_id);
CREATE INDEX IF NOT EXISTS idx_match_evidence_tenant_id
  ON match_evidence (tenant_id);

-- RLS : service-role only, aucune policy (deny-by-default pour anon/authenticated)
ALTER TABLE match_evidence ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Reload PostgREST schema cache (FK ajoutées -> embeds matches(*)/tenants(*))
NOTIFY pgrst, 'reload schema';
