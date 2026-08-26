-- Migration: Campagnes email — corps en HTML libre
-- Date: 2026-08-26
--
-- Jusqu'ici le corps d'une campagne était exclusivement un template STRUCTURÉ
-- (heading + paragraphes + CTA + note de pied), chaque champ échappé au rendu.
-- Sûr, mais impossible d'y mettre une image, une mise en page à deux colonnes
-- ou un encart — par exemple le logo d'un partenaire de production.
--
-- Cette migration ajoute un second mode de rédaction :
--   body_format = 'structured' (défaut, comportement historique inchangé)
--   body_format = 'html'       → body_html porte le corps de la carte
--
-- Le HTML n'est PAS stocké tel quel au rendu : `sanitizeEmailHtml`
-- (utils/emailHtmlSanitizer.ts) applique une allowlist de balises/attributs au
-- moment de construire l'email et la preview. Le wrapper de marque
-- (emailLayout) — en-tête, pied de page, lien de désinscription RGPD — reste
-- toujours en place : le mode HTML remplit la carte, il ne remplace pas le
-- document.
--
-- Rétrocompatibilité : les colonnes structurées restent NOT NULL et continuent
-- d'être renseignées (heading sert de titre de repli et d'étiquette dans
-- l'admin). Une campagne existante est inchangée — body_format vaut
-- 'structured' partout après cette migration.

ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS body_format text NOT NULL DEFAULT 'structured',
  ADD COLUMN IF NOT EXISTS body_html text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'email_campaigns'::regclass
      AND conname = 'email_campaigns_body_format_check'
  ) THEN
    ALTER TABLE email_campaigns
      ADD CONSTRAINT email_campaigns_body_format_check
      CHECK (body_format IN ('structured', 'html'));
  END IF;
END $$;

-- Un corps 'html' vide produirait une carte blanche envoyée à toute une
-- audience : la contrainte rend cet état impossible côté base, en plus de la
-- validation zod côté API.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'email_campaigns'::regclass
      AND conname = 'email_campaigns_body_html_present'
  ) THEN
    ALTER TABLE email_campaigns
      ADD CONSTRAINT email_campaigns_body_html_present
      CHECK (body_format <> 'html' OR (body_html IS NOT NULL AND length(btrim(body_html)) > 0));
  END IF;
END $$;

COMMENT ON COLUMN email_campaigns.body_format IS
  'structured = template assemblé depuis heading/body_paragraphs/cta/footer (défaut) ; html = body_html rend le corps de la carte, après passage par sanitizeEmailHtml.';
COMMENT ON COLUMN email_campaigns.body_html IS
  'Corps HTML libre (mode body_format = html). Nettoyé au rendu par sanitizeEmailHtml (allowlist) — jamais injecté brut.';
