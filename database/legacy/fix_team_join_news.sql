-- ARCHIVÉ le 2026-06-26 : DATA FIX one-shot (UPDATE de lignes news existantes),
--   commenté/manuel (preview SELECT + UPDATE à décommenter). Aucun schéma, aucune
--   reproductibilité attendue. NE PAS versionner. Conservé pour historique uniquement.
-- =====================================================================

-- Fix existing team join news: add player name in title/excerpt/content + team logo as image
-- Preview first (SELECT), then run the UPDATE

-- 1) Preview: show current news and what they will become
SELECT
  n.id,
  n.slug,
  n.title AS old_title,
  n.image_url AS old_image,
  t.name AS team_name,
  t.logo_url AS team_logo,
  tm.battle_tag,
  split_part(tm.battle_tag, '#', 1) AS player_name,
  -- New values:
  split_part(tm.battle_tag, '#', 1) || ' rejoint ' || t.name AS new_title,
  split_part(tm.battle_tag, '#', 1) || ' rejoint ' || t.name || ' en tant que ' || tm.role || '.' AS new_excerpt,
  split_part(tm.battle_tag, '#', 1) || ' a rejoint ' || t.name || ' en tant que ' || tm.role || '. Bienvenue !' AS new_content
FROM news n
JOIN teams t ON n.slug LIKE 'team-' || t.id::text || '-member-%'
JOIN team_members tm ON tm.team_id = t.id
  -- Match the member that was added closest after the news was published
  AND tm.created_at >= n.published_at - interval '1 minute'
  AND tm.created_at <= n.published_at + interval '5 minutes'
WHERE n.slug LIKE 'team-%-member-%'
  AND n.tag = 'teams'
ORDER BY n.published_at DESC;

-- 2) UPDATE: uncomment and run after verifying the preview
/*
UPDATE news
SET
  title = sub.new_title,
  excerpt = sub.new_excerpt,
  content = sub.new_content,
  image_url = sub.team_logo
FROM (
  SELECT
    n.id AS news_id,
    split_part(tm.battle_tag, '#', 1) || ' rejoint ' || t.name AS new_title,
    split_part(tm.battle_tag, '#', 1) || ' rejoint ' || t.name || ' en tant que ' || tm.role || '.' AS new_excerpt,
    split_part(tm.battle_tag, '#', 1) || ' a rejoint ' || t.name || ' en tant que ' || tm.role || '. Bienvenue !' AS new_content,
    t.logo_url AS team_logo
  FROM news n
  JOIN teams t ON n.slug LIKE 'team-' || t.id::text || '-member-%'
  JOIN team_members tm ON tm.team_id = t.id
    AND tm.created_at >= n.published_at - interval '1 minute'
    AND tm.created_at <= n.published_at + interval '5 minutes'
  WHERE n.slug LIKE 'team-%-member-%'
    AND n.tag = 'teams'
) sub
WHERE news.id = sub.news_id;
*/
