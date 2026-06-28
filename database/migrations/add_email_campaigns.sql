-- Migration: Email campaigns — campagnes broadcast créables depuis l'admin
-- Date: 2026-06-28
--
-- Jusqu'ici les campagnes d'emails broadcast étaient déclarées en dur dans
-- utils/broadcasts.ts (BROADCAST_CAMPAIGNS) + un builder HTML par campagne dans
-- utils/email.ts, ce qui imposait un déploiement pour chaque nouvelle campagne.
--
-- Cette table persiste les campagnes créées depuis le formulaire admin. Le corps
-- de l'email est un TEMPLATE STRUCTURÉ (pas du HTML libre) rendu dans le wrapper
-- de marque existant (emailLayout) par buildCampaignEmailHtml() :
--   heading           → titre h1
--   greeting_enabled  → préfixe "Hey {prénom}," si un label destinataire existe
--   body_paragraphs   → tableau JSON de paragraphes (un <p> chacun)
--   cta_label/cta_url → bouton d'appel à l'action (optionnel)
--   footer_note       → petite note centrée en bas (optionnel)
--
-- Le catalogue codé en dur reste utilisé comme fallback (campagne idahobit
-- one-shot historique) : getCampaign() lit la DB d'abord, puis le tableau.
--
-- Accès service-role uniquement (via supabaseAdmin), comme broadcast_recipients
-- / broadcast_schedules — jamais exposée au client anon. Pas de tenant_id, pour
-- rester cohérent avec ces deux tables sœurs (le catalogue est global).

CREATE TABLE IF NOT EXISTS email_campaigns (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  subject text NOT NULL,
  audience text NOT NULL DEFAULT 'all-confirmed-users'
    CHECK (audience IN ('all-confirmed-users')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('active', 'draft', 'archived')),
  heading text NOT NULL,
  greeting_enabled boolean NOT NULL DEFAULT true,
  body_paragraphs jsonb NOT NULL DEFAULT '[]'::jsonb,
  cta_label text,
  cta_url text,
  footer_note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_campaigns_created_at_idx
  ON email_campaigns (created_at DESC);

-- RLS activé sans policy : aucun accès via le client anon/authenticated. Tout
-- l'accès passe par supabaseAdmin (service_role, bypass RLS), comme les tables
-- sœurs broadcast_recipients / broadcast_schedules.
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE email_campaigns IS
  'Campagnes d''emails broadcast créées depuis l''admin — template structuré rendu par buildCampaignEmailHtml. Accès service-role uniquement.';
COMMENT ON COLUMN email_campaigns.id IS
  'Slug stable (kebab-case dérivé du nom), réutilisé comme campaign_id dans broadcast_schedules / broadcast_recipients / staff_logs.';
COMMENT ON COLUMN email_campaigns.body_paragraphs IS
  'Tableau JSON de paragraphes (chaînes) — rendu un <p> par entrée. Texte brut, échappé au rendu.';
COMMENT ON COLUMN email_campaigns.status IS
  'draft = non envoyable ; active = envoyable / planifiable ; archived = lecture seule.';
