/* biome-ignore-all lint/performance/noImgElement: image hors next/image (exclusion reprise d’ESLint) */
// components/admin/tournament/mapPool/EditMapModal.tsx
//
// Édition d'une carte du pool : nom, type, visuel. Extrait de
// `pages/admin/tournament/[id]/maps.tsx` (règle A7).

import { useEffect, useState } from 'react';
import Modal from '@/components/admin/Modal';
import type { TournamentMapRow } from './types';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

type Labels = {
  editMapTitle: string;
  mapNameLabel: string;
  mapTypeLabel: string;
  imagePreviewLabel: string;
  previewAlt: string;
  changeImageLabel: string;
  imageFormatHint: string;
  orEnterUrlLabel: string;
  imageUrlPlaceholder: string;
  cancel: string;
  save: string;
  updating: string;
  typeControl: string;
  typeEscort: string;
  typeHybrid: string;
  typePush: string;
  typeFlashpoint: string;
};

type Props = {
  map: TournamentMapRow | null;
  labels: Labels;
  updating: boolean;
  onClose: () => void;
  onSave: (patch: {
    map_name: string;
    map_type: string;
    image_url: string | null;
  }) => void;
};

export default function EditMapModal({
  map,
  labels,
  updating,
  onClose,
  onSave,
}: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState('control');
  const [imageUrl, setImageUrl] = useState('');
  const [preview, setPreview] = useState('');

  // La carte éditée change → le formulaire repart de ses valeurs.
  useEffect(() => {
    setName(map?.map_name ?? '');
    setType(map?.map_type || 'control');
    setImageUrl(map?.image_url || '');
    setPreview(map?.image_url || '');
  }, [map]);

  function handleImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Le fichier devient la valeur envoyée : l'écran n'a pas de service
      // d'upload, l'image est stockée en data-URI comme avant l'extraction.
      setPreview(dataUrl);
      setImageUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  return (
    <Modal
      open={Boolean(map)}
      onClose={onClose}
      title={<h2 className="text-xl font-semibold">{labels.editMapTitle}</h2>}
      size="2xl"
      backdropClassName="bg-black/50 backdrop-blur-sm"
      panelChromeClassName="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]"
      footer={
        <>
          <AdminButton size="sm" onClick={onClose}>
            {labels.cancel}
          </AdminButton>
          <AdminButton
            variant="primary"
            size="sm"
            onClick={() =>
              onSave({
                map_name: name,
                map_type: type,
                image_url: imageUrl || null,
              })
            }
            disabled={updating}
          >
            {updating ? labels.updating : labels.save}
          </AdminButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm text-[var(--t2,#c7bfca)]">
            {labels.mapNameLabel}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-[var(--t2,#c7bfca)]">
            {labels.mapTypeLabel}
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
          >
            <option value="control">{labels.typeControl}</option>
            <option value="escort">{labels.typeEscort}</option>
            <option value="hybrid">{labels.typeHybrid}</option>
            <option value="push">{labels.typePush}</option>
            <option value="flashpoint">{labels.typeFlashpoint}</option>
          </select>
        </div>

        {preview && (
          <div>
            <label className="mb-2 block text-sm text-[var(--t2,#c7bfca)]">
              {labels.imagePreviewLabel}
            </label>
            <div className="relative h-48 w-full overflow-hidden rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)]">
              <img
                src={preview}
                alt={labels.previewAlt}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm text-[var(--t2,#c7bfca)]">
            {labels.changeImageLabel}
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageFileChange}
            className="w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none file:mr-4 file:cursor-pointer file:rounded-[var(--r-ctrl,4px)] file:border file:border-[rgba(180,103,209,.45)] file:bg-transparent file:px-3 file:py-1.5 file:font-[family-name:var(--fd)] file:text-xs file:font-bold file:uppercase file:text-[var(--or-200,#eec4ff)] hover:file:bg-[rgba(180,103,209,.08)]"
          />
          <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
            {labels.imageFormatHint}
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm text-[var(--t2,#c7bfca)]">
            {labels.orEnterUrlLabel}
          </label>
          <input
            type="text"
            value={imageUrl.startsWith('data:') ? '' : imageUrl}
            onChange={(e) => {
              setImageUrl(e.target.value);
              setPreview(e.target.value);
            }}
            className="w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
            placeholder={labels.imageUrlPlaceholder}
          />
        </div>
      </div>
    </Modal>
  );
}
