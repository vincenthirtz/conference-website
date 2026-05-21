-- Seed dev : event_runs + event_segments pour la feature run-of-show
-- Date: 2026-05-21
--
-- WHY:
--   Donne au Director (admin S2) + Cockpit caster (PWA S3) une timeline
--   pré-remplie pour développer et tester contre des données réalistes,
--   plutôt que d'attendre que le staff crée tout à la main depuis l'UI.
--
--   Cible : tenant `conference` (UUID `ce69a726-773e-4d12-b5eb-d2503aa752b4`),
--   le seul tenant existant côté prod et donc le seul utilisé en dev local.
--
--   Le run est rattaché au tournament existant `e8fa740c-d92b-49d8-a654-05a37d0eea3b`
--   indirectement (via le match seedé), mais event_runs n'a pas de FK
--   tournament — c'est volontaire (cf. header de create_event_runs_table.sql).
--
-- CONTENU :
--   1 event_run "Soirée test run-of-show" (status='draft', scheduled à J+1).
--   4 event_segments dans la timeline :
--     ord=1 : intro       (5 min)
--     ord=2 : match       (40 min) → lié au match `482fd785-...` existant
--     ord=3 : break       (10 min)
--     ord=4 : outro       (5 min)
--
-- IDEMPOTENCE :
--   Le seed est idempotent : on identifie le run par (tenant_id, slug), et
--   les segments par (event_run_id, ord). ON CONFLICT DO NOTHING ignore
--   les rows déjà présentes. Réapplicable sans erreur en local.
--
-- NOTES :
--   - Le match_id du segment ord=2 référence une row existante en prod
--     (482fd785-0e91-4bd1-8bf7-28a4c3c14882 — visible via
--     `SELECT id FROM matches WHERE tournament_id = 'e8fa740c-...' LIMIT 1`).
--     Si ce match disparaît un jour, la FK ON DELETE SET NULL transforme le
--     segment en "match orphelin" — ré-exécuter le seed corrigera (insert
--     fera nothing, mais on peut UPDATE manuellement si besoin).
--   - Le seed est volontairement à part de la migration : les seeds dev ne
--     doivent pas être appliqués en prod automatiquement (cf. convention
--     database/seeds/ vs database/migrations/).

BEGIN;

-- 1) event_run (idempotent via UNIQUE (tenant_id, slug)).
INSERT INTO public.event_runs (
  id,
  tenant_id,
  name,
  slug,
  description,
  scheduled_at,
  status
)
VALUES (
  '11111111-1111-4111-8111-000000000001',
  'ce69a726-773e-4d12-b5eb-d2503aa752b4',
  'Soirée test run-of-show',
  'soiree-test-run-of-show',
  'Run dev pour itérer sur Director + Cockpit caster. Pas un événement public réel.',
  now() + interval '1 day',
  'draft'
)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- 2) event_segments (idempotent via UNIQUE (event_run_id, ord)).
-- On référence le run par son slug pour éviter de hardcoder un UUID
-- supplémentaire que le ON CONFLICT du run pourrait avoir ignoré.

INSERT INTO public.event_segments (
  event_run_id,
  tenant_id,
  ord,
  type,
  match_id,
  title,
  duration_min,
  status,
  broadcast_message,
  caster_checklist
)
SELECT
  r.id,
  r.tenant_id,
  v.ord,
  v.type,
  v.match_id,
  v.title,
  v.duration_min,
  'upcoming'::text,
  v.broadcast_message,
  v.caster_checklist
FROM public.event_runs r
CROSS JOIN (VALUES
  (
    1,
    'intro'::text,
    NULL::uuid,
    'Intro & présentation des équipes',
    5,
    jsonb_build_object(
      'discord', 'Le show commence dans 5 minutes ! Rejoignez-nous sur Twitch.',
      'push_title', 'Le show commence',
      'push_body', 'Soirée test run-of-show — intro dans 5 min'
    ),
    '[
      { "key": "obs_scene_ready",   "label": "Scène OBS intro prête" },
      { "key": "mic_check",         "label": "Micro testé" }
    ]'::jsonb
  ),
  (
    2,
    'match'::text,
    '482fd785-0e91-4bd1-8bf7-28a4c3c14882'::uuid,
    'Match featured',
    40,
    jsonb_build_object(
      'discord', 'Le match featured commence maintenant.',
      'push_title', 'Match en direct',
      'push_body', 'Match featured — soirée test run-of-show'
    ),
    '[
      { "key": "lobby_code_shared", "label": "Code lobby partagé aux équipes" },
      { "key": "score_overlay_on",  "label": "Overlay score actif" },
      { "key": "casters_briefed",   "label": "Casters briefés" }
    ]'::jsonb
  ),
  (
    3,
    'break'::text,
    NULL::uuid,
    'Pause sponsor',
    10,
    NULL,  -- pas de broadcast sur les breaks
    '[
      { "key": "ads_queued",        "label": "Spot pub prêt à diffuser" }
    ]'::jsonb
  ),
  (
    4,
    'outro'::text,
    NULL::uuid,
    'Outro & remerciements',
    5,
    jsonb_build_object(
      'discord', 'Merci à toutes et tous pour cette soirée ! Rendez-vous bientôt.'
    ),
    '[
      { "key": "vod_url_ready",     "label": "URL VOD prête à partager" }
    ]'::jsonb
  )
) AS v(ord, type, match_id, title, duration_min, broadcast_message, caster_checklist)
WHERE r.tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'
  AND r.slug = 'soiree-test-run-of-show'
ON CONFLICT (event_run_id, ord) DO NOTHING;

COMMIT;
