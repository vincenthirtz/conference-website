-- Update: assign roles + display order to the "Direction & admin" pôle members.
-- Idempotent: re-running keeps the same final state.

UPDATE association_pole_members
SET title = 'Présidente', sort_order = 1
WHERE pole_key = 'direction' AND name = 'La_Kiiroii';

UPDATE association_pole_members
SET title = 'Vice-Président', sort_order = 2
WHERE pole_key = 'direction' AND name = 'Anrataria';

UPDATE association_pole_members
SET title = 'Trésorier', sort_order = 3
WHERE pole_key = 'direction' AND name = 'Arukdo';

UPDATE association_pole_members
SET title = 'Secrétaire', sort_order = 4
WHERE pole_key = 'direction' AND name = 'Altoy';
