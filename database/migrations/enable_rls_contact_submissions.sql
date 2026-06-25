-- Migration: activer RLS sur `contact_submissions`
-- Date: 2026-06-25
--
-- WHY:
--   Dans la migration d'origine (create_contact_submissions_table.sql), la ligne
--   `ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;` était COMMENTÉE.
--   Résultat : la table est reachable via PostgREST avec RLS désactivé -> toute
--   clé anon ou authenticated peut lire/écrire directement des données à
--   caractère personnel (name, email, ip_address, user_agent, message,
--   admin_notes). Trou de sécurité / fuite PII.
--
--   On NE se contente PAS de décommenter l'ancienne migration : elle a
--   peut-être déjà été appliquée en prod (table créée sans RLS). Une migration
--   additive idempotente est plus sûre — elle (ré)active RLS sans présumer de
--   l'état exact de la prod.
--
-- WHAT:
--   - ENABLE ROW LEVEL SECURITY sur public.contact_submissions, SANS aucune
--     policy (même pattern que enable_rls_remaining_tables.sql /
--     enable_rls_baseline_tables.sql / player_blacklist).
--   - Service-role-only : ni anon ni authenticated n'y accèdent. Tous les accès
--     passent par supabaseAdmin (service_role bypass RLS).
--
-- IMPACT API — AUCUN :
--   pages/api/contact.ts (POST) ne touche PAS la table : il envoie un email via
--   sendContactStaffEmail(). Toute lecture/écriture éventuelle de
--   contact_submissions (côté admin) passe par supabaseAdmin (service_role), qui
--   bypasse RLS. Activer RLS ne casse donc aucun flux serveur.
--
-- CAVEATS:
--   - Idempotente : `ENABLE ROW LEVEL SECURITY` est sans effet si RLS est déjà
--     actif (pas d'erreur). Aucune policy créée -> rien à DROP/recréer.
--   - Pas de changement de FK ni de schéma -> reload du schema cache PostgREST
--     non requis pour cette migration.

BEGIN;

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- Pas de policy : service_role uniquement.

COMMIT;
