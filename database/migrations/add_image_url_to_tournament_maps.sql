-- Migration: Add image_url column to tournament_maps table
-- Date: 2026-01-09

-- Add image_url column if it doesn't exist
ALTER TABLE public.tournament_maps
ADD COLUMN IF NOT EXISTS public.tournament_maps text null;

-- Add comment to document the column purpose
COMMENT ON COLUMN public.tournament_maps.image_url IS 'URL de l''image représentant la map';
