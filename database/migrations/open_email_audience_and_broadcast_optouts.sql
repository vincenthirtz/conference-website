-- Migration: Ouverture de l'audience des campagnes email + opt-out RGPD par email
-- Date: 2026-07-17
--
-- Deux changements liés à l'élargissement du broadcast email :
--
-- 1) email_campaigns.audience était figée à la seule valeur 'all-confirmed-users'
--    (CHECK inline créé avec add_email_campaigns.sql). On ouvre l'audience à un
--    ensemble borné de segments : capitaines, membres d'équipe, staff, adhérent·es.
--    Le DEFAULT reste 'all-confirmed-users'. La contrainte inline avait le nom
--    auto-généré par Postgres 'email_campaigns_audience_check' ; on la remplace
--    proprement (DROP IF EXISTS + ADD nommé), et on couvre aussi un éventuel nom
--    explicite pour rester ré-exécutable quel que soit l'historique.
--
-- 2) broadcast_email_optouts : nouvelle table d'opt-out RGPD keyée par EMAIL, pour
--    les destinataires qui n'ont PAS de compte auth (ex. adhérent·es importé·es
--    depuis HelloAsso). C'est le pendant « email-only » de l'opt-out utilisateur
--    qui vit, lui, dans notification_prefs (keyé par user_id). Le lien de
--    désinscription d'un envoi broadcast vers un email sans compte écrit ici.
--
-- Accès service-role uniquement (via supabaseAdmin) pour la nouvelle table, comme
-- email_campaigns / broadcast_recipients / broadcast_schedules : RLS activé sans
-- policy. Pas de tenant_id, pour rester cohérent avec le catalogue broadcast global.

-- 1) Relâcher la contrainte CHECK sur l'audience -----------------------------

-- Nom auto-généré par Postgres pour la contrainte inline d'origine.
ALTER TABLE email_campaigns
  DROP CONSTRAINT IF EXISTS email_campaigns_audience_check;

-- Nom explicite (au cas où une exécution antérieure de cette migration l'aurait
-- déjà posé) — garantit la ré-exécutabilité.
ALTER TABLE email_campaigns
  DROP CONSTRAINT IF EXISTS email_campaigns_audience_allowed;

ALTER TABLE email_campaigns
  ADD CONSTRAINT email_campaigns_audience_allowed
  CHECK (audience IN (
    'all-confirmed-users',
    'team-captains',
    'team-members',
    'staff',
    'adherents'
  ));

-- 2) Table d'opt-out RGPD broadcast keyée par email --------------------------

CREATE TABLE IF NOT EXISTS broadcast_email_optouts (
  email text PRIMARY KEY,
  unsubscribed_at timestamptz NOT NULL DEFAULT now(),
  source text
);

-- RLS activé sans policy : aucun accès via le client anon/authenticated. Tout
-- l'accès passe par supabaseAdmin (service_role, bypass RLS), comme les tables
-- sœurs email_campaigns / broadcast_recipients / broadcast_schedules.
ALTER TABLE broadcast_email_optouts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE broadcast_email_optouts IS
  'Opt-out RGPD des emails broadcast keyé par EMAIL, pour les destinataires sans compte auth (ex. adhérent·es HelloAsso). Pendant email-only de l''opt-out user-id qui vit dans notification_prefs. Accès service-role uniquement.';
COMMENT ON COLUMN broadcast_email_optouts.email IS
  'Adresse email désinscrite, stockée en minuscules (lower(email)) — clé primaire, une ligne par adresse.';
COMMENT ON COLUMN broadcast_email_optouts.unsubscribed_at IS
  'Horodatage de la désinscription (première demande d''opt-out).';
COMMENT ON COLUMN broadcast_email_optouts.source IS
  'Contexte optionnel de la désinscription (ex. segment d''audience : ''adherents''), pour audit/analytics.';
