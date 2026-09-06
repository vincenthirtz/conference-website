-- Contraintes de disponibilité d'une équipe — lot 1 de docs/PLAN-plateforme-tournois.md
--
-- POURQUOI CETTE TABLE. La plateforme sait quand un match a lieu (matches.scheduled_at)
-- et n'a jamais su quand il a le DROIT d'avoir lieu. Le 2026-09-06, la planification de
-- la Cup 2026 a dû être refaite à la main, hors du produit, pour satisfaire une phrase
-- qui vivait dans un message Discord : « Hinode ne joue pas avant 21 h, et pas du 18 au
-- 20 ni du 25 au 27 septembre ». Tant que cette phrase n'est écrite nulle part, l'auto-
-- scheduler ne peut pas la respecter, le diagnostic de planning ne peut pas la vérifier,
-- et le staff arbitre de mémoire.
--
-- QUATRE NATURES, PAS UNE DE PLUS. Ce sont les quatre qui sont réellement apparues :
--   blackout — indisponible d'une date à une autre (bornes INCLUSIVES) ;
--   earliest — aucun match qui COMMENCE avant telle heure murale ;
--   latest   — aucun match qui commence après telle heure murale ;
--   weekday  — indisponible tel(s) jour(s) de la semaine (1 = lundi … 7 = dimanche, ISO).
-- Un enum SQL aurait figé le catalogue ; un CHECK le contraint sans imposer une migration
-- à chaque ajout, et il documente les valeurs à l'endroit où on les lit.
--
-- POURQUOI UN FUSEAU EN COLONNE. « Avant 21 h » est une heure MURALE, pas un instant.
-- Le même match à 20 h 30 Paris est à 19 h 30 Londres : sans fuseau, la contrainte n'a
-- pas de sens vérifiable, et elle change de sens au passage à l'heure d'hiver — la Cup
-- 2026 court du 18/09 au 23/10, elle traverse la bascule du 25 octobre.
--
-- PORTÉE. tournament_id NULL = la contrainte vaut pour tous les tournois de l'équipe
-- (« on ne joue jamais le lundi »). Renseigné, elle ne vaut que pour celui-là
-- (« indisponible pendant la Cup, semaine du 18 »). Les deux cas existent, et une
-- contrainte permanente recopiée à chaque tournoi finirait périmée quelque part.
--
-- NE PAS CONFONDRE AVEC `team_availability`. Cette table-là est la grille
-- « When2Meet » des scrims : des créneaux peints par une JOUEUSE, pour UNE
-- négociation, jetables une fois le scrim calé. Celle-ci porte des règles
-- PERMANENTES de l'équipe, opposables au calendrier officiel. Deux durées de
-- vie, deux auteurs, deux usages — les fusionner ferait qu'un oubli de peinture
-- vaudrait indisponibilité.
--
-- RLS : activée sans aucune policy. Service role uniquement — la lecture passe par les
-- routes admin, qui portent déjà le contrôle de permission staff.
--
-- Idempotent : re-jouable sans effet.

CREATE TABLE IF NOT EXISTS team_availability_constraints (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  team_id       uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  /* NULL = vaut pour tous les tournois de l'équipe. */
  tournament_id uuid REFERENCES tournaments(id) ON DELETE CASCADE,

  kind          text NOT NULL
                CHECK (kind IN ('blackout', 'earliest', 'latest', 'weekday')),

  /* kind = 'blackout' : bornes INCLUSIVES. Un blackout d'un seul jour a
     starts_on = ends_on — c'est le cas le plus fréquent, il ne doit pas
     demander de réfléchir. */
  starts_on     date,
  ends_on       date,

  /* kind = 'earliest' | 'latest' : heure murale dans `timezone`. */
  time_of_day   time,

  /* kind = 'weekday' : jours ISO (1 = lundi … 7 = dimanche). Tableau parce
     qu'« ni le samedi ni le dimanche » est une seule contrainte, pas deux. */
  weekdays      smallint[],

  /* IANA. Défaut = le fuseau de l'association, celui de la quasi-totalité des
     contraintes qu'on saisira. */
  timezone      text NOT NULL DEFAULT 'Europe/Paris',

  /* Ce que l'équipe a réellement écrit. C'est ce qu'on relira dans six mois pour
     savoir si la contrainte tient toujours — la forme normalisée ci-dessus perd
     le « parce que » et le « jusqu'à quand ». */
  note          text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES staff(id) ON DELETE SET NULL,

  /* Chaque nature exige ses champs et interdit les autres. Sans ça, un
     'earliest' sans heure passerait en base et serait silencieusement ignoré
     par le vérificateur : une contrainte saisie, affichée, et sans effet —
     le pire des trois états possibles. */
  CONSTRAINT team_availability_shape CHECK (
    CASE kind
      WHEN 'blackout' THEN
        starts_on IS NOT NULL AND ends_on IS NOT NULL AND ends_on >= starts_on
        AND time_of_day IS NULL AND weekdays IS NULL
      WHEN 'earliest' THEN
        time_of_day IS NOT NULL AND starts_on IS NULL AND ends_on IS NULL AND weekdays IS NULL
      WHEN 'latest' THEN
        time_of_day IS NOT NULL AND starts_on IS NULL AND ends_on IS NULL AND weekdays IS NULL
      WHEN 'weekday' THEN
        weekdays IS NOT NULL AND array_length(weekdays, 1) BETWEEN 1 AND 7
        AND starts_on IS NULL AND ends_on IS NULL AND time_of_day IS NULL
      ELSE false
    END
  )
);

/* La lecture dominante est « toutes les contraintes des équipes de ce tournoi »
   (diagnostic de planning, auto-scheduler) et « celles de cette équipe » (fiche
   équipe). Les deux passent par team_id ; tenant_id en tête garde l'index
   utilisable pour le filtre de portée. */
CREATE INDEX IF NOT EXISTS idx_team_availability_team
  ON team_availability_constraints (tenant_id, team_id);

CREATE INDEX IF NOT EXISTS idx_team_availability_tournament
  ON team_availability_constraints (tenant_id, tournament_id)
  WHERE tournament_id IS NOT NULL;

ALTER TABLE team_availability_constraints ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE team_availability_constraints IS
  'Quand une équipe a le droit de jouer. Lu par le diagnostic de planning et l''auto-scheduler. Service role uniquement (RLS sans policy).';
COMMENT ON COLUMN team_availability_constraints.timezone IS
  'IANA. Les heures (time_of_day) et les dates (starts_on/ends_on) sont MURALES dans ce fuseau.';
COMMENT ON COLUMN team_availability_constraints.weekdays IS
  'Jours ISO : 1 = lundi … 7 = dimanche.';
