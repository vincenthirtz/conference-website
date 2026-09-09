/* eslint-disable @next/next/no-img-element */
// components/admin/tournament/mapPool/EditMapModal.tsx
//
// Édition d'une carte du pool : nom, type, visuel. Extrait de
// `pages/admin/tournament/[id]/maps.tsx` (règle A7).

import { useEffect, useState } from 'react';
import Modal from '@/components/admin/Modal';
import type { TournamentMapRow } from './types';

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
      panelChromeClassName="bg-neutral-900 rounded-xl border border-white/10"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm transition-colors"
          >
            {labels.cancel}
          </button>
          <button
            onClick={() =>
              onSave({
                map_name: name,
                map_type: type,
                image_url: imageUrl || null,
              })
            }
            disabled={updating}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
          >
            {updating ? labels.updating : labels.save}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-300 mb-2">
            {labels.mapNameLabel}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-2">
            {labels.mapTypeLabel}
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
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
            <label className="block text-sm text-gray-300 mb-2">
              {labels.imagePreviewLabel}
            </label>
            <div className="relative w-full h-48 rounded-lg overflow-hidden bg-gradient-to-b from-purple-900/20 to-transparent">
              <img
                src={preview}
                alt={labels.previewAlt}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm text-gray-300 mb-2">
            {labels.changeImageLabel}
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageFileChange}
            className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white file:cursor-pointer hover:file:bg-purple-700"
          />
          <p className="text-xs text-gray-400 mt-1">{labels.imageFormatHint}</p>
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-2">
            {labels.orEnterUrlLabel}
          </label>
          <input
            type="text"
            value={imageUrl.startsWith('data:') ? '' : imageUrl}
            onChange={(e) => {
              setImageUrl(e.target.value);
              setPreview(e.target.value);
            }}
            className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
            placeholder={labels.imageUrlPlaceholder}
          />
        </div>
      </div>
    </Modal>
  );
}
