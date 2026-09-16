// components/admin/tenants/TenantNetworkSection.tsx
//
// « Réseau entre espaces » — les deux décisions d'ouverture d'un espace, dans
// la fiche d'espace (lot 4 du rapport).
//
// Extrait plutôt qu'écrit en ligne, parce que `pages/admin/tenants/[id].tsx`
// fait partie des écrans gelés par `tests/unit/adminFileSizeGuard.test.ts` :
// la règle du dépôt veut que tout lot qui touche un de ces fichiers en sorte
// un panneau. Le garde-fou a mordu, et il avait raison — la fiche a gagné
// soixante lignes ce matin sans rien en perdre.
//
// Purement présentationnel : l'état et l'enregistrement restent dans la page,
// avec le reste du formulaire « général » qu'un seul bouton soumet.

type Props = {
  shareScrims: boolean;
  shareRecruitment: boolean;
  onChangeScrims: (value: boolean) => void;
  onChangeRecruitment: (value: boolean) => void;
  labels: {
    heading: string;
    intro: string;
    scrimsLabel: string;
    scrimsHint: string;
    recruitmentLabel: string;
    recruitmentHint: string;
  };
};

const CHECKBOX_CLASS =
  'mt-0.5 w-5 h-5 rounded border-neutral-600 bg-neutral-900/50 text-purple-500 focus:ring-purple-500';

export default function TenantNetworkSection({
  shareScrims,
  shareRecruitment,
  onChangeScrims,
  onChangeRecruitment,
  labels,
}: Props) {
  return (
    <fieldset
      className="border-t border-neutral-700/50 pt-6 space-y-3"
      data-testid="tenant-network-section"
    >
      <legend className="text-sm font-semibold text-white">
        {labels.heading}
      </legend>
      <p className="text-xs text-neutral-400">{labels.intro}</p>

      <Toggle
        checked={shareScrims}
        onChange={onChangeScrims}
        label={labels.scrimsLabel}
        hint={labels.scrimsHint}
        testId="tenant-network-scrims"
      />
      <Toggle
        checked={shareRecruitment}
        onChange={onChangeRecruitment}
        label={labels.recruitmentLabel}
        hint={labels.recruitmentHint}
        testId="tenant-network-recruitment"
      />
    </fieldset>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
  testId,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
  testId: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={CHECKBOX_CLASS}
        data-testid={testId}
      />
      <span>
        <span className="block text-sm font-medium text-neutral-200">
          {label}
        </span>
        <span className="block text-xs text-neutral-500">{hint}</span>
      </span>
    </label>
  );
}
