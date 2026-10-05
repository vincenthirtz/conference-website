// components/forms/HoneypotField.tsx
//
// Le champ piège des formulaires publics : hors écran, masqué aux lecteurs
// d'écran, non tabulable. Un humain ne le remplit jamais ; un script qui
// remplit tout, si — et la route lui répond un succès générique sans rien
// faire. Compagnon de `usePublicFormGuard`.

export default function HoneypotField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      aria-hidden="true"
      className="absolute -left-[9999px] h-px w-px overflow-hidden"
    >
      <label>
        {label}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
