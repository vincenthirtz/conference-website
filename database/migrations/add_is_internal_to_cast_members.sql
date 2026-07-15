-- Migration: fiche caster interne (opérationnelle) vs caster public
--
-- WHY: cast_members.is_active porte aujourd'hui DEUX rôles à la fois :
--   - il sert de gate pour l'accès au cockpit Régie (une fiche caster active
--     = un accès au cockpit),
--   - et il conditionne l'affichage public (listes de casters, assignation
--     sur les diffusions, vitrine).
--   Conséquence : impossible de donner l'accès cockpit à un admin/owner sans
--   le publier comme casteur public. On introduit une fiche « interne »,
--   purement opérationnelle : un admin/owner obtient l'accès cockpit sans
--   jamais apparaître sur les surfaces publiques ni dans l'assignation.
--
-- WHAT (additif, non-destructif) :
--   - is_internal : true = fiche opérationnelle interne (cockpit uniquement),
--     exclue de TOUTES les surfaces publiques/assignation. false = vrai casteur
--     public (comportement historique). Défaut false => toutes les fiches
--     existantes restent publiques, aucune régression et aucun backfill requis.
--
--   Aucun UPDATE nécessaire (le DEFAULT s'en charge). Pas de FK ajoutée =>
--   pas de reload du cache PostgREST.

BEGIN;

ALTER TABLE public.cast_members
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cast_members.is_internal IS
  'true = fiche caster interne/opérationnelle (accès cockpit Régie uniquement, jamais listée publiquement ni assignable). false = casteur public (défaut). Découple le gate cockpit de l''affichage public porté par is_active.';

COMMIT;
