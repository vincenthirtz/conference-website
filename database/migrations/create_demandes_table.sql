-- Migration: créer la table `demandes` (colonnes, FK PostgREST, trigger, RLS) — VERSIONNAGE D'UN OBJET LOOSE
-- Date: 2026-06-26
-- Sources historiques (loose, non versionnées) :
--   - database/demandes.sql                  (colonnes + index + trigger + RLS)
--   - database/demandes_fix_foreign_keys.sql (noms de FK explicites pour PostgREST)
--
-- WHY:
--   `demandes` est la table centrale des demandes (join/leave/captain/etc.),
--   lue/écrite par de nombreux handlers (/api/demandes*, admin, bot). Elle a été
--   créée et complétée EXCLUSIVEMENT via des fichiers loose jamais versionnés :
--     - demandes.sql faisait des `ALTER TABLE demandes ADD COLUMN ...` en
--       supposant la table déjà existante (jamais de CREATE TABLE versionné) ;
--     - demandes_fix_foreign_keys.sql posait les FK avec des noms explicites
--       (demandes_user_id_fkey, demandes_team_id_fkey, demandes_tournament_id_fkey)
--       attendus par PostgREST pour les embeds.
--   De nombreuses migrations ultérieures supposent `demandes` présente
--   (add_*_type_to_demandes, optimize_rls_initplan, add_tenant_id_to_bot_ops_tables,
--   enforce_tenant_id_not_null_and_fk, etc.).
--   Cette migration consolide l'ÉTAT D'ORIGINE en un CREATE TABLE complet
--   idempotent, pour rendre la base reconstructible. Aucun changement de
--   comportement : colonnes, types, contraintes et noms de FK sont identiques à
--   ce que les fichiers loose produisaient en prod.
--
-- WHAT:
--   - CREATE TABLE IF NOT EXISTS public.demandes avec toutes les colonnes du loose
--     et les FK NOMMÉES explicitement (PostgREST-friendly) :
--       demandes_user_id_fkey        -> auth.users(id)   ON DELETE CASCADE
--       demandes_team_id_fkey        -> teams(id)        ON DELETE SET NULL
--       demandes_tournament_id_fkey  -> tournaments(id)  ON DELETE SET NULL
--       processed_by_staff_id        -> staff(id)        ON DELETE SET NULL
--   - CHECK demandes_type_check à l'état d'ORIGINE (join/leave/captain_request/
--     other). Les valeurs ajoutées plus tard (team_registration, transfer,
--     invite, caster_application) sont portées par leurs migrations dédiées qui
--     DROP+ADD ce check — on ne les anticipe PAS ici (fidélité à l'origine).
--   - CHECK demandes_status_check (pending/approved/rejected/cancelled).
--   - Index user_id / team_id / type / status / created_at DESC.
--   - Trigger updated_at via update_demandes_updated_at().
--   - RLS activé + policies d'origine "Users can view/create own demandes".
--     (optimize_rls_initplan.sql les redéfinit ensuite en version optimisée :
--      DROP+CREATE — pas de conflit, idempotent.)
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS sur table/colonnes/index, CREATE OR REPLACE
--     FUNCTION, DROP TRIGGER/POLICY IF EXISTS avant CREATE.
--   - PostgREST : sur une base reconstruite à neuf, recharger le schema cache
--     après application (NOTIFY pgrst, 'reload schema' ou bouton Dashboard) car
--     de nouvelles FK nommées sont créées. Sur la base prod existante, les FK
--     sont déjà là -> no-op, pas de reload nécessaire.
--   - Dépend de auth.users, teams, tournaments, staff (toutes en prod).

-- Table + colonnes + FK nommées (état consolidé d'origine).
CREATE TABLE IF NOT EXISTS public.demandes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  team_id uuid,
  tournament_id uuid,
  type text NOT NULL DEFAULT 'other'
    CONSTRAINT demandes_type_check
    CHECK (type IN ('join', 'leave', 'captain_request', 'other')),
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT demandes_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  comment text,
  staff_note text,
  processed_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  processed_at timestamptz,
  source text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  CONSTRAINT demandes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT demandes_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL,
  CONSTRAINT demandes_tournament_id_fkey
    FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE SET NULL
);

-- Index pour les requêtes fréquentes.
CREATE INDEX IF NOT EXISTS idx_demandes_user_id    ON public.demandes(user_id);
CREATE INDEX IF NOT EXISTS idx_demandes_team_id    ON public.demandes(team_id);
CREATE INDEX IF NOT EXISTS idx_demandes_type       ON public.demandes(type);
CREATE INDEX IF NOT EXISTS idx_demandes_status     ON public.demandes(status);
CREATE INDEX IF NOT EXISTS idx_demandes_created_at ON public.demandes(created_at DESC);

-- Trigger updated_at.
CREATE OR REPLACE FUNCTION public.update_demandes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS demandes_updated_at ON public.demandes;
CREATE TRIGGER demandes_updated_at
  BEFORE UPDATE ON public.demandes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_demandes_updated_at();

-- RLS : les utilisateurs voient/créent leurs propres demandes.
-- (Le staff opère via service_role/supabaseAdmin qui bypass RLS.)
ALTER TABLE public.demandes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own demandes" ON public.demandes;
CREATE POLICY "Users can view own demandes"
  ON public.demandes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create demandes" ON public.demandes;
CREATE POLICY "Users can create demandes"
  ON public.demandes FOR INSERT
  WITH CHECK (auth.uid() = user_id);
