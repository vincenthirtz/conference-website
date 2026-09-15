// utils/partners/partnerLogo.ts
//
// Le logo d'un partenaire est une URL libre saisie dans l'admin. Servi tel quel,
// il partait vers l'hôte d'origine (Wix, site du partenaire…) à chaque visite
// de l'accueil, AVANT tout consentement, et cassait dès que cet hôte tombait.
// À l'enregistrement, on le recopie donc dans notre stockage : la page ne
// dépend plus que de nous. Un chemin relatif (`/img/partners/…`) ou une image
// déjà chez nous est laissé tel quel.

import { rehostImage } from '@/utils/social/rehostImage';
import { sanitizeUrl } from '@/utils/apiHelpers';

export type PartnerLogoResult =
  | { ok: true; logoUrl: string | null }
  | { ok: false; error: string };

export async function resolvePartnerLogo(
  raw: string | undefined | null
): Promise<PartnerLogoResult> {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return { ok: true, logoUrl: null };
  // Chemin local du site : servi par nous, rien à recopier.
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return { ok: true, logoUrl: trimmed };
  }
  // Schéma refusé (javascript:, data:…) : ignoré, comme avant l'introduction
  // de la recopie — le partenaire s'affiche alors sans logo.
  const url = sanitizeUrl(trimmed);
  if (!url) return { ok: true, logoUrl: null };
  const copy = await rehostImage(url, 'partners');
  if (!copy.rehosted) {
    return {
      ok: false,
      error: `Le logo n'a pas pu être recopié sur le site : ${copy.error ?? 'erreur inconnue'} Utilisez une image PNG, JPEG, WebP ou GIF accessible publiquement.`,
    };
  }
  return { ok: true, logoUrl: copy.url };
}
