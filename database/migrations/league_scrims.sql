-- Rattacher les scrims à une saison.
--
-- Une saison agrégeait jusqu'ici les seuls TOURNOIS (`league_tournaments`).
-- Décision produit (2026-08-24) : les résultats de scrims comptent eux aussi
-- pour la saison en cours. D'où cette table de liaison, décalquée de
-- `league_tournaments` — même forme, même poids, mêmes garanties.
--
-- Pourquoi une liaison EXPLICITE plutôt qu'une fenêtre de dates : un scrim peut
-- très bien tomber hors des bornes de la saison à laquelle on veut le
-- rattacher (parties de mai 2026 versées à la saison ouverte en août). Une
-- règle par dates trancherait à la place de l'organisation, et sans recours.
--
-- `scrims_counted` sur `league_standings` : sans cette colonne, une équipe
-- présente uniquement par ses scrims afficherait « 0 tournoi » à côté de ses
-- points, ce qui se lit comme un bug.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS league_scrims (
  league_id  uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  scrim_id   uuid NOT NULL REFERENCES scrims(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  weight     numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, scrim_id)
);

CREATE INDEX IF NOT EXISTS idx_league_scrims_scrim ON league_scrims (scrim_id);
CREATE INDEX IF NOT EXISTS idx_league_scrims_tenant ON league_scrims (tenant_id);

ALTER TABLE league_standings
  ADD COLUMN IF NOT EXISTS scrims_counted integer NOT NULL DEFAULT 0;

-- RLS : lecture publique comme `league_tournaments` (une saison publique
-- expose ses épreuves), écriture réservée au service role.
ALTER TABLE league_scrims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS league_scrims_read ON league_scrims;
CREATE POLICY league_scrims_read ON league_scrims
  FOR SELECT USING (true);

-- Rappel : après ajout d'une clé étrangère, recharger le cache de schéma
-- PostgREST (NOTIFY pgrst, 'reload schema').
