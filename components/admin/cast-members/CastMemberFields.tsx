// components/admin/cast-members/CastMemberFields.tsx
//
// Les champs d'une fiche casteuse — nom, titre, ville, ordre, image, lien,
// description — communs à la modale de création (`CastMemberFormModal`) et à
// l'écran d'édition (`pages/admin/cast-members/[id]`).
//
// DEUX COPIES, DEUX DÉRIVES. Les deux écrans recopiaient ces sept champs,
// exemples français en dur compris, et la modale avait fini par typer l'image
// en `url` : le navigateur refusait alors un chemin du site (`/img/…`), le
// format même que l'exemple proposait. Un champ texte ici, pour les deux.

import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminCastMemberFields from '@/lib/i18n/locales/admin-fr/adminCastMemberFields';

export type CastMemberFieldValues = {
  name: string;
  title: string;
  city: string;
  sortOrder: string;
  imageUrl: string;
  twitchUrl: string;
  description: string;
};

const INPUT =
  'w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t1,#f4edf7)] focus:outline-none focus:border-[var(--or,#b467d1)] text-sm';

export default function CastMemberFields({
  form,
  onField,
  sortOrderPlaceholder,
}: {
  form: CastMemberFieldValues;
  onField: (field: keyof CastMemberFieldValues, value: string) => void;
  /** « Auto (dernier) » à la création, la valeur par défaut à l'édition. */
  sortOrderPlaceholder?: string;
}) {
  const t = useAdminT(nsAdminCastMemberFields);
  const label = 'block text-sm text-[var(--t2,#c7bfca)] mb-1';
  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label className={label}>
            {t.nameLabel} <span className="text-red-400">*</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onField('name', e.target.value)}
              placeholder={t.namePlaceholder}
              className={`${INPUT} mt-1`}
              required
            />
          </label>
        </div>
        <div>
          <label className={label}>
            {t.titleLabel}
            <input
              type="text"
              value={form.title}
              onChange={(e) => onField('title', e.target.value)}
              placeholder={t.titlePlaceholder}
              className={`${INPUT} mt-1`}
            />
          </label>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label className={label}>
            {t.cityLabel}
            <input
              type="text"
              value={form.city}
              onChange={(e) => onField('city', e.target.value)}
              placeholder={t.cityPlaceholder}
              className={`${INPUT} mt-1`}
            />
          </label>
        </div>
        <div>
          <label className={label}>
            {t.sortOrderLabel}
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => onField('sortOrder', e.target.value)}
              placeholder={sortOrderPlaceholder ?? '0'}
              className={`${INPUT} mt-1`}
              min="0"
            />
          </label>
        </div>
      </div>

      <div>
        <label className={label}>
          {t.imageLabel}
          <input
            type="text"
            value={form.imageUrl}
            onChange={(e) => onField('imageUrl', e.target.value)}
            placeholder={t.imagePlaceholder}
            className={`${INPUT} mt-1 font-mono`}
          />
        </label>
        <p className="text-xs text-neutral-500 mt-1">{t.imageHint}</p>
      </div>

      <div>
        <label className={label}>
          {t.twitchLabel}
          <input
            type="url"
            value={form.twitchUrl}
            onChange={(e) => onField('twitchUrl', e.target.value)}
            placeholder={t.twitchPlaceholder}
            className={`${INPUT} mt-1 font-mono`}
          />
        </label>
      </div>

      <div>
        <label className={label}>
          {t.descriptionLabel}
          <textarea
            value={form.description}
            onChange={(e) => onField('description', e.target.value)}
            placeholder={t.descriptionPlaceholder}
            rows={3}
            className={`${INPUT} mt-1 resize-y`}
          />
        </label>
      </div>
    </>
  );
}
