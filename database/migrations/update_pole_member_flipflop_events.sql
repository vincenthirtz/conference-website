-- Update: FlipFlop (pôle Communauté) est crédité de l'organisation des
-- ÉVÈNEMENTS, en remplacement de l'organisation des scrims.
--
-- Idempotent : re-jouable, l'état final reste le même.

UPDATE association_pole_members
SET title = 'Organisation des évènements'
WHERE pole_key = 'communaute'
  AND name = 'FlipFlop';
