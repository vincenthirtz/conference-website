-- Migration: ouvrir `free_players` aux inscriptions faites DEPUIS LE SITE
-- Date: 2026-08-23
-- Lot 1 du backlog d'acquisition (docs/BACKLOG-acquisition-joueuses.md).
--
-- WHY:
--   Jusqu'ici une « joueuse libre » ne pouvait exister que d'une seule façon :
--   porter le rôle Discord « Recherche une équipe », que le bot pousse vers
--   `free_players`. Autrement dit, une joueuse qui découvre le site sans passer
--   par Discord n'avait AUCUN moyen de se signaler — et le site la renvoyait
--   explicitement ailleurs (FAQ de /inscription-2026). C'est le plus gros
--   gisement d'acquisition, et il était fermé.
--
--   Cette migration ajoute une seconde provenance (`source = 'web'`) : une
--   inscription faite depuis /rejoindre, SANS compte requis. Les deux
--   provenances cohabitent dans la même table parce que c'est le même concept
--   côté lecture (« qui cherche une équipe ? ») — les capitaines lisent une
--   liste unique, pas deux.
--
-- DANGER PRINCIPAL TRAITÉ ICI:
--   `/api/bot/v1/free-players/sync` fait un FULL REPLACE : il supprime TOUTES
--   les rows du tenant puis réinsère le set Discord reçu. Sans garde-fou, la
--   première synchro du bot effacerait toutes les inscriptions web. Deux
--   verrous complémentaires :
--     1. le handler filtre désormais sa purge sur `source = 'discord'` ;
--     2. l'index d'unicité Discord devient PARTIEL (`WHERE source='discord'`),
--        ce qui rend l'intention explicite en base et pas seulement dans le code.
--
-- CAVEATS:
--   - `discord_user_id` devient NULLABLE (une inscription web n'a pas de
--     Discord). L'invariant est préservé par un CHECK par provenance :
--     'discord' ⇒ discord_user_id NOT NULL ; 'web' ⇒ display_name + contact_email.
--   - `contact_email` / `contact_discord` sont des données de CONTACT : elles ne
--     doivent JAMAIS sortir par la route publique (cf. /api/public/free-players,
--     qui projette une vue anonymisée). Seules les capitaines authentifiées y
--     accèdent, via /api/teams/free-players.
--   - `expires_at` : une annonce périme au bout de 60 jours. Sans ça l'annuaire
--     pourrit — une joueuse inscrite il y a huit mois et déjà en équipe ailleurs
--     donne l'impression d'un marché actif qui ne l'est pas. La colonne est
--     filtrée à la lecture, pas purgée (on garde la trace).
--   - Service-role only : la table reste en RLS activée SANS policy. L'écriture
--     publique passe par une route API avec captcha + rate-limit, jamais par
--     PostgREST.
--   - Idempotente (IF NOT EXISTS / DROP IF EXISTS partout). Ré-appliquable.
--   - Pas de nouvelle FK → pas de reload du schema cache PostgREST nécessaire.

BEGIN;

-- ===========================================================================
-- 1) Provenance + colonnes propres à l'inscription web
-- ===========================================================================

ALTER TABLE public.free_players
  -- DEFAULT 'discord' : toutes les rows existantes viennent du bot.
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'discord',
  ADD COLUMN IF NOT EXISTS display_name text,
  -- Postes joués. Tableau (et pas colonne unique) : une joueuse coche
  -- volontiers « dps + flex ». Vocabulaire aligné sur team_members.specialty.
  ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}',
  -- Disponibilités en texte libre borné. Volontairement PAS structuré ici :
  -- la grille de créneaux existe déjà côté scrims et serait une friction
  -- rédhibitoire sur un formulaire d'entrée. À structurer si le volume le
  -- justifie un jour.
  ADD COLUMN IF NOT EXISTS availability text,
  ADD COLUMN IF NOT EXISTS level text,
  ADD COLUMN IF NOT EXISTS note text,
  -- Contact : JAMAIS exposé publiquement (cf. en-tête).
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_discord text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.free_players.source IS
  'Provenance : discord (poussée par le bot, full replace) | web (formulaire public /rejoindre).';
COMMENT ON COLUMN public.free_players.contact_email IS
  'Contact privé. Ne doit jamais sortir par une route publique — capitaines authentifiées uniquement.';
COMMENT ON COLUMN public.free_players.expires_at IS
  'Péremption de l''annonce (60 j par défaut). Filtrée à la lecture, pas purgée.';

-- ===========================================================================
-- 2) Contraintes de cohérence par provenance
-- ===========================================================================

ALTER TABLE public.free_players
  ALTER COLUMN discord_user_id DROP NOT NULL;

ALTER TABLE public.free_players
  DROP CONSTRAINT IF EXISTS free_players_source_check;
ALTER TABLE public.free_players
  ADD CONSTRAINT free_players_source_check
  CHECK (source IN ('discord', 'web'));

-- Chaque provenance porte ses propres champs obligatoires. Sans ça, une row
-- 'web' sans contact serait injoignable (donc inutile) et une row 'discord'
-- sans snowflake serait invisible du bot.
ALTER TABLE public.free_players
  DROP CONSTRAINT IF EXISTS free_players_source_fields_check;
ALTER TABLE public.free_players
  ADD CONSTRAINT free_players_source_fields_check
  CHECK (
    (source = 'discord' AND discord_user_id IS NOT NULL)
    OR
    (source = 'web'
      AND display_name IS NOT NULL AND length(btrim(display_name)) > 0
      AND contact_email IS NOT NULL AND length(btrim(contact_email)) > 0)
  );

-- ===========================================================================
-- 3) Unicité : une par provenance
-- ===========================================================================

-- L'unicité Discord devient PARTIELLE : elle ne doit plus s'appliquer aux rows
-- web (dont discord_user_id est NULL). Un index unique classique tolérerait
-- plusieurs NULL, mais le partiel dit l'intention et protège l'invariant si
-- discord_user_id venait à être renseigné sur une row web.
-- Nom relevé en prod le 2026-08-23 (pas le nom auto-généré par Postgres :
-- la contrainte a été nommée explicitement à la création de la table).
ALTER TABLE public.free_players
  DROP CONSTRAINT IF EXISTS free_players_tenant_discord_unique;
-- Filet pour les environnements où elle porterait le nom auto-généré.
ALTER TABLE public.free_players
  DROP CONSTRAINT IF EXISTS free_players_tenant_id_discord_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_free_players_tenant_discord
  ON public.free_players (tenant_id, discord_user_id)
  WHERE source = 'discord';

-- Côté web, l'email est la clé fonctionnelle : une re-soumission met à jour
-- l'annonce existante (upsert) au lieu d'en créer une seconde. lower() pour que
-- Alice@x.fr et alice@x.fr soient la même personne.
CREATE UNIQUE INDEX IF NOT EXISTS uq_free_players_tenant_email
  ON public.free_players (tenant_id, lower(contact_email))
  WHERE source = 'web';

-- ===========================================================================
-- 4) Index de lecture
-- ===========================================================================

-- Les deux lectures réelles : la liste publique (tenant + non périmé) et la
-- purge du bot (tenant + source).
CREATE INDEX IF NOT EXISTS idx_free_players_tenant_source
  ON public.free_players (tenant_id, source);
CREATE INDEX IF NOT EXISTS idx_free_players_tenant_expires
  ON public.free_players (tenant_id, expires_at DESC NULLS LAST);

COMMIT;
