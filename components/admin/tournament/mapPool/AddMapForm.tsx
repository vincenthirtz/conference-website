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
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

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
    <div className="mb-6 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-5">
      <h3 className="text-lg font-semibold mb-4">{labels.addMapTitle}</h3>

      {!hasMapVeto && (
        <div className="mb-4 rounded-[var(--r-ctrl,4px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.08)] p-3 text-sm text-[#ffd9a3]">
          {hasGameDef
            ? labels.noVetoGame.replace('{game}', gameLabel)
            : labels.noPredefinedPool}{' '}
          {labels.canAddCustom}
        </div>
      )}

      {hasMapVeto && (
        <div className="flex gap-4 mb-4">
          <AdminButton
            size="sm"
            variant={!useCustom ? 'secondary' : 'ghost'}
            onClick={() => setUseCustom(false)}
          >
            {labels.mapGameToggle.replace('{game}', gameLabel)}
          </AdminButton>
          <AdminButton
            size="sm"
            variant={useCustom ? 'secondary' : 'ghost'}
            onClick={() => setUseCustom(true)}
          >
            {labels.mapCustomToggle}
          </AdminButton>
        </div>
      )}

      {hasMapVeto && !useCustom ? (
        <div className="space-y-3">
          <div>
            <label className="mb-2 block text-sm text-[var(--t2,#c7bfca)]">
              {labels.selectMapLabel.replace('{game}', gameLabel)}
            </label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
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
            <label className="mb-2 block text-sm text-[var(--t2,#c7bfca)]">
              {labels.mapNameLabel}
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
              placeholder={labels.mapNamePlaceholder}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm text-[var(--t2,#c7bfca)]">
              {labels.mapTypeLabel}
            </label>
            <select
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              className="w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
            >
              <option value="control">{labels.typeControl}</option>
              <option value="escort">{labels.typeEscort}</option>
              <option value="hybrid">{labels.typeHybrid}</option>
              <option value="push">{labels.typePush}</option>
              <option value="flashpoint">{labels.typeFlashpoint}</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm text-[var(--t2,#c7bfca)]">
              {labels.imageUrlLabel}
            </label>
            <input
              type="text"
              value={customImage}
              onChange={(e) => setCustomImage(e.target.value)}
              className="w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
              placeholder={labels.imageUrlPlaceholder}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <AdminButton
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={adding}
        >
          {adding ? labels.adding : labels.addButton}
        </AdminButton>
        <AdminButton size="sm" onClick={onCancel}>
          {labels.cancel}
        </AdminButton>
      </div>
    </div>
  );
}
