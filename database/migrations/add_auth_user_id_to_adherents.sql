-- Migration: Add auth_user_id to adherents table
-- Description: Permet de lier un adhérent à un compte utilisateur auth.users

-- =============================================================================
-- ADD AUTH_USER_ID COLUMN
-- =============================================================================

-- Ajouter la colonne auth_user_id (optionnelle, peut être NULL)
ALTER TABLE adherents
ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index pour la recherche par auth_user_id
CREATE INDEX IF NOT EXISTS idx_adherents_auth_user
ON adherents (auth_user_id) WHERE auth_user_id IS NOT NULL;

-- =============================================================================
-- COMMENT
-- =============================================================================
COMMENT ON COLUMN adherents.auth_user_id IS 'Lien optionnel vers un compte utilisateur auth.users';
