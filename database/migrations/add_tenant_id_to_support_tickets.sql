-- Scoping tenant des tickets de support.
--
-- La table était volontairement globale tant qu'un seul tenant existait : le
-- commentaire en tête de `pages/api/admin/support/tickets.ts` disait déjà que
-- l'arrivée d'un deuxième tenant l'imposerait. C'est fait — sans cette
-- colonne, le staff d'un tenant lit les signalements d'un autre, y compris des
-- signalements de harcèlement nominatifs.
--
-- Backfill : toutes les lignes existantes appartiennent au tenant historique
-- (conference). La colonne est ensuite NOT NULL avec ce défaut, pour qu'une
-- insertion qui oublierait le tenant échoue bruyamment plutôt que de créer un
-- ticket orphelin invisible de tous.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

UPDATE public.support_tickets s
SET tenant_id = t.id
FROM public.tenants t
WHERE s.tenant_id IS NULL AND t.slug = 'conference';

ALTER TABLE public.support_tickets
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant_created
  ON public.support_tickets (tenant_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
