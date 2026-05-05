-- Seed: add Eiko to the "Communauté" pôle (louve blanche).
-- Idempotent: skip if a member with the same (pole_key, name) already exists.

INSERT INTO association_pole_members (pole_key, name, title, sort_order)
SELECT 'communaute', 'Eiko', 'Louve blanche', 2
WHERE NOT EXISTS (
  SELECT 1 FROM association_pole_members
  WHERE pole_key = 'communaute' AND name = 'Eiko'
);
