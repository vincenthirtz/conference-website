-- Seed: add F4Y4 to the "Tournoi & arbitrage" pôle.
-- Idempotent: skip if a member with the same (pole_key, name) already exists.

INSERT INTO association_pole_members (pole_key, name, sort_order)
SELECT 'tournoi', 'F4Y4', 1
WHERE NOT EXISTS (
  SELECT 1 FROM association_pole_members
  WHERE pole_key = 'tournoi' AND name = 'F4Y4'
);
