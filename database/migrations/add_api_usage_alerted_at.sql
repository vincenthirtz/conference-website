-- T3 — prévenir AVANT le mur, et une seule fois.
--
-- `api_usage_counters` compte déjà chaque appel authentifié. Personne ne le lit
-- à l'échelle de la plateforme : l'owner ne peut pas répondre à « qui consomme
-- quoi », ni voir venir un dépassement. Le compteur devient un signal.
--
-- `alerted_at` retient le seuil déjà annoncé pour CETTE fenêtre : sans lui, un
-- espace à 85 % recevrait la même alerte tous les jours jusqu'à la fin du mois,
-- et une alerte quotidienne cesse d'être lue au troisième jour.
alter table api_usage_counters
  add column if not exists alerted_at timestamptz,
  add column if not exists alerted_threshold smallint;

comment on column api_usage_counters.alerted_threshold is
  'Dernier seuil annoncé (80 ou 100) pour cette fenêtre. Empêche la répétition quotidienne.';
