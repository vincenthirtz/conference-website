-- Migration: création de la table `team_openings` — « une équipe cherche une joueuse »
-- Date: 2026-09-12
--
-- WHY:
--   Le marché des joueuses libres n'existait que dans un sens. Une joueuse sans
--   équipe peut se signaler depuis /rejoindre (table `free_players`, annonce
--   Discord dans #🔎-recherche-equipe-🔎). L'inverse — une équipe à qui il
--   manque une joueuse — n'avait AUCUNE surface : ni page, ni formulaire, ni
--   annonce. Les capitaines postaient à la main dans un salon, et une joueuse
--   qui arrivait sur le site ne voyait nulle part quelles équipes recrutaient.
--
--   Cette table est le miroir exact de `free_players` : mêmes provenances
--   possibles, même durée de vie, même confidentialité des contacts, même
--   régime RLS. Deux tables plutôt qu'une colonne `kind` sur `free_players`
--   parce que ce ne sont pas les mêmes entités (une personne vs une équipe) :
--   les colonnes obligatoires diffèrent, les projections diffèrent, et une
--   table commune obligerait chaque lecture à filtrer — le genre d'oubli qui
--   fait apparaître une équipe dans la liste des joueuses.
--
-- CE QUE PORTE UNE ROW:
--   - `roles` : les postes RECHERCHÉS (et non joués — sens inverse de
--     `free_players.roles`). Même vocabulaire (`utils/freePlayers.ts`) pour que
--     les deux marchés se lisent avec les mêmes mots.
--   - `level` : le niveau de l'ÉQUIPE, indicatif. Même échelle que les
--     joueuses, `unknown` compris : demander un rang à une équipe qui se monte
--     est la friction que ce parcours cherche justement à supprimer.
--   - `team_id` NULLABLE : une équipe peut publier une annonce SANS compte, de
--     la même façon qu'une joueuse. Renseigné plus tard quand l'annonce est
--     posée depuis l'espace capitaine ; sinon `team_name` fait foi.
--
-- CAVEATS:
--   - Service-role only : RLS ACTIVÉE SANS AUCUNE POLICY, comme `free_players`.
--     anon/authenticated sont bloqués ; tout passe par les routes API
--     (supabaseAdmin), qui portent captcha + rate-limit côté public.
--   - `contact_email` / `contact_discord` sont des données de CONTACT : elles
--     ne sortent JAMAIS de la route publique (cf. `toPublicTeamOpening`).
--     Seules les personnes connectées y accèdent, via /api/team-openings/contact.
--   - `expires_at` : 60 jours, comme les fiches joueuses. Une annonce de
--     recrutement périmée est pire qu'aucune annonce — elle fait croire à un
--     marché actif et renvoie sur une équipe déjà complète. Filtrée à la
--     lecture, pas purgée (on garde la trace).
--   - tenant_id NOT NULL + FK tenants ON DELETE RESTRICT : convention Tier-1.
--   - Idempotente (IF NOT EXISTS partout). Ré-appliquable sans erreur.
--   - Nouvelles FK (tenants, teams) ⇒ reload du schema cache PostgREST
--     (NOTIFY en fin de fichier).
--
-- APRÈS APPLICATION : régénérer l'instantané de schéma dont dépend le garde-fou
--   `tests/unit/supabaseSelectSchema.test.ts` :
--     node scripts/refresh-schema-snapshot.mjs

BEGIN;

-- ===========================================================================
-- 1) Table `team_openings`
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.team_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scoping multi-tenant (convention Tier-1).
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,

  -- Provenance. 'web' par défaut : contrairement à `free_players`, ce marché
  -- naît du site. 'discord' est prévu pour un futur push du bot (annonce postée
  -- depuis un salon) et n'est écrit par personne aujourd'hui.
  source text NOT NULL DEFAULT 'web',

  -- Équipe. NULL = annonce publiée sans compte : `team_name` fait alors foi.
  -- ON DELETE SET NULL : une équipe dissoute ne doit pas bloquer la suppression
  -- ni faire disparaître l'historique de son annonce.
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  team_name text,

  -- Postes RECHERCHÉS (sens inverse de free_players.roles). Vocabulaire commun.
  roles text[] NOT NULL DEFAULT '{}',

  -- Niveau de l'équipe, même échelle que les joueuses ('unknown' inclus).
  level text,

  -- Disponibilités en texte libre borné. Volontairement PAS structuré : la
  -- grille de créneaux existe côté scrims et serait une friction rédhibitoire
  -- sur un formulaire d'entrée.
  availability text,
  note text,

  -- Contact : JAMAIS exposé publiquement (cf. en-tête).
  contact_email text,
  contact_discord text,

  marked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

COMMENT ON TABLE public.team_openings IS
  'Annonces « cette équipe cherche une joueuse » — miroir de free_players. Service-role only (RLS sans policy).';
COMMENT ON COLUMN public.team_openings.source IS
  'Provenance : web (formulaire public) | discord (réservé à un futur push du bot).';
COMMENT ON COLUMN public.team_openings.team_id IS
  'Équipe du site quand l''annonce vient d''un espace capitaine. NULL = annonce publiée sans compte, team_name fait foi.';
COMMENT ON COLUMN public.team_openings.roles IS
  'Postes RECHERCHÉS (tank/dps/support/flex) — sens inverse de free_players.roles.';
COMMENT ON COLUMN public.team_openings.contact_email IS
  'Contact privé. Ne doit jamais sortir par une route publique — personnes connectées uniquement.';
COMMENT ON COLUMN public.team_openings.expires_at IS
  'Péremption de l''annonce (60 j). Filtrée à la lecture, pas purgée.';

-- ===========================================================================
-- 2) Contraintes de cohérence
-- ===========================================================================

ALTER TABLE public.team_openings
  DROP CONSTRAINT IF EXISTS team_openings_source_check;
ALTER TABLE public.team_openings
  ADD CONSTRAINT team_openings_source_check
  CHECK (source IN ('web', 'discord'));

-- Une annonce doit être IDENTIFIABLE (on sait de quelle équipe il s'agit) et
-- JOIGNABLE (on peut y répondre). Sans l'un des deux elle n'apprend rien et
-- n'aboutit à rien : autant refuser l'insert.
ALTER TABLE public.team_openings
  DROP CONSTRAINT IF EXISTS team_openings_identity_check;
ALTER TABLE public.team_openings
  ADD CONSTRAINT team_openings_identity_check
  CHECK (
    team_id IS NOT NULL
    OR (team_name IS NOT NULL AND length(btrim(team_name)) > 0)
  );

ALTER TABLE public.team_openings
  DROP CONSTRAINT IF EXISTS team_openings_contact_check;
ALTER TABLE public.team_openings
  ADD CONSTRAINT team_openings_contact_check
  CHECK (
    source <> 'web'
    OR (contact_email IS NOT NULL AND length(btrim(contact_email)) > 0)
  );

-- ===========================================================================
-- 3) Unicité — une annonce par équipe et par email
-- ===========================================================================

-- L'email est la clé fonctionnelle du parcours sans compte : une re-soumission
-- met à jour l'annonce existante au lieu d'en empiler une seconde. lower() pour
-- que Capitaine@x.fr et capitaine@x.fr soient la même personne. Index PARTIEL
-- (source='web') : une future provenance Discord aura sa propre clé.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_openings_tenant_email
  ON public.team_openings (tenant_id, lower(contact_email))
  WHERE source = 'web';

-- ===========================================================================
-- 4) Index de lecture
-- ===========================================================================

-- Les deux lectures réelles : la liste publique (tenant, la plus récente en
-- premier) et le filtre de péremption.
CREATE INDEX IF NOT EXISTS idx_team_openings_tenant_marked
  ON public.team_openings (tenant_id, marked_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_openings_tenant_expires
  ON public.team_openings (tenant_id, expires_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_team_openings_team_id
  ON public.team_openings (team_id);

-- ===========================================================================
-- 5) Trigger updated_at
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.update_team_openings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_openings_updated_at ON public.team_openings;
CREATE TRIGGER trg_team_openings_updated_at
  BEFORE UPDATE ON public.team_openings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_team_openings_updated_at();

-- ===========================================================================
-- 6) RLS — service-role only
-- ===========================================================================
--
-- Aucune policy, exactement comme `free_players` : anon/authenticated bloqués.
-- L'écriture publique passe par une route API avec captcha + rate-limit, jamais
-- par PostgREST — et les colonnes de contact ne peuvent donc pas être lues
-- directement par un client.

ALTER TABLE public.team_openings ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ===========================================================================
-- 7) PostgREST schema cache reload (nouvelle table + nouvelles FK)
-- ===========================================================================

NOTIFY pgrst, 'reload schema';
