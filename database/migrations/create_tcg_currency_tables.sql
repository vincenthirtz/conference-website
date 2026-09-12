-- Migration: monnaie du TCG — porte-monnaie et registre d'écritures.
-- Date: 2026-09-13
--
-- WHY:
--   Permettre d'acquérir des boosters autrement qu'en gagnant un match : on
--   gagne des pièces en jouant, on les dépense en boosters. Le paquet offert à
--   chaque victoire (cf. create_tcg_tables.sql) ne change pas ; la monnaie
--   ouvre une seconde voie, plus lente et choisie.
--
-- LA MONNAIE NE S'ACHÈTE PAS EN ARGENT RÉEL, ET CE N'EST PAS UN OUBLI.
--   Une monnaie achetable + des paquets aléatoires = une loot box payante.
--   C'est interdit en Belgique et aux Pays-Bas, surveillé par l'ANJ en France,
--   et le public de ce site comprend des mineures. Aucune colonne, aucun
--   endpoint ici ne relie ce solde à un moyen de paiement. Y brancher
--   HelloAsso plus tard serait une décision produit à prendre en connaissance
--   de cause, pas une extension naturelle de ce schéma.
--
-- LE REGISTRE EST LA SOURCE DE VÉRITÉ, LE SOLDE EN EST LE CACHE.
--   Même patron que la cagnotte prize-pool : `tcg_wallets.balance` est une
--   somme dénormalisée, `tcg_wallet_entries` la justifie ligne à ligne. Un
--   solde qu'on ne peut pas expliquer est un solde qu'on ne peut pas corriger
--   — et il faudra pouvoir répondre « d'où viennent mes pièces ? ».
--
-- IDEMPOTENCE PAR CONSTRUCTION, ENCORE.
--   `UNIQUE (tenant_id, user_id, source_kind, source_ref)` : une victoire, une
--   seule écriture, quoi qu'il arrive — rejeu de la greffe, correction de
--   score, cron relancé. La garantie est dans le schéma, pas dans la prudence
--   de l'appelant. C'est la leçon des quatre doublons Discord du 2026-09-12,
--   et celle déjà appliquée à `tcg_packs`.
--
-- POURQUOI `source_ref` EST DU TEXTE et non un uuid : les sources n'ont pas
--   toutes la même clé. Une victoire pointe un `matches.id` (uuid), un achat
--   de booster pointe un `tcg_packs.id`, une vente de doublon pointera autre
--   chose. Un texte accepte les trois sans une colonne par cas.
--
-- CAVEATS:
--   - Idempotente (IF NOT EXISTS partout, DROP POLICY avant CREATE POLICY).
--   - tenant_id NOT NULL + FK tenants ON DELETE RESTRICT : convention Tier-1.
--   - RLS activée + policy service_role : rien n'est lu par le client en
--     direct, tout passe par les routes serveur.
--   - `amount` est SIGNÉ : positif pour un gain, négatif pour une dépense. Le
--     solde ne peut jamais devenir négatif (CHECK sur `tcg_wallets`), c'est à
--     l'endpoint d'achat de refuser avant d'écrire.

/* ---------------------------------------------------------------------------
 * 1) tcg_wallets — le solde, cache du registre
 * ------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.tcg_wallets (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,

  -- Somme dénormalisée de `tcg_wallet_entries.amount`. Jamais négative : une
  -- dépense se refuse AVANT d'être écrite.
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (tenant_id, user_id)
);

/* ---------------------------------------------------------------------------
 * 2) tcg_wallet_entries — le registre, source de vérité
 * ------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.tcg_wallet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,

  -- Signé : > 0 gain, < 0 dépense. Jamais zéro (une écriture qui ne change
  -- rien n'a pas lieu d'être).
  amount integer NOT NULL CHECK (amount <> 0),

  -- D'où vient l'écriture. `match_win` et `scrim_win` sont les gains ;
  -- `booster_purchase` la dépense ; `admin_grant` la correction manuelle,
  -- tracée par `logStaffAction`.
  source_kind text NOT NULL CHECK (
    source_kind IN ('match_win', 'scrim_win', 'booster_purchase', 'admin_grant')
  ),
  -- Identifiant de l'objet source, en TEXTE (cf. l'en-tête).
  source_ref text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Le garde-fou central : une source = une écriture.
  CONSTRAINT tcg_wallet_entries_one_per_source
    UNIQUE (tenant_id, user_id, source_kind, source_ref)
);

-- « Mon historique de pièces », du plus récent au plus ancien.
CREATE INDEX IF NOT EXISTS idx_tcg_wallet_entries_user
  ON public.tcg_wallet_entries (tenant_id, user_id, created_at DESC);

/* ---------------------------------------------------------------------------
 * RLS — service_role uniquement.
 * ------------------------------------------------------------------------- */

ALTER TABLE public.tcg_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_wallet_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tcg_wallets_service_role ON public.tcg_wallets;
CREATE POLICY tcg_wallets_service_role ON public.tcg_wallets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tcg_wallet_entries_service_role ON public.tcg_wallet_entries;
CREATE POLICY tcg_wallet_entries_service_role ON public.tcg_wallet_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.tcg_wallets IS
  'Solde de pièces TCG d''une joueuse. Cache dénormalisé de tcg_wallet_entries, qui reste la source de vérité. Jamais négatif.';
COMMENT ON TABLE public.tcg_wallet_entries IS
  'Registre des mouvements de pièces TCG. UNIQUE (tenant_id, user_id, source_kind, source_ref) : une source ne peut créditer ou débiter qu''une fois. La monnaie ne s''achète PAS en argent réel — cf. l''en-tête de la migration.';
