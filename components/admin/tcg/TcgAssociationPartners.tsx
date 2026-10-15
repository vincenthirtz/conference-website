// components/admin/tcg/TcgAssociationPartners.tsx
//
// Les PARTENAIRES de l'association dans l'onglet « L'association » de
// /admin/tcg, et le CRÉDIT d'une carte (nom affiché + lien) que partagent le
// dépôt et la modification dans `TcgAssociationPanel`.
//
// Une carte de partenaire est une carte de l'association : son logo est
// copié, son crédit nomme le partenaire et renvoie sur son site (route admin
// de la catégorie, action `import_partner`, dans conference-api).
// Le lien n'accepte que `https://` — la route refuse le reste
// (`credit_url_https_required`). Un partenaire dont le logo n'est pas dans le
// stockage peut quand même avoir sa carte : on dépose l'image à la main, avec
// son nom en crédit et le lien de son site.
//
// Rendu seulement : l'état (brouillons, action en cours) et les appels restent
// dans le panneau, passés en props.

import type { TcgAssociationWrite } from '@/features/admin/tcg/client';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { rubanCard, rubanInset } from '@/features/admin/_shared/ui/ruban';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTcgAssociation from '@/lib/i18n/locales/admin-fr/adminTcgAssociation';
import { FANART_LIMITS } from '@/utils/tcg/fanart';
import { LOGO_CREDIT_LIMITS } from '@/utils/teams/logoCredit';

/** Style des champs de l'onglet, partagé avec `TcgAssociationPanel`. */
export const ASSOCIATION_INPUT =
  'mt-1 w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';

/** Champs d'un brouillon de carte (création ou modification). */
export type AssociationDraftField =
  | 'title'
  | 'credit'
  | 'creditUrl'
  | 'rarity'
  | 'description';

/** Un partenaire, tel que le rend `GET /api/admin/tcg/association`. */
export type AssociationPartner = {
  id: string;
  name: string;
  logoUrl: string | null;
  /** Le lien que la carte porterait : `null` s'il n'est pas en https. */
  websiteUrl: string | null;
  importable: boolean;
  /** `partner_logo_not_in_bucket` | `partner_website_not_https` | `null`. */
  reason: string | null;
  cardId: string | null;
};

/** L'hôte d'un lien, pour l'afficher sans le protocole. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Le crédit d'une carte : le nom affiché et son lien (https, facultatif). */
export function CreditFields({
  credit,
  creditUrl,
  placeholder,
  onCredit,
  onCreditUrl,
}: {
  credit: string;
  creditUrl: string;
  placeholder?: string;
  onCredit: (next: string) => void;
  onCreditUrl: (next: string) => void;
}) {
  const t = useAdminT(nsAdminTcgAssociation);
  return (
    <>
      <label className="block text-xs text-neutral-400">
        {t.labelCredit}
        <input
          value={credit}
          maxLength={FANART_LIMITS.artistName}
          placeholder={placeholder}
          onChange={(e) => onCredit(e.target.value)}
          className={ASSOCIATION_INPUT}
        />
      </label>
      <label className="block text-xs text-neutral-400">
        {t.labelCreditUrl}
        <input
          type="url"
          inputMode="url"
          value={creditUrl}
          maxLength={LOGO_CREDIT_LIMITS.urlMax}
          placeholder="https://"
          onChange={(e) => onCreditUrl(e.target.value)}
          className={ASSOCIATION_INPUT}
        />
      </label>
    </>
  );
}

export default function TcgAssociationPartners({
  partners,
  busy,
  rarity,
  run,
}: {
  partners: readonly AssociationPartner[];
  /** Clé de l'action en cours dans le panneau, `null` au repos. */
  busy: string | null;
  /** Rareté donnée à la carte importée (celle par défaut de la catégorie). */
  rarity: string | undefined;
  run: (
    key: string,
    init: TcgAssociationWrite,
    success: string
  ) => Promise<boolean>;
}) {
  const t = useAdminT(nsAdminTcgAssociation);

  const importPartner = (partner: AssociationPartner) =>
    run(
      `partner:${partner.id}`,
      {
        method: 'POST',
        json: { action: 'import_partner', partnerId: partner.id, rarity },
      },
      t.toastPartnerImported
    );

  return (
    <div className={`p-4 ${rubanCard}`}>
      <h3 className="font-semibold">{t.partnersTitle}</h3>
      <p className="mt-1 text-sm text-neutral-400">{t.partnersIntro}</p>
      {partners.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">{t.partnersEmpty}</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {partners.map((partner) => (
            <li
              key={partner.id}
              className={`flex items-center gap-3 p-3 ${rubanInset}`}
            >
              {partner.logoUrl ? (
                // biome-ignore lint/performance/noImgElement: bucket public ou chemin du site, hors remotePatterns
                <img
                  src={partner.logoUrl}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-[3px] bg-[var(--s1,#100812)] object-contain"
                />
              ) : (
                <div
                  aria-hidden
                  className="h-14 w-14 shrink-0 rounded-[3px] bg-[var(--s1,#100812)]"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{partner.name}</p>
                {partner.websiteUrl && (
                  <p className="truncate text-xs text-neutral-400">
                    {hostOf(partner.websiteUrl)}
                  </p>
                )}
                {partner.cardId ? (
                  <p className="text-xs text-emerald-300">
                    {t.eventLogoImported}
                  </p>
                ) : partner.importable ? (
                  <AdminButton
                    variant="secondary"
                    size="xs"
                    disabled={busy !== null}
                    onClick={() => void importPartner(partner)}
                    className="mt-1"
                  >
                    {busy === `partner:${partner.id}`
                      ? t.working
                      : t.importPartner}
                  </AdminButton>
                ) : (
                  <p className="text-xs text-amber-200">
                    {partner.reason === 'partner_website_not_https'
                      ? t.partnerWebsiteNotHttps
                      : t.partnerLogoNotImportable}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
