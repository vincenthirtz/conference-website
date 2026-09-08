-- Update: FlipFlop (pôle Communauté) organise aussi les évènements, pas
-- seulement les scrims.
--
-- La carte membre s'affiche en pastille « Nom — Titre » sur une seule ligne :
-- les deux responsabilités tiennent donc dans un titre unique plutôt que dans
-- deux entrées, qui dupliqueraient le nom.
--
-- Idempotent : re-jouable, l'état final reste le même.

UPDATE association_pole_members
SET title = 'Organisation des scrims et évènements'
WHERE pole_key = 'communaute'
  AND name = 'FlipFlop';
