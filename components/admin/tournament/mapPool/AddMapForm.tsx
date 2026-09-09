// components/admin/tournament/mapPool/AddMapForm.tsx
//
// Ajout d'une carte au pool édité : soit une carte proposée, soit une arène
// personnalisée. Extrait de `pages/admin/tournament/[id]/maps.tsx` (règle A7).
//
// Les cartes proposées dépendent de la CIBLE et sont calculées par l'écran :
// pour le pool par défaut c'est le catalogue du jeu, pour une journée c'est le
// pool par défaut du tournoi — remplir une journée avec une carte écartée de la
// compétition n'aurait pas de sens.

import { useState } from 'react';
import { typeLabel } from './types';

export type SelectableMap = {
  name: string;
  type: string;
  image: string;
};

type Labels = {
  addMapTitle: string;
  noVetoGame: string;
  noPredefinedPool: string;
  canAddCustom: string;
  mapGameToggle: string;
  mapCustomToggle: string;
  selectMapLabel: string;
  chooseMapPlaceholder: string;
  mapNameLabel: string;
  mapNamePlaceholder: string;
  mapTypeLabel: string;
  imageUrlLabel: string;
  imageUrlPlaceholder: string;
  addButton: string;
  adding: string;
  cancel: string;
  alertEnterMapName: string;
  alertSelectMap: string;
  typeControl: string;
  typeEscort: string;
  typeHybrid: string;
  typePush: string;
  typeFlashpoint: string;
};

type Props = {
  /** Cartes proposables, déjà privées de celles présentes dans le pool. */
  available: SelectableMap[];
  /** Le jeu a-t-il un pool prédéfini (veto) ? Sinon seul le mode libre existe. */
  hasMapVeto: boolean;
  gameLabel: string;
  hasGameDef: boolean;
  typeLabels: Record<string, string>;
  labels: Labels;
  adding: boolean;
  onSubmit: (map: { name: string; type: string; image: string }) => void;
  onCancel: () => void;
  onError: (message: string) => void;
};

export default function AddMapForm({
  available,
  hasMapVeto,
  gameLabel,
  hasGameDef,
  typeLabels,
  labels,
  adding,
  onSubmit,
  onCancel,
  onError,
}: Props) {
  const [selected, setSelected] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customType, setCustomType] = useState('control');
  const [customImage, setCustomImage] = useState('');

  // Jeu sans pool prédéfini : la saisie libre est le SEUL mode possible.
  const forceCustom = useCustom || !hasMapVeto;

  function handleSubmit() {
    if (forceCustom) {
      if (!customName.trim()) {
        onError(labels.alertEnterMapName);
        return;
      }
      onSubmit({
        name: customName.trim(),
        type: customType,
        image: customImage.trim(),
      });
      setCustomName('');
      setCustomImage('');
      return;
    }

    if (!selected) {
      onError(labels.alertSelectMap);
      return;
    }
    const found = available.find((m) => m.name === selected);
    if (!found) return;
    onSubmit({ name: found.name, type: found.type, image: found.image });
    setSelected('');
  }

  return (
    <div className="mb-6 p-5 rounded-xl bg-white/5 border border-white/10">
      <h3 className="text-lg font-semibold mb-4">{labels.addMapTitle}</h3>

      {!hasMapVeto && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-400/30 text-amber-100 text-sm">
          {hasGameDef
            ? labels.noVetoGame.replace('{game}', gameLabel)
            : labels.noPredefinedPool}{' '}
          {labels.canAddCustom}
        </div>
      )}

      {hasMapVeto && (
        <div className="flex gap-4 mb-4">
          <button
            onClick={() => setUseCustom(false)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              !useCustom
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-gray-300 hover:bg-white/10'
            }`}
          >
            {labels.mapGameToggle.replace('{game}', gameLabel)}
          </button>
          <button
            onClick={() => setUseCustom(true)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              useCustom
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-gray-300 hover:bg-white/10'
            }`}
          >
            {labels.mapCustomToggle}
          </button>
        </div>
      )}

      {hasMapVeto && !useCustom ? (
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              {labels.selectMapLabel.replace('{game}', gameLabel)}
            </label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
            >
              <option value="">{labels.chooseMapPlaceholder}</option>
              {available.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} ({typeLabel(typeLabels, m.type)})
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              {labels.mapNameLabel}
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
              placeholder={labels.mapNamePlaceholder}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              {labels.mapTypeLabel}
            </label>
            <select
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
            >
              <option value="control">{labels.typeControl}</option>
              <option value="escort">{labels.typeEscort}</option>
              <option value="hybrid">{labels.typeHybrid}</option>
              <option value="push">{labels.typePush}</option>
              <option value="flashpoint">{labels.typeFlashpoint}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              {labels.imageUrlLabel}
            </label>
            <input
              type="text"
              value={customImage}
              onChange={(e) => setCustomImage(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
              placeholder={labels.imageUrlPlaceholder}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={adding}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
        >
          {adding ? labels.adding : labels.addButton}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm transition-colors"
        >
          {labels.cancel}
        </button>
      </div>
    </div>
  );
}
