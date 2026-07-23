-- Migration: newsletter externe (double opt-in) + audiences email
-- Date: 2026-07-23
--
-- Entrée « newsletter » publique (page d'accueil / footer) pour des abonné·es
-- EXTERNES (sans compte site). Double opt-in RGPD : une inscription crée une
-- ligne `pending` + token de confirmation ; l'abonné·e n'est `confirmed`
-- qu'après clic sur le lien reçu par email. La désinscription passe par le même
-- mécanisme email-only que les broadcasts (broadcast_email_optouts) + statut
-- `unsubscribed` ici.
--
-- Les campagnes email peuvent alors cibler 3 nouvelles audiences :
--   newsletter                → abonné·es newsletter confirmé·es (externes)
--   all-plus-newsletter       → comptes confirmés du site + newsletter (dédup email)
--   adherents-plus-newsletter → adhérent·es payé·es + newsletter (dédup email)

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  -- Token de confirmation double opt-in (aléatoire, consommé au confirm).
  confirm_token text,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  -- Provenance indicative ('homepage', 'footer', …).
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Un email au plus par tenant (insensible à la casse). L'inscription se fait en
-- upsert sur cette clé (re-inscription d'un email pending re-génère le token).
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_tenant_email_uidx
  ON newsletter_subscribers (tenant_id, lower(email));

-- Lookup par token de confirmation (double opt-in).
CREATE INDEX IF NOT EXISTS newsletter_subscribers_confirm_token_idx
  ON newsletter_subscribers (confirm_token)
  WHERE confirm_token IS NOT NULL;

-- Résolution d'audience : « confirmés d'un tenant ».
CREATE INDEX IF NOT EXISTS newsletter_subscribers_confirmed_idx
  ON newsletter_subscribers (tenant_id)
  WHERE status = 'confirmed';

-- RLS : table sensible (emails). Aucun accès anon/auth direct ; tout passe par
-- le service-role (API publique subscribe/confirm/unsubscribe + résolution
-- d'audience admin). RLS activée SANS policy permissive = deny par défaut.
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE newsletter_subscribers IS
  'Abonné·es newsletter externes (sans compte site), double opt-in. Accès service-role uniquement (RLS deny).';

-- Ouvre le CHECK d'audience aux 3 nouvelles valeurs (pendant de
-- open_email_audience_and_broadcast_optouts.sql). Contrainte réelle :
-- `email_campaigns_audience_allowed` (on garde le même nom).
ALTER TABLE email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_audience_allowed;
ALTER TABLE email_campaigns ADD CONSTRAINT email_campaigns_audience_allowed
  CHECK (audience IN (
    'all-confirmed-users',
    'team-captains',
    'team-members',
    'staff',
    'adherents',
    'newsletter',
    'all-plus-newsletter',
    'adherents-plus-newsletter'
  ));

-- Nouvelle table exposée via PostgREST → recharger le cache de schéma.
NOTIFY pgrst, 'reload schema';
