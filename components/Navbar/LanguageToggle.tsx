import { useLang, type Lang } from '@/lib/i18n/LanguageProvider';

/**
 * Petit bascule FR / EN pour l'espace joueur / capitaine. Choix persiste en
 * localStorage (cf. LanguageProvider). Defaut : francais.
 */
export default function LanguageToggle({
  className = '',
}: {
  className?: string;
}) {
  const { lang, setLang } = useLang();

  const options: { value: Lang; label: string }[] = [
    { value: 'fr', label: 'FR' },
    { value: 'en', label: 'EN' },
  ];

  return (
    <div
      role="group"
      aria-label={lang === 'fr' ? 'Choix de la langue' : 'Language'}
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5 ${className}`}
    >
      {options.map((opt) => {
        const active = lang === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLang(opt.value)}
            aria-pressed={active}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
              active
                ? 'bg-purple-500/20 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
