-- Migration: Créer la table twitch_channels
-- Date: 2026-01-11
-- Description:
--   Table pour stocker les chaînes Twitch partenaires affichées
--   dans la section "En attendant la compétition" sur la page d'accueil.

-- Créer la table twitch_channels
CREATE TABLE IF NOT EXISTS twitch_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL UNIQUE,             -- Nom de la chaîne Twitch (ex: "crocheh")
  label TEXT NOT NULL,                       -- Nom d'affichage (ex: "Crocheh")
  badge TEXT,                                -- Badge optionnel (ex: "Cast", "Player", "Coach")
  description TEXT,                          -- Description de la chaîne
  background_url TEXT,                       -- URL de l'avatar/background
  is_active BOOLEAN DEFAULT true,            -- Actif ou non
  sort_order INTEGER DEFAULT 0,              -- Ordre d'affichage
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour le tri et le filtrage
CREATE INDEX IF NOT EXISTS idx_twitch_channels_active_order
  ON twitch_channels(is_active, sort_order ASC, created_at DESC);

-- Commentaires pour documentation
COMMENT ON TABLE twitch_channels IS 'Chaînes Twitch partenaires affichées sur la page d''accueil';
COMMENT ON COLUMN twitch_channels.channel IS 'Nom de la chaîne Twitch (identifiant dans l''URL)';
COMMENT ON COLUMN twitch_channels.badge IS 'Badge affiché à côté du nom (Cast, Player, Coach, etc.)';
COMMENT ON COLUMN twitch_channels.sort_order IS 'Ordre d''affichage (plus petit = plus haut)';

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_twitch_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour updated_at
DROP TRIGGER IF EXISTS trigger_twitch_channels_updated_at ON twitch_channels;
CREATE TRIGGER trigger_twitch_channels_updated_at
  BEFORE UPDATE ON twitch_channels
  FOR EACH ROW
  EXECUTE FUNCTION update_twitch_channels_updated_at();

-- RLS (Row Level Security)
ALTER TABLE twitch_channels ENABLE ROW LEVEL SECURITY;

-- Politique de lecture publique (pour l'affichage sur la page d'accueil)
CREATE POLICY twitch_channels_select_policy ON twitch_channels
  FOR SELECT
  USING (true);

-- Politiques d'écriture pour service role uniquement
CREATE POLICY twitch_channels_insert_policy ON twitch_channels
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY twitch_channels_update_policy ON twitch_channels
  FOR UPDATE
  USING (true);

CREATE POLICY twitch_channels_delete_policy ON twitch_channels
  FOR DELETE
  USING (true);

-- Insérer les données existantes
INSERT INTO twitch_channels (channel, label, badge, description, background_url, sort_order) VALUES
  ('crocheh', 'Crocheh', 'Cast', 'Casts francophones et analyses OW2 avec un focus compétitif.', 'https://static-cdn.jtvnw.net/jtv_user_pictures/06c2cf74-2197-4f99-b372-618477410b29-profile_image-150x150.png', 1),
  ('gwadael', 'Gwadael', 'Cast', 'Cast dynamique, joueuse accomplie et spécialiste du LORE Overwatch.', 'https://static-cdn.jtvnw.net/jtv_user_pictures/a7b5e36f-134a-42a2-aa5d-2f8b256ec548-profile_image-150x150.png', 2),
  ('arukdo', 'Arukdo', 'Analyse', 'Débriefs stratégiques, review de VOD et pédagogie pour progresser.', 'https://static-cdn.jtvnw.net/jtv_user_pictures/25e794ab-fb22-4373-8862-e73ffc670ce3-profile_image-150x150.png', 3),
  ('la_kiiroii', 'La_Kiiroii', 'Communauté', 'Communauté et ambiance chaleureuse autour des tournois.', 'https://static-cdn.jtvnw.net/jtv_user_pictures/ef9103e3-7601-4528-b42e-2e565f4a8a9c-profile_image-150x150.jpeg', 4),
  ('yamatorochii', 'Yamatorochii', 'Player', 'Lives réguliers, gameplay et échanges avec la communauté. Joueuse de l''équipe Avoidgers', 'https://static-cdn.jtvnw.net/jtv_user_pictures/94996092-0ed5-401c-982e-d55a2ea024df-profile_image-150x150.png', 5),
  ('eiaeltv', 'EiaelTV', 'Coach', 'Casts et contenus dédiés à la scène Overwatch et Valorant féminine et mixte.', 'https://static-cdn.jtvnw.net/jtv_user_pictures/db4b2c5d-38df-4835-a541-48851402b8a0-profile_image-150x150.png', 6),
  ('misskiwiii', 'MissKiwiii', 'Player', 'Joueuse Overwatch 2 avec bonne humeur, scrims avec la team Sparkles (tenante du titre 2025).', 'https://static-cdn.jtvnw.net/jtv_user_pictures/6324195a-0d2a-4966-93e5-3970ef1af174-profile_image-150x150.png', 7),
  ('imbanshee01', 'ImBanshee01', 'Player', 'Equipe des phénix et joueuse occasionnelle console', 'https://static-cdn.jtvnw.net/jtv_user_pictures/a37f1f33-2910-4349-b7b5-4b0e0beee14b-profile_image-150x150.jpeg', 8),
  ('eiko_live', 'Eiko_Live', 'Player', 'Streams Overwatch 2 avec une ambiance chill et des conseils gameplay. Joueuse de l''équipe Avoidgers', 'https://static-cdn.jtvnw.net/jtv_user_pictures/8e26e1e3-e8d3-4ed1-8a3c-42199cda7741-profile_image-150x150.png', 9),
  ('happy_ow_', 'Happy_ow_', 'Player', 'Gameplay OW2, ranked et scrims avec une ambiance positive. Membre des Sparkles', 'https://static-cdn.jtvnw.net/jtv_user_pictures/499eb8fc-1e35-4816-a74c-458c837ae32d-profile_image-150x150.png', 10),
  ('zezzdecitron', 'ZezzDeCitron', 'Player', 'Ici c''est principalement du Overwatch mais aussi quelques petits jeux indé et sinon ça discute pas mal. Support des Onna Bugeisha', 'https://static-cdn.jtvnw.net/jtv_user_pictures/05b93829-6a55-463a-89ec-bd65c33d1d16-profile_image-150x150.jpeg', 11),
  ('ooh_jaz', 'Ooh_Jaz', 'Player', 'Casts et parties classées Overwatch 2, avec focus dps et ambiance chill. Joueuse des Onna Bugeisha', 'https://static-cdn.jtvnw.net/jtv_user_pictures/5dda95ec-d9d0-4e30-bb3f-6fd0211cdeb0-profile_image-150x150.png', 12)
ON CONFLICT (channel) DO NOTHING;
