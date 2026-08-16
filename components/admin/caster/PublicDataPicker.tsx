// components/admin/caster/PublicDataPicker.tsx
//
// Picker partagé des scènes « données du site » (lot 6) : un `<select>` alimenté
// par l'API publique + bouton « Recharger la liste » + message d'erreur non
// bloquant. Trois consommateurs (tournoi pour bracket/standings, joueuse pour
// player, ligue pour leaderboard) : la mécanique est identique, seules les
// options et les libellés changent.
//
// États couverts : chargement (select désactivé), erreur (liste vide + message +
// rechargement possible), liste vide (option « aucun » seule) et sélection
// absente de la liste (option fantôme, cf. resolvePickerSelection).

import { useEffect } from 'react';

import { useAdminT } from '@/lib/i18n/useAdminT';
import type { PickerOption } from '@/utils/caster/dataSceneOptions';
import {
  memorizedNameFix,
  resolvePickerSelection,
} from '@/utils/caster/dataSceneOptions';

import { labelClass, inputClass } from './fieldClasses';
import nsAdminCasterScenes from '@/lib/i18n/locales/admin-fr/adminCasterScenes';

type Props = {
  label: string;
  /** null = premier chargement en cours. */
  options: PickerOption[] | null;
  /** Référence persistée dans scene.data (id de tournoi, userId, slug…). */
  selected: string | null;
  /** Nom mémorisé, libellé de l'option fantôme si la référence a disparu. */
  memorizedLabel?: string | null;
  /**
   * Sélection : `value` = référence à persister ('' = aucune), `name` = nom nu
   * de l'option à mémoriser (tournamentName / playerName / leagueName).
   */
  onSelect: (value: string, name: string) => void;
  /**
   * Appelé quand la liste chargée révèle que le nom mémorisé est vide ou
   * périmé pour la référence en place — l'éditeur le réécrit dans la scène
   * (le sous-titre des overlays standings/bracket en dépend). Une seule
   * écriture : l'appel cesse dès que les noms concordent.
   */
  onResolvedName?: (name: string) => void;
  onReload: () => void;
  loadingLabel: string;
  noneLabel: string;
  reloadLabel: string;
  /** Message d'erreur déjà formaté (null = pas d'erreur). */
  error?: string | null;
  /**
   * Note affichée quand la référence en place est absente de la liste (option
   * fantôme). Optionnelle car ce n'est pas anormal partout : le picker joueuse
   * ne liste que les 100 premières du classement, une joueuse hors page reste
   * parfaitement valide — alors qu'un tournoi ou une ligne de ligue absente
   * signale une référence probablement morte.
   */
  ghostNote?: string | null;
  testId: string;
};

export default function PublicDataPicker({
  label,
  options,
  selected,
  memorizedLabel,
  onSelect,
  onResolvedName,
  onReload,
  loadingLabel,
  noneLabel,
  reloadLabel,
  error,
  ghostNote,
  testId,
}: Props) {
  const t = useAdminT(nsAdminCasterScenes);
  const loading = options === null;
  const list = options || [];
  // Liste chargée mais vide (aucune ligue publique, classement encore vide…) :
  // on le DIT plutôt que de laisser un select à une seule entrée « aucun ».
  const empty = !loading && list.length === 0 && !error;
  const { value, ghost } = resolvePickerSelection(
    list,
    selected,
    memorizedLabel
  );
  const all = ghost ? [ghost, ...list] : list;

  // Ré-alignement du nom mémorisé (vide ou périmé) une fois la liste chargée.
  const nameFix = memorizedNameFix(options, selected, memorizedLabel);
  useEffect(() => {
    if (nameFix && onResolvedName) onResolvedName(nameFix);
  }, [nameFix, onResolvedName]);

  return (
    <div className="space-y-2" data-testid={testId}>
      <label className="block">
        <span className={labelClass}>{label}</span>
        <select
          value={loading ? '' : value}
          onChange={(e) => {
            const next = e.target.value;
            const opt = all.find((o) => o.value === next);
            onSelect(next, opt?.name ?? opt?.label ?? '');
          }}
          className={inputClass}
          disabled={loading}
        >
          {loading ? (
            <option value="">{loadingLabel}</option>
          ) : (
            <>
              <option value="">{noneLabel}</option>
              {all.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </>
          )}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onReload}
          className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
          data-testid={`${testId}-reload`}
        >
          {reloadLabel}
        </button>
        {error && <span className="text-xs text-red-300">{error}</span>}
        {empty && (
          <span
            className="text-xs text-neutral-500"
            data-testid={`${testId}-empty`}
          >
            {t.pickerEmptyList}
          </span>
        )}
      </div>
      {ghost && ghostNote && !loading && (
        <p
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200"
          data-testid={`${testId}-ghost-note`}
        >
          {ghostNote}
        </p>
      )}
    </div>
  );
}
