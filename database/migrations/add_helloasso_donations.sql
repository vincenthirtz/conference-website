-- Migration: helloasso_donations — les dons HelloAsso reçus, pour la source
-- OBS « alerte don » (`/overlay/don-alert`).
--
-- WHY:
--   Streamlabs n'a pas d'intégration HelloAsso : une régie qui veut afficher
--   « Merci pour ce don de 10 € ! » à l'antenne n'a aucun moyen de le faire.
--   Le webhook HelloAsso (`pages/api/helloasso/webhook.ts`) reçoit bien chaque
--   paiement, mais ne persistait RIEN d'un don générique : il émettait un event
--   bot et repartait. La source OBS a besoin d'une liste interrogeable (les
--   derniers dons, le total depuis le début de la journée pour la jauge), d'où
--   cette table, alimentée par le webhook et lue par `GET /api/overlay/donations`.
--
--   Ce qui est un don (et ce qui n'en est pas) est décidé dans le code, pas ici :
--   `utils/helloasso/donationEvent.ts`. Adhésions, billetterie, boutique,
--   abonnements de plan et contributions de cagnotte n'y entrent pas.
--
-- RÈGLES:
--   - AUCUNE DONNÉE PERSONNELLE. Ni nom, ni email, ni message du donateur : une
--     personne tape son nom légal pour un reçu fiscal, pas pour le voir à
--     l'écran d'un stream. Le montant, la devise et le formulaire suffisent à
--     l'alerte et à la jauge. N'ajoutez pas de colonne `payer_*` ici sans un
--     consentement explicite recueilli au moment du don.
--   - Idempotence : UNIQUE (tenant_id, helloasso_payment_id). HelloAsso rejoue
--     une notification tant qu'il n'a pas eu son 200 ; le webhook insère en
--     `ON CONFLICT DO NOTHING`, un rejeu ne compte donc jamais deux fois.
--   - tenant_id = l'espace AUTHENTIFIÉ par le webhook (secret plateforme →
--     l'association ; jeton dérivé `?tenant=` → cet espace), jamais une valeur
--     lue dans le payload.
--   - form_type / form_slug : d'où vient le paiement (`Donation`, `Checkout`…),
--     pour vérifier la couverture de la classification a posteriori.
--
-- RLS:
--   ENABLE ROW LEVEL SECURITY, ZÉRO policy → invisible via PostgREST anon/auth.
--   Service role uniquement (webhook en écriture, route overlay en lecture, qui
--   ne rend que id / montant / devise / date).
--
-- CAVEATS:
--   - Un remboursement HelloAsso (paiement `Refunded`) ne retire pas la ligne :
--     la jauge du jour peut donc surestimer après un remboursement. Rare, et
--     corrigeable à la main (DELETE de la ligne).
--   - ON DELETE CASCADE sur tenant_id : ces lignes ne décrivent qu'un espace,
--     elles n'ont pas de sens sans lui (la purge d'espace les supprime de toute
--     façon, cf. utils/tenants/tenantTables.ts).
--   - Ajout de FK → NOTIFY pgrst en fin (reload du cache de schéma PostgREST).
--   - Idempotent : re-jouable sans effet.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.helloasso_donations;
--   NOTIFY pgrst, 'reload schema';

BEGIN;

CREATE TABLE IF NOT EXISTS public.helloasso_donations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL
                         REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Id du paiement HelloAsso, en TEXT comme prize_pool_contributions.
  helloasso_payment_id TEXT NOT NULL,
  amount_cents         INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency             TEXT NOT NULL DEFAULT 'EUR',
  form_type            TEXT NULL,
  form_slug            TEXT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT helloasso_donations_tenant_payment_key
    UNIQUE (tenant_id, helloasso_payment_id)
);

-- Sert la source OBS : « les derniers dons » et « le total depuis minuit ».
CREATE INDEX IF NOT EXISTS idx_helloasso_donations_tenant_created
  ON public.helloasso_donations (tenant_id, created_at DESC);

ALTER TABLE public.helloasso_donations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.helloasso_donations IS
  'Dons HelloAsso reçus (webhook), pour la source OBS /overlay/don-alert. Aucune donnée personnelle : montant et formulaire seulement. Service role uniquement.';

COMMIT;

NOTIFY pgrst, 'reload schema';
