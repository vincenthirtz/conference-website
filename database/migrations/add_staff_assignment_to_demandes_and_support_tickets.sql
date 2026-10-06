-- Migration: assignation staff des files de traitement (demandes, tickets)
-- Date: 2026-10-06
--
-- Jusqu'ici, une demande ne portait que `processed_by_staff_id` et un ticket
-- support que `resolved_by` : on savait QUI avait tranché, jamais qui était
-- EN TRAIN de traiter. Deux personnes ouvraient le même ticket, ou personne
-- parce que chacune pensait qu'une autre s'en chargeait.
--
-- `assigned_staff_id` (FK staff.id, pas auth.users) + `assigned_at` : le bouton
-- « Je prends » de /admin/demandes et de l'onglet Support de /admin/moderation
-- les remplit, « Libérer » les vide. ON DELETE SET NULL : un staff retiré
-- libère ses dossiers plutôt que de les emporter.
--
-- Avant application, le code se replie : listes lues sans ces colonnes,
-- boutons d'assignation masqués, et la route d'assignation répond 503.
--
-- Idempotent (IF NOT EXISTS partout).

ALTER TABLE public.demandes
  ADD COLUMN IF NOT EXISTS assigned_staff_id uuid
    REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

COMMENT ON COLUMN public.demandes.assigned_staff_id IS
  'Staff qui a pris la demande en charge (« Je prends »). NULL = non assignée.';
COMMENT ON COLUMN public.demandes.assigned_at IS
  'Moment de la prise en charge (assigned_staff_id).';

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS assigned_staff_id uuid
    REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

COMMENT ON COLUMN public.support_tickets.assigned_staff_id IS
  'Staff qui a pris le ticket en charge (« Je prends »). NULL = non assigné.';
COMMENT ON COLUMN public.support_tickets.assigned_at IS
  'Moment de la prise en charge (assigned_staff_id).';

-- Filtre « à moi » : (tenant, staff) sur les seules lignes assignées.
CREATE INDEX IF NOT EXISTS idx_demandes_tenant_assigned_staff
  ON public.demandes (tenant_id, assigned_staff_id)
  WHERE assigned_staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant_assigned_staff
  ON public.support_tickets (tenant_id, assigned_staff_id)
  WHERE assigned_staff_id IS NOT NULL;
