-- Migration: Create adherents table
-- Description: Gestion des adhérents de l'association et suivi des cotisations

-- =============================================================================
-- ADHERENTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS adherents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Informations personnelles
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  birth_date DATE,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'France',

  -- Informations association
  member_number TEXT UNIQUE, -- Numéro d'adhérent (auto-généré ou manuel)
  join_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Cotisation année en cours
  current_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN (
    'pending',      -- En attente de paiement
    'partial',      -- Paiement partiel reçu
    'paid',         -- Payé intégralement
    'exempt',       -- Exempté (bénévole, cas spécial)
    'overdue'       -- En retard
  )),
  payment_amount DECIMAL(10, 2) DEFAULT 0, -- Montant payé
  payment_date DATE,                        -- Date du dernier paiement
  payment_method TEXT CHECK (payment_method IN (
    'cash',         -- Espèces
    'check',        -- Chèque
    'transfer',     -- Virement bancaire
    'card',         -- Carte bancaire
    'helloasso',    -- HelloAsso
    'other'         -- Autre
  )),
  payment_reference TEXT,                   -- Référence du paiement (n° chèque, ID transaction)

  -- Statut membre
  is_active BOOLEAN DEFAULT true,
  role TEXT DEFAULT 'member' CHECK (role IN (
    'member',       -- Membre simple
    'volunteer',    -- Bénévole
    'board',        -- Membre du bureau
    'president',    -- Président(e)
    'treasurer',    -- Trésorier(ère)
    'secretary'     -- Secrétaire
  )),

  -- Notes et suivi
  notes TEXT,

  -- Métadonnées
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,  -- Staff qui a créé l'entrée
  updated_by UUID   -- Staff qui a mis à jour l'entrée
);

-- Index pour la recherche par nom
CREATE INDEX IF NOT EXISTS idx_adherents_name
ON adherents (last_name, first_name);

-- Index pour la recherche par email
CREATE INDEX IF NOT EXISTS idx_adherents_email
ON adherents (email);

-- Index pour le filtrage par statut de paiement
CREATE INDEX IF NOT EXISTS idx_adherents_payment_status
ON adherents (current_year, payment_status);

-- Index pour les membres actifs
CREATE INDEX IF NOT EXISTS idx_adherents_active
ON adherents (is_active, current_year);

-- Trigger pour auto-update updated_at
CREATE OR REPLACE FUNCTION update_adherents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS adherents_updated_at ON adherents;
CREATE TRIGGER adherents_updated_at
  BEFORE UPDATE ON adherents
  FOR EACH ROW
  EXECUTE FUNCTION update_adherents_updated_at();

-- Fonction pour générer un numéro d'adhérent
CREATE OR REPLACE FUNCTION generate_member_number()
RETURNS TRIGGER AS $$
DECLARE
  year_prefix TEXT;
  next_number INTEGER;
BEGIN
  IF NEW.member_number IS NULL THEN
    year_prefix := TO_CHAR(NEW.join_date, 'YYYY');

    SELECT COALESCE(MAX(
      CAST(SUBSTRING(member_number FROM 6) AS INTEGER)
    ), 0) + 1
    INTO next_number
    FROM adherents
    WHERE member_number LIKE year_prefix || '-%';

    NEW.member_number := year_prefix || '-' || LPAD(next_number::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS adherents_generate_member_number ON adherents;
CREATE TRIGGER adherents_generate_member_number
  BEFORE INSERT ON adherents
  FOR EACH ROW
  EXECUTE FUNCTION generate_member_number();

-- =============================================================================
-- ADHERENT PAYMENTS HISTORY TABLE (optionnel, pour historique multi-années)
-- =============================================================================
CREATE TABLE IF NOT EXISTS adherent_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adherent_id UUID NOT NULL REFERENCES adherents(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method TEXT CHECK (payment_method IN (
    'cash', 'check', 'transfer', 'card', 'helloasso', 'other'
  )),
  payment_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,

  UNIQUE(adherent_id, year)
);

CREATE INDEX IF NOT EXISTS idx_adherent_payments_adherent
ON adherent_payments (adherent_id);

CREATE INDEX IF NOT EXISTS idx_adherent_payments_year
ON adherent_payments (year, payment_date);

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE adherents IS 'Membres adhérents de l''association';
COMMENT ON COLUMN adherents.member_number IS 'Numéro d''adhérent unique (format: YYYY-XXXX)';
COMMENT ON COLUMN adherents.current_year IS 'Année de cotisation en cours';
COMMENT ON COLUMN adherents.payment_status IS 'Statut du paiement: pending, partial, paid, exempt, overdue';
COMMENT ON COLUMN adherents.payment_amount IS 'Montant payé pour l''année en cours';
COMMENT ON COLUMN adherents.payment_method IS 'Mode de paiement utilisé';
COMMENT ON COLUMN adherents.role IS 'Rôle dans l''association: member, volunteer, board, president, treasurer, secretary';

COMMENT ON TABLE adherent_payments IS 'Historique des paiements de cotisation par année';
